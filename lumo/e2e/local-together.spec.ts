import { devices, expect, test, type Page } from '@playwright/test';
import { answerAndCheck, answerCurrent, closeHatch, continueRound, ONE_TAP, openChests, ROUND_DONE } from './helpers';

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
  await a.getByRole('radio', { name: 'Friends', exact: true }).click();
  await expect(a.getByText('Your friends can see this deck now.')).toBeVisible();

  // Bruno sees Alice on the Friends page, adds her, and copies the shared deck.
  await b.getByRole('link', { name: 'Me', exact: true }).click();
  await b.getByRole('link', { name: /Friends/ }).click();
  // Alice is online right now; Bruno adds her by typing her username and pressing Enter.
  await expect(b.getByTestId('my-username')).toHaveText('Bruno');
  await expect(b.getByRole('heading', { name: /Online now \(1\)/ })).toBeVisible({ timeout: 10_000 });
  await b.getByLabel("Type a friend's username, press Enter").fill('alice');
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  // A new friend pays a few coins (enough for 2 snacks), once.
  await expect(b.getByRole('status')).toHaveText('Alice is now your friend! +20 coins for a new friend! 🪙');
  await expect(b.locator('ol li', { hasText: 'Alice' })).toBeVisible();
  await b.getByLabel("Type a friend's username, press Enter").fill('nobody');
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(b.getByRole('status')).toContainText('Nobody is called');
  await b.screenshot({ path: 'e2e/screens/web-friends.png', fullPage: true });
  await b.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(b.getByText('Cells — the basics').first()).toBeVisible();
  await b.getByRole('button', { name: 'Add to my decks' }).first().click();
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
      const f = (await section.getAttribute('data-format'))!;
      await answerCurrent(p, f); // a colour tile is sent with one tap
      if (!ONE_TAP.includes(f)) await p.getByRole('button', { name: 'Lock in answer' }).click();
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
  await a.getByRole('button', { name: /^Play\b/ }).click();
  for (let i = 0; i < 3; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(a, (await section.getAttribute('data-format'))!);
    await expect(a.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    await closeHatch(a);
    await continueRound(a);
    await closeHatch(a);
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

  // A full round, all by tapping (multiple choice and true/false answer with one tap on a tile).
  await p.getByRole('button', { name: /^Play\b/ }).tap();
  for (let i = 0; i < 30; i++) {
    const section = p.locator('section[data-format]');
    await expect(section).toBeVisible();
    const f = (await section.getAttribute('data-format'))!;
    await answerCurrent(p, f);
    if (!ONE_TAP.includes(f)) await p.getByRole('button', { name: 'Check' }).tap();
    const btn = p.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible({ timeout: 15_000 });
    await closeHatch(p);
    const last = /See results/.test((await btn.textContent()) ?? '');
    await btn.tap();
    await openChests(p);
    await closeHatch(p);
    if (last) break;
  }
  await expect(p.getByRole('heading', { name: ROUND_DONE })).toBeVisible();
  await p.getByRole('link', { name: 'Back to deck' }).tap();
  await expect(p.getByRole('heading', { name: 'Mastery map' })).toBeVisible();

  // Every mode starts (the speed run and the boss open with an intro).
  for (const [mode, go] of [
    [/Review|Fix mistakes/, null],
    [/Speed run/, /GO!/],
    [/Boss battle/, /Fight!/],
    [/Mock exam/, null],
  ] as const) {
    await p.getByRole('button', { name: mode }).first().tap();
    await expect(p.locator('section[data-format]')).toBeVisible();
    const intro = p.getByRole('dialog', { name: /Speed run|Boss battle/ });
    if (go) {
      await intro.getByRole('button', { name: go }).tap();
      await expect(intro).toHaveCount(0, { timeout: 5000 });
    } else await expect(intro).toHaveCount(0);
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
  await a.getByRole('tab', { name: 'Paste notes' }).click();
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
    const f = (await section.getAttribute('data-format'))!;
    await answerCurrent(p, f);
    if (!ONE_TAP.includes(f)) await p.getByRole('button', { name: 'Lock in answer' }).click();
  }
  await a.getByRole('button', { name: 'End game', exact: true }).click({ timeout: 15_000 });
  await a.getByRole('button', { name: 'Tap to end', exact: true }).click();
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
  await a.getByRole('button', { name: /^Play\b/ }).click();
  let hatched = false;
  for (let i = 0; i < 30; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(a, (await section.getAttribute('data-format'))!);
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
    await openChests(a);
    if (await a.getByRole('dialog', { name: 'Your egg hatched!' }).count()) {
      await a.getByRole('dialog', { name: 'Your egg hatched!' }).getByRole('button', { name: 'Keep going' }).click();
      hatched = true;
    }
    if (last) break;
  }
  expect(hatched).toBe(true);
  await expect(a.getByRole('heading', { name: ROUND_DONE })).toBeVisible();
  // The round's chest is waiting: open it.
  await a.getByRole('link', { name: 'Home', exact: true }).click();
  await a.getByRole('link', { name: /chests? to open/ }).click();
  await a.getByRole('button', { name: /^Open / }).first().click();
  await expect(a.getByText('You got')).toBeVisible({ timeout: 10_000 });
  await a.screenshot({ path: 'e2e/screens/web-chest.png' });
  // The new pet shows on the home screen.
  await a.goto(`${process.env.MULTI_URL}?uid=u_g`);
  await expect(a.locator('main a[href="/pets"]').first()).toBeVisible();
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
  await a.getByRole('tab', { name: 'Topic' }).click();
  await a.getByLabel('Just type a topic').fill('récit psychologique français secondaire 2');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  await a.getByRole('button', { name: /^Play\b/ }).click();
  // Claude may still be writing: the writing screen lets you start as soon as a few are ready.
  const section = a.locator('section[data-format]');
  const writing = a.getByRole('dialog', { name: 'Lumo is writing your test' });
  await expect(section.or(writing).first()).toBeVisible({ timeout: 10_000 });
  if (await writing.count()) await writing.getByRole('button', { name: /Play now/ }).click({ timeout: 20_000 });
  await expect(section).toBeVisible();
});

