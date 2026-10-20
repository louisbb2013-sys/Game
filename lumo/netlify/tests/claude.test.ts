import { describe, expect, it } from 'vitest';
import { budgetKey, makeHandler } from '../edge-functions/claude';
import { memoryKV } from '../lib/kv';
import { signSession } from '../lib/session';

function sse(usage = { input: 1000, output: 2000 }) {
  return [
    `event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"claude-opus-5-5","stop_reason":null,"usage":{"input_tokens":${usage.input},"output_tokens":1}}}\n\n`,
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"ok\\": true}"}}\n\n',
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":${usage.output}}}\n\n`,
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('');
}

async function setup(vars: Record<string, string> = { ANTHROPIC_API_KEY: 'sk-test' }) {
  const kv = memoryKV();
  const sent: { url: string; body: Record<string, unknown>; beta: string | null }[] = [];
  const fetchMock = (async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)), beta: new Headers(init?.headers).get('anthropic-beta') });
    return new Response(sse(), { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'r1' } });
  }) as typeof fetch;
  const env = (k: string) => vars[k];
  const handler = makeHandler({ env, kv, fetch: fetchMock });
  const token = (u: string) => signSession(kv, env, { u, n: 'x', k: 'pw' });
  const post = (auth: string, body: unknown) => handler(new Request('https://lumo.example/api/claude', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { token, post, sent, kv };
}

describe('/api/claude edge function', () => {
  it('streams Claude back to a signed-in learner, with research and photos when asked', async () => {
    const { token, post, sent } = await setup();
    const res = await post(await token('u1'), { input: 'Make a deck about volcanoes', tier: 'default', research: true, images: [{ media_type: 'image/png', data: 'aGVsbG8=' }, { media_type: 'text/html', data: 'x' }, { media_type: 'application/pdf', data: 'JVBERi0=' }] });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toContain('text_delta');
    const req = sent[0]!.body;
    expect(sent[0]!.url).toContain('api.anthropic.com');
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.stream).toBe(true);
    expect(req.fallbacks).toBe('default');
    expect(sent[0]!.beta).toContain('server-side-fallback-2026-07-01');
    expect(req.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }]);
    const content = (req.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((c) => c.type)).toEqual(['image', 'document', 'text']); // the HTML "image" was dropped, the PDF kept
    expect((req.output_config as { effort: string }).effort).toBe('medium');
  });

  it('quick checks use low effort and no web search', async () => {
    const { token, post, sent } = await setup();
    await post(await token('u2'), { input: 'Is "round" the same as "circular"?', tier: 'quick' });
    expect((sent[0]!.body.output_config as { effort: string }).effort).toBe('low');
    expect(sent[0]!.body.tools).toBeUndefined();
  });

  it('refuses anyone not signed in to this site', async () => {
    const { post, sent } = await setup();
    const other = await setup({ ANTHROPIC_API_KEY: 'sk-test', LUMO_SECRET: 'another-site-secret-0123456789' });
    expect((await post('nope', { input: 'hi' })).status).toBe(401);
    expect((await post(await other.token('u3'), { input: 'hi' })).status).toBe(401); // signed by another site
    expect(sent).toHaveLength(0);
  });

  it('says so when Claude is not set up', async () => {
    const { token, post } = await setup({});
    const res = await post(await token('u4'), { input: 'hi' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('through Netlify AI Gateway: no beta headers, and stops for the month at the budget', async () => {
    const { token, post, sent, kv } = await setup({ ANTHROPIC_API_KEY: 'gw-key', ANTHROPIC_BASE_URL: 'https://lumo.example/.netlify/ai/anthropic', LUMO_AI_MONTHLY_USD: '0.1' });
    const t = await token('u5');
    const first = await post(t, { input: 'one', research: true });
    expect(first.status).toBe(200);
    await first.text(); // finishing the answer records what it cost
    expect(sent[0]!.url).toContain('/.netlify/ai/anthropic');
    expect(sent[0]!.beta).toBeNull();
    expect(sent[0]!.body.fallbacks).toBeUndefined();
    expect(sent[0]!.body.tools).toBeUndefined(); // no paid web search on the shared credits
    const month = new Date().toISOString().slice(0, 7);
    const usd = JSON.parse((await kv.get(`ai/${month}`))!.value).usd as number;
    expect(usd).toBeCloseTo((1000 * 4 + 2000 * 20) / 1e6, 6); // $0.044
    await (await post(t, { input: 'two' })).text();
    await (await post(t, { input: 'three' })).text(); // now over $0.10
    const over = await post(t, { input: 'four' });
    expect(over.status).toBe(402);
    expect(await over.json()).toEqual({ error: 'budget' });
    expect(sent).toHaveLength(3);
  });

  it('starts the budget month on the day Netlify credits renew', async () => {
    const at = (iso: string) => Date.parse(iso);
    expect(budgetKey(at('2026-10-18T12:00:00Z'))).toBe('ai/2026-10');
    expect(budgetKey(at('2026-10-18T12:00:00Z'), '17')).toBe('ai/2026-10-17');
    expect(budgetKey(at('2026-11-16T23:59:00Z'), '17')).toBe('ai/2026-10-17');
    expect(budgetKey(at('2026-11-17T00:00:00Z'), '17')).toBe('ai/2026-11-17');
    expect(budgetKey(at('2027-01-05T00:00:00Z'), '17')).toBe('ai/2026-12-17');
    expect(budgetKey(at('2026-10-18T12:00:00Z'), 'nonsense')).toBe('ai/2026-10');

    // Spend from before the reset day no longer counts.
    const kv = memoryKV();
    await kv.set('ai/2026-10', JSON.stringify({ usd: 5 }));
    const vars: Record<string, string> = { ANTHROPIC_API_KEY: 'gw-key', ANTHROPIC_BASE_URL: 'https://lumo.example/.netlify/ai/anthropic', LUMO_AI_MONTHLY_USD: '1', LUMO_AI_RESET_DAY: '17' };
    const env = (k: string) => vars[k];
    const now = () => at('2026-10-18T12:00:00Z');
    const fetchMock = (async () => new Response(sse(), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;
    const handler = makeHandler({ env, kv, fetch: fetchMock, now });
    const token = await signSession(kv, env, { u: 'u8', n: 'x', k: 'pw' }, now());
    const res = await handler(new Request('https://lumo.example/api/claude', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'volcanoes' }) }));
    expect(res.status).toBe(200);
    await res.text();
    expect(JSON.parse((await kv.get('ai/2026-10-17'))!.value).usd).toBeGreaterThan(0);
  });

  it('through the gateway, web search only when the owner turns it on', async () => {
    const { token, post, sent } = await setup({ ANTHROPIC_API_KEY: 'gw-key', ANTHROPIC_BASE_URL: 'https://lumo.example/.netlify/ai/anthropic', LUMO_AI_WEB_SEARCH: 'on' });
    await (await post(await token('u9'), { input: 'volcanoes', research: true })).text();
    expect(sent[0]!.body.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }]);
  });

  it('with Haiku: the basic web search, no refusal fallback, and no research if the search is refused', async () => {
    const { token, post, sent } = await setup({ ANTHROPIC_API_KEY: 'sk-test', CLAUDE_MODEL: 'claude-haiku-5-5' });
    await (await post(await token('u6'), { input: 'volcanoes', research: true })).text();
    expect(sent[0]!.body.model).toBe('claude-haiku-5-5');
    expect(sent[0]!.body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }]);
    expect(sent[0]!.body.fallbacks).toBeUndefined();
    expect(sent[0]!.beta).toBeNull();
  });

  it('builds the deck without research when the web search is refused', async () => {
    const kv = memoryKV();
    const env = (k: string) => ({ ANTHROPIC_API_KEY: 'sk-test', CLAUDE_MODEL: 'claude-haiku-5-5' })[k];
    const bodies: Record<string, unknown>[] = [];
    const fetchMock = (async (_url: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(b);
      if (b.tools) return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'tool not supported' } }, { status: 400 });
      return new Response(sse(), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const handler = makeHandler({ env, kv, fetch: fetchMock });
    const token = await signSession(kv, env, { u: 'u7', n: 'x', k: 'pw' });
    const res = await handler(new Request('https://lumo.example/api/claude', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ input: 'volcanoes', research: true }) }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('text_delta');
    expect(bodies.map((b) => !!b.tools)).toEqual([true, false]);
  });

  it('limits how fast one account can call it', async () => {
    const { token, post } = await setup();
    const t = await token('busy');
    for (let i = 0; i < 40; i++) expect((await post(t, { input: 'x' })).status).toBe(200);
    expect((await post(t, { input: 'x' })).status).toBe(429);
  });
});
