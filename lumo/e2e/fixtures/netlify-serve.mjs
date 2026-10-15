// Serves dist-netlify like Netlify would (SPA fallback) with a stand-in for /api/claude, for e2e/netlify.spec.ts:
//   node e2e/fixtures/netlify-serve.mjs "$PWD/apps/web/dist-netlify"   (with the Firebase emulators running)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };
const deck = { title: 'Le récit psychologique', subject: 'Français', summary: 'Un récit centré sur la vie intérieure.', concepts: [
  ['Récit psychologique', 'Récit qui explore les pensées et les émotions d’un personnage.'], ['Narrateur', 'Celui qui raconte l’histoire.'], ['Monologue intérieur', 'Pensées du personnage rapportées comme il les vit.'],
  ['Focalisation interne', 'On voit l’histoire par les yeux d’un personnage.'], ['Schéma narratif', 'Les cinq étapes d’une histoire.'], ['Élément déclencheur', 'Ce qui vient briser la situation initiale.'], ['Dénouement', 'Ce qui met fin aux péripéties.'],
].map(([term, summary]) => ({ topic: 'Récit', kind: 'definition', term, summary, keyPoints: [summary], examples: [], misconceptions: [], synonyms: [] })) };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/claude')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      if (!String(req.headers.authorization || '').startsWith('Bearer ey')) { res.writeHead(401); return res.end('{"error":"signed_out"}'); }
      const input = String(b.input);
      // Deck from a topic → the deck; writing a test → one question per line; the answer checker → [] (keeps all).
      const terms = (input.match(/^\d+\. .+$/gm) || []).map((l) => l.replace(/^\d+\. /, '').split(' — ')[0]);
      const text = input.includes('typed what they want to study')
        ? JSON.stringify(deck)
        : input.includes('writing a real test')
          ? terms.flatMap((term, i) => [
              { c: i + 1, type: 'mcq', level: 'apply', context: 'Bank scenario ' + (i + 1) + ': in class, a student notices something new.', q: 'Which idea best explains what the student noticed?', options: [term, 'A common mix-up', 'Something unrelated', 'The opposite idea'], answer: 0, why: 'Because of ' + term + '.', wrong: ['', 'The classic misconception.', 'Unrelated.', 'Backwards.'] },
              { c: i + 1, type: 'tf', level: 'understand', q: 'Bank statement ' + (i + 1) + ': this idea describes something real.', answer: true, why: 'It is a real idea from the course.' },
            ].map((o) => JSON.stringify(o))).join('\n') + '\n'
          : input.includes('You are checking a school quiz')
            ? '[]'
            : '{}';
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const half = Math.floor(text.length / 2);
      const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
      res.write(ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }));
      res.write(ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(0, half) } }));
      setTimeout(() => { res.write(ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(half) } })); res.write(ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })); res.end(ev({ type: 'message_stop' })); }, 200);
    });
    return;
  }
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(8899, '127.0.0.1', () => console.log('serving on 8899'));
