// Review screenshots: every page at 390 / 768 / 1440 px, plus the open
// creature sheet, into .shots/. Also reports console errors/warnings.
//   npm run dev  (or npm run preview)  then  npm run shots
// Options: SHOTS_URL, PAGES=/,/boutique  WIDTHS=390,1440  Q=static  RM=1 (reduced motion)
import fs from 'node:fs/promises';
import { launch } from './pw.mjs';

const base = process.env.SHOTS_URL ?? 'http://localhost:5173';
const pages = (process.env.PAGES ?? '/,/boutique,/creatures,/creatures/brume,/a-propos,/contact,/nope').split(',');
const widths = (process.env.WIDTHS ?? '390,768,1440').split(',').map(Number);
const quality = process.env.Q ? `?q=${process.env.Q}` : '';
const reduced = process.env.RM === '1';
const out = process.env.OUT ?? '.shots';
await fs.mkdir(out, { recursive: true });

const browser = await launch();
const problems = [];
for (const w of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: w < 500 ? 844 : w < 1000 ? 1024 : 900 },
    deviceScaleFactor: 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    colorScheme: process.env.DARK === '1' ? 'dark' : 'light',
    hasTouch: w < 1000,
    isMobile: w < 500,
  });
  for (const path of pages) {
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${w}] ${path} ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`[${w}] ${path} pageerror: ${e.message}`));
    await page.goto(base + path + quality, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    // Walk down the page so scroll reveals fire, then return to the top.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`[${w}] ${path} horizontal overflow ${overflow}px`);
    const name = `${out}/${w}${path.replace(/\//g, '_') || '_home'}${process.env.SUFFIX ?? ''}.png`;
    if (path.startsWith('/creatures/')) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: name });
    } else {
      // One capture per viewport height (full-page capture breaks pinned/fixed layers).
      const vh = page.viewportSize().height;
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      let i = 0;
      for (let y = 0; y < total; y += vh) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(1400);
        await page.screenshot({ path: name.replace('.png', `-${String(i++).padStart(2, '0')}.png`) });
        if ((await page.evaluate(() => window.scrollY)) + vh >= total) break;
      }
    }
    console.log('✓', name);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? '\nProblems:\n' + [...new Set(problems)].join('\n') : '\nNo console problems.');
