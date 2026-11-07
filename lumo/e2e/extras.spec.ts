import { expect, test, type Page } from '@playwright/test';
import { answerAndCheck, closeHatch, continueRound, openChests } from './helpers';

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
  const monsterHp = page.getByRole('progressbar', { name: 'Monster health' });
  for (let i = 0; i < 15 && (await monsterHp.getAttribute('aria-valuenow')) === '60'; i++) {
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

test('think first: bet coins before the choices show; the world map: conquer an island', async ({ page }) => {
  test.setTimeout(150_000);
  await fresh(page, 'u_ex3');
  // Think first comes on about one question in three; here, on every one that has choices.
  await page.evaluate(() => localStorage.setItem('lumo.thinkFirst', 'all'));
  await page.getByTestId('daily-claim').click(); // 20 coins to bet with
  await page.getByRole('link', { name: 'Learn', exact: true }).click();
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByRole('tab', { name: 'Topic' }).click();
  await page.getByLabel('Just type a topic').fill('récit psychologique');
  await page.getByLabel('Just type a topic').press('Enter');
  await expect(page.getByText(/\d+ test questions/)).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('world-map').click();
  await expect(page.getByTestId('island')).toHaveCount(1);
  await expect(page.getByTestId('island')).toHaveAttribute('data-state', 'new');
  await page.getByTestId('island').getByRole('button').click();

  let betDone = false;
  let boss = false;
  for (let i = 0; i < 25; i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    boss ||= await page.getByTestId('island-boss').isVisible().catch(() => false);
    if (!betDone && (await page.getByTestId('think-first').isVisible().catch(() => false))) {
      // The choices are hidden while you think.
      await expect(section.locator('.tile')).toHaveCount(0);
      await page.getByRole('button', { name: 'Bet 10 coins' }).click();
      await expect(section.locator('.tile').first()).toBeVisible();
      betDone = true;
    }
    const format = (await section.getAttribute('data-format'))!;
    if (format === 'explain' || format === 'apply') {
      await section.locator('textarea').fill('It names the idea because it matters.');
      await page.getByRole('button', { name: 'Check' }).click();
    } else await answerAndCheck(page, format);
    // Wait for the answer panel (an egg can hatch just then), then move on.
    await expect(page.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    await closeHatch(page);
    if (await continueRound(page)) break;
  }
  expect(betDone).toBe(true);
  expect(boss).toBe(true);
  await expect(page.getByText(/Bets: [+-]?\d+/)).toBeVisible({ timeout: 10_000 });
  const result = page.getByTestId('island-result');
  await expect(result).toContainText('Back to the map');
  await openChests(page);
  await result.click();
  await expect(page.getByRole('heading', { name: /World map/ })).toBeVisible();
  await expect(page.getByTestId('island')).toHaveAttribute('data-state', /won|new/);
});

test('making a deck: tell Lumo what is on the test, then say yes or no to each part it finds', async ({ page }) => {
  test.setTimeout(90_000);
  await fresh(page, 'u_ex4');
  await page.getByRole('link', { name: 'Learn', exact: true }).click();
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByTestId('test-box').locator('textarea').fill('Seulement la poésie');
  await page.getByRole('tab', { name: 'Paste notes' }).click();
  await page.locator('#deck-notes').fill('Mes notes de français, deux thèmes : le récit et la poésie. La strophe est surlignée.');
  await page.getByRole('button', { name: /Make my deck/ }).first().click();
  // Each part pops up: "Do you want this in your deck?"
  const ask = page.getByTestId('idea-ask');
  await expect(ask).toBeVisible({ timeout: 20_000 });
  const first = (await page.getByTestId('idea-term').textContent())!.trim();
  await page.getByTestId('idea-no').click();
  await expect(page.getByTestId('idea-term')).not.toHaveText(first);
  await page.getByTestId('idea-yes').click();
  await page.getByTestId('idea-keep-rest').click();
  await expect(page.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  // The part the student said no to isn't in the deck.
  await expect(page.getByText(first, { exact: true })).toHaveCount(0);
  // The test the student described reached Claude.
  const prompts = await page.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts);
  expect(prompts.find((p) => p.includes('Break it into the precise sub-aspects'))).toContain('Seulement la poésie');
});
