import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/learn', '/sandbox', '/live', '/league', '/me', '/settings', '/shop', '/pets', '/friends', '/groups', '/offline'];

test('main screens have no serious accessibility problems', async ({ page }) => {
  test.setTimeout(120_000);
  const name = 'a' + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '');
  await page.request.post('/api/auth/dev', { data: { name } });
  await page.request.patch('/api/me', { data: { locale: 'en', settings: { sound: false } } });
  const deckId = (await (await page.request.post('/api/decks/sample', { data: { language: 'en' } })).json()).id;
  // The play screen too (a round of the sample deck).
  const round = (await (await page.request.post(`/api/decks/${deckId}/sessions`, { data: { mode: 'practice', length: 10 } })).json()).session.id;
  const problems: string[] = [];
  for (const path of [...PAGES, `/decks/${deckId}`, `/quiz/${round}`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.waitForTimeout(700); // let colour transitions finish
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        problems.push(`${path} [${theme}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' => ' + (n.failureSummary ?? '').split('\n').pop()).join(' | ')}`);
      }
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
