import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

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
