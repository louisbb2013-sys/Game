import { expect, test, type Browser, type Page } from '@playwright/test';
import { answerAndCheck, answerCurrent, closeHatch, continueRound, ONE_TAP } from './helpers';

// The standalone (Netlify) site with its real sign-in, data and room endpoints (in memory), a
// stand-in Claude and a pretend Netlify Identity for Google: e2e/fixtures/netlify-serve.ts.
// Run with NETLIFY_URL=http://127.0.0.1:8899/
test.skip(!process.env.NETLIFY_URL, 'needs the Netlify build served by e2e/fixtures/netlify-serve.ts');

const tag = () => Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6);
const PHONE = { width: 400, height: 860 };

async function open(browser: Browser, viewport = PHONE): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(process.env.NETLIFY_URL!);
  return p;
}
const inApp = (p: Page) => expect(p.getByRole('link', { name: 'Learn', exact: true })).toBeVisible({ timeout: 15_000 });

/** A learner makes an account with a Lumo name and password. */
async function signUp(browser: Browser, name: string, viewport = PHONE): Promise<Page> {
  const p = await open(browser, viewport);
  await expect(p.getByRole('tab', { name: 'Create account' })).toHaveAttribute('aria-selected', 'true');
  await p.locator('#gate-name').fill(name);
  await p.locator('#gate-password').fill('secret123');
  await p.getByRole('button', { name: 'Create my account' }).click();
  await inApp(p);
  return p;
}
async function logIn(browser: Browser, name: string): Promise<Page> {
  const p = await open(browser);
  await p.getByRole('tab', { name: 'Log in' }).click();
  await p.locator('#gate-name').fill(name);
  await p.locator('#gate-password').fill('secret123');
  await p.getByRole('button', { name: 'Log in', exact: true }).click();
  await inApp(p);
  return p;
}

test('make an account, build a deck from a topic on Home, progress follows the account', async ({ browser }) => {
  test.setTimeout(120_000);
  const name = `Ana_${tag()}`;
  const a = await signUp(browser, name);
  await expect(a.getByRole('heading', { level: 1 })).toContainText(name);
  // Home's "what do you want to study?" goes straight to building the deck.
  await a.getByRole('textbox', { name: 'What do you want to study?' }).fill('récit psychologique français secondaire 2');
  await a.getByRole('button', { name: /Generate/ }).click();
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(a.getByText(/\d+ test questions/)).toBeVisible({ timeout: 20_000 });
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
  await a.getByRole('button', { name: 'Leave quiz' }).click();
  await a.waitForTimeout(3000); // the account copy is written a moment after a change

  // Same account on another device: the deck is there.
  const again = await logIn(browser, name.toLowerCase());
  await again.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(again.getByText('Le récit psychologique').first()).toBeVisible({ timeout: 15_000 });

  // A wrong password is refused; signing out goes back to the sign-in screen.
  const wrong = await open(browser);
  await wrong.getByRole('tab', { name: 'Log in' }).click();
  await wrong.locator('#gate-name').fill(name);
  await wrong.locator('#gate-password').fill('not-it');
  await wrong.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(wrong.getByRole('alert')).toHaveText("That name and password don't match. (wrong_login)");
  await again.getByRole('link', { name: 'Me', exact: true }).click();
  await again.getByRole('button', { name: 'Sign out' }).click();
  await expect(again.getByRole('button', { name: 'Create my account' })).toBeVisible({ timeout: 15_000 });
  for (const p of [a, again, wrong]) await p.context().close();
});