test('website: Claude writes real test questions for a new deck, line by line, and the game uses them', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const url = `${process.env.MULTI_URL}?uid=u_q&sample=ok`;
  await a.goto(url);
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_q:')) delete localStorage[k];
  });
  await a.goto(url);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByRole('tab', { name: 'Topic' }).click();
  await a.getByLabel('Just type a topic').fill('récit psychologique secondaire 2');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  // Claude starts writing as soon as the deck exists; the deck page counts the questions.
  await expect(a.getByText(/21 test questions/)).toBeVisible({ timeout: 20_000 });
  await a.screenshot({ path: 'e2e/screens/web-bank.png', fullPage: true });
  await a.getByRole('button', { name: /^Play\b/ }).click();
  let fromBank = 0;
  let wrote = false;
  for (let i = 0; i < 8; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    if (/Bank (scenario|statement|question)/.test((await section.textContent()) ?? '')) fromBank++;
    const format = (await section.getAttribute('data-format'))!;
    if (format === 'explain' || format === 'apply') {
      await section.locator('textarea').fill('It names the idea because it matters.');
      await a.getByRole('button', { name: 'Check' }).click();
    } else await answerAndCheck(a, format);
    const btn = a.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible();
    if (format === 'explain' || format === 'apply') {
      // Graded against its rubric by Claude.
      await expect(a.getByText('Good start: add the reason.')).toBeVisible();
      wrote = true;
    }
    await closeHatch(a);
    if (await continueRound(a)) break;
    await closeHatch(a);
  }
  expect(fromBank).toBeGreaterThanOrEqual(6);
  expect(wrote).toBe(true);
  // Claude explains a question again, differently, when asked.
  const back = a.getByRole('link', { name: 'Back to deck' });
  if (await back.count()) await back.click();
  else await a.getByRole('button', { name: 'Leave quiz' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
});

test('website: "explain it differently" asks Claude for a new explanation', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const url = `${process.env.MULTI_URL}?uid=u_ex&sample=ok`;
  await a.goto(url);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await a.getByRole('button', { name: /^Play\b/ }).click();
  const section = a.locator('section[data-format]');
  await expect(section).toBeVisible();
  await answerAndCheck(a, (await section.getAttribute('data-format'))!);
  const sheet = a.getByRole('status').filter({ has: a.getByRole('button', { name: /Continue|See results/ }) });
  await sheet.getByRole('button', { name: /Explain it to me differently/ }).click();
  await expect(sheet.getByText('Think of it like a crowded hallway')).toBeVisible();
});

