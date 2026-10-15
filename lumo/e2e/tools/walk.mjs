// Phone walkthrough of the play screens with screenshots (a dev tool, not a test).
// node e2e/tools/walk.mjs [learn|speed|boss|cards|all]
// Needs the local test pages (e2e/fixtures/make-pages.py) served on :8765; OUT = where screenshots go.
import { chromium, devices } from '@playwright/test';
const OUT = process.env.OUT ?? 'e2e/screens/walk';
const which = process.argv[2] ?? 'all';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: process.env.MOTION ? 'no-preference' : 'reduce' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('ERR ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 200)); });
const U = `${process.env.MULTI_URL ?? 'http://localhost:8765/multi.html'}?uid=u_walk${Date.now() % 1000}&sample=ok&3d=1`;
await p.goto(U);
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
import('node:fs').then((fs) => fs.mkdirSync(OUT, { recursive: true }));
await p.getByRole('link', { name: 'Learn', exact: true }).tap();
await p.getByRole('button', { name: 'Try a sample deck' }).tap();
await p.getByRole('heading', { name: 'Mastery map' }).waitFor();

async function answerOne(i, tag) {
  const fmt = await p.locator('[data-format]').first().getAttribute('data-format', { timeout: 4000 }).catch(() => null);
  if (!fmt) return null;
  const check = () => p.getByRole('button', { name: 'Check' }).tap();
  if (['multiple_choice', 'true_false', 'cause_effect'].includes(fmt)) await p.locator('[data-answer-area] .tile').nth(i % 2).tap();
  else if (fmt === 'type_answer') { await p.getByLabel('Your answer').fill('mitochondria'); await check(); }
  else if (fmt === 'calculation') { await p.getByLabel('Your answer').fill('300'); await check(); }
  else if (fmt === 'ordering') { for (let k = 0; k < 7; k++) { const b = p.locator('[data-answer-area] .flex-wrap > .tile').first(); if (await b.count()) await b.tap(); } await check(); }
  else if (fmt === 'matching') { const L = p.locator('[data-answer-area] .grid > div').first().locator('button'); const R = p.locator('[data-answer-area] .grid > div').nth(1).locator('button'); const n = await L.count(); for (let k = 0; k < n; k++) { await L.nth(k).tap(); await R.nth(k).tap(); } await check(); }
  else if (fmt === 'categorize') { const pool = p.getByRole('button', { name: 'Items to place' }); const zones = p.locator('[data-drop]:not([data-drop="__pool"])'); let k = 0; while ((await pool.getByRole('button').count()) > 0 && k < 12) { await pool.getByRole('button').first().tap(); await zones.nth(k % 2).tap({ position: { x: 8, y: 8 } }); k++; } await check(); }
  else { await p.locator('textarea:visible').first().fill('Both have a nucleus and a membrane, but only plant cells have a cell wall and chloroplasts.'); await check(); }
  await p.waitForTimeout(800);
  await shot(`${tag}-${String(i).padStart(2, '0')}-${fmt}`);
  return fmt;
}

async function hatch(tag, i) {
  const d = p.getByRole('dialog', { name: 'Your egg hatched!' });
  await p.waitForTimeout(200);
  if (await d.count()) {
    await p.waitForTimeout(1800);
    await shot(`${tag}-${i}-hatch`);
    await d.getByRole('button', { name: 'Keep going' }).tap();
  }
}

async function afterAnswer(tag, i) {
  await hatch(tag, i);
  const cont = p.getByRole('button', { name: /^(Continue|See results)$/ });
  if (await cont.count()) await cont.first().tap();
  await p.waitForTimeout(500);
  const chest = p.getByRole('dialog', { name: 'Pick a chest!' });
  while (await chest.count()) {
    await shot(`${tag}-${i}-chest`);
    await chest.getByRole('button', { name: 'Chest 2' }).tap();
    await p.waitForTimeout(1200);
    await shot(`${tag}-${i}-chest-open`);
    await hatch(tag, i);
    await chest.getByRole('button', { name: /Continue|Next chest/ }).tap();
    await p.waitForTimeout(600);
  }
  await hatch(tag, i);
}

async function round(button, tag, max = 16) {
  await p.getByRole('button', { name: button }).first().tap();
  const intro = p.getByRole('dialog').filter({ hasText: /Boss battle|Speed run/ });
  await p.waitForTimeout(600);
  if (await intro.count()) {
    await shot(`${tag}-00-intro`);
    await intro.getByRole('button').first().tap();
    await p.waitForTimeout(tag === 'speed' ? 2800 : 600);
  }
  for (let i = 1; i <= max; i++) {
    const end = p.getByRole('button', { name: /Play again|Rematch/ });
    if (await end.count()) break;
    const f = await answerOne(i, tag);
    if (!f) break;
    await afterAnswer(tag, i);
  }
  await p.waitForTimeout(1500);
  await shot(`${tag}-99-end`);
  const back = p.getByRole('link', { name: 'Back to deck' });
  if (await back.count()) await back.tap();
  else await p.getByRole('button', { name: 'Leave quiz' }).tap();
  await p.getByRole('heading', { name: 'Mastery map' }).waitFor();
}

if (which === 'all' || which === 'learn') await round(/^▶?\s*Play/, 'learn');
if (which === 'all' || which === 'boss') await round(/Boss battle/, 'boss');
if (which === 'all' || which === 'speed') await round(/Speed run/, 'speed', 40);
if (which === 'all' || which === 'cards') {
  await p.getByRole('button', { name: /Flashcards/ }).tap();
  await p.waitForTimeout(800);
  await shot('cards-1-front');
  await p.getByRole('button', { name: 'Flip the card' }).tap();
  await p.waitForTimeout(900);
  await shot('cards-2-back');
  await p.getByRole('button', { name: /Knew it/ }).tap();
  await p.waitForTimeout(600);
}
await shot('zz-deck-after');
console.log(errs.join('\n') || 'no errors');
await browser.close();
