import { expect, test } from '@playwright/test';

const NOTES = `# The Water Cycle
Evaporation is when liquid water turns into water vapour because of the sun's heat.
Condensation is the process where water vapour cools and turns into tiny droplets, forming clouds.
Precipitation is water falling from clouds as rain, snow or hail.
Transpiration is water released by plants through tiny holes in their leaves.
Runoff is water that flows over the ground into rivers and the sea.
For example, morning dew on grass is condensation.

Stages of the water cycle:
1. Water evaporates from oceans
2. Vapour rises and cools
3. Clouds form by condensation
4. Rain falls back to the ground`;

test('chat: notes → What I understood → edit → build → quiz & sandbox', async ({ page }) => {
  const name = 'c' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  await page.request.post('/api/auth/dev', { data: { name } });
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  await page.goto('/');
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByRole('button', { name: /New deck from my notes/ }).click();
  await expect(page.getByText(/Send me photos of your notes/)).toBeVisible();

  // Attach a text file (consent dialog first).
  await page.getByRole('button', { name: 'Attach photos, PDF or text' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'I understand' }).click();
  await (await chooser).setFiles({ name: 'water.txt', mimeType: 'text/plain', buffer: Buffer.from(NOTES) });
  await page.getByLabel(/Message Lumo/).fill('My science test is on Friday');
  await page.getByRole('button', { name: 'Send' }).click();

  const editor = page.getByRole('region', { name: 'What I understood' });
  await expect(editor).toBeVisible();
  await expect(editor.getByText('Condensation', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/chat-draft.png', fullPage: true });
  // Not on the exam: untick Runoff; rename the deck.
  await editor.getByLabel('Include Runoff').uncheck();
  await editor.getByLabel('Deck title').fill('Water cycle test');
  const buildBtn = editor.getByRole('button', { name: /Build my deck \(\d+ concepts\)/ });
  await buildBtn.click();
  await expect(page.getByText(/Your deck “Water cycle test” is ready/)).toBeVisible();

  // Ask for a sandbox activity in plain words.
  await page.getByRole('button', { name: 'Make a crossword' }).click();
  await expect(page.getByRole('link', { name: /Crossword/ })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/chat-built.png', fullPage: true });
  await page.getByRole('link', { name: /Crossword/ }).click();
  await expect(page.getByLabel('Type the word')).toBeVisible();

  // Back to the chat: "make it harder" gives a harder quiz.
  await page.goBack();
  await page.getByRole('button', { name: 'Make it harder' }).click();
  await page.getByRole('button', { name: /Start a harder quiz/ }).click();
  await expect(page).toHaveURL(/\/quiz\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // The deck exists without Runoff.
  const decks = await (await page.request.get('/api/decks')).json();
  const deck = await (await page.request.get(`/api/decks/${decks.decks[0].id}`)).json();
  expect(deck.deck.title).toBe('Water cycle test');
  expect(deck.concepts.map((c: { term: string }) => c.term)).not.toContain('Runoff');
});
