import { expect, test, type Page } from '@playwright/test';
import { answerAndCheck } from './helpers';

// The newer extras on the Claude page build (with the viewer stand-in and a stand-in Claude): Ask Lumo
// (chat that builds a game, played in a sandbox), Monster Quest, grades, the daily gift, rarity eggs.
// Run with MULTI_URL=http://localhost:8765/multi.html
test.skip(!process.env.MULTI_URL, 'needs the browser-only build and the viewer stand-in');

async function fresh(page: Page, uid: string) {
  const url = `${process.env.MULTI_URL}?uid=${uid}&sample=ok`;
  await page.goto(url);
  await page.evaluate((u) => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${u}:`)) delete localStorage[k];
  }, uid);
  await page.goto(url);
  await expect(page.getByRole('link', { name: 'Learn', exact: true })).toBeVisible();
}

test('Ask Lumo builds a game; grade, daily gift and rarity eggs show', async ({ page }) => {
  await fresh(page, 'u_ex1');
  await expect(page.getByTestId('grade').first()).toContainText('Grade 4');
  await page.getByTestId('daily-claim').click();
  await expect(page.getByText('+20 coins!')).toBeVisible();

  await page.getByRole('link', { name: /Ask Lumo/ }).first().click();
  await page.getByRole('button', { name: 'Make me a chess lesson game for beginners' }).click();
  await page.getByTestId('ask-open-game').click();
  const frame = page.frameLocator('[data-testid="ask-game"] iframe');
  await frame.getByRole('button', { name: 'L-shape' }).click();
  await expect(frame.getByRole('heading', { name: 'Right!' })).toBeVisible();
  await page.getByRole('button', { name: /Back to chat/ }).click();
  await expect(page.getByTestId('ask-reply')).toContainText('chess lesson game');

  await page.goto(`${process.env.MULTI_URL}?uid=u_ex1&sample=ok`);
  await page.getByRole('link', { name: /\d+ Coins/ }).first().click();
  await expect(page.getByTestId('rarity-eggs')).toContainText('Divine');
});

test('Monster Quest: pick a spell, answer to cast it', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page, 'u_ex2');
  await page.getByRole('link', { name: 'Learn', exact: true }).click();
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByRole('tab', { name: 'Topic' }).click();
  await page.getByLabel('Just type a topic').fill('récit psychologique');
  await page.getByLabel('Just type a topic').press('Enter');
  await expect(page.getByText(/\d+ test questions/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Monster Quest/ }).click();
  await page.getByRole('button', { name: /Fight/ }).click();
  const arena = page.getByTestId('quest-arena');
  await expect(arena).toContainText('Slime');
  await page.getByTestId('quest-spells').getByRole('radio', { name: /Fireball/ }).click();
  for (let i = 0; i < 4; i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(page, (await section.getAttribute('data-format'))!);
    // A miss shows the explanation; a right answer moves on by itself.
    const cont = page.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    if (await cont.isVisible().catch(() => false)) await cont.click();
    await page.waitForTimeout(1300);
  }
  await expect(page.getByRole('progressbar', { name: 'Monster health' })).not.toHaveAttribute('aria-valuenow', '60');

  // The bac à sable box: a format makes that game; anything else goes straight to Lumo's chat.
  await page.goto(`${process.env.MULTI_URL}?uid=u_ex2&sample=ok`);
  await page.getByRole('link', { name: /Study Sandbox/ }).click();
  await page.getByLabel('Ask Lumo anything, or ask for a format').fill('Teach me chess with a game');
  await page.getByLabel('Ask Lumo anything, or ask for a format').press('Enter');
  await expect(page.getByRole('heading', { name: 'Ask Lumo' })).toBeVisible();
  await expect(page.getByTestId('ask-messages')).toContainText('Teach me chess with a game');
  await expect(page.getByTestId('ask-open-game')).toBeVisible();
});
