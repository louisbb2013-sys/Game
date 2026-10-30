import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const name = 's' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  expect((await page.request.post('/api/auth/dev', { data: { name } })).ok()).toBe(true);
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id as string;
  return deckId;
}

async function make(page: Page, deckId: string, kind: string) {
  const r = await page.request.post('/api/sandbox', { data: { deckId, kind } });
  expect(r.ok(), kind).toBe(true);
  const a = await r.json();
  await page.goto(`/sandbox/play/${a.id}`);
  return a.data;
}

const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name });

/** Answer a quiz question correctly through the real UI, using the answer key the game ships with. */
async function answerCorrectly(page: Page, q: any) {
  const byText = (id: string, opts: { id: string; text: string }[]) => opts.find((o) => o.id === id)!.text;
  switch (q.format) {
    case 'multiple_choice':
    case 'cause_effect':
      await page.getByRole('radio', { name: byText(q.correctId, q.options), exact: false }).first().click();
      break;
    case 'multiple_select':
      for (const id of q.correctIds) await page.getByRole('checkbox', { name: byText(id, q.options) }).click();
      break;
    case 'type_answer':
      await page.getByLabel('Your answer').fill(q.accepted[0]);
      break;
    case 'fill_blank':
      for (const [i, b] of q.blanks.entries()) await page.getByLabel(`Blank ${i + 1}`).fill(b.accepted[0]);
      break;
    case 'calculation':
      await page.getByLabel('Your answer').fill(String(q.answer));
      break;
    case 'spot_mistake':
      await page.locator('fieldset').getByRole('button', { name: byText(q.wrongId, q.segments), exact: true }).click();
      await page.getByLabel('Correction').fill(q.correction[0]);
      break;
    case 'matching':
    case 'categorize': {
      const pairs: [string, string][] = q.format === 'matching' ? Object.entries(q.pairs).map(([l, r]) => [r as string, l]) : Object.entries(q.mapping) as [string, string][];
      const chips = q.format === 'matching' ? q.right : q.items;
      const zones = q.format === 'matching' ? q.left : q.categories;
      for (const [chipId, zoneId] of pairs) {
        await page.locator('[data-drop="__pool"]').getByRole('button', { name: byText(chipId, chips), exact: true }).click();
        await page.getByRole('button', { name: byText(zoneId, zones), exact: true }).click({ position: { x: 6, y: 6 } });
      }
      break;
    }
    case 'ordering': {
      for (let k = 0; k < q.correctOrder.length; k++) {
        const want = byText(q.correctOrder[k], q.items);
        for (let guard = 0; guard < 10; guard++) {
          const texts = await page.locator('ol li').allInnerTexts();
          const pos = texts.findIndex((t) => t.includes(want));
          if (pos <= k) break;
          await page.getByRole('button', { name: 'Move up' }).nth(pos).click();
        }
      }
      break;
    }
    default:
      throw new Error('no correct-answer helper for ' + q.format);
  }
}

async function expectReward(page: Page, kind: string) {
  await expect(page.getByText(/\d+%/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /New version/ })).toBeVisible();
  await page.screenshot({ path: `e2e/screens/sb-${kind}-done.png` });
}

