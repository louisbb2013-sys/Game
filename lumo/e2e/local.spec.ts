import { expect, test } from '@playwright/test';
import { answerAndCheck, closeHatch, continueRound, ONE_TAP, openChests } from './helpers';

// Browser-only build (no server). Run with LOCAL_URL pointing at a page that embeds dist-local/lumo.html.
test.skip(!process.env.LOCAL_URL, 'needs the browser-only build');

test('browser-only Lumo: deck, quiz, exam, sandbox, notes, progress kept after reload', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // No sign-in screen: straight to Home, 5 tabs (no League).
  await expect(page.getByRole('link', { name: 'Learn' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'League' })).toHaveCount(0);
  await page.screenshot({ path: 'e2e/screens/local-home.png', fullPage: true });

  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  await expect(page.getByRole('heading', { name: 'Mastery map' })).toBeVisible();
  // The sample deck comes with hand-written test questions: play straight away.
  await expect(page.getByText(/\d+ test questions/)).toBeVisible();
  await page.getByRole('button', { name: /^Play\b/ }).click();
  for (let i = 0; i < 3; i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(page, (await section.getAttribute('data-format'))!);
    const btn = page.getByRole('status').getByRole('button', { name: /Continue|See results/ });
    await expect(btn).toBeVisible();
    await closeHatch(page);
    if (i === 0) await page.screenshot({ path: 'e2e/screens/local-quiz.png' });
    await btn.click();
    await openChests(page);
    await closeHatch(page);
  }
  await page.getByRole('button', { name: 'Leave quiz' }).click();
  await expect(page.getByText(/Learning|Familiar|Mastered/).first()).toBeVisible();

  // Mock exam: hand in, report.
  await page.getByRole('button', { name: /Mock exam/ }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('button', { name: 'Hand in' }).click();
  await page.getByRole('button', { name: 'Are you sure? Tap again' }).click();
  await expect(page.getByTestId('exam-percent')).toBeVisible();

  // Deck from pasted notes.
  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('link', { name: /Make a deck with Lumo/ }).click();
  await page.getByRole('tab', { name: 'Paste notes' }).click();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: /Make my deck/ }).click();
  await expect(page.getByRole('heading', { name: 'The Water Cycle', level: 1 })).toBeVisible();

  // Sandbox activity.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: /Study Sandbox/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/local-sandbox.png', fullPage: true });

  // Progress survives a reload.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!));
  expect(saved.decks).toHaveLength(2);
  expect(Object.keys(saved.states).length).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole('link', { name: 'Learn' }).click();
  await expect(page.getByText('Cells — the basics')).toBeVisible();
  await expect(page.getByText('The Water Cycle')).toBeVisible();
  expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
});

test('pets climb the rarities: Common → Rare with enough level and coins; the pet fills the whole screen', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByLabel('Give it a name').fill('Pip');
  await page.getByRole('button', { name: 'Adopt!' }).click();
  // Like Gizmo: a team of up to 4 pets, each with a bonus; tap a card to see the pet up close.
  await expect(page.getByRole('heading', { name: 'Active pets (1/4)' })).toBeVisible();
  await expect(page.getByTestId('pet-card')).toContainText('+5% chance to win a heart on a right answer');
  await expect(page.getByTestId('study-egg')).toContainText('Answer 5 more questions to hatch your egg!');
  await page.getByTestId('pet-card').click();
  // The pet takes the whole screen (one page to scroll, not a little box).
  const screen = page.getByTestId('pet-screen');
  await expect(screen).toBeVisible();
  const box = (await screen.boundingBox())!;
  const view = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(view.width);
  expect(Math.round(box.height)).toBe(view.height);
  await expect(page.getByTestId('pet-rarity')).toHaveText('Common');
  await expect(page.getByRole('list', { name: 'Rarity' }).getByRole('listitem')).toHaveText(['Common', 'Rare', 'Epic', 'Legendary', 'Mythical', 'Exotic', 'Galaxial', 'Celestial', 'Divine', 'Lumo']);
  // Not yet: the pet needs level 4 and 200 coins.
  await expect(page.getByTestId('pet-upgrade')).toContainText('Upgrade to Rare');
  await expect(page.getByTestId('pet-upgrade').getByRole('button', { name: 'Upgrade' })).toBeDisabled();

  // After some studying (level 3) and saving up coins, it can go up a rarity.
  await page.evaluate(() => {
    const k = 'lumo_local_v1';
    const d = JSON.parse(localStorage.getItem(k)!);
    d.user.coins = 500;
    d.game.pets[0].level = 4;
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByTestId('pet-card').click();
  await page.getByTestId('pet-upgrade').getByRole('button', { name: 'Upgrade' }).click();
  await expect(page.getByText('Your pet is Rare now!')).toBeVisible();
  await expect(page.getByTestId('pet-rarity')).toHaveText('Rare');
  await expect(page.getByTestId('pet-upgrade')).toContainText('Upgrade to Epic');
  // Rarer and higher level: a bigger bonus (Rare base 8% + 3 levels).
  await expect(page.getByTestId('pet-buff')).toContainText('+11% chance to win a heart on a right answer');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!).user.coins)).toBe(300);
  await page.screenshot({ path: 'e2e/screens/local-pet-upgrade.png' });
});

