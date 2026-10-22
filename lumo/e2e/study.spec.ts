import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { answerCurrent } from './helpers';

async function signIn(page: Page) {
  const name = 's' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  const r = await page.request.post('/api/auth/dev', { data: { name } });
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  const user = (await r.json()).user as { id: string; username: string };
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id as string;
  return { ...user, deckId };
}

test('mock exam: timed, no feedback, hand in early, report', async ({ page }) => {
  const u = await signIn(page);
  await page.goto(`/decks/${u.deckId}`);
  await page.getByRole('button', { name: /Mock exam/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const section = page.locator('section[data-format]');
    const before = await section.getAttribute('data-format');
    const bar = page.getByRole('progressbar');
    const progress = await bar.getAttribute('aria-valuenow');
    await answerCurrent(page, before!);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // No feedback screen: the next question comes straight away.
    await expect(bar).not.toHaveAttribute('aria-valuenow', progress!);
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  }
  await page.screenshot({ path: 'e2e/screens/exam-question.png' });
  await page.getByRole('button', { name: 'Hand in' }).click();
  await page.getByRole('button', { name: 'Are you sure? Tap again' }).click();
  await expect(page).toHaveURL(/\/exam\//);
  await expect(page.getByTestId('exam-percent')).toBeVisible();
  await expect(page.getByText(/not answered/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to do next' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /By topic/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/exam-report.png', fullPage: true });
});

test('study plan: exam date → daily plan → start from home', async ({ page }) => {
  const u = await signIn(page);
  await page.goto(`/decks/${u.deckId}`);
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expect(page.getByText(/Exam in 7 days/)).toBeVisible();
  await expect(page.getByText('Mock exam', { exact: false }).last()).toBeVisible();
  await page.locator('#plan').screenshot({ path: 'e2e/screens/study-plan.png' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Today's plan/ })).toBeVisible();
  await page.getByRole('button', { name: /Start today's plan/ }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('offline review: save, study with no connection, sync when back', async ({ page, context }) => {
  const u = await signIn(page);
  await page.goto(`/decks/${u.deckId}`);
  await page.getByRole('button', { name: /Save for offline/ }).click();
  await expect(page.getByText('Saved offline')).toBeVisible();
  await page.goto('/offline');
  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page.locator('section[data-format]')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  for (let i = 0; i < 20; i++) {
    const section = page.locator('section[data-format]');
    if (!(await section.isVisible())) break;
    await answerCurrent(page, (await section.getAttribute('data-format'))!);
    await page.getByRole('button', { name: 'Check' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByText(/sent when you're back online/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/offline-done.png' });

  await context.setOffline(false);
  // Back online: the app syncs by itself.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lumo_offline_queue')), { timeout: 10_000 }).toBe('[]');
  const deck = await (await page.request.get(`/api/decks/${u.deckId}`)).json();
  expect(deck.concepts.filter((c: { band: string }) => c.band !== 'new').length).toBeGreaterThan(0);
});

test('parents & teachers link, reminders, data export', async ({ page, browser }) => {
  const u = await signIn(page);
  await page.goto('/settings');

  // Reminders
  await page.getByRole('switch', { name: 'Remind me to study' }).check({ force: true });
  await expect(page.getByLabel('Time')).toBeVisible();
  await expect
    .poll(async () => (await (await page.request.get('/api/me')).json()).user.settings.reminder?.enabled)
    .toBe(true);

  // Progress link
  await page.getByLabel('Who is it for?').fill('Mum');
  await page.getByRole('button', { name: 'Make link' }).click();
  await expect(page.getByText('Mum')).toBeVisible();
  const { links } = await (await page.request.get('/api/me/shares')).json();
  const parent = await (await browser.newContext()).newPage();
  await parent.goto(links[0].url.replace(/^https?:\/\/[^/]+/, ''));
  await expect(parent.getByRole('heading', { name: u.username })).toBeVisible();
  await expect(parent.getByText('Cells — the basics')).toBeVisible();
  await parent.screenshot({ path: 'e2e/screens/progress-link.png', fullPage: true });
  await page.getByRole('button', { name: 'Turn off' }).click();
  await parent.reload();
  await expect(parent.getByText(/turned off/)).toBeVisible();

  // Export
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /Download my data/ }).click();
  const file = await (await download).path();
  const data = JSON.parse(readFileSync(file!, 'utf8'));
  expect(data.user.username).toBe(u.username);
  expect(data.decks[0].concepts.length).toBeGreaterThan(3);
  await page.screenshot({ path: 'e2e/screens/settings-m6.png', fullPage: true });
});

test('audio mode: Lumo asks, you rate yourself', async ({ page }) => {
  test.setTimeout(90_000);
  const u = await signIn(page);
  await page.goto(`/decks/${u.deckId}`);
  await page.getByRole('link', { name: /Audio mode/ }).click();
  await page.getByRole('button', { name: /Start \(/ }).click();
  await expect(page.getByText('1 / 9')).toBeVisible();
  await expect(page.getByRole('button', { name: /I knew it/ })).toBeVisible({ timeout: 45_000 });
  await page.screenshot({ path: 'e2e/screens/audio.png' });
  await page.getByRole('button', { name: /I knew it/ }).click();
  await expect(page.getByText('2 / 9')).toBeVisible();
  await page.getByRole('button', { name: /Pause/ }).click();
  await expect(page.getByRole('button', { name: /Start \(/ })).toBeVisible();
});
