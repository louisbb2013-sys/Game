import { expect, type Page } from '@playwright/test';

/** Interact with whatever input the current question shows, in a realistic way. */
export async function answerCurrent(page: Page, format: string) {
  switch (format) {
    case 'multiple_choice':
    case 'cause_effect':
      await page.getByRole('radio').first().click();
      break;
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
    case 'matching':
    case 'categorize': {
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
      break;
    }
    case 'ordering':
      await page.getByRole('button', { name: 'Move up' }).nth(1).click();
      break;
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