test.describe('Study Sandbox players', () => {
  test('hub lists every format and "ask for anything" works', async ({ page }) => {
    await setup(page);
    await page.goto('/sandbox');
    await expect(page.getByRole('heading', { name: 'Study Sandbox' })).toBeVisible();
    for (const name of ['Explainer video', 'Podcast', 'Crossword', 'Escape room', 'Mind map', 'Memory tricks']) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/sb-hub.png', fullPage: true });
    await page.getByLabel('Ask Lumo anything, or ask for a format').fill('make me a word search about osmosis');
    await btn(page, 'Make it').click();
    await expect(page.getByRole('heading', { name: /Word search/ })).toBeVisible();
  });

  test('video: scenes, pause-and-predict checks, finish', async ({ page }) => {
    const d = await make(page, await setup(page), 'video');
    await page.screenshot({ path: 'e2e/screens/sb-video.png' });
    for (let i = 0; i < d.scenes.length + 2; i++) {
      if (await btn(page, 'Finish').isVisible()) break;
      const check = page.getByRole('button', { name: 'Continue' });
      if (await page.getByText('Pause and predict!').isVisible()) {
        await page.locator('.pop-in button').first().click();
        await page.screenshot({ path: 'e2e/screens/sb-video-check.png' });
        await check.click();
      } else await btn(page, 'Next').click();
    }
    await btn(page, 'Finish').click();
    await expectReward(page, 'video');
  });

  test('podcast: transcript, quick checks', async ({ page }) => {
    await make(page, await setup(page), 'podcast');
    for (let i = 0; i < 80; i++) {
      if (await btn(page, 'Finish').isVisible()) break;
      if (await btn(page, 'Continue').isVisible()) await btn(page, 'Continue').click();
      else if (await page.locator('.pop-in button').first().isVisible() && !(await btn(page, 'Next').isVisible())) await page.locator('.pop-in button').first().click();
      else await btn(page, 'Next').click();
    }
    await page.screenshot({ path: 'e2e/screens/sb-podcast.png' });
    await btn(page, 'Finish').click();
    await expectReward(page, 'podcast');
  });

  test('story: unlock chapters by answering', async ({ page }) => {
    const d = await make(page, await setup(page), 'story');
    for (let i = 0; i < d.chapters.length; i++) {
      await btn(page, /Unlock the next chapter/).click();
      await page.locator('.pop-in .grid button').first().click();
      await btn(page, 'Continue').click();
    }
    await btn(page, 'Finish').click();
    await expectReward(page, 'story');
  });

  test('crossword: fill, check, finish', async ({ page }) => {
    const d = await make(page, await setup(page), 'crossword');
    await page.screenshot({ path: 'e2e/screens/sb-crossword.png' });
    // Type the first answer for real, reveal the rest.
    await page.getByLabel('Type the word').fill(d.entries[0].answer.toLowerCase());
    for (let i = 1; i < d.entries.length; i++) {
      await btn(page, /Next →/).click();
      await btn(page, /Reveal/).click();
    }
    await btn(page, 'Check').click();
    await btn(page, /Finish — \d+%/).click();
    await expectReward(page, 'crossword');
  });

  test('word search: find a word by tapping its ends', async ({ page }) => {
    const d = await make(page, await setup(page), 'word_search');
    // Locate the first word in the grid (any direction) and tap first + last letters.
    const w = d.words[0].word;
    const n = d.size;
    const dirs = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
    let found: number[] | null = null;
    for (let r = 0; r < n && !found; r++) for (let c = 0; c < n && !found; c++) for (const [dr, dc] of dirs) {
      let ok = true;
      for (let k = 0; k < w.length && ok; k++) ok = d.grid[r + dr * k]?.[c + dc * k] === w[k];
      if (ok) { found = [r, c, r + dr * (w.length - 1), c + dc * (w.length - 1)]; break; }
    }
    expect(found).not.toBeNull();
    await page.getByRole('button', { name: `${w[0]} ${found![0] + 1},${found![1] + 1}` }).click();
    await page.getByRole('button', { name: `${w.at(-1)} ${found![2] + 1},${found![3] + 1}` }).click();
    await expect(page.getByText(`✓ ${d.words[0].display}`)).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/sb-word_search.png' });
    await btn(page, /finish|Finish/).click();
    await expectReward(page, 'word_search');
  });

  test('memory: match all pairs', async ({ page }) => {
    const d = await make(page, await setup(page), 'memory');
    const partner = new Map<string, string>();
    for (const p of d.pairs) { partner.set(p.a, p.b); partner.set(p.b, p.a); }
    const cards = page.getByRole('main').locator('.grid button');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    const known = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      if (await cards.nth(i).isDisabled()) continue;
      await cards.nth(i).click();
      const text = (await cards.nth(i).innerText()).trim();
      const mate = [...known.entries()].find(([t]) => partner.get(text) === t);
      if (mate) {
        await cards.nth(mate[1]).click();
        await expect(cards.nth(i)).toBeDisabled();
      } else if (i + 1 < count) {
        await cards.nth(i + 1).click();
        const t2 = (await cards.nth(i + 1).innerText()).trim();
        known.set(text, i);
        known.set(t2, i + 1);
        if (partner.get(text) === t2) await expect(cards.nth(i)).toBeDisabled();
        else await page.waitForTimeout(1300);
        i++;
      }
    }
    // Clean up any pairs we saw but haven't matched yet.
    for (let guard = 0; guard < 20 && !(await btn(page, 'Finish').isVisible()); guard++) {
      const open = [];
      for (let i = 0; i < count; i++) if (!(await cards.nth(i).isDisabled())) open.push(i);
      const texts = new Map<number, string>();
      for (const i of open) { const t = [...known.entries()].find(([, idx]) => idx === i)?.[0]; if (t) texts.set(i, t); }
      const a = [...texts.entries()].find(([, t]) => [...texts.values()].includes(partner.get(t)!));
      if (!a) break;
      const b = [...texts.entries()].find(([, t]) => t === partner.get(a[1]))!;
      await cards.nth(a[0]).click();
      await cards.nth(b[0]).click();
      await expect(cards.nth(a[0])).toBeDisabled();
    }
    await page.screenshot({ path: 'e2e/screens/sb-memory.png' });
    await btn(page, 'Finish').click();
    await expectReward(page, 'memory');
  });

  test('word scramble: hints solve it', async ({ page }) => {
    const d = await make(page, await setup(page), 'scramble');
    for (const item of d.items) {
      for (let k = 0; k < item.answer.length && !(await btn(page, 'Continue').isVisible()); k++) await btn(page, /Hint/).click();
      await btn(page, 'Continue').click();
    }
    await btn(page, 'Finish').click();
    await expectReward(page, 'scramble');
  });

  test('quiz show: answer a cell correctly for points', async ({ page }) => {
    const d = await make(page, await setup(page), 'quiz_show');
    await page.screenshot({ path: 'e2e/screens/sb-quiz_show.png' });
    const cell = d.categories[0].cells[0];
    await page.locator('.grid button').first().click();
    await answerCorrectly(page, cell.q);
    await btn(page, 'Check').click();
    await expect(page.getByText('Yes! Exactly.')).toBeVisible();
    await btn(page, 'Continue').click();
    await expect(page.getByText(`🏆 ${cell.value}`)).toBeVisible();
    await btn(page, 'End game').click();
    await expectReward(page, 'quiz_show');
  });

  test('escape room: crack every lock and escape', async ({ page }) => {
    const d = await make(page, await setup(page), 'escape_room');
    await btn(page, 'Enter the room').click();
    for (const room of d.rooms) {
      await answerCorrectly(page, room.q);
      await btn(page, 'Check').click();
      await expect(page.getByText('Yes! Exactly.')).toBeVisible();
      await btn(page, 'Continue').click();
    }
    await expect(page.getByText('You escaped!')).toBeVisible();
    await expect(page.getByText(d.code)).toBeVisible();
    await page.screenshot({ path: 'e2e/screens/sb-escape_room.png' });
    await btn(page, 'Finish').click();
    await expectReward(page, 'escape_room');
  });

  test('speed round, two truths, flashcards, mind map, cheat sheet', async ({ page }) => {
    const deckId = await setup(page);

    const s = await make(page, deckId, 'speed_round');
    await btn(page, 'Go!').click();
    for (let i = 0; i < s.items.length && !(await btn(page, 'Finish').isVisible()); i++) await btn(page, /True/).click();
    await btn(page, 'Finish').click();
    await expectReward(page, 'speed_round');

    const tt = await make(page, deckId, 'two_truths');
    for (const r of tt.rounds) {
      await btn(page, r.statements[r.lieIndex]).click();
      await expect(page.getByText('Caught it!')).toBeVisible();
      await btn(page, 'Continue').click();
    }
    await btn(page, 'Finish').click();
    await expectReward(page, 'two_truths');

    const fc = await make(page, deckId, 'flashcards');
    for (let i = 0; i < fc.cards.length; i++) {
      await page.getByRole('button', { name: 'Flip' }).last().click();
      await btn(page, /Got it/).click();
    }
    await btn(page, 'Finish').click();
    await expectReward(page, 'flashcards');

    await make(page, deckId, 'mind_map');
    await page.screenshot({ path: 'e2e/screens/sb-mind_map.png' });
    await btn(page, /Test me/).click();
    for (let i = 0; i < 8 && !(await btn(page, /Finish/).isVisible()); i++) {
      await page.locator('.grid.grid-cols-2 button').first().click();
      await page.waitForTimeout(1000);
    }
    await btn(page, /Finish/).click();
    await expectReward(page, 'mind_map');

    await make(page, deckId, 'cheat_sheet');
    await btn(page, /Self-test/).click();
    await btn(page, 'Recall it, then tap').first().click();
    await page.getByLabel('I knew it').first().check();
    await page.screenshot({ path: 'e2e/screens/sb-cheat_sheet.png', fullPage: true });
    await btn(page, 'Finish').click();
    await expectReward(page, 'cheat_sheet');
  });

  test('memory tricks and timeline: rebuild from memory', async ({ page }) => {
    const deckId = await setup(page);
    const m = await make(page, deckId, 'mnemonics');
    await page.screenshot({ path: 'e2e/screens/sb-mnemonics.png' });
    for (const item of m.items) {
      await btn(page, 'Test my memory').click();
      for (const x of item.list) await btn(page, x).click();
      await btn(page, /Perfect!/).click();
    }
    await btn(page, /Finish/).click();
    await expectReward(page, 'mnemonics');

    const tl = await make(page, deckId, 'timeline');
    await btn(page, 'Rebuild it from memory').click();
    for (const e of tl.events) await btn(page, e.detail).click();
    await btn(page, 'Finish — 100%').click();
    await expectReward(page, 'timeline');
  });
});