test('website: an older deck without questions gets them written the first time you play', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  // Made outside Claude: basic questions only.
  await a.goto(`${process.env.MULTI_URL}?uid=u_old`);
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_old:')) delete localStorage[k];
  });
  await a.goto(`${process.env.MULTI_URL}?uid=u_old`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByRole('tab', { name: 'Paste notes' }).click();
  await a.getByRole('button', { name: 'Use an example' }).click();
  await a.getByRole('button', { name: /Make my deck/ }).click();
  await expect(a.getByRole('heading', { name: 'The Water Cycle', level: 1 })).toBeVisible();
  await expect(a.getByText(/Open Lumo inside Claude/)).toBeVisible();
  // Back inside Claude (slow to answer, not allowed yet): Play opens the writing screen.
  await a.goto(`${process.env.MULTI_URL}?uid=u_old&sample=slow`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByText('The Water Cycle').click();
  await a.getByRole('button', { name: /^Play\b/ }).click();
  const writing = a.getByRole('dialog', { name: 'Lumo is writing your test' });
  await expect(writing).toBeVisible();
  await expect(writing.getByRole('button', { name: /Almost there/ })).toBeDisabled();
  await writing.getByRole('button', { name: /Play now/ }).click({ timeout: 20_000 });
  await expect(a.locator('section[data-format]')).toBeVisible();
  expect(/Bank (scenario|statement|question)/.test((await a.locator('section[data-format]').textContent()) ?? '')).toBe(true);
});

test('website: saying no to Claude explains how to allow it, and basic questions still work', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_no`);
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_no:')) delete localStorage[k];
  });
  await a.goto(`${process.env.MULTI_URL}?uid=u_no`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByRole('tab', { name: 'Paste notes' }).click();
  await a.getByRole('button', { name: 'Use an example' }).click();
  await a.getByRole('button', { name: /Make my deck/ }).click();
  await expect(a.getByRole('heading', { name: 'The Water Cycle', level: 1 })).toBeVisible();
  await a.goto(`${process.env.MULTI_URL}?uid=u_no&sample=deny`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByText('The Water Cycle').click();
  await a.getByRole('button', { name: /^Play\b/ }).click();
  const writing = a.getByRole('dialog', { name: 'Lumo is writing your test' });
  await expect(writing.getByText(/needs your OK to use Claude/)).toBeVisible({ timeout: 10_000 });
  await expect(writing.getByRole('button', { name: 'Allow Claude' })).toBeVisible();
  await writing.getByRole('button', { name: /basic questions/ }).click();
  await expect(a.locator('section[data-format]')).toBeVisible();
});

test('website: Home jumps straight back into your last deck', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_jump`);
  await a.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('u_jump:') || k === 'lumo:lastDeck') delete localStorage[k];
  });
  await open(a, 'u_jump');
  // No deck yet: nothing to jump back into.
  await expect(a.getByRole('region', { name: /^Level \d+$/ })).toBeVisible();
  await expect(a.getByText('Jump back in')).toHaveCount(0);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  await a.getByRole('link', { name: 'Home', exact: true }).click();
  const jump = a.locator('section', { has: a.getByText('Jump back in') });
  await expect(jump.getByRole('heading', { name: 'Cells — the basics' })).toBeVisible();
  // One tap: a round starts.
  await jump.getByRole('button', { name: /Play/ }).click();
  await expect(a.locator('section[data-format]')).toBeVisible();
  await a.getByRole('button', { name: 'Leave quiz' }).click();
  // And the boss battle, straight from Home.
  await a.getByRole('link', { name: 'Home', exact: true }).click();
  await jump.getByRole('button', { name: 'Boss battle' }).click();
  await expect(a.getByRole('dialog', { name: 'Boss battle' })).toBeVisible();
});

