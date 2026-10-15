import { expect, test, type Browser, type Page } from '@playwright/test';
import { answerAndCheck, answerCurrent, closeHatch, continueRound, ONE_TAP } from './helpers';

// The standalone (Netlify) site against the local Firebase emulators.
// Run with NETLIFY_URL=http://127.0.0.1:8899/ (a build made with VITE_FIREBASE_EMULATOR=127.0.0.1).
test.skip(!process.env.NETLIFY_URL, 'needs the Netlify build and the Firebase emulators');

const run = Date.now().toString(36);

/** A learner signs in with (a test) Google account in their own browser. */
async function student(browser: Browser, id: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  await p.goto(process.env.NETLIFY_URL!);
  await expect(p.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await p.evaluate((u) => (window as unknown as { __lumoTestSignIn: (id: string) => Promise<unknown> }).__lumoTestSignIn(u), `${id}-${run}`);
  await expect(p.getByRole('link', { name: 'Learn', exact: true })).toBeVisible({ timeout: 15_000 });
  return p;
}

test('sign in with Google, make a deck from a topic, progress follows the account', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await student(browser, 'ana');
  await a.screenshot({ path: 'e2e/screens/netlify-home.png', fullPage: true });
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByLabel('Just type a topic').fill('récit psychologique français secondaire 2');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 15_000 });
  // Claude writes the test questions right after the deck is made.
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

  // Same Google account on a new device: the deck is there.
  const again = await student(browser, 'ana');
  await again.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(again.getByText('Le récit psychologique')).toBeVisible({ timeout: 15_000 });

  // Signing out goes back to the sign-in screen.
  await again.getByRole('link', { name: 'Me', exact: true }).click();
  await again.getByRole('button', { name: 'Sign out' }).click();
  await expect(again.getByRole('button', { name: 'Continue with Google' })).toBeVisible({ timeout: 15_000 });
  await a.context().close();
  await again.context().close();
});

test('two Google accounts: add a friend by username, share a deck, play Live', async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await student(browser, 'host');
  const b = await student(browser, 'guest');

  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('button', { name: 'Try a sample deck' }).click();
  await a.getByRole('switch', { name: /Share with friends/ }).click();
  await expect(a.getByText('Your friends can see this deck now.')).toBeVisible({ timeout: 10_000 });
  await a.getByRole('link', { name: 'Me', exact: true }).click();
  await a.getByRole('link', { name: /Friends/ }).click();
  const hostName = (await a.getByTestId('my-username').textContent())!.trim();

  await b.getByRole('link', { name: 'Me', exact: true }).click();
  await b.getByRole('link', { name: /Friends/ }).click();
  await expect(b.getByRole('heading', { name: /Online now \([1-9]/ })).toBeVisible({ timeout: 15_000 });
  await b.getByLabel("Type a friend's username, press Enter").fill(hostName);
  await b.getByLabel("Type a friend's username, press Enter").press('Enter');
  await expect(b.getByRole('status')).toHaveText(`${hostName} is now your friend!`, { timeout: 10_000 });
  await b.screenshot({ path: 'e2e/screens/netlify-friends.png', fullPage: true });
  await b.getByRole('link', { name: 'Learn', exact: true }).click();
  await expect(b.getByText('Cells — the basics').first()).toBeVisible({ timeout: 10_000 });

  await a.getByRole('link', { name: 'Live', exact: true }).click();
  await a.getByRole('button', { name: '5', exact: true }).click();
  await a.getByRole('button', { name: /Create game/ }).click();
  await expect(a.getByTestId('live-code')).toBeVisible({ timeout: 15_000 });
  await b.getByRole('link', { name: 'Live', exact: true }).click();
  await b.getByRole('button', { name: new RegExp(`Cells — the basics.*${hostName}`) }).click({ timeout: 15_000 });
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
