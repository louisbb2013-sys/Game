import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://lumo:lumo@localhost:5432/lumo' });
test.afterAll(() => db.end());

async function setup(page: Page) {
  const name = 'g' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  const r = await page.request.post('/api/auth/dev', { data: { name } });
  const id = (await r.json()).user.id as string;
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  return id;
}

test('league: earn XP, join a group, see yourself in the table', async ({ page }) => {
  const id = await setup(page);
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;
  const a = await (await page.request.post('/api/sandbox', { data: { deckId, kind: 'flashcards' } })).json();
  await page.request.post(`/api/sandbox/${a.id}/complete`, { data: { score: 1 } });
  await page.goto('/league');
  await expect(page.getByRole('heading', { name: 'Bronze League' })).toBeVisible();
  const me = page.locator('li', { hasText: '(you)' });
  await expect(me).toContainText('25 XP');
  await page.getByRole('tab', { name: 'Global' }).click();
  await expect(page.getByText('25 XP').first()).toBeVisible();
  await page.getByRole('tab', { name: 'My league' }).click();
  await page.screenshot({ path: 'e2e/screens/game-league.png', fullPage: true });
  expect(id).toBeTruthy();
});

test('shop, chest opening, pets, quests and badges', async ({ page }) => {
  const id = await setup(page);
  await db.query('UPDATE users SET coins = 1000 WHERE id = $1', [id]);
  await db.query("INSERT INTO chests (user_id, kind, source) VALUES ($1, 'epic', 'test')", [id]);

  // Shop
  await page.goto('/shop');
  await page.getByRole('button', { name: /Buy Pet snack for 10 coins/ }).click();
  await expect(page.getByRole('status')).toContainText('You bought: Pet snack');
  await page.getByRole('button', { name: /Buy Mystery egg/ }).click();
  await page.getByRole('button', { name: /Buy Ocean theme/ }).click();
  await page.screenshot({ path: 'e2e/screens/game-shop.png', fullPage: true });

  // My stuff: open the chest, wear the theme
  await page.getByRole('tab', { name: /My stuff/ }).click();
  await page.getByRole('button', { name: /Open epic chest/ }).click();
  await expect(page.getByText('You got')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(900); // let the loot animate in
  await page.screenshot({ path: 'e2e/screens/game-chest.png' });
  await page.getByRole('button', { name: 'Awesome!' }).click();
  await page.locator('li', { hasText: 'Ocean theme' }).getByRole('button', { name: 'Wear' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'theme_ocean');

  // Pets: adopt, feed, hatch
  await page.goto('/pets');
  await page.getByRole('radio', { name: /Pixel Owl/ }).click();
  await page.getByLabel('Give it a name').fill('Hoot');
  await page.getByRole('button', { name: 'Adopt!' }).click();
  await expect(page.getByRole('button', { name: /Hoot/ })).toBeVisible();
  await page.getByRole('button', { name: /Feed \(\d+ snacks?\)/ }).click();
  await expect(page.getByText(/15 \//)).toBeVisible();
  await page.getByRole('button', { name: /Mystery egg/ }).click();
  await expect(page.getByText(/Collection \(2 of 16 species\)|Collection \(1 of 16 species\)/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/game-pets.png', fullPage: true });

  // Home: quests, pet card; Profile: badges
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Quests/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Hoot/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/game-home.png', fullPage: true });
  await page.goto('/me');
  await expect(page.getByRole('heading', { name: /Badges \(\d+\/19\)/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/game-profile.png', fullPage: true });
});

test('level-up and badge pop-ups after finishing an activity', async ({ page }) => {
  const id = await setup(page);
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;
  await db.query('UPDATE users SET xp = 45 WHERE id = $1', [id]);
  const a = await (await page.request.post('/api/sandbox', { data: { deckId, kind: 'cheat_sheet' } })).json();
  await page.goto(`/sandbox/play/${a.id}`);
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Level 2!')).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/game-levelup.png' });

  // A finished quest can be claimed on Home for coins.
  const before = (await db.query('SELECT coins FROM users WHERE id = $1', [id])).rows[0].coins;
  await db.query("UPDATE user_quests SET progress = target WHERE user_id = $1", [id]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Claim' }).first().click();
  await expect.poll(async () => (await db.query('SELECT coins FROM users WHERE id = $1', [id])).rows[0].coins).toBeGreaterThan(before);
});
