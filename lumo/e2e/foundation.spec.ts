import { expect, test } from '@playwright/test';

test('sign in, see home, change settings, language and username', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByRole('heading', { name: /Welcome to Revio|Bienvenue/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/signin.png' });

  // Each run gets its own account so parallel workers never share state.
  const devName = 'e2e' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  expect((await page.request.post('/api/auth/dev', { data: { name: devName } })).ok()).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Level 1').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/home.png', fullPage: true });

  await page.getByRole('link', { name: /^Me$|^Moi$/ }).click();
  await page.getByLabel(/Username|Nom d'utilisateur/).fill('Lea2011');
  await page.getByRole('button', { name: /Save|Enregistrer/ }).click();
  await expect(page.getByRole('status')).toContainText(/personal info|infos personnelles/);
  const name = 'Star' + Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  await page.getByLabel(/Username|Nom d'utilisateur/).fill(name);
  await page.getByRole('button', { name: /Save|Enregistrer/ }).click();
  await expect(page.getByRole('status')).toContainText(/Saved|Enregistré/);

  await page.getByRole('link', { name: /Settings|Réglages/ }).click();
  await page.getByRole('button', { name: 'fr', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  await page.getByRole('combobox').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByText('Police adaptée à la dyslexie').click();
  await expect(page.locator('html')).toHaveAttribute('data-dyslexic', 'true');
  await page.screenshot({ path: 'e2e/screens/settings-fr-dark.png', fullPage: true });

  // Persisted server-side: reload keeps French + dark + dyslexic font.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/');
  await page.screenshot({ path: 'e2e/screens/home-fr-dark.png', fullPage: true });
});

test('developer sign-in button', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('button', { name: /Developer sign-in|Connexion développeur/ }).click();
  await expect(page.getByRole('link', { name: /^Me$|^Moi$/ })).toBeVisible();
});

test('email code sign-in', async ({ page, request }) => {
  await page.goto('/signin');
  await page.getByRole('button', { name: 'en', exact: true }).click();
  // A fresh address per run: sign-in codes are rate-limited per email.
  await page.getByLabel('Email').fill(`e2e${Date.now()}@example.com`);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByText(/We sent a 6-digit code/)).toBeVisible();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The real code is only in the server log/email; a wrong one must be refused politely.
  await expect(page.getByRole('alert')).toContainText(/wrong or expired/);
  expect((await request.get('/api/me')).status()).toBe(401);
});
