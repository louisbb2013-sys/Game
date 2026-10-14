import { devices, expect, test, type Page } from '@playwright/test';
import { answerCurrent, closeHatch } from './helpers';

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
  // Alice is online right now; Bruno adds her by typing her username and pressing Enter.
  await expect(b.getByTestId('my-username')).toHaveText('Bruno');
  await expect(b.getByRole('heading', { name: /Online now \(1\)/ })).toBeVisible({ timeout: 10_000 });
  await b.getByLabel("Type a friend's username, press Enter").fill('alice');
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(b.getByRole('status')).toHaveText('Alice is now your friend!');
  await expect(b.locator('ol li', { hasText: 'Alice' })).toBeVisible();
  await b.getByLabel("Type a friend's username, press Enter").fill('nobody');
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(b.getByRole('status')).toContainText('Nobody is called');
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

test('progress and username come back after the browser forgets everything', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  await open(a, 'u_c');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  const name = (await a.locator('main p.text-xl').first().textContent())!.trim();
  await a.waitForTimeout(2500); // the account copy is written a moment after a change

  // Wipe this learner's browser storage (keep the stand-in's shared store), then reopen.
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_c:')) delete localStorage[k]; // the raw key, past the stand-in's prefixing
  });
  await open(a, 'u_c');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(a.getByText('Cells — the basics')).toBeVisible();
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await expect(a.locator('main p.text-xl').first()).toHaveText(name);

  // Studying works on progress that came back from the account.
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByText('Cells — the basics').click();
  await a.getByRole('button', { name: /Practice/ }).click();
  for (let i = 0; i < 3; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerCurrent(a, (await section.getAttribute('data-format'))!);
    await a.getByRole('button', { name: 'Check' }).click();
    await expect(a.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    await closeHatch(a);
    await a.getByRole('status').getByRole('button', { name: /Continue|See results/ }).click();
  }
});

test('on a phone every study button answers a tap, and a slow Claude never blocks Check', async ({ browser }) => {
  test.setTimeout(180_000);
  const { defaultBrowserType: _d, ...phone } = devices['iPhone 13'];
  const ctx = await browser.newContext(phone);
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // sample=hang: Claude's answer check never replies (like an unanswered permission sheet).
  const url = `${process.env.MULTI_URL}?uid=u_m&sample=hang`;
  await p.goto(url);
  await p.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_m:')) delete localStorage[k];
  });
  await p.goto(url);
  await p.getByRole('link', { name: 'Learn', exact: true }).tap();
  await p.getByRole('button', { name: 'Try a sample deck' }).tap();
  await expect(p.getByRole('heading', { name: 'Mastery map' })).toBeVisible();

  // Locked modes explain themselves instead of doing nothing.
  await p.getByRole('button', { name: /Review/ }).first().tap();
  await expect(p.getByRole('alert')).toContainText('first round');

  // A full practice round, all by tapping.
  await p.getByRole('button', { name: /Practice/ }).tap();
  for (let i = 0; i < 30; i++) {
    const section = p.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerCurrent(p, (await section.getAttribute('data-format'))!);
    await p.getByRole('button', { name: 'Check' }).tap();
    const btn = p.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await closeHatch(p);
    const last = /See results/.test((await btn.textContent()) ?? '');
    await btn.tap();
    if (last) break;
  }
  await expect(p.getByRole('heading', { name: 'Session complete!' })).toBeVisible();
  await p.getByRole('link', { name: 'Back to deck' }).tap();
  await expect(p.getByRole('heading', { name: 'Mastery map' })).toBeVisible();

  // Every mode starts.
  for (const mode of [/Review/, /Fix mistakes/, /Challenge/, /Mock exam/]) {
    await p.getByRole('button', { name: mode }).first().tap();
    await expect(p.locator('section[data-format]')).toBeVisible();
    await p.getByRole('button', { name: 'Leave quiz' }).tap();
    await expect(p.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('decks made on two devices are both kept', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  // Device 1: makes the sample deck, which goes to the account.
  await open(a, 'u_d');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await a.waitForTimeout(2500);
  const account = await a.evaluate(() => localStorage.getItem('fake:db'));

  // Device 2 (fresh browser, account not reachable yet): makes its own deck from notes.
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) delete localStorage[k];
  });
  await open(a, 'u_d');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByRole('button', { name: 'Use an example' }).click();
  await a.getByRole('button', { name: /Make my deck/ }).click();
  await expect(a.getByRole('heading', { name: 'The Water Cycle', level: 1 })).toBeVisible();

  // Now the account (with device 1's deck) shows up: both decks stay.
  await a.evaluate((acc) => localStorage.setItem('fake:db', acc!), account);
  await open(a, 'u_d');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(a.getByText('Cells — the basics')).toBeVisible();
  await expect(a.getByText('The Water Cycle')).toBeVisible();
});

