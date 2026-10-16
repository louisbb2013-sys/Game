// Serves dist-netlify like Netlify would (SPA fallback) with the site's real sign-in, data and room
// endpoints on an in-memory store, a stand-in for Claude, and a pretend Netlify Identity for Google:
//   npx tsx e2e/fixtures/netlify-serve.ts "$PWD/apps/web/dist-netlify"   (port 8899)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { makeAuthHandler } from '../../netlify/lib/auth';
import { makeDataHandler } from '../../netlify/lib/data';
import { memoryKV } from '../../netlify/lib/kv';
import { bearer, verifySession } from '../../netlify/lib/session';

const root = process.argv[2]!;
const port = Number(process.env.PORT ?? 8899);
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };
const kv = memoryKV();
const env = () => undefined;
// The pretend Identity knows every token it handed out.
const identity = new Map<string, string>();
const auth = makeAuthHandler({
  kv,
  env,
  rounds: 1000,
  fetch: (async (_url: unknown, init?: RequestInit) => {
    const id = identity.get(new Headers(init?.headers).get('authorization')?.replace('Bearer ', '') ?? '');
    return id ? Response.json({ id }) : new Response('no', { status: 401 });
  }) as typeof fetch,
});
const data = makeDataHandler({ kv, env });

const deck = { title: 'Le récit psychologique', subject: 'Français', summary: 'Un récit centré sur la vie intérieure.', concepts: [
  ['Récit psychologique', 'Récit qui explore les pensées et les émotions d’un personnage.'], ['Narrateur', 'Celui qui raconte l’histoire.'], ['Monologue intérieur', 'Pensées du personnage rapportées comme il les vit.'],
  ['Focalisation interne', 'On voit l’histoire par les yeux d’un personnage.'], ['Schéma narratif', 'Les cinq étapes d’une histoire.'], ['Élément déclencheur', 'Ce qui vient briser la situation initiale.'], ['Dénouement', 'Ce qui met fin aux péripéties.'],
].map(([term, summary]) => ({ topic: 'Récit', kind: 'definition', term, summary, keyPoints: [summary], examples: [], misconceptions: [], synonyms: [] })) };

/** Stand-in Claude: a deck for topics/notes/files, test questions for the writer, [] for the checker. */
async function claude(req: Request): Promise<Response> {
  if (!(await verifySession(kv, env, bearer(req)))) return Response.json({ error: 'signed_out' }, { status: 401 });
  const b = (await req.json()) as { input: string };
  const input = String(b.input);
  const terms = (input.match(/^\d+\. .+$/gm) || []).map((l) => l.replace(/^\d+\. /, '').split(' — ')[0]);
  const text = /typed what they want to study|study material|notes \(typed or pasted\)/.test(input)
    ? JSON.stringify(deck)
    : input.includes('writing a real test')
      ? terms
          .flatMap((term, i) => [
            { c: i + 1, type: 'mcq', level: 'apply', context: 'Bank scenario ' + (i + 1) + ': in class, a student notices something new.', q: 'Which idea best explains what the student noticed?', options: [term, 'A common mix-up', 'Something unrelated', 'The opposite idea'], answer: 0, why: 'Because of ' + term + '.', wrong: ['', 'The classic misconception.', 'Unrelated.', 'Backwards.'] },
            { c: i + 1, type: 'tf', level: 'understand', q: 'Bank statement ' + (i + 1) + ': this idea describes something real.', answer: true, why: 'It is a real idea from the course.' },
          ].map((o) => JSON.stringify(o)))
          .join('\n') + '\n'
      : input.includes('You are checking a school quiz')
        ? '[]'
        : '{}';
  const half = Math.floor(text.length / 2);
  const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
  const body = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      c.enqueue(enc.encode(ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })));
      c.enqueue(enc.encode(ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, half) } })));
      setTimeout(() => {
        c.enqueue(enc.encode(ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(half) } })));
        c.enqueue(enc.encode(ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })));
        c.close();
      }, 200);
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

async function route(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const p = url.pathname;
  if (p.startsWith('/api/auth/')) return auth(req);
  if (p === '/api/data' || p === '/api/room') return data(req);
  if (p === '/api/claude') return claude(req);
  if (p === '/.netlify/identity/settings') return process.env.NO_GOOGLE ? new Response('', { status: 404 }) : Response.json({ external: { google: true }, disable_signup: false, autoconfirm: true });
  if (p === '/.netlify/identity/authorize') {
    // Google said yes for a made-up Google account (the same one each time for ?as=…).
    const who = url.searchParams.get('as') ?? 'google-learner-0001';
    const token = `idn-${Math.random().toString(36).slice(2)}`;
    identity.set(token, who);
    return new Response(null, { status: 302, headers: { location: `/#access_token=${token}&token_type=bearer&expires_in=3600` } });
  }
  return null;
}

http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks) });
    const answer = await route(request).catch((e) => new Response(String(e), { status: 500 }));
    if (answer) {
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      if (answer.body) for await (const c of answer.body as unknown as AsyncIterable<Uint8Array>) res.write(c);
      return res.end();
    }
    let file = path.join(root, decodeURIComponent((req.url ?? '/').split('?')[0]!));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => console.log(`serving on ${port}`));
