import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { eyebrow } from './cards';

// The To do summary (platform spec 5.1, design system spec 4.3), on the in-page gateway.
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const cards = (page: Page) => page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card');

/** Chooses a count tile the way a person does: the whole card is its radio button's label. */
async function choose(page: Page, name: string) {
  await page.getByRole('main').locator('.pf-v6-c-card').filter({ has: page.getByRole('radio', { name, exact: true }) }).click();
  await expect(page.getByRole('radio', { name, exact: true })).toBeChecked();
}

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  await expect(cards(page).first()).toBeVisible({ timeout: 30_000 });
}

test('the count tiles narrow the cards, and Waiting shows them all again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  const all = await cards(page).count();
  await expect(page.getByRole('radio', { name: 'Waiting' })).toBeChecked();

  await choose(page, 'Urgent');
  await expect(cards(page)).toHaveCount(1);
  await expect(eyebrow(cards(page), 'SC-003')).toBeVisible();

  await choose(page, 'Due within 7 days');
  await expect(eyebrow(cards(page), 'SUB-1')).toBeVisible();
  await expect(cards(page)).toHaveCount(1);

  await choose(page, 'Waiting');
  await expect(cards(page)).toHaveCount(all);
});

test('work by type and stage says its figures in words as well as in the chart', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  const chart = page.getByRole('img', { name: 'Safety Cases by stage' });
  await expect(chart).toBeVisible();
  await expect(page.getByText('received 3')).toBeVisible();
  await expect(page.getByText('assessed 2')).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the summary has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await openTodo(page);
      await expect(page.getByText('assessed 2')).toBeVisible();
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBe(0);
    });
  }
}
