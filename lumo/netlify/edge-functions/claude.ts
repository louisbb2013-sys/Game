import Anthropic from '@anthropic-ai/sdk';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/**
 * Lumo's Claude endpoint for the standalone site (Netlify Edge Function at /api/claude).
 *
 * Only signed-in learners (a valid Firebase ID token) can use it. The Anthropic key stays here, in
 * the site's environment variables, never in the page. The answer is streamed back as it is written,
 * so long jobs (building a deck from a topic with web research) don't hit a time limit.
 *
 * Environment variables: ANTHROPIC_API_KEY, FIREBASE_PROJECT_ID, optionally CLAUDE_MODEL.
 */

const GOOGLE_KEYS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_B64 = 6_000_000; // ~4.5 MB per photo
const SYSTEM = 'You are the helper inside Lumo, a study app for school students (about 11-18 years old). Follow the instructions in the message exactly and reply in the format it asks for. Keep everything accurate, age-appropriate and focused on learning.';

type Env = (name: string) => string | undefined;
interface Deps {
  env: Env;
  keys: JWTVerifyGetKey;
  fetch?: typeof fetch;
  now?: () => number;
}

const json = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { 'content-type': 'application/json' } });

/** A small per-instance limit so one account can't run up the bill by accident. */
const recent = new Map<string, number[]>();
function allowed(uid: string, now: number): boolean {
  const windowMs = 10 * 60_000;
  const list = (recent.get(uid) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= 40) return false;
  list.push(now);
  recent.set(uid, list);
  if (recent.size > 5000) recent.clear();
  return true;
}

export function makeHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json(405, 'method_not_allowed');
    const apiKey = deps.env('ANTHROPIC_API_KEY');
    const projectId = deps.env('FIREBASE_PROJECT_ID');
    if (!apiKey || !projectId) return json(503, 'not_configured');

    // Who is asking: a learner signed in to this site with Google.
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    let uid: string;
    try {
      const { payload } = await jwtVerify(token, deps.keys, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId });
      if (!payload.sub) throw new Error('no subject');
      uid = payload.sub;
    } catch {
      return json(401, 'signed_out');
    }
    if (!allowed(uid, (deps.now ?? Date.now)())) return json(429, 'rate_limited');

    let body: { input?: unknown; images?: unknown; tier?: unknown; research?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, 'bad_request');
    }
    const input = typeof body.input === 'string' ? body.input.slice(0, 60_000) : '';
    if (!input.trim()) return json(400, 'bad_request');
    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 5).flatMap((i: { media_type?: unknown; data?: unknown }) =>
      typeof i?.data === 'string' && typeof i.media_type === 'string' && MEDIA.has(i.media_type) && i.data.length <= MAX_IMAGE_B64
        ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: i.media_type as 'image/jpeg', data: i.data } }]
        : [],
    );
    const research = body.research === true;

    const client = new Anthropic({ apiKey, maxRetries: 1, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    try {
      const upstream = await client.beta.messages
        .create({
          model: deps.env('CLAUDE_MODEL') || 'claude-opus-5-5',
          max_tokens: 16000,
          stream: true,
          system: SYSTEM,
          messages: [{ role: 'user', content: [...images, { type: 'text', text: input }] }],
          output_config: { effort: body.tier === 'quick' ? 'low' : 'medium' },
          ...(research ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 4 }] } : {}),
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
        .asResponse();
      // Pass Claude's event stream straight through: the page reads the text as it arrives.
      return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json(429, 'rate_limited');
      if (e instanceof Anthropic.AuthenticationError) return json(503, 'not_configured');
      if (e instanceof Anthropic.APIError) return json(502, 'upstream_error');
      return json(502, 'upstream_error');
    }
  };
}

const netlifyEnv: Env = (name) => (globalThis as { Netlify?: { env: { get(k: string): string | undefined } } }).Netlify?.env.get(name);

export default makeHandler({ env: netlifyEnv, keys: createRemoteJWKSet(new URL(GOOGLE_KEYS)) });

export const config = { path: '/api/claude' };