test('website Live: 100 questions, the host ends early', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  await open(a, 'u_e');
  await open(b, 'u_f');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await a.getByRole('link', { name: 'Live', exact: true }).click();
  await a.getByRole('button', { name: '100', exact: true }).click();
  await a.getByRole('button', { name: /Create game/ }).click();
  await expect(a.getByTestId('live-code')).toBeVisible();
  await b.getByRole('link', { name: 'Live', exact: true }).click();
  await b.getByRole('button', { name: /Cells — the basics/ }).click({ timeout: 15_000 });
  await expect(a.getByRole('button', { name: 'Start with 2 players' })).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: 'Start with 2 players' }).click();
  await expect(b.getByText('Question 1 of 100')).toBeVisible({ timeout: 15_000 });
  for (const p of [a, b]) {
    const section = p.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerCurrent(p, (await section.getAttribute('data-format'))!);
    await p.getByRole('button', { name: 'Lock in answer' }).click();
  }
  await a.getByRole('button', { name: 'End game' }).click({ timeout: 15_000 });
  await a.getByRole('button', { name: 'Tap to end' }).click();
  await expect(a.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible();
  await expect(b.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
});

test('website game: the study egg hatches, a round earns a chest, quests and shop work', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message));
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  await open(a, 'u_g');
  // Home shows the egg and today's quests.
  await expect(a.getByText('Common egg')).toBeVisible();
  await expect(a.getByRole('heading', { name: /Quests/ })).toBeVisible();
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await a.getByRole('button', { name: /Practice/ }).click();
  let hatched = false;
  for (let i = 0; i < 30; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerCurrent(a, (await section.getAttribute('data-format'))!);
    await a.getByRole('button', { name: 'Check' }).click();
    const btn = a.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible();
    const dialog = a.getByRole('dialog', { name: 'Your egg hatched!' });
    await a.waitForTimeout(250);
    if (await dialog.count()) {
      await expect(dialog.getByRole('heading', { name: /You got|again!/ })).toBeVisible({ timeout: 5000 });
      if (!hatched) await a.screenshot({ path: 'e2e/screens/web-hatch.png' });
      await dialog.getByRole('button', { name: 'Keep going' }).click();
      hatched = true;
    }
    const last = /See results/.test((await btn.textContent()) ?? '');
    await btn.click();
    if (last) break;
  }
  expect(hatched).toBe(true);
  await expect(a.getByRole('heading', { name: 'Session complete!' })).toBeVisible();
  // The round's chest is waiting: open it.
  await a.getByRole('link', { name: 'Home', exact: true }).click();
  await a.getByRole('link', { name: /chests? to open/ }).click();
  await a.getByRole('button', { name: /^Open / }).first().click();
  await expect(a.getByText('You got')).toBeVisible({ timeout: 10_000 });
  await a.screenshot({ path: 'e2e/screens/web-chest.png' });
  // The new pet shows on the home screen.
  await a.goto(`${process.env.MULTI_URL}?uid=u_g`);
  await expect(a.locator('a[href="/pets"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('website: a deck from just a topic (Claude researches it)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_h&sample=ok`);
  await a.evaluate(() => localStorage.clear());
  await a.goto(`${process.env.MULTI_URL}?uid=u_h&sample=ok`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByLabel('Just type a topic').fill('récit psychologique français secondaire 2');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: /Practice/ }).click();
  await expect(a.locator('section[data-format]')).toBeVisible();
});
