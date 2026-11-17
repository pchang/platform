import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { cardFor } from './cards';

// The search page (platform spec 5.2, design system spec 4.1), on the in-page gateway. Asking is in chat.spec.ts.
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const results = (page: Page) => page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card__header').getByText(/ · /);

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible({ timeout: 30_000 });
}

test('the search page shows how the query was understood, and what it found', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/search/' + encodeURIComponent('cases for P-101'));
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('6 matches for “cases for P-101”.')).toBeVisible();
  await expect(page.getByText('Type: Safety Case', { exact: true })).toBeVisible();
  await expect(page.getByText('Linked to P-101', { exact: true })).toBeVisible();
  await expect(results(page)).toHaveText(['SC-001 · Safety Case', 'SC-002 · Safety Case', 'SC-003 · Safety Case', 'SC-004 · Safety Case', 'SC-005 · Safety Case', 'SC-006 · Safety Case']);
});

test('words find what the records say, with the methods the person can run', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/#/search/pneumonia');
  await expect(results(page)).toHaveText(['AE-005 · Adverse Event'], { timeout: 30_000 });
  await expect(cardFor(page, 'AE-005').getByRole('button', { name: 'Report to safety' })).toBeVisible();
});

test('“list all of my queries” finds the person’s own queries, and says the ontology understood it when no model is connected', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Sam Whitfield/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/#/search/' + encodeURIComponent('list all of my queries'));
  await expect(page.getByText('3 matches for “list all of my queries”.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Understood from the ontology')).toBeVisible();
  // The in-page gateway holds no credential, so the question is searched, and the page says so.
  await expect(page.getByText('No model is connected to answer questions, so the question was searched.')).toBeVisible();
  await expect(page.getByText('Yours', { exact: true })).toBeVisible();
  await expect(results(page)).toHaveText(['Q-01 · Data Query', 'Q-02 · Data Query', 'Q-03 · Data Query']);
});

test('says so when nothing matches', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/search/zebra');
  await expect(page.getByText('Nothing matches for “zebra”.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Try fewer words/)).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`search has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/#/search/' + encodeURIComponent('serious cases'));
      await expect(results(page).first()).toBeVisible({ timeout: 30_000 });
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
