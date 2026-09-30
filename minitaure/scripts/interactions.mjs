// Interaction checks (run against dev or preview): node scripts/interactions.mjs [baseUrl]
// Prints PASS/FAIL per check and exits non-zero on failure.
import { launch } from './pw.mjs';

const base = process.argv[2] ?? process.env.SHOTS_URL ?? 'http://localhost:5173';
const browser = await launch();
const results = [];
const errors = [];
const check = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function newPage(width = 1440) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 900, isMobile: width < 500 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''} ${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 40)}` : '';
});

// ---- Keyboard: skip link + nav ----
{
  const page = await newPage();
  await page.goto(base + '/?q=static', { waitUntil: 'networkidle' });
  await page.keyboard.press('Tab');
  check('first Tab focuses the skip link', (await active(page)).includes('Aller au contenu'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check('skip link moves focus to <main>', (await page.evaluate(() => location.hash)) === '#main');
  // Tab to "Boutique" in the nav and follow it.
  await page.goto(base + '/?q=static', { waitUntil: 'networkidle' });
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  const f = await active(page);
  check('nav links are keyboard reachable', f.includes('Boutique'), f);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/boutique**');
  await page.waitForFunction(() => document.title.startsWith('Boutique'), null, { timeout: 5000 }).catch(() => {});
  check('route change via keyboard', page.url().includes('/boutique'));
  check('page title updates per route', (await page.title()).startsWith('Boutique'), await page.title());
  const focusVisible = await page.evaluate(() => {
    const a = document.querySelector('a');
    a.focus();
    return getComputedStyle(a).outlineStyle !== 'none';
  });
  check('visible focus style on links', focusVisible);
  await page.context().close();
}

// ---- Filters + cart ----
{
  const page = await newPage();
  await page.goto(base + '/boutique?q=static', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const before = await page.locator('main ul > li').count();
  await page.getByRole('radio', { name: /Coffrets/ }).click();
  await page.waitForTimeout(900);
  const after = await page.locator('main ul > li').count();
  check('collection filter narrows the grid', before === 17 && after === 3, `${before} → ${after}`);
  check('filter is reflected in the URL', page.url().includes('collection=coffrets'));
  await page.getByRole('radio', { name: /Coffrets/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('chips support arrow keys', !page.url().includes('coffrets') || (await page.getByRole('radio', { checked: true }).textContent()).includes('Tout'), page.url());
  await page.goto(base + '/boutique?q=static', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Accueillir Brume/ }).click();
  await page.getByRole('button', { name: /Accueillir Coffret Sucrerie/ }).click();
  await page.waitForTimeout(500);
  const badge = await page.locator('header button[class*="cart"]').innerText();
  check('cart counter increments', badge.includes('2'), JSON.stringify(badge));
  const live = await page.locator('p[role="status"].visually-hidden').innerText();
  check('cart addition announced to screen readers', live.includes('ajouté au panier'), live);
  await page.locator('header button[class*="cart"]').click();
  await page.waitForTimeout(700);
  check('cart drawer opens as a dialog', await page.getByRole('dialog', { name: /Votre panier/ }).isVisible());
  check('cart total is correct (24 € + 56 €)', (await page.getByRole('dialog').innerText()).replace(/\s/g, ' ').includes('80 €'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  check('Escape closes the cart', !(await page.getByRole('dialog').count()));
  await page.reload({ waitUntil: 'networkidle' });
  check('cart persists across reloads', (await page.locator('header button[class*="cart"]').innerText()).includes('2'));
  await page.context().close();
}

// ---- Creature sheet ----
{
  const page = await newPage();
  await page.goto(base + '/creatures?q=static', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('link', { name: /Praline, N° 002/ }).click();
  await page.waitForTimeout(1200);
  check('card opens the sheet (URL)', page.url().includes('/creatures/praline'));
  const dlg = page.getByRole('dialog', { name: 'Praline' });
  check('sheet is a labelled modal dialog', await dlg.isVisible());
  check('focus moves into the sheet', (await active(page)).includes('Praline'));
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  check('focus is trapped in the sheet', inside);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  check('Escape closes the sheet', page.url().endsWith('/creatures?q=static') || page.url().endsWith('/creatures'), page.url());
  check('focus returns to the card', (await active(page)).includes('Praline'), await active(page));
  await page.getByRole('link', { name: /Brume, N° 001/ }).click();
  await page.waitForTimeout(1000);
  await page.goBack();
  await page.waitForTimeout(1000);
  check('browser back closes the sheet', !(await page.getByRole('dialog').count()));
  await page.goto(base + '/creatures/minuit?q=static', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('deep link opens the sheet', await page.getByRole('dialog', { name: 'Minuit' }).isVisible());
  await page.getByRole('link', { name: /N° 004 Pistache/ }).click();
  await page.waitForTimeout(800);
  check('next/previous creature navigation', page.url().includes('/creatures/pistache'));
  await page.context().close();
}

// ---- Contact form ----
{
  const page = await newPage();
  await page.goto(base + '/contact?q=static', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await page.waitForTimeout(500);
  check('empty submit shows an error summary', await page.getByRole('alert').first().isVisible());
  check('summary receives focus', (await active(page)).includes('champs demandent'));
  const invalid = await page.locator('[aria-invalid="true"]').count();
  check('invalid fields flagged with aria-invalid', invalid === 4, String(invalid));
  const described = await page.locator('#' + (await page.locator('input[name="email"]').getAttribute('aria-describedby'))).innerText();
  check('errors linked via aria-describedby', described.length > 5, described);
  await page.getByLabel('Nom').fill('Camille Durand');
  await page.getByLabel('E-mail').fill('camille@exemple');
  await page.getByLabel('E-mail').blur();
  await page.waitForTimeout(300);
  check('inline email validation', (await page.locator('input[name="email"]').getAttribute('aria-invalid')) === 'true');
  await page.getByLabel('E-mail').fill('camille@exemple.fr');
  await page.getByLabel('Sujet').selectOption({ index: 1 });
  await page.getByLabel('Message').fill('Bonjour, Brume a-t-elle une sœur ?');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await page.waitForTimeout(2000);
  check('success state after valid submit', (await page.getByText('Message bien reçu.').count()) === 1);
  await page.context().close();
}

// ---- Mobile menu ----
{
  const page = await newPage(390);
  await page.goto(base + '/?q=static', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.waitForTimeout(900);
  check('mobile menu opens as a dialog', await page.getByRole('dialog', { name: 'Menu' }).isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  check('Escape closes the mobile menu', !(await page.getByRole('dialog').count()));
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('dialog').getByRole('link', { name: /Contact/ }).click();
  await page.waitForTimeout(1500);
  check('mobile menu navigates and closes', page.url().includes('/contact') && !(await page.getByRole('dialog').count()));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('no horizontal scroll at 390px', overflow <= 0, String(overflow));
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter((el) => el.getClientRects().length && !el.closest('.visually-hidden') && !el.classList.contains('skip-link'))
      .map((el) => [el, el.getBoundingClientRect()])
      .filter(([, r]) => r.height < 40 && r.width > 0)
      .map(([el, r]) => `${el.tagName} "${(el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}`),
  );
  check('touch targets ≥ 40px tall on /contact', small.length === 0, small.join(', '));
  await page.context().close();
}

await browser.close();
const unique = [...new Set(errors)];
check('no console errors during the run', unique.length === 0, unique.join(' | '));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
