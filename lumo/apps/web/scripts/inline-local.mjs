// Turns the browser-only build (dist-local) into one self-contained page: lumo.html.
// Scripts, styles, fonts and images are all inside the file, so it can be opened or published anywhere.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-local');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (href) => readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => read(m[1])).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((m) => read(m[1])).join('\n');
if (!js) throw new Error('no script found in dist-local/index.html');

const page = [
  '<title>Lumoly</title>',
  '<meta name="description" content="Lumoly turns your notes into quizzes that help you truly understand.">',
  `<style>${css}</style>`,
  '<div id="root"></div>',
  // An inline script must never contain a closing script tag.
  `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`,
].join('\n');

writeFileSync(join(dist, 'lumo.html'), page);
console.log(`lumo.html: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
