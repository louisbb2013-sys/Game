import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  const name = 'q' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  expect((await page.request.post('/api/auth/dev', { data: { name } })).ok()).toBe(true);
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
}

async function sampleDeck(page: Page) {
  const r = await page.request.post('/api/decks/sample', { data: { language: 'en' } });
  return (await r.json()).id as string;
}

/** Interact with whatever input the current question shows, in a realistic way. */
async function answerCurrent(page: Page, format: string) {
  switch (format) {
    case 'multiple_choice':
    case 'cause_effect':
      await page.getByRole('radio').first().click();
      break;
    case 'multiple_select':
      await page.getByRole('checkbox').first().click();
      break;
    case 'type_answer':
      await page.getByLabel('Your answer').fill('mitochondria');
      break;
    case 'fill_blank':
      for (const input of await page.getByLabel(/^Blank \d+$/).all()) await input.fill('osmosis');
      break;
    case 'explain':
    case 'apply':
    case 'compare':
    case 'teach_back':
      await page.getByLabel('Your answer').fill('Particles move from high to low concentration and it needs no energy.');
      break;
    case 'true_false_justify':
      await page.getByRole('button', { name: 'True', exact: true }).click();
      await page.getByLabel('Why?').fill('Because the cell membrane controls what enters and leaves.');
      break;
    case 'matching':
    case 'categorize': {
      // First item by real drag (pointer), the rest by tap-then-tap.
      const pool = page.getByRole('button', { name: 'Items to place' });
      const zones = page.locator('[data-drop]:not([data-drop="__pool"])');
      const before = await pool.getByRole('button').count();
      const first = pool.getByRole('button').first();
      const fb = await first.boundingBox();
      const zb = await zones.first().boundingBox();
      await page.mouse.move(fb!.x + fb!.width / 2, fb!.y + fb!.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb!.x + 30, fb!.y + 30, { steps: 4 });
      await page.mouse.move(zb!.x + zb!.width / 2, zb!.y + zb!.height / 2, { steps: 8 });
      await page.mouse.up();
      expect(await pool.getByRole('button').count()).toBe(before - 1);
      let i = 1;
      while ((await pool.getByRole('button').count()) > 0) {
        await pool.getByRole('button').first().click();
        await zones.nth(i % (await zones.count())).click({ position: { x: 8, y: 8 } });
        i++;
      }
      break;
    }
    case 'ordering':
      await page.getByRole('button', { name: 'Move up' }).nth(1).click();
      break;
    case 'spot_mistake':
      await page.locator('fieldset').getByRole('button').first().click();
      await page.getByLabel('Correction').fill('nucleus');
      break;
    case 'calculation':
      await page.getByLabel('Your answer').fill('400');
      break;
    default:
      throw new Error('unhandled format ' + format);
  }
}

const FORMATS = ['multiple_choice', 'multiple_select', 'type_answer', 'fill_blank', 'explain', 'true_false_justify', 'matching', 'ordering', 'categorize', 'spot_mistake', 'cause_effect', 'apply', 'calculation', 'compare', 'teach_back'];

for (const format of FORMATS) {
  test(`question type works in the browser: ${format}`, async ({ page }) => {
    await signIn(page);
    const deckId = await sampleDeck(page);
    const start = await page.request.post(`/api/decks/${deckId}/sessions`, { data: { length: 20, formats: [format] } });
    expect(start.ok()).toBe(true);
    const { session, question } = await start.json();
    expect(question.format).toBe(format);
    await page.goto(`/quiz/${session.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const check = page.getByRole('button', { name: 'Check' });
    if (format !== 'ordering') await expect(check).toBeDisabled();
    await answerCurrent(page, format);
    await expect(check).toBeEnabled();
    await check.click();
    if (format === 'teach_back') {
      await page.getByLabel('Your reply to Lumo').fill('For example, perfume spreads across a room.');
      await page.getByRole('button', { name: 'Reply to Lumo' }).click();
    }
    const feedback = page.getByRole('status').filter({ hasText: /right|Almost|Not quite|Correct/ });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText('Why?')).toBeVisible();
    await page.screenshot({ path: `e2e/screens/q-${format}.png`, fullPage: false });
    await feedback.getByRole('button', { name: /Continue|See results/ }).click();
    await expect(page.getByRole('button', { name: 'Check' })).toBeVisible();
  });
}

test('full session from the deck page through the summary', async ({ page }) => {
  await signIn(page);
  await page.goto('/learn');
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/deck.png', fullPage: true });
  await page.getByRole('button', { name: /Practice/ }).click();
  await expect(page).toHaveURL(/\/quiz\//);

  const formatsSeen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const res = await page.request.get(page.url().replace(/.*\/quiz\//, '/api/sessions/'));
    const { question } = await res.json();
    if (!question) break;
    formatsSeen.add(question.format);
    await answerCurrent(page, question.format);
    await page.getByRole('button', { name: 'Check' }).click();
    if (question.format === 'teach_back') {
      await page.getByLabel('Your reply to Lumo').fill('Here is an example from real life.');
      await page.getByRole('button', { name: 'Reply to Lumo' }).click();
    }
    const btn = page.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible();
    const last = (await btn.textContent())?.includes('See results');
    await btn.click();
    if (last) break;
  }
  await expect(page.getByRole('heading', { name: /Session complete|Out of hearts/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/summary.png', fullPage: true });
  expect(formatsSeen.size).toBeGreaterThanOrEqual(4);
  await page.getByRole('link', { name: 'Back to deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await expect(page.getByText(/Learning|Familiar|Mastered/).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/deck-after.png', fullPage: true });
});