test('Challenge: hearts show while you play, and a miss breaks one', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Learn' }).first().click();
  await page.getByRole('button', { name: 'Try a sample deck' }).first().click();
  const tile = page.getByTestId('challenge-tile');
  await expect(tile.getByRole('img', { name: '5 hearts left' })).toBeVisible();
  await tile.click();
  const hearts = page.getByTestId('challenge-hearts');
  await expect(hearts).toHaveAttribute('data-hearts', '5');
  // Answer carelessly until one is wrong.
  for (let i = 0; i < 10 && (await hearts.getAttribute('data-hearts')) === '5'; i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    const f = (await section.getAttribute('data-format'))!;
    if (f === 'type_answer') {
      await page.getByLabel('Your answer').fill('qqqq');
      await page.getByRole('button', { name: 'Check' }).click();
    } else if (ONE_TAP.includes(f)) {
      if (await page.getByTestId('show-choices').isVisible().catch(() => false)) await page.getByTestId('show-choices').click();
      const tiles = section.locator('.tile');
      await tiles.nth(i % (await tiles.count())).click();
    } else await answerAndCheck(page, f);
    await expect(page.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    if ((await hearts.getAttribute('data-hearts')) !== '5') break;
    if (await continueRound(page)) break;
  }
  await expect(hearts).toHaveAttribute('data-hearts', '4');
  await expect(hearts).toHaveAccessibleName('4 hearts left');
  await page.waitForTimeout(1000); // the broken heart's animation
  await page.screenshot({ path: 'e2e/screens/local-challenge.png' });
  // Back on the deck page, the Challenge tile shows what's left.
  await page.getByRole('button', { name: 'Leave quiz' }).click();
  await expect(page.getByTestId('challenge-tile').getByRole('img', { name: '4 hearts left' })).toBeVisible();
  await page.getByTestId('challenge-tile').screenshot({ path: 'e2e/screens/local-challenge-tile.png' });
});

test('pet team: up to 4 active pets, their bonuses add up, swap one for another', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByLabel('Give it a name').fill('Pokka');
  await page.getByRole('button', { name: 'Adopt!' }).click();
  await expect(page.getByTestId('pet-card')).toHaveCount(1);
  // Four more pets hatched over time (saved before teams: the first 4 make the team).
  await page.evaluate(() => {
    const k = 'lumo_local_v1';
    const d = JSON.parse(localStorage.getItem(k)!);
    const base = d.game.pets[0];
    delete base.active;
    for (const [i, species] of ['pixel_owl', 'acorn_squirrel', 'crystal_cat', 'comet_fox'].entries()) d.game.pets.push({ ...base, id: `p${i}`, species, name: '', equipped: false });
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await expect(page.getByRole('heading', { name: 'Active pets (4/4)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Available pets (1)' })).toBeVisible();
  // The team's bonuses, added up: two heart pets (5% + 8%), an XP pet, a coin pet.
  await expect(page.getByTestId('team-buffs')).toContainText('+13% heart chance');
  await expect(page.getByTestId('team-buffs')).toContainText('+4% XP');
  await expect(page.getByTestId('team-buffs')).toContainText('+1 coin per right answer');
  // The 5th can't join a full team…
  await page.getByRole('button', { name: /^Comet Fox/ }).click();
  await expect(page.getByTestId('pet-join-team')).toBeDisabled();
  await expect(page.getByRole('dialog').getByText('Your team is full (4 pets). Take one off first.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  // …until one leaves it.
  await page.getByRole('button', { name: /^Acorn Squirrel/ }).click();
  await page.getByTestId('pet-leave-team').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /^Comet Fox/ }).click();
  await page.getByTestId('pet-join-team').click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('team')).toContainText('Comet Fox');
  await expect(page.getByTestId('team')).not.toContainText('Acorn Squirrel');
  await page.screenshot({ path: 'e2e/screens/local-pet-team.png', fullPage: true });
});