test('Google sign-in and a name/password friend: add a friend, share a deck, play Live', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await open(browser);
  await a.getByRole('button', { name: 'Continue with Google' }).click();
  await inApp(a);
  const b = await signUp(browser, `Ben_${tag()}`);

  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).first().click();
  await a.getByRole('radio', { name: 'Friends', exact: true }).click();
  await expect(a.getByText('Your friends can see this deck now.')).toBeVisible({ timeout: 10_000 });
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await a.getByRole('link', { name: /Friends/ }).first().click();
  const hostName = (await a.getByTestId('my-username').textContent())!.trim();

  await b.getByRole('link', { name: 'Me', exact: true }).click();
  await b.getByRole('link', { name: /Friends/ }).first().click();
  // Strangers are never listed on the website: only people you add.
  await expect(b.getByText('People on this Lumo')).toHaveCount(0);
  await b.getByLabel("Type a friend's username, press Enter").fill(hostName);
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(b.getByRole('status')).toContainText(`${hostName} is now your friend!`, { timeout: 10_000 });
  await expect(b.getByRole('heading', { name: /Online now \([1-9]/ })).toBeVisible({ timeout: 20_000 });
  await b.screenshot({ path: 'e2e/screens/netlify-friends.png', fullPage: true });
  await b.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(b.getByText('Cells — the basics').first()).toBeVisible({ timeout: 15_000 });

  await a.getByRole('link', { name: 'Live', exact: true }).click();
  await a.getByRole('button', { name: '5', exact: true }).click();
  await a.getByRole('button', { name: /Create game/ }).click();
  await expect(a.getByTestId('live-code')).toBeVisible({ timeout: 15_000 });
  await b.getByRole('link', { name: 'Live', exact: true }).click();
  await b.getByRole('button', { name: new RegExp(`Cells — the basics.*${hostName}`) }).click({ timeout: 20_000 });
  await expect(b.getByText('Waiting for the host to start…')).toBeVisible({ timeout: 15_000 });
  await a.getByRole('button', { name: 'Start with 2 players' }).click({ timeout: 15_000 });
  for (let i = 1; i <= 5; i++) {
    await expect(b.getByText(`Question ${i} of 5`)).toBeVisible({ timeout: 15_000 });
    for (const p of [a, b]) {
      const section = p.locator('section[data-format]');
      await expect(section).toBeVisible();
      const f = (await section.getAttribute('data-format'))!;
      await answerCurrent(p, f);
      if (!ONE_TAP.includes(f)) await p.getByRole('button', { name: 'Lock in answer' }).click();
    }
    await expect(b.getByText('Waiting for the host…')).toBeVisible({ timeout: 15_000 });
    await a.getByRole('button', { name: i < 5 ? 'Next question' : 'Show the podium' }).click();
  }
  await expect(a.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await b.screenshot({ path: 'e2e/screens/netlify-podium.png', fullPage: true });
  await a.context().close();
  await b.context().close();
});

test('try without an account, make a deck from notes, then keep it in a new account', async ({ browser }) => {
  test.setTimeout(90_000);
  const p = await open(browser, { width: 1440, height: 900 });
  await p.getByRole('button', { name: 'Try it first without an account' }).click();
  await inApp(p);
  await expect(p.getByText("You're trying Lumo without an account.")).toBeVisible();
  // AI needs an account: the create page says so and offers notes.
  await p.getByRole('link', { name: 'Create', exact: true }).click();
  await expect(p.getByText('AI needs a free account')).toBeVisible();
  await p.getByRole('button', { name: 'Paste notes instead' }).click();
  await p.getByRole('button', { name: 'Use an example' }).click();
  await p.getByRole('button', { name: /Make my deck/ }).click();
  await expect(p.getByRole('button', { name: /^Play\b/ })).toBeVisible({ timeout: 15_000 }); // the new deck's page
  const deckTitle = (await p.getByRole('heading', { level: 1 }).textContent())!.trim();
  await p.getByRole('link', { name: 'Home', exact: true }).click();
  await p.getByRole('button', { name: 'Create an account to save everywhere' }).click();
  const name = `Cam_${tag()}`;
  await p.locator('#gate-name').fill(name);
  await p.locator('#gate-password').fill('secret123');
  await p.getByRole('button', { name: 'Create my account' }).click();
  await inApp(p);
  await expect(p.getByRole('heading', { level: 1 })).toContainText(name);
  await p.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(p.getByText(deckTitle).first()).toBeVisible();
  await p.context().close();
});

