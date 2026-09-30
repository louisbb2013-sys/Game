// Rasterises public/favicon.svg into PNG icons, and captures the OG image
// (1200×630) from a running server: node scripts/icons.mjs [baseUrl]
import fs from 'node:fs/promises';
import { launch } from './pw.mjs';
const svg = await fs.readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const b = await launch();
for (const [name, size, bg] of [['favicon-32.png', 32, null], ['apple-touch-icon.png', 180, '#FCF9F4']]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const pad = bg ? size * 0.14 : 0;
  await p.setContent(`<body style="margin:0;background:${bg ?? 'transparent'}"><div style="padding:${pad}px;box-sizing:border-box;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</div></body>`);
  await p.screenshot({ path: `public/${name}`, omitBackground: !bg });
  await p.close();
  console.log('✓', name);
}
const base = process.argv[2];
if (base) {
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.goto(base + '/?q=high', { waitUntil: 'networkidle' });
  await p.waitForTimeout(12000);
  await p.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 });
  console.log('✓ og.jpg');
}
await b.close();
