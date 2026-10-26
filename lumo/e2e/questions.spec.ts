import { expect, test, type Page } from '@playwright/test';
import { answerAndCheck, closeHatch, continueRound, openChests, ROUND_DONE } from './helpers';

// The question system on the Claude page build (with the viewer stand-in and a stand-in Claude):
// making a deck your way, a whole-deck round (one question per fact, never the same one twice, pop-ups),
// every question on its own page (fix, add, remove), adding notes to a deck, and picking a round back up.
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

/** Make the récit deck from a topic, with some options, and wait until its questions are written. */
async function makeDeck(a: Page) {
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await a.getByRole('tab', { name: 'Topic' }).click();
  // Make it yours: level, harder, quick checks.
  await a.getByTestId('deck-options').locator('summary').click();
  await a.getByLabel('Your level').fill('Secondaire 2');
  await a.getByRole('radio', { name: 'Harder' }).click();
  await a.getByRole('button', { name: /Quick checks/ }).click();
  await expect(a.getByTestId('deck-options').locator('summary')).toContainText('Secondaire 2');
  await a.getByLabel('Just type a topic').fill('récit psychologique');
  await a.getByLabel('Just type a topic').press('Enter');
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible({ timeout: 10_000 });
  await expect(a.getByText(/21 test questions/)).toBeVisible({ timeout: 20_000 });
}

test('a deck made your way: the whole deck in one round, every question on its own page, new notes added', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await fresh(a, 'u_qs');
  await makeDeck(a);

  // Claude was told: the level, harder, mostly quick checks; and to break the topic into every fact.
  const prompts = await a.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts);
  const reading = prompts.find((p) => p.includes('Break it into the precise sub-aspects'))!;
  expect(reading).toContain("The student's level: Secondaire 2");
  const writing = prompts.find((p) => p.includes('Write exactly the number of questions asked for each fact'))!;
  expect(writing).toContain('level: Secondaire 2');
  expect(writing).toContain('Level: challenging');
  expect(writing).toContain('quick checks');
  expect(writing).toMatch(/\[1\] .+ → write 2/);

  // Play: the whole deck (7 facts), each question once; a missed idea comes back with another question.
  await expect(a.getByTestId('play-all')).toContainText('7 questions');
  // The deck is small: no separate short round (it would be as long as the whole deck).
  await expect(a.getByTestId('play-quick')).toHaveCount(0);
  await a.getByTestId('play-all').click();
  const asked: string[] = [];
  let pops = 0;
  for (let i = 0; i < 20; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    asked.push(((await section.textContent()) ?? '').replace(/\s+/g, ' '));
    const format = (await section.getAttribute('data-format'))!;
    if (format === 'explain' || format === 'apply') {
      await section.locator('textarea').fill('It names the idea because it matters.');
      await a.getByRole('button', { name: 'Check' }).click();
    } else await answerAndCheck(a, format);
    await expect(a.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    pops += await a.getByTestId('pop-up').count();
    await closeHatch(a);
    if (await continueRound(a)) break;
  }
  expect(asked.length).toBeGreaterThanOrEqual(7);
  expect(new Set(asked).size).toBe(asked.length); // never the same question twice
  // The last question of the topic closes the chapter with a pop-up.
  expect(pops).toBeGreaterThanOrEqual(1);
  await expect(a.getByText(ROUND_DONE)).toBeVisible({ timeout: 10_000 });
  await openChests(a);

  // Every question, with its answer and the fact it checks; fix one, write one, remove one.
  await a.goto(`${process.env.MULTI_URL}?uid=u_qs&sample=ok`);
  await a.getByRole('link', { name: 'Learn', exact: true }).click();
  await a.getByText('Le récit psychologique').first().click();
  await a.getByTestId('all-questions').click();
  await expect(a.getByTestId('deck-questions')).toContainText('21 questions');
  await expect(a.getByTestId('deck-questions')).toContainText('7/7 facts covered');
  const row = a.getByTestId('question-row').filter({ hasText: 'Bank statement' }).first();
  await row.locator('button').first().click();
  await expect(row).toContainText('Fact');
  await row.getByRole('button', { name: /Edit/ }).click();
  const editor = a.getByTestId('question-editor');
  await editor.getByLabel('Statement to judge').fill('Le narrateur peut être un personnage de l’histoire.');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  await expect(a.getByText('Le narrateur peut être un personnage de l’histoire.')).toBeVisible();
  await a.getByTestId('new-question').click();
  await editor.getByLabel('Kind').selectOption('typed');
  await editor.getByLabel('Question').fill('Comment appelle-t-on celui qui raconte l’histoire?');
  await editor.getByLabel('Right answers (one per line)').fill('le narrateur\nnarrateur');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(a.getByTestId('deck-questions')).toContainText('22 questions');
  const mine = a.getByTestId('question-row').filter({ hasText: 'Comment appelle-t-on celui qui raconte' });
  await mine.locator('button').first().click();
  await mine.getByRole('button', { name: /Remove/ }).click();
  await mine.getByRole('button', { name: /Remove it\?/ }).click();
  await expect(a.getByTestId('deck-questions')).toContainText('21 questions');

  // New notes added to the deck: only what's new is kept, and Claude writes its questions.
  await a.getByRole('link', { name: /Back/ }).first().click();
  await a.getByTestId('add-notes').click();
  await expect(a.getByRole('heading', { name: 'Le récit psychologique', level: 1 })).toBeVisible();
  await a.getByRole('tab', { name: 'Paste notes' }).click();
  await a.locator('#deck-notes').fill('La chute surprend le lecteur. Le narrateur peut être un personnage.');
  await a.getByRole('button', { name: /Add to my deck/ }).click();
  await expect(a.getByTestId('notes-added')).toContainText('new ideas 1, new facts 2', { timeout: 10_000 });
  const add = await a.evaluate(() => (window as unknown as { __prompts: string[] }).__prompts.filter((p) => p.includes('The deck ALREADY has these sub-aspects')));
  expect(add[0]).toContain('Narrateur');
  await expect(a.getByText(/2[4-9] test questions|3\d test questions/)).toBeVisible({ timeout: 20_000 });
});