// A tiny real PNG (1×1), for photo uploads.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('invite link adds a friend, the friend gets a request to add back, and a shared deck plays right away', async ({ browser }) => {
  test.setTimeout(120_000);
  const aName = `Ivy_${tag()}`;
  const a = await signUp(browser, aName);
  const b = await signUp(browser, `Max_${tag()}`);
  const bName = (await b.getByRole('heading', { level: 1 }).textContent())!.match(/(Max_\w+)/)![1]!;

  // A shares the sample deck (with its questions).
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).first().click();
  await a.getByRole('radio', { name: 'Friends', exact: true }).click();
  await expect(a.getByText('Your friends can see this deck now.')).toBeVisible({ timeout: 10_000 });

  // B opens A's invite link.
  await b.goto(`${process.env.NETLIFY_URL}add/${aName}`);
  await expect(b.getByText(`${aName} is now your friend!`)).toBeVisible({ timeout: 20_000 });
  await b.getByRole('link', { name: 'Friends' }).last().click();
  // A's shared deck is on B's Friends page; B's copy plays straight away (its questions came along).
  await expect(b.getByText('Cells — the basics').first()).toBeVisible({ timeout: 15_000 });
  await b.getByRole('button', { name: 'Add to my decks' }).first().click();
  await expect(b.getByRole('heading', { name: 'Cells — the basics', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText(/\d+ test questions/)).toBeVisible();

  // A sees B's request and adds them back.
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await a.getByRole('link', { name: /Friends/ }).first().click();
  await expect(a.getByRole('heading', { name: /Friend requests \(1\)/ })).toBeVisible({ timeout: 20_000 });
  await a.getByRole('button', { name: 'Add back' }).click();
  await expect(a.getByRole('status')).toHaveText(`${bName} is now your friend!`);
  await expect(a.getByRole('heading', { name: /Friend requests/ })).toHaveCount(0, { timeout: 15_000 });
  await expect(a.getByRole('list').getByText(bName).first()).toBeVisible();
  await a.screenshot({ path: 'e2e/screens/netlify-requests.png', fullPage: true });
  for (const p of [a, b]) await p.context().close();
});

test('make a deck straight from a photo: from Home, and from the create page', async ({ browser }) => {
  test.setTimeout(90_000);
  const p = await signUp(browser, `Pix_${tag()}`);
  // Home: "Take a photo" opens the camera; the deck builds as soon as the photo is chosen.
  await p.locator('main input[capture]').first().setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: PNG });
  await expect(p.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 20_000 });

  // Create page: take two photos, see them, then read them.
  await p.goto(`${process.env.NETLIFY_URL}chat`);
  await expect(p.getByRole('tab', { name: 'Photo / PDF' })).toHaveAttribute('aria-selected', 'true');
  await p.locator('#deck-camera').setInputFiles({ name: 'page1.png', mimeType: 'image/png', buffer: PNG });
  await p.locator('#deck-camera').setInputFiles({ name: 'page2.png', mimeType: 'image/png', buffer: PNG });
  await expect(p.getByRole('img', { name: /Photo 2/ })).toBeVisible();
  await p.getByRole('button', { name: /Read my files/ }).click();
  await expect(p.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 20_000 });
  await p.context().close();
});

/** Two learners who are friends both ways (by the invite link, then "Add back"). */
async function friends(browser: Browser) {
  const aName = `Lea_${tag()}`;
  const a = await signUp(browser, aName);
  const b = await signUp(browser, `Tom_${tag()}`);
  const bName = (await b.getByRole('heading', { level: 1 }).textContent())!.match(/(Tom_\w+)/)![1]!;
  await b.goto(`${process.env.NETLIFY_URL}add/${aName}`);
  await expect(b.getByText(`${aName} is now your friend!`)).toBeVisible({ timeout: 20_000 });
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await a.getByRole('link', { name: /Friends/ }).first().click();
  await a.getByRole('button', { name: 'Add back' }).click({ timeout: 20_000 });
  await expect(a.getByRole('list').getByText(bName).first()).toBeVisible({ timeout: 10_000 });
  return { a, b, aName, bName };
}

