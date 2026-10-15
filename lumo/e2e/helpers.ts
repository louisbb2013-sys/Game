import { expect, type Page } from '@playwright/test';

/** Formats answered with a single tap on a tile (no "Check" button). */
export const ONE_TAP = ['multiple_choice', 'true_false', 'cause_effect'];

/**
 * Interact with whatever input the current question shows, in a realistic way. One-tap formats
 * (multiple choice, true/false) are answered — and sent — by tapping a tile; for the others, call
 * `checkCurrent` afterwards.
 */
export async function answerCurrent(page: Page, format: string) {
  switch (format) {
    case 'multiple_choice':
    case 'true_false':
    case 'cause_effect': {
      // The game screen's colour tiles, or the plain list elsewhere (offline review).
      const tile = page.locator('section[data-format] .tile');
      if (await tile.count()) await tile.first().click();
      else await page.getByRole('radio').first().click();
      break;
    }
    case 'multiple_select':
      await page.getByRole('checkbox').first().click();
      break;
    case 'type_answer':
      await page.getByLabel('Your answer').fill('mitochondria');
      break;
    case 'fill_blank':
      for (const input of await page.getByLabel(/^Blank \d+$/).all()) await input.fill('osmosis');
      break;
    case 'explain':
    case 'apply':
    case 'compare':
    case 'teach_back':
      await page.getByLabel('Your answer').fill('Particles move from high to low concentration and it needs no energy.');
      break;
    case 'true_false_justify':
      await page.getByRole('button', { name: 'True', exact: true }).click();
      await page.getByLabel('Why?').fill('Because the cell membrane controls what enters and leaves.');
      break;
    case 'matching': {
      if (!(await page.getByRole('group', { name: 'Match these' }).count())) {
        await placeChips(page);
        break;
      }
      // Tap a left item, then its partner on the right.
      const left = page.getByRole('group', { name: 'Match these' }).getByRole('button');
      const right = page.getByRole('group', { name: '…with these' }).getByRole('button');
      const n = await left.count();
      for (let i = 0; i < n; i++) {
        await left.nth(i).click();
        await right.nth(i).click();
      }
      break;
    }
    case 'categorize':
      await placeChips(page);
      break;
    case 'ordering': {
      // The game screen: tap the items first to last. Elsewhere: the arrows.
      const pool = page.getByRole('group', { name: 'Items to place' }).getByRole('button');
      if (await pool.count()) while ((await pool.count()) > 0) await pool.first().click();
      else await page.getByRole('button', { name: 'Move up' }).nth(1).click();
      break;
    }
    case 'spot_mistake':
      await page.locator('fieldset').getByRole('button').first().click();
      await page.getByLabel('Correction').fill('nucleus');
      break;
    case 'calculation':
      await page.getByLabel('Your answer').fill('400');
      break;
    default:
      throw new Error('unhandled format ' + format);
  }
}

/** Drag-and-drop boards (categories, and matching outside the game screen): first chip by a real drag, the rest tap-then-tap. */
async function placeChips(page: Page) {
  // First item by real drag (pointer), the rest by tap-then-tap.
  const pool = page.getByRole('button', { name: 'Items to place' });
  const zones = page.locator('[data-drop]:not([data-drop="__pool"])');
  const before = await pool.getByRole('button').count();
  await expect(pool.getByRole('button').first()).toBeVisible();
  const phone = (page.viewportSize()?.width ?? 1000) < 500; // phones: tap-then-tap (touch drag is checked on its own)
  const first = pool.getByRole('button').first();
  const fb = await first.boundingBox();
  const zb = await zones.first().boundingBox();
  if (!phone) {
    await page.mouse.move(fb!.x + fb!.width / 2, fb!.y + fb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(fb!.x + 30, fb!.y + 30, { steps: 4 });
    await page.mouse.move(zb!.x + zb!.width / 2, zb!.y + zb!.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await pool.getByRole('button').count()).toBe(before - 1);
  }
  let i = phone ? 0 : 1;
  while ((await pool.getByRole('button').count()) > 0) {
    await pool.getByRole('button').first().click();
    await zones.nth(i % (await zones.count())).click({ position: { x: 8, y: 8 } });
    i++;
  }
}

/** Website: close the "egg hatched" celebration if one popped up. */
export async function closeHatch(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Your egg hatched!' });
  await page.waitForTimeout(200);
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Keep going' }).click({ timeout: 5000 });
    await expect(dialog).toHaveCount(0);
  }
}

/** Send the answer: tiles already did; other formats press "Check". */
export async function checkCurrent(page: Page, format: string) {
  if (!ONE_TAP.includes(format)) await page.getByRole('button', { name: 'Check' }).click();
}

/** Answer the question on screen and send it. */
export async function answerAndCheck(page: Page, format: string) {
  await answerCurrent(page, format);
  await checkCurrent(page, format);
}

/** After the feedback panel: Continue (or See results). Returns true when the round is over. Opens any chest on the way. */
export async function continueRound(page: Page): Promise<boolean> {
  const btn = page.getByRole('status').getByRole('button', { name: /Continue|See results/ });
  await expect(btn).toBeVisible();
  const last = /See results/.test((await btn.textContent()) ?? '');
  await btn.click();
  await openChests(page);
  return last;
}

/** Pick a chest whenever the "pick a chest" reward pops up (and close the egg if what it gave hatched it). */
export async function openChests(page: Page) {
  const chest = page.getByRole('dialog', { name: 'Pick a chest!' });
  await page.waitForTimeout(150);
  for (let i = 0; i < 5 && (await chest.count()); i++) {
    await chest.getByRole('button', { name: 'Chest 1' }).click();
    await chest.getByRole('button', { name: /Continue|Next chest/ }).click();
    await closeHatch(page);
  }
}

/** The end-of-round screen. */
export const ROUND_DONE = /Round complete!|Perfect round!|Out of hearts|Boss defeated|The boss won|The boss got away|Time’s up|New record/;
