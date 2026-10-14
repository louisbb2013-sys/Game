import { expect, test, type Browser, type Page } from '@playwright/test';
import { answerCurrent } from './helpers';

async function newPlayer(browser: Browser, prefix: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const name = prefix + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, '');
  const r = await page.request.post('/api/auth/dev', { data: { name } });
  const user = (await r.json()).user as { id: string; username: string };
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  return { page, context, ...user };
}

test('friends: add by link, accept, see each other on the board', async ({ browser }) => {
  const a = await newPlayer(browser, 'fa');
  const b = await newPlayer(browser, 'fb');

  await a.page.goto('/friends');
  const code = (await a.page.getByTestId('friend-code').textContent())!.trim();
  await a.page.getByRole('button', { name: 'QR code' }).click();
  await expect(a.page.getByRole('img', { name: 'QR code to add me as a friend' })).toBeVisible();
  await a.page.screenshot({ path: 'e2e/screens/social-friends.png', fullPage: true });

  // b opens a's link
  await b.page.goto(`/add/${code}`);
  await expect(b.page.getByRole('status')).toHaveText('Friend request sent!');

  await a.page.reload();
  await expect(a.page.getByRole('heading', { name: 'Friend requests' })).toBeVisible();
  await a.page.getByRole('button', { name: 'Accept' }).click();
  await expect(a.page.getByRole('status')).toContainText('are now friends');
  await expect(a.page.getByRole('heading', { name: 'My friends (1)' })).toBeVisible();
  await expect(a.page.getByText(b.username).first()).toBeVisible();
  await expect(a.page.getByRole('heading', { name: /This week/ })).toBeVisible();

  await a.context.close();
  await b.context.close();
});

test('groups: create, invite by code, share a deck, play the daily quiz', async ({ browser }) => {
  const a = await newPlayer(browser, 'ga');
  const b = await newPlayer(browser, 'gb');
  await a.page.request.post('/api/decks/sample', { data: { language: 'en' } });

  await a.page.goto('/groups');
  await a.page.getByLabel('Create a group').fill('Bio squad');
  await a.page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(a.page.getByRole('heading', { name: 'Bio squad' })).toBeVisible();
  await a.page.getByLabel('Share one of my decks…').selectOption({ label: 'Cells — the basics' });
  await a.page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(a.page.getByRole('link', { name: /Cells/ }).first()).toBeVisible();
  await a.page.getByRole('button', { name: /Invite/ }).click();
  const code = (await a.page.getByTestId('group-code').textContent())!.trim();
  await a.page.screenshot({ path: 'e2e/screens/social-group.png', fullPage: true });

  await b.page.goto('/groups');
  await b.page.getByLabel('Join with a code').fill(code);
  await b.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(b.page.getByRole('heading', { name: 'Bio squad' })).toBeVisible();
  await b.page.getByRole('button', { name: "Play today's quiz" }).click();
  await expect(b.page).toHaveURL(/\/quiz\//);
  await expect(b.page.getByRole('heading', { level: 1 })).toBeVisible();

  await a.context.close();
  await b.context.close();
});

async function playQuestion(p: Page, last = false) {
  const section = p.locator('section[data-format]');
  await expect(section).toBeVisible();
  const format = (await section.getAttribute('data-format'))!;
  await answerCurrent(p, format);
  await p.getByRole('button', { name: 'Lock in answer' }).click();
  // The last player to answer goes straight to the reveal.
  if (!last) await expect(p.getByRole('status').filter({ hasText: 'Locked in!' })).toBeVisible();
}

test('live: two players play a full game to the podium', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await newPlayer(browser, 'lh');
  const guest = await newPlayer(browser, 'lg');
  const deckId = (await (await host.page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;

  await host.page.goto(`/decks/${deckId}`);
  await host.page.getByRole('link', { name: /Play Live with friends/ }).click();
  await host.page.getByRole('button', { name: '5', exact: true }).click();
  await host.page.getByRole('button', { name: /Create game/ }).click();
  await expect(host.page).toHaveURL(/\/live\/[A-Z0-9]{6}$/);
  const code = (await host.page.getByTestId('live-code').textContent())!.trim();
  await expect(host.page.getByRole('button', { name: 'Waiting for at least 2 players…' })).toBeDisabled();

  await guest.page.goto('/live');
  await guest.page.getByLabel('Game code').fill(code.toLowerCase());
  await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.page.getByText('Waiting for the host to start…')).toBeVisible();
  await expect(host.page.getByText(guest.username)).toBeVisible();
  await host.page.screenshot({ path: 'e2e/screens/live-lobby.png', fullPage: true });

  await host.page.getByRole('button', { name: 'Start with 2 players' }).click();
  for (let i = 1; i <= 5; i++) {
    await expect(guest.page.getByText(`Question ${i} of 5`)).toBeVisible();
    await playQuestion(host.page);
    if (i === 1) await guest.page.screenshot({ path: 'e2e/screens/live-question.png', fullPage: true });
    await playQuestion(guest.page, true);
    // Everyone answered: the reveal shows right away.
    await expect(guest.page.getByText('Answer', { exact: true })).toBeVisible();
    if (i === 1) await guest.page.screenshot({ path: 'e2e/screens/live-reveal.png', fullPage: true });
    await expect(guest.page.getByText('Waiting for the host…')).toBeVisible();
    await host.page.getByRole('button', { name: i < 5 ? 'Next question' : 'Show the podium' }).click();
  }

  await expect(host.page.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible();
  await expect(guest.page.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible();
  await expect(guest.page.getByRole('status').filter({ hasText: 'XP' })).toBeVisible();
  await guest.page.waitForTimeout(600);
  await guest.page.screenshot({ path: 'e2e/screens/live-podium.png', fullPage: true });

  await host.context.close();
  await guest.context.close();
});

test('live: a 100-question game the host ends early', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await newPlayer(browser, 'eh');
  const guest = await newPlayer(browser, 'eg');
  const deckId = (await (await host.page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;
  await host.page.goto(`/decks/${deckId}`);
  await host.page.getByRole('link', { name: /Play Live with friends/ }).click();
  await host.page.getByRole('button', { name: '100', exact: true }).click();
  await host.page.getByRole('button', { name: /Create game/ }).click();
  const code = (await host.page.getByTestId('live-code').textContent())!.trim();
  await guest.page.goto('/live');
  await guest.page.getByLabel('Game code').fill(code);
  await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(host.page.getByText(guest.username)).toBeVisible();
  await host.page.getByRole('button', { name: 'Start with 2 players' }).click();
  await expect(guest.page.getByText('Question 1 of 100')).toBeVisible();
  await playQuestion(host.page);
  await playQuestion(guest.page, true);
  await host.page.getByRole('button', { name: 'End game' }).click();
  await host.page.getByRole('button', { name: 'Tap to end' }).click();
  await expect(host.page.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible();
  await expect(guest.page.getByRole('heading', { name: /You won!|Final results/ })).toBeVisible();
  await expect(guest.page.getByRole('status').filter({ hasText: 'XP' })).toBeVisible();
  await host.context.close();
  await guest.context.close();
});
