import { expect, test } from '@playwright/test';
import { answerAndCheck, closeHatch, openChests } from './helpers';

// Browser-only build (no server). Run with LOCAL_URL pointing at a page that embeds dist-local/lumo.html.
test.skip(!process.env.LOCAL_URL, 'needs the browser-only build');

test('browser-only Lumo: deck, quiz, exam, sandbox, notes, progress kept after reload', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // No sign-in screen: straight to Home, 5 tabs (no League).
  await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'League' })).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screens/local-home.png', fullPage: true });

  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  // The sample deck comes with hand-written test questions: play straight away.
  await expect(page.getByText(/\d+ test questions/)).toBeVisible();
  await page.getByRole('button', { name: /^Play\b/ }).click();
  for (let i = 0; i < 3; i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(page, (await section.getAttribute('data-format'))!);
    const btn = page.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible();
    await closeHatch(page);
    if (i === 0) await page.screenshot({ path: 'e2e/screens/local-quiz.png' });
    await btn.click();
    await openChests(page);
    await closeHatch(page);
  }
  await page.getByRole('button', { name: 'Leave quiz' }).click();
  await expect(page.getByText(/Learning|Familiar|Mastered/).first()).toBeVisible();

  // Mock exam: hand in, report.
  await page.getByRole('button', { name: /Mock exam/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Hand in' }).click();
  await page.getByRole('button', { name: 'Are you sure? Tap again' }).click();
  await expect(page.getByTestId('exam-percent')).toBeVisible();

  // Deck from pasted notes.
  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByRole('tab', { name: 'Paste notes' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: /Make my deck/ }).click();
  await expect(page.getByRole('heading', { name: 'The Water Cycle', level: 1 })).toBeVisible();

  // Sandbox activity.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: /Study Sandbox/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/local-sandbox.png', fullPage: true });

  // Progress survives a reload.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!));
  expect(saved.decks).toHaveLength(2);
  expect(Object.keys(saved.states).length).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('link', { name: 'Learn' }).click();
  await expect(page.getByText('Cells — the basics')).toBeVisible();
  await expect(page.getByText('The Water Cycle')).toBeVisible();
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});
