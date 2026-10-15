import { chromium, devices } from '@playwright/test';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
const p = await ctx.newPage();
const U = `http://localhost:8765/multi.html?uid=u_pt${Date.now() % 1000}&sample=ok&3d=1`;
await p.goto(U);
await p.getByRole('link', { name: 'Learn', exact: true }).click();
await p.getByRole('button', { name: 'Try a sample deck' }).click();
await p.getByRole('heading', { name: 'Mastery map' }).waitFor();
await p.getByRole('button', { name: /^Play\b/ }).click();
for (let i = 0; i < 12; i++) {
  const hatch = p.getByRole('dialog', { name: 'Your egg hatched!' });
  if (await hatch.count()) { await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/hatch.png` }); await hatch.getByRole('button', { name: 'Keep going' }).click(); break; }
  const tile = p.locator('[data-answer-area] .tile');
  if (await tile.count()) await tile.first().click();
  else {
    const ta = p.locator('textarea:visible, input[type=text]:visible').first();
    if (await ta.count()) await ta.fill('mitochondria because energy');
    const check = p.getByRole('button', { name: 'Check' });
    if (await check.count() && await check.isEnabled()) await check.click(); else { await p.getByRole('button', { name: 'Leave quiz' }).click(); break; }
  }
  await p.waitForTimeout(600);
  const h2 = p.getByRole('dialog', { name: 'Your egg hatched!' });
  if (await h2.count()) { await p.waitForTimeout(2500); await p.screenshot({ path: `${OUT}/hatch.png` }); await h2.getByRole('button', { name: 'Keep going' }).click(); break; }
  const c = p.getByRole('status').getByRole('button', { name: /Continue|See results/ });
  if (await c.count()) await c.click();
  const chest = p.getByRole('dialog', { name: 'Pick a chest!' });
  await p.waitForTimeout(300);
  if (await chest.count()) { await chest.getByRole('button', { name: 'Chest 1' }).click(); await chest.getByRole('button', { name: /Continue|Next chest/ }).click(); }
}
console.log('done');
await browser.close();
