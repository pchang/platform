import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// At a glance (platform spec 5.1; design system spec 4.5), on the in-page gateway.
test.setTimeout(90_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function actAs(page: Page, name: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

const main = (page: Page) => page.getByRole('main');

/** As the Clinical Program Lead, who oversees studies and so opens on At a glance. */
async function asProgramLead(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Morgan Ellis');
  await expect(main(page).getByRole('heading', { level: 2, name: 'Health' })).toBeVisible({ timeout: 30_000 });
}

test('a role that oversees studies opens on the study at a glance: journey, health, progress and what needs attention', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await asProgramLead(page);
  await expect(page.getByRole('link', { name: 'At a glance' })).toHaveAttribute('aria-current', 'page');
  await expect(main(page).getByRole('heading', { level: 1 })).toContainText('VELOCITY-2');
  await expect(main(page).getByText(/^(On track|At risk|Off track): /)).toBeVisible();
  await expect(main(page).getByRole('list', { name: /^Journey: Status, now enrolling/ })).toBeVisible();
  // Each rule says its numbers in words.
  await expect(main(page).getByText('Data awaiting verification: 14 of 40 data records entered (35%), above 25%')).toBeVisible();
  await expect(main(page).getByText('Missed visits: 0 of 30 visits missed (0%), at or below 5%')).toBeVisible();
  // A progress card per type in the study's scope.
  await expect(main(page).getByRole('heading', { level: 3, name: 'Patients · 12' })).toBeVisible();
  await expect(main(page).getByText('randomized: 10')).toBeVisible();
  // What needs attention is an object list: its objects open in the panel.
  await expect(main(page).getByRole('heading', { level: 2, name: /^Needs attention · \d+$/ })).toBeVisible();
  await main(page).getByRole('button', { name: 'Open ST-01' }).click();
  await expect(page.locator('.app-object-panel').getByText('ST-01 · Study', { exact: true })).toBeVisible();
});

test('anyone may open At a glance from the sidebar, and To do stays where it was', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'At a glance' }).click();
  await expect(main(page).getByRole('heading', { level: 2, name: 'Health' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'To do' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Summary' })).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`At a glance has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await asProgramLead(page);
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