test('Live like Gizmo: invite a friend in one tap, four answers A-D, XP bets, a clear right or wrong', async ({ browser }) => {
  test.setTimeout(180_000);
  const { a, b, bName } = await friends(browser);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).first().click();
  await expect(a.getByRole('button', { name: /^Play\b/ })).toBeVisible({ timeout: 15_000 });
  await a.getByRole('link', { name: 'Live', exact: true }).click();
  await a.getByRole('button', { name: '5', exact: true }).click();
  await a.getByRole('button', { name: /Create game/ }).click();
  await expect(a.getByTestId('live-code')).toBeVisible({ timeout: 15_000 });

  // The host invites the friend: the friend gets a pop-up (wherever they are) and joins with one tap.
  await b.getByRole('link', { name: 'Home', exact: true }).click();
  await a.getByRole('button', { name: 'Invite', exact: true }).click({ timeout: 20_000 });
  await expect(a.getByRole('button', { name: /Invited/ })).toBeDisabled();
  await expect(b.getByTestId('live-invite')).toBeVisible({ timeout: 25_000 });
  await expect(b.getByTestId('live-invite')).toContainText('invites you to play Live!');
  await b.getByTestId('live-invite').getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.getByText('Waiting for the host to start…')).toBeVisible({ timeout: 15_000 });
  await expect(b.getByTestId('live-invite')).toHaveCount(0);
  await a.getByRole('button', { name: 'Start with 2 players' }).click({ timeout: 15_000 });

  // Every question: four answers, A to D.
  await expect(b.getByText('Question 1 of 5')).toBeVisible({ timeout: 15_000 });
  for (const p of [a, b]) {
    await expect(p.locator('section[data-format="multiple_choice"] .tile')).toHaveCount(4);
    await expect(p.locator('.tile-letter')).toHaveText(['A', 'B', 'C', 'D']);
  }
  // The friend bets 25 XP that the host gets it right; the host sees someone bet on them.
  await b.getByTestId('bet-panel').getByRole('radio', { name: '25 XP' }).click();
  await b.getByTestId('bet-panel').getByRole('button', { name: /Right/ }).click();
  await expect(b.getByTestId('bet-panel')).toContainText('You bet 25 XP that');
  await expect(a.getByText('Someone bet on you!')).toBeVisible({ timeout: 15_000 });
  for (const p of [a, b]) await p.locator('section[data-format] .tile').first().click();
  // The answer screen says it plainly, in green or red, and shows the right answer on the tiles.
  for (const p of [a, b]) {
    await expect(p.getByTestId('live-verdict')).toBeVisible({ timeout: 15_000 });
    expect(['right', 'wrong']).toContain(await p.getByTestId('live-verdict').getAttribute('data-verdict'));
    await expect(p.locator('.tile[data-state="right"]')).toHaveCount(1);
    await expect(p.getByText('✓ Right answer')).toBeVisible();
  }
  await expect(b.getByText(/Good call! You won 25 XP|Bad call: you lost 25 XP/)).toBeVisible();
  await b.screenshot({ path: 'e2e/screens/netlify-live-reveal.png', fullPage: true });
  await a.getByRole('button', { name: 'End game' }).click();
  await a.getByRole('button', { name: 'Tap to end' }).click();
  await expect(b.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible({ timeout: 15_000 });
  await expect(b.getByRole('status').filter({ hasText: /🎲 [+−]25 XP/ })).toBeVisible({ timeout: 15_000 });
  expect(bName).toBeTruthy();
  for (const p of [a, b]) await p.context().close();
});

test('a public deck: anyone on Lumo finds it, its link opens it; and a deck turns into French in one tap', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await signUp(browser, `Pub_${tag()}`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).first().click();
  await expect(a.getByRole('radio', { name: 'Only me' })).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
  await a.getByRole('radio', { name: 'Public', exact: true }).click();
  await expect(a.getByText('Your deck is public now.')).toBeVisible({ timeout: 10_000 });
  const deckUrl = a.url();

  // Someone who isn't a friend finds it under Public decks.
  const s = await signUp(browser, `New_${tag()}`);
  await s.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(s.getByRole('heading', { name: /Public decks/ })).toBeVisible({ timeout: 20_000 });
  await expect(s.getByText('Cells — the basics').first()).toBeVisible();
  // ...and its link opens it too.
  const owner = await a.evaluate(() => JSON.parse(localStorage.getItem('lumo_session') ?? '{}').uid as string);
  await s.goto(`${process.env.NETLIFY_URL}shared/${owner}/${deckUrl.split('/decks/')[1]}`);
  await expect(s.getByRole('heading', { name: 'Cells — the basics', level: 1 })).toBeVisible({ timeout: 15_000 });
  await s.getByRole('button', { name: 'Add to my decks' }).click();
  await expect(s.getByRole('button', { name: /^Play\b/ })).toBeVisible({ timeout: 15_000 });

  // Switch Lumo to French: the English deck offers to turn itself into French.
  const myDeck = s.url();
  await s.goto(`${process.env.NETLIFY_URL}settings`);
  await s.getByRole('button', { name: 'fr', exact: true }).click();
  await s.goto(myDeck);
  await expect(s.getByTestId('translate-deck')).toContainText('Ce paquet est en anglais.', { timeout: 15_000 });
  await s.getByRole('button', { name: 'Traduire en français' }).click();
  await expect(s.getByRole('heading', { level: 1 })).toContainText('FR Cells', { timeout: 20_000 });
  await expect(s.getByTestId('translate-deck')).toHaveCount(0);
  for (const p of [a, s]) await p.context().close();
});
