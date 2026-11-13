import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { cardFor, cardIds, eyebrow } from './cards';

// Orient with the in-page gateway and the seed graph (platform spec 5.1, design system spec 4.1 and 4.3).
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function actAs(page: Page, name: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

async function todoCards(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('progressbar')).toHaveCount(0, { timeout: 30_000 });
  return cardIds(page.getByRole('main').locator('.pf-v6-l-gallery'));
}

test('opens on To do for the Drug Safety Physician, nearest deadline first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  expect(await todoCards(page)).toEqual(['SUB-1', 'SC-003', 'SC-001', 'SC-002', 'SC-004', 'SC-005', 'SC-006', 'SIG-1']);
  await expect(page.getByText('Due Nov 17, 2026')).toBeVisible();
});

test('gives each person the navigation and To do of their own work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await todoCards(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  await actAs(page, 'Ben Okafor');
  expect(await todoCards(page)).toEqual(['AE-003', 'AE-005', 'AE-001', 'AE-002', 'AE-004', 'Q-04', 'Q-05', 'Q-06']);
  await expect(nav.getByText('Clinical Development')).toBeVisible();
  await expect(nav.getByText('Safety and Regulatory')).toHaveCount(0);
  await expect(nav.getByText('Scientific Innovation')).toHaveCount(0);

  await actAs(page, 'Elena Kovacs');
  expect(await todoCards(page)).toEqual(['B-002', 'QE-1']);
  await expect(nav.getByText('Scientific Innovation')).toBeVisible();
  await expect(nav.getByText('Clinical Development')).toHaveCount(0);
});

test('gives the Clinical Research Coordinator visits by date and the Clinical Research Associate records to verify', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await todoCards(page);

  await actAs(page, 'Sam Whitfield');
  const visits = await todoCards(page);
  expect(visits.slice(0, 3)).toEqual(['V-01-3', 'V-02-3', 'V-03-3']);
  expect(visits.slice(-5)).toEqual(['PT-11', 'PT-12', 'Q-01', 'Q-02', 'Q-03']);
  await expect(page.getByText('Overdue since Nov 3, 2026')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Visits by stage' })).toBeVisible();

  // Completing a visit takes it off the list.
  const card = cardFor(page, 'V-01-3');
  await card.getByRole('button', { name: 'Complete visit' }).click();
  const dialog = page.getByRole('dialog', { name: 'Complete visit V-01-3' });
  await expect(dialog.getByText('scheduled → completed')).toBeVisible();
  await dialog.getByRole('button', { name: 'Complete visit' }).click();
  await expect(page.getByText('Complete visit done on V-01-3')).toBeVisible();
  expect(await todoCards(page)).not.toContain('V-01-3');

  await actAs(page, 'Priya Natarajan');
  const records = await todoCards(page);
  expect(records.slice(0, 2)).toEqual(['AE-005', 'AE-004']);
  expect(records.filter((id) => id.startsWith('DR-'))).toHaveLength(8);
});

test('opens a list of objects from the navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await todoCards(page);
  await actAs(page, 'Elena Kovacs');
  await page.getByRole('link', { name: /^Batches/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible();
  await expect(page.getByRole('main').locator('.pf-v6-c-card__header').getByText(/ · /)).toHaveText(['B-001 · Batch', 'B-002 · Batch', 'B-003 · Batch']);
});

test('on a phone, navigation is a drawer that closes when a destination is chosen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await todoCards(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Navigation' }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: /^Signals/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Signals' })).toBeVisible();
  await expect(nav).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1280]) {
    test(`To do has no accessibility violations at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await todoCards(page);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }
}
