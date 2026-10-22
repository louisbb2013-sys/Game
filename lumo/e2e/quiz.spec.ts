import { expect, test, type Page } from '@playwright/test';
import { answerCurrent, checkCurrent, continueRound, ONE_TAP, ROUND_DONE } from './helpers';

async function signIn(page: Page) {
  const name = 'q' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  expect((await page.request.post('/api/auth/dev', { data: { name } })).ok()).toBe(true);
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
}

async function sampleDeck(page: Page) {
  const r = await page.request.post('/api/decks/sample', { data: { language: 'en' } });
  return (await r.json()).id as string;
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
    if (ONE_TAP.includes(format)) {
      // Colourful tiles: one tap is the answer (no Check button).
      await expect(page.getByRole('button', { name: 'Check' })).toHaveCount(0);
      await answerCurrent(page, format);
    } else {
      const check = page.getByRole('button', { name: 'Check' });
      await expect(check).toBeDisabled();
      await answerCurrent(page, format);
      await expect(check).toBeEnabled();
      await checkCurrent(page, format);
    }
    if (format === 'teach_back') {
      await page.getByLabel('Your reply to Revio').fill('For example, perfume spreads across a room.');
      await page.getByRole('button', { name: 'Reply to Revio' }).click();
    }
    const feedback = page.getByRole('status').filter({ has: page.getByRole('button', { name: /Continue|See results/ }) });
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText('Why?')).toBeVisible();
    await page.screenshot({ path: `e2e/screens/q-${format}.png`, fullPage: false });
    await continueRound(page);
    await expect(page.locator('section[data-format]')).toBeVisible();
  });
}

test('full session from the deck page through the summary', async ({ page }) => {
  await signIn(page);
  await page.goto('/learn');
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/deck.png', fullPage: true });
  await page.getByRole('button', { name: /^Play\b/ }).click();
  await expect(page).toHaveURL(/\/quiz\//);

  const formatsSeen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const res = await page.request.get(page.url().replace(/.*\/quiz\//, '/api/sessions/'));
    const { question } = await res.json();
    if (!question) break;
    await expect(page.locator(`section[data-format="${question.format}"]`)).toBeVisible();
    formatsSeen.add(question.format);
    await answerCurrent(page, question.format);
    await checkCurrent(page, question.format);
    if (question.format === 'teach_back') {
      await page.getByLabel('Your reply to Revio').fill('Here is an example from real life.');
      await page.getByRole('button', { name: 'Reply to Revio' }).click();
    }
    if (await continueRound(page)) break;
  }
  await expect(page.getByRole('heading', { name: ROUND_DONE })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/summary.png', fullPage: true });
  expect(formatsSeen.size).toBeGreaterThanOrEqual(4);
  await page.getByRole('link', { name: 'Back to deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await expect(page.getByText(/Learning|Familiar|Mastered/).first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/deck-after.png', fullPage: true });
});
