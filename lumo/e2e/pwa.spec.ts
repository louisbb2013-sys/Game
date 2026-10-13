import { expect, test } from '@playwright/test';

// Only meaningful against the production build (service worker on): E2E_URL=http://localhost:3002
test.skip(!process.env.E2E_URL, 'needs the built app');

test('installed app opens with no connection and reviews a saved deck', async ({ page, context }) => {
  const name = 'p' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  await page.request.post('/api/auth/dev', { data: { name } });
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;

  await page.goto(`/decks/${deckId}`);
  await page.getByRole('button', { name: /Save for offline/ }).click();
  await expect(page.getByText('Saved offline')).toBeVisible();
  // Wait until the service worker controls the page and has cached the app.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.goto('/offline');
  await expect(page.getByText(/You're offline/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page.locator('section[data-format]')).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/pwa-offline.png' });
  await context.setOffline(false);
});