test('a whole-deck round left halfway picks up where it stopped; a speed run has no pop-ups', async ({ browser }) => {
  test.setTimeout(200_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await fresh(a, 'u_qr');
  await makeDeck(a);
  await a.getByTestId('play-all').click();
  for (let i = 0; i < 2; i++) {
    const section = a.locator('section[data-format]');
    await expect(section).toBeVisible();
    const format = (await section.getAttribute('data-format'))!;
    if (format === 'explain' || format === 'apply') {
      await section.locator('textarea').fill('It names the idea because it matters.');
      await a.getByRole('button', { name: 'Check' }).click();
    } else await answerAndCheck(a, format);
    await closeHatch(a);
    await continueRound(a);
  }
  await a.getByRole('button', { name: 'Leave quiz' }).click();
  await expect(a.getByTestId('resume-round')).toContainText('2 of');
  await a.getByTestId('resume-round').click();
  await expect(a.locator('section[data-format]')).toBeVisible();
  await a.getByRole('button', { name: 'Leave quiz' }).click();


  // Speed run: straight to the next question, nothing popping up.
  await a.getByRole('button', { name: /Speed run/ }).click();
  await a.getByRole('button', { name: /GO!/ }).click();
  let seen = 0;
  for (let i = 0; i < 8; i++) {
    // A speed run moves on by itself: tap whatever tile is there, never wait long for one.
    const tile = a.locator('section[data-format] .tile').first();
    if (await tile.isVisible().catch(() => false)) await tile.click({ timeout: 2000 }).catch(() => {});
    seen += await a.getByTestId('pop-up').count();
    await a.waitForTimeout(400);
  }
  expect(seen).toBe(0);
});
