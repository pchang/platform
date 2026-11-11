import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// Confirm and Fill in, end to end on the in-page gateway (platform spec 5.4, design system spec 5.1).
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('main').getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
}
const card = (page: Page, id: string) => page.getByRole('main').locator('.pf-v6-c-card').filter({ has: page.getByRole('heading', { level: 2, name: id, exact: true }) });

test('Fill in: triage a case, see what will change, commit, and see the case move on', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SC-004').getByRole('button', { name: 'Triage' }).click();

  const dialog = page.getByRole('dialog', { name: 'Triage SC-004' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Fill in every field to see what will change.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Triage' })).toBeDisabled();

  await dialog.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('serious', { exact: true }).check();
  await dialog.getByRole('radiogroup', { name: 'Expectedness' }).getByLabel('unexpected').check();
  await expect(dialog.getByText('received → triaged')).toBeVisible();
  await expect(dialog.getByText('set to serious')).toBeVisible();

  await dialog.getByRole('button', { name: 'Triage' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Triage done on SC-004')).toBeVisible();
  await expect(card(page, 'SC-004').getByRole('button', { name: 'Assess' })).toBeVisible();
  await expect(card(page, 'SC-004').getByText('Urgent')).toBeVisible();
});

test('Confirm: evaluate a signal with one confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SIG-1').getByRole('button', { name: 'Evaluate signal' }).click();
  const dialog = page.getByRole('dialog', { name: 'Evaluate signal SIG-1' });
  await expect(dialog.getByText('detected → under evaluation')).toBeVisible();
  await dialog.getByRole('button', { name: 'Evaluate signal' }).click();
  await expect(page.getByText('Evaluate signal done on SIG-1')).toBeVisible();
  await expect(card(page, 'SIG-1').getByRole('button', { name: 'Confirm signal' })).toBeVisible();
});

test('a person input defaults to you, so the preview is ready at once', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SUB-1').getByRole('button', { name: 'Send for review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send for review SUB-1' });
  await expect(dialog.getByLabel('Reviewer')).toHaveValue(/person-chloe$/);
  await expect(dialog.getByText('draft → in review')).toBeVisible();
  await dialog.getByRole('button', { name: 'Send for review' }).click();
  // Submit needs Review and sign, which is not built yet: it shows as text, not as a button.
  await expect(card(page, 'SUB-1').getByText('Submit (Review and sign, coming soon)')).toBeVisible();
});

test('Cancel and Escape change nothing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SC-001').getByRole('button', { name: 'Close case' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await card(page, 'SC-002').getByRole('button', { name: 'Assess' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card(page, 'SC-001').getByRole('button', { name: 'Close case' })).toBeVisible();
  await expect(page.getByText(/done on/)).toHaveCount(0);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the open dialog has no accessibility violations at ${width}px in ${mode} mode, and fits the screen`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 800 });
      await openTodo(page);
      await card(page, 'SC-004').getByRole('button', { name: 'Triage' }).click();
      const dialog = page.getByRole('dialog', { name: 'Triage SC-004' });
      await dialog.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('serious', { exact: true }).check();
      await dialog.getByRole('radiogroup', { name: 'Expectedness' }).getByLabel('unexpected').check();
      await expect(dialog.getByText('received → triaged')).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
}
