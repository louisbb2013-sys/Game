import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { makeHandler } from '../edge-functions/claude';

const PROJECT = 'lumo-test';

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const token = (sub: string, opts: { aud?: string; iss?: string } = {}) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setSubject(sub)
      .setIssuer(opts.iss ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.aud ?? PROJECT)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  const sent: Record<string, unknown>[] = [];
  const fetchMock = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const sse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"claude-opus-5-5","stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"{\\"ok\\": true}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'r1' } });
  }) as typeof fetch;
  const env = (k: string) => ({ ANTHROPIC_API_KEY: 'sk-test', FIREBASE_PROJECT_ID: PROJECT })[k];
  const handler = makeHandler({ env, keys, fetch: fetchMock });
  const post = (auth: string, body: unknown) => handler(new Request('https://lumo.example/api/claude', { method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { token, post, sent };
}

describe('/api/claude edge function', () => {
  it('streams Claude back to a signed-in learner, with research and photos when asked', async () => {
    const { token, post, sent } = await setup();
    const res = await post(await token('u1'), { input: 'Make a deck about volcanoes', tier: 'default', research: true, images: [{ media_type: 'image/png', data: 'aGVsbG8=' }, { media_type: 'text/html', data: 'x' }] });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(await res.text()).toContain('text_delta');
    const req = sent[0]!;
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.stream).toBe(true);
    expect(req.fallbacks).toBe('default');
    expect(req.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }]);
    const content = (req.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((c) => c.type)).toEqual(['image', 'text']); // the HTML "image" was dropped
    expect((req.output_config as { effort: string }).effort).toBe('medium');
  });

  it('quick checks use low effort and no web search', async () => {
    const { token, post, sent } = await setup();
    await post(await token('u2'), { input: 'Is "round" the same as "circular"?', tier: 'quick' });
    expect((sent[0]!.output_config as { effort: string }).effort).toBe('low');
    expect(sent[0]!.tools).toBeUndefined();
  });

  it('refuses anyone not signed in to this project', async () => {
    const { token, post, sent } = await setup();
    expect((await post('nope', { input: 'hi' })).status).toBe(401);
    expect((await post(await token('u3', { aud: 'other-project' }), { input: 'hi' })).status).toBe(401);
    expect((await post(await token('u3', { iss: 'https://evil.example' }), { input: 'hi' })).status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it('limits how fast one account can call it', async () => {
    const { token, post } = await setup();
    const t = await token('busy');
    for (let i = 0; i < 40; i++) expect((await post(t, { input: 'x' })).status).toBe(200);
    expect((await post(t, { input: 'x' })).status).toBe(429);
  });
});
