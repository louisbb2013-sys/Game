import Anthropic from '@anthropic-ai/sdk';
import { getStore } from '@netlify/blobs';
import { blobsKV, freshKV, type KV } from '../lib/kv.ts';
import { bearer, json, limiter, verifySession } from '../lib/session.ts';

/**
 * Revio's Claude endpoint for the standalone site (Netlify Edge Function at /api/claude).
 *
 * Only learners signed in to the site can use it. Claude is reached either with the site's own
 * Anthropic key (ANTHROPIC_API_KEY set by the owner), or, with nothing set up, through Netlify's AI
 * Gateway, which Netlify switches on for every site and bills to the site's monthly credits. Those
 * credits are shared with the site itself (a site pauses when they run out), so through the
 * gateway Claude stops for the month once LUMO_AI_MONTHLY_USD (default $0.75) has been spent. The
 * month starts on LUMO_AI_RESET_DAY (the day Netlify's credits renew), or on the 1st without it.
 *
 * The answer is streamed back as it is written, so long jobs don't hit a time limit.
 * Environment variables (all optional): ANTHROPIC_API_KEY, CLAUDE_MODEL, LUMO_AI_MONTHLY_USD,
 * LUMO_AI_RESET_DAY, LUMO_AI_WEB_SEARCH.
 */

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_B64 = 6_000_000; // ~4.5 MB per photo
const SYSTEM = 'You are the helper inside Revio, a study app for school students (about 11-18 years old). Follow the instructions in the message exactly and reply in the format it asks for. Keep everything accurate, age-appropriate and focused on learning.';
/** US dollars per million tokens (input, output), for keeping the monthly gateway budget. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};
const SEARCH_USD = 0.01;

type Env = (name: string) => string | undefined;
interface Deps {
  env: Env;
  kv: KV;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Where this budget month's spend is kept: `ai/2026-10` for calendar months, `ai/2026-10-17` when months start on the 17th. */
export function budgetKey(t: number, resetDay?: string): string {
  const d = new Date(t);
  const day = Number(resetDay);
  if (!Number.isInteger(day) || day < 2 || day > 28) return `ai/${d.toISOString().slice(0, 7)}`;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (d.getUTCDate() < day ? 1 : 0), day));
  return `ai/${start.toISOString().slice(0, 10)}`;
}

/** Spend through the gateway this month (approximate: two answers finishing together may count once). */
async function spent(kv: KV, key: string): Promise<number> {
  const v = await kv.get(key);
  return v ? Number((JSON.parse(v.value) as { usd?: number }).usd) || 0 : 0;
}
async function addSpend(kv: KV, key: string, usd: number) {
  for (let i = 0; i < 4; i++) {
    const cur = await kv.get(key);
    const before = cur ? Number((JSON.parse(cur.value) as { usd?: number }).usd) || 0 : 0;
    if (await kv.set(key, JSON.stringify({ usd: before + usd }), cur ? { ifMatch: cur.etag } : { ifNew: true })) return;
  }
}

/** Passes Claude's event stream through untouched while reading what it cost. */
function metered(body: ReadableStream<Uint8Array>, onDone: (u: { input: number; output: number; searches: number }) => Promise<void>) {
  const dec = new TextDecoder();
  let buf = '';
  const u = { input: 0, output: 0, searches: 0 };
  const read = (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const line = buf
        .slice(0, i)
        .split('\n')
        .find((l) => l.startsWith('data:'));
      buf = buf.slice(i + 2);
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        const usage = ev.type === 'message_start' ? ev.message?.usage : ev.type === 'message_delta' ? ev.usage : null;
        if (usage) {
          u.input = Math.max(u.input, (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
          u.output = Math.max(u.output, usage.output_tokens ?? 0);
          u.searches = Math.max(u.searches, usage.server_tool_use?.web_search_requests ?? 0);
        }
      } catch {
        /* not ours to judge: pass it on */
      }
    }
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        read(dec.decode(chunk, { stream: true }));
        ctl.enqueue(chunk);
      },
      async flush() {
        await onDone(u).catch(() => {});
      },
    }),
  );
}

