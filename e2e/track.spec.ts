import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { cardFor } from './cards';

// Start and track, end to end on the in-page gateway (platform spec 3.4 and 5.4, design system spec 4.1, 4.3 and 5.1).
test.setTimeout(90_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function openProducts(page: Page) {
  await page.goto('/#/type/Product');
  await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible({ timeout: 30_000 });
  await expect(card(page, 'P-101')).toBeVisible({ timeout: 30_000 });
}
const card = cardFor;

async function noViolations(page: Page) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  expect(violations).toEqual([]);
}

test('start signal detection from the product list, follow it to the end, and read the notification', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openProducts(page);
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();

  // An on-demand method, reached from the object list (design system spec 4.3).
  await card(page, 'P-101').getByRole('button', { name: 'Run signal detection' }).click();
  const dialog = page.getByRole('dialog', { name: 'Run signal detection P-101' });
  await expect(dialog.getByText('In the background')).toBeVisible();
  await expect(dialog.getByText('disproportionately often for this product')).toBeVisible();

  await dialog.getByRole('button', { name: 'Run signal detection' }).click();
  await expect(dialog.getByRole('progressbar', { name: /Run signal detection on P-101/ })).toBeVisible();
  await expect(dialog.getByText('Found 1 new signal: Signal-2 for skin rash, in 4 safety cases')).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('progressbar', { name: 'Run signal detection on P-101: finished' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Run signal detection finished on P-101')).toBeVisible();

  // Notifications tells the person how it ended (design system spec 4.1).
  const bell = page.getByRole('button', { name: 'Notifications, 1 unread' });
  await expect(bell).toBeVisible({ timeout: 10_000 });
  await bell.click();
  const drawer = page.getByRole('list', { name: 'Notifications, newest first' });
  await expect(drawer.getByText('Run signal detection finished')).toBeVisible();
  await expect(drawer.getByText(/P-101: Found 1 new signal/)).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications' }).click();

  // The new signal is now work waiting on To do.
  await page.goto('/#/');
  await expect(cardFor(page, 'Signal-2')).toBeVisible({ timeout: 30_000 });
});

test('a background method no worker can do says why, and cannot start', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /Ada Moreno/ }).click();
  await page.goto('/#/type/Compound');
  await expect(card(page, 'C-101')).toBeVisible({ timeout: 30_000 });
  // Run simulation is blocked for want of a model, so it is not offered.
  await expect(card(page, 'C-101').getByRole('button', { name: 'Run simulation' })).toHaveCount(0);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the run and the notification drawer have no accessibility violations at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 800 });
      await openProducts(page);
      await card(page, 'P-102').getByRole('button', { name: 'Run signal detection' }).click();
      const dialog = page.getByRole('dialog', { name: 'Run signal detection P-102' });
      await dialog.getByRole('button', { name: 'Run signal detection' }).click();
      await expect(dialog.getByText('No new signals.')).toBeVisible({ timeout: 30_000 });
      await noViolations(page);
      const box = await dialog.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(width);
      await dialog.getByRole('button', { name: 'Done' }).click();

      await page.getByRole('button', { name: 'Notifications, 1 unread' }).click({ timeout: 10_000 });
      await expect(page.getByText('Run signal detection finished').first()).toBeVisible();
      await noViolations(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBe(0);
    });
  }
}
