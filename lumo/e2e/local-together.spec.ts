import { expect, test, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

// Browser-only build + a stand-in for the Claude viewer (shared data and rooms between tabs).
// Run with MULTI_URL=http://localhost:8765/multi.html
test.skip(!process.env.MULTI_URL, 'needs the browser-only build and the viewer stand-in');

async function open(page: Page, uid: string) {
  await page.goto(`${process.env.MULTI_URL}?uid=${uid}`);
  await expect(page.getByRole('link', { name: 'Learn', exact: true })).toBeVisible();
}

test('friends, a shared deck and a two-player Live game on the website', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  const b = await ctx.newPage();
  await open(a, 'u_a');
  await open(b, 'u_b');

  // Alice makes a deck, earns a little XP and shares the deck.
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await a.getByRole('switch', { name: /Share with friends/ }).click();
  await expect(a.getByText('Your friends can see this deck now.')).toBeVisible();

  // Bruno sees Alice on the Friends page, adds her, and copies the shared deck.
  await b.getByRole('link', { name: 'Me', exact: true }).click();
  await b.getByRole('link', { name: /Friends/ }).click();
  await expect(b.getByText('Alice')).toBeVisible({ timeout: 10_000 });
  await b.getByRole('button', { name: 'Add' }).first().click();
  await expect(b.getByRole('heading', { name: /This week/ })).toBeVisible();
  await expect(b.locator('li', { hasText: 'Alice' })).toBeVisible();
  await b.screenshot({ path: 'e2e/screens/web-friends.png', fullPage: true });
  await b.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(b.getByText('Cells — the basics').first()).toBeVisible();
  await b.getByRole('button', { name: 'Add' }).first().click();
  await expect(b.getByRole('heading', { name: 'Mastery map' })).toBeVisible();

  // Alice hosts a Live game; Bruno joins from "Games now".
  await a.getByRole('link', { name: 'Live', exact: true }).click();
  await a.getByRole('button', { name: '5', exact: true }).click();
  await a.getByRole('button', { name: /Create game/ }).click();
  const code = (await a.getByTestId('live-code').textContent())!.trim();
  await b.getByRole('link', { name: 'Live', exact: true }).click();
  await expect(b.getByText('Games now')).toBeVisible({ timeout: 10_000 });
  await b.getByRole('button', { name: /Cells — the basics/ }).click();
  await expect(b.getByText('Waiting for the host to start…')).toBeVisible({ timeout: 10_000 });
  await expect(a.getByText('Bruno')).toBeVisible({ timeout: 10_000 });
  await a.screenshot({ path: 'e2e/screens/web-lobby.png', fullPage: true });
  await a.getByRole('button', { name: 'Start with 2 players' }).click();

  for (let i = 1; i <= 5; i++) {
    await expect(b.getByText(`Question ${i} of 5`)).toBeVisible({ timeout: 15_000 });
    for (const p of [a, b]) {
      const section = p.locator('section[data-format]');
      await expect(section).toBeVisible();
      await answerCurrent(p, (await section.getAttribute('data-format'))!);
      await p.getByRole('button', { name: 'Lock in answer' }).click();
    }
    await expect(b.getByText('Waiting for the host…')).toBeVisible({ timeout: 15_000 });
    if (i === 1) await b.screenshot({ path: 'e2e/screens/web-reveal.png', fullPage: true });
    await a.getByRole('button', { name: i < 5 ? 'Next question' : 'Show the podium' }).click();
  }
  await expect(a.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByRole('status').filter({ hasText: 'XP' })).toBeVisible({ timeout: 10_000 });
  await b.screenshot({ path: 'e2e/screens/web-podium.png', fullPage: true });
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
});