export function makeHandler(deps: Deps) {
  const allow = limiter(40, 10 * 60_000);
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const now = (deps.now ?? Date.now)();
    const me = await verifySession(deps.kv, deps.env, bearer(req), now);
    if (me === 'unavailable') return json(503, { error: 'unavailable' });
    if (!me) return json(401, { error: 'signed_out' });
    const apiKey = deps.env('ANTHROPIC_API_KEY');
    if (!apiKey) return json(503, { error: 'not_configured' });
    const baseURL = deps.env('ANTHROPIC_BASE_URL') || undefined;
    // Through Netlify's gateway (no key of the site's own): keep within the monthly budget.
    let host = '';
    try {
      host = baseURL ? new URL(baseURL).host : '';
    } catch {
      /* not a full address: treat it as a gateway */
    }
    const gateway = !!baseURL && !/(^|\.)anthropic\.com$/.test(host);
    const budget = Number(deps.env('LUMO_AI_MONTHLY_USD') ?? (gateway ? '0.75' : 'Infinity'));
    const spendKey = budgetKey(now, deps.env('LUMO_AI_RESET_DAY'));
    if (Number.isFinite(budget) && (await spent(deps.kv, spendKey).catch(() => 0)) >= budget) return json(402, { error: 'budget' });
    if (!allow(me.u, now)) return json(429, { error: 'rate_limited' });

    let body: { input?: unknown; images?: unknown; tier?: unknown; research?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, { error: 'bad_request' });
    }
    const input = typeof body.input === 'string' ? body.input.slice(0, 60_000) : '';
    if (!input.trim()) return json(400, { error: 'bad_request' });
    // Photos become image blocks; a PDF (notes, slides, a worksheet) becomes a document block.
    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 5).flatMap((i: { media_type?: unknown; data?: unknown }): Anthropic.ContentBlockParam[] => {
      if (typeof i?.data !== 'string' || typeof i.media_type !== 'string' || i.data.length > MAX_IMAGE_B64) return [];
      if (i.media_type === 'application/pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: i.data } }];
      return MEDIA.has(i.media_type) ? [{ type: 'image', source: { type: 'base64', media_type: i.media_type as 'image/jpeg', data: i.data } }] : [];
    });
    // Web search costs about a cent per search on top of the words, and through the gateway that comes
    // out of the credits the site shares with the owner's other sites: there, decks are built from what
    // Claude knows unless LUMO_AI_WEB_SEARCH=on.
    const research = body.research === true && (!gateway || deps.env('LUMO_AI_WEB_SEARCH') === 'on');
    const model = deps.env('CLAUDE_MODEL') || 'claude-opus-5-5';

    const client = new Anthropic({ apiKey, baseURL, maxRetries: 1, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    // Haiku has the basic web search and no server-side refusal fallback; the newer models have both.
    const haiku = /haiku/.test(model);
    const params = {
      model,
      max_tokens: 16000,
      stream: true as const,
      system: SYSTEM,
      messages: [{ role: 'user' as const, content: [...images, { type: 'text' as const, text: input }] }],
      output_config: { effort: body.tier === 'quick' ? ('low' as const) : ('medium' as const) },
    };
    const search = haiku
      ? { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: gateway ? 3 : 4 }
      : { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: gateway ? 3 : 4 };
    // The gateway passes no beta headers, so the refusal fallback is only asked for on a direct key.
    const send = (withSearch: boolean) => {
      const p = { ...params, ...(withSearch ? { tools: [search] } : {}) };
      return gateway || haiku
        ? client.messages.create(p).asResponse()
        : client.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).asResponse();
    };
    try {
      let upstream: Response;
      try {
        upstream = await send(research);
      } catch (e) {
        // Research is a bonus: if this model or route won't search, build the deck from what Claude knows.
        if (!research || !(e instanceof Anthropic.BadRequestError)) throw e;
        console.error('lumo: web search refused, answering without it', e);
        upstream = await send(false);
      }
      const [inUsd, outUsd] = PRICES[model] ?? [4, 20];
      const out = Number.isFinite(budget)
        ? metered(upstream.body!, (u) => addSpend(deps.kv, spendKey, (u.input * inUsd + u.output * outUsd) / 1e6 + u.searches * SEARCH_USD))
        : upstream.body;
      // Pass Claude's event stream straight through: the page reads the text as it arrives.
      return new Response(out, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
    } catch (e) {
      console.error('lumo: Claude call failed', e);
      if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' });
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json(503, { error: 'not_configured' });
      return json(502, { error: 'upstream_error' });
    }
  };
}

const netlifyEnv: Env = (name) => (globalThis as { Netlify?: { env: { get(k: string): string | undefined } } }).Netlify?.env.get(name);

let handler: ((req: Request) => Promise<Response>) | null = null;
export default (req: Request) => {
  handler ??= makeHandler({ env: netlifyEnv, kv: freshKV(() => blobsKV(getStore({ name: 'lumo', consistency: 'strong' }) as never)) });
  return handler(req);
};

export const config = { path: '/api/claude' };
