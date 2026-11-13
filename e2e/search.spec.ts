import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// Search in the navigation (platform spec 5.2, design system spec 4.1), on the in-page gateway.
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const field = (page: Page) => page.getByRole('search').getByRole('textbox', { name: 'Search objects' });
const results = (page: Page) => page.getByRole('main').locator('.pf-v6-l-gallery').getByRole('heading', { level: 2 });

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
}

test('typing shows the best matches; Enter opens the search page with how the query was understood', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await field(page).fill('cases for P-101');
  await expect(page.getByRole('search').getByText('6 matches')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Best matches' }).getByRole('link')).toHaveText(['SC-001', 'SC-002', 'SC-003', 'SC-004', 'SC-005', 'See all 6']);

  await field(page).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await expect(page.getByText('6 matches for “cases for P-101”.')).toBeVisible();
  await expect(page.getByText('Type: Safety Case', { exact: true })).toBeVisible();
  await expect(page.getByText('Linked to P-101', { exact: true })).toBeVisible();
  await expect(results(page)).toHaveText(['SC-001', 'SC-002', 'SC-003', 'SC-004', 'SC-005', 'SC-006']);
  await expect(field(page)).toHaveValue('cases for P-101');
});

test('words find what the records say, and a match opens at that object, with its methods', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  await field(page).fill('pneumonia');
  await page.getByRole('list', { name: 'Best matches' }).getByRole('link', { name: 'AE-005' }).click();
  await expect(results(page)).toHaveText(['AE-005']);
  const card = page.getByRole('main').locator('.pf-v6-c-card').filter({ has: page.getByRole('heading', { level: 2, name: 'AE-005' }) });
  await expect(card.getByRole('button', { name: 'Report to safety' })).toBeVisible();
});

test('says so when nothing matches', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/search/zebra');
  await expect(page.getByText('Nothing matches for “zebra”.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Try fewer words/)).toBeVisible();
});

test('on a phone, the field is in the navigation drawer, which closes when a search opens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openTodo(page);
  await page.getByRole('button', { name: 'Navigation' }).click();
  await field(page).fill('open queries');
  await field(page).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`search has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/#/search/' + encodeURIComponent('serious cases'));
      await expect(results(page).first()).toBeVisible({ timeout: 30_000 });
      if (width < 1200) await page.getByRole('button', { name: 'Navigation' }).click();
      await field(page).fill('rash');
      await expect(page.getByRole('list', { name: 'Best matches' })).toBeVisible();
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBe(0);
    });
  }
}