test('an egg with a pet you already have gives 5 snacks', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByLabel('Give it a name').fill('Pip');
  await page.getByRole('button', { name: 'Adopt!' }).click();
  await expect(page.getByTestId('pet-card')).toHaveCount(1);
  // Every pet an egg can give is already in the collection, and there's an egg to hatch.
  await page.evaluate(() => {
    const k = 'lumo_local_v1';
    const d = JSON.parse(localStorage.getItem(k)!);
    const base = d.game.pets[0];
    const all = ['moss_turtle', 'cloud_sheep', 'pixel_owl', 'comet_fox', 'crystal_cat', 'star_jelly', 'bubble_octo', 'ember_dragon', 'puddle_frog', 'acorn_squirrel', 'snow_penguin', 'lucky_bunny', 'rock_dino', 'mystic_unicorn', 'cosmic_whale', 'aurora_peacock', 'celestial_phoenix', 'galaxy_dragon', 'prism_axolotl', 'nebula_manta'];
    for (const [i, species] of all.filter((x) => x !== base.species).entries()) d.game.pets.push({ ...base, id: `d${i}`, species, name: '', equipped: false, active: false });
    d.game.inventory = { ...d.game.inventory, egg_common: 1, pet_food: 2 };
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByRole('button', { name: /egg ×1/i }).click();
  const hatch = page.getByRole('dialog', { name: 'Your egg hatched!' });
  await expect(hatch.getByTestId('duplicate-snacks')).toHaveText('+5 🍎 snacks', { timeout: 10_000 });
  await expect(hatch).toContainText('again!');
  await hatch.screenshot({ path: 'e2e/screens/local-duplicate-snacks.png' });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!).game.inventory.pet_food)).toBe(7);
});

test('while playing, a surprise gift drops in now and then: tap it before it floats away', async ({ page }) => {
  test.setTimeout(120_000);
  // Make luck certain for this test: every right answer (after the 3rd) brings a gift, and it's coins.
  await page.addInitScript(() => (Math.random = () => 0.01));
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByRole('button', { name: 'Try a sample deck' }).click();
  // (The study egg stays far from hatching, so its pop-up never covers the gift.)
  await page.evaluate(() => {
    const k = 'lumo_local_v1';
    const d = JSON.parse(localStorage.getItem(k)!);
    if (d.game?.egg) d.game.egg.target = 999;
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Learn' }).click();
  await page.getByText('Cells — the basics').first().click();
  await page.getByRole('button', { name: /^Play\b/ }).click();
  const gift = page.getByTestId('surprise-gift');
  for (let i = 0; i < 10 && !(await gift.count()); i++) {
    const section = page.locator('section[data-format]');
    await expect(section).toBeVisible();
    await answerAndCheck(page, (await section.getAttribute('data-format'))!);
    await expect(page.getByRole('status').getByRole('button', { name: /Continue|See results/ })).toBeVisible();
    if (await gift.count()) break;
    await closeHatch(page);
    if (await continueRound(page)) break;
    await openChests(page);
  }
  await closeHatch(page); // the forced luck also hatches eggs quickly
  await expect(gift).toBeVisible();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!).user.coins);
  await gift.click();
  await expect(page.getByTestId('gift-won')).toHaveText('🪙 +3 coins!');
  await expect(gift).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lumo_local_v1')!).user.coins)).toBe(before + 3);
});

test('a Lumo-rarity pet has Lumo power (no separate bonus of its own): +50% XP and +50% coins', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(process.env.LOCAL_URL!);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  await page.getByLabel('Give it a name').fill('Pip');
  await page.getByRole('button', { name: 'Adopt!' }).click();
  await expect(page.getByTestId('pet-card')).toHaveCount(1);
  // The creator gave this learner a Lumo Firefly.
  await page.evaluate(() => {
    const k = 'lumo_local_v1';
    const d = JSON.parse(localStorage.getItem(k)!);
    d.game.pets = [{ ...d.game.pets[0], species: 'lumo_firefly', tier: 'lumo', name: '' }];
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await page.getByRole('link', { name: 'Pets' }).first().click();
  const team = page.getByTestId('team-buffs');
  await expect(team).toContainText('+50% XP'); // Lumo power only: nothing that doesn't add up
  await expect(team).toContainText('+50% coins');
  await expect(team).toContainText('+20% heart chance');
  await expect(team).toContainText('+50% faster egg');
  await expect(page.getByTestId('pet-card')).toContainText('Lumo power');
  await page.getByTestId('pet-card').click();
  await expect(page.getByTestId('lumo-power')).toContainText('+50% XP');
  await page.screenshot({ path: 'e2e/screens/local-lumo-power.png' });
});