test('website: a friend who can only view the page in Claude is told why friends don’t save', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_view&viewonly=1`);
  await expect(a.getByRole('link', { name: 'Learn', exact: true })).toBeVisible();
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await a.getByRole('link', { name: /Friends/ }).first().click();
  await expect(a.getByText('Claude only lets you look at this page')).toBeVisible({ timeout: 10_000 });
  // Adding someone explains it too, instead of failing quietly.
  await a.getByLabel("Type a friend's username, press Enter").fill('nobody_here');
  await a.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(a.getByRole('status')).toContainText('use the Lumo website together', { timeout: 10_000 });
});

test("website: Lumo's memory: tell Lumo about your class book, and it uses it to make the deck and write the test", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_mem&sample=ok`);
  await a.evaluate(() => localStorage.clear());
  await a.goto(`${process.env.MULTI_URL}?uid=u_mem&sample=ok`);
  await a.getByTestId('memory-card').click();
  await expect(a.getByRole('heading', { name: "Lumo's memory", level: 1 })).toBeVisible();
  await a.getByRole('button', { name: /My class book/ }).click();
  await expect(a.locator('#memory-text')).toHaveValue('In French class we use the book ');
  await a.locator('#memory-text').pressSequentially('« Zénith 2 », chapter 4');
  await a.getByRole('button', { name: 'Remember this' }).click();
  await expect(a.getByTestId('memory-notes')).toContainText('Zénith 2');
  await a.getByRole('radio', { name: 'Short' }).click();
  await expect(a.getByRole('radio', { name: 'Short' })).toHaveAttribute('aria-checked', 'true');

  // Making a deck: Lumo says it remembers, and the note goes into what Claude is asked.
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await expect(a.getByTestId('memory-link')).toContainText('Lumo remembers 1 thing about you');
  await a.getByRole('tab', { name: 'Topic' }).click();
  await a.getByLabel('Just type a topic').fill('récit psychologique secondaire 2');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => a.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts.filter((p) => p.includes('Zénith 2')).length), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const writing = await a.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts.find((p) => p.includes('writing a real test'))!);
  expect(writing).toContain('About this student');
  expect(writing).toContain('Keep explanations very short and simple.');

  // Forgetting works too.
  await a.goto(`${process.env.MULTI_URL}?uid=u_mem&sample=ok`);
  await a.getByTestId('memory-card').click();
  await a.getByRole('button', { name: /Forget: In French class/ }).click();
  await expect(a.getByText('Nothing yet. Tell Lumo about your class')).toBeVisible();
  await ctx.close();
});

test('website: after a round there is always a way out (close, or Done)', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${process.env.MULTI_URL}?uid=u_exit`);
  await a.evaluate(() => localStorage.clear());
  await a.goto(`${process.env.MULTI_URL}?uid=u_exit`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await a.getByRole('button', { name: /^Play\b/ }).click();
  for (let i = 0; i < 40; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(a, (await section.getAttribute('data-format'))!);
    await closeHatch(a);
    const last = await continueRound(a);
    await closeHatch(a);
    if (last) break;
  }
  await expect(a.getByRole('heading', { name: ROUND_DONE })).toBeVisible();
  await expect(a.getByTestId('round-close')).toBeVisible();
  await a.getByRole('link', { name: '✓ Done' }).click();
  await expect(a.getByRole('button', { name: /^Play\b/ })).toBeVisible();
  await ctx.close();
});

test('website Live: a player can leave any time, and the host can stop the game (two taps)', async ({ browser }) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(process.env.MULTI_URL!);
  await a.evaluate(() => localStorage.clear());
  await open(a, 'u_l1');
  await open(b, 'u_l2');
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(a.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  const host = async () => {
    await a.getByRole('link', { name: 'Live', exact: true }).click();
    await a.getByRole('button', { name: '5', exact: true }).click();
    await a.getByRole('button', { name: /Create game/ }).click();
    await expect(a.getByTestId('live-code')).toBeVisible();
    await b.getByRole('link', { name: 'Live', exact: true }).click();
    await b.getByRole('button', { name: /Cells — the basics/ }).click({ timeout: 15_000 });
    await expect(a.getByRole('button', { name: 'Start with 2 players' })).toBeVisible({ timeout: 10_000 });
  };

  // In the middle of a question, the player leaves: one tap asks, the second leaves.
  await host();
  await a.getByRole('button', { name: 'Start with 2 players' }).click();
  await expect(b.getByText('Question 1 of 5')).toBeVisible({ timeout: 15_000 });
  await b.getByTestId('live-leave').click();
  await expect(b.getByTestId('live-leave')).toHaveText('Tap again to leave');
  await b.getByTestId('live-leave').click();
  await expect(b.getByRole('heading', { name: 'Join a game' })).toBeVisible();

  // The host stops mid-game: everyone goes to the results.
  await expect(a.getByTestId('live-leave')).toHaveText('✕ End game');
  await a.getByTestId('live-leave').click();
  await a.getByTestId('live-leave').click();
  await expect(a.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await a.getByRole('link', { name: 'Play again' }).click();

  // From the lobby, the host closes the game: the player is told it ended.
  await host();
  await a.getByTestId('live-leave').click();
  await a.getByTestId('live-leave').click();
  await expect(a.getByRole('button', { name: /Create game/ })).toBeVisible();
  await expect(b.getByText('This game has ended.')).toBeVisible({ timeout: 15_000 });
});
