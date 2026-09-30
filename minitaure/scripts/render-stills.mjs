// Renders every creature with the real fur shader and saves transparent WebP
// stills to src/assets/stills/<slug>.webp. Requires the dev server:
//   npm run dev   (in another terminal)   then   npm run stills
// Options: STILLS_URL=http://localhost:5173  ONLY=brume,praline
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch } from './pw.mjs';

const base = process.env.STILLS_URL ?? 'http://localhost:5173';
const src = await fs.readFile(new URL('../src/content/creatures.ts', import.meta.url), 'utf8');
let slugs = [...src.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
if (process.env.ONLY) slugs = process.env.ONLY.split(',');
const outDir = new URL('../src/assets/stills/', import.meta.url);
await fs.mkdir(outDir, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
for (const slug of slugs) {
  await page.goto(`${base}/_render?c=${slug}&size=640`);
  await page.waitForFunction(() => window.__stillReady === true, null, { timeout: 60000 });
  const data = await page.evaluate(() => document.querySelector('#still canvas').toDataURL('image/webp', 0.9));
  const buf = Buffer.from(data.split(',')[1], 'base64');
  await fs.writeFile(new URL(`${slug}.webp`, outDir), buf);
  console.log(`✓ ${slug}.webp  ${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
console.log('Stills written to', path.relative(process.cwd(), outDir.pathname));
