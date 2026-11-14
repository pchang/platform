import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { eyebrow } from './cards';

// The object panel (platform spec 5.1, Within an object; design system spec 4.4), on the in-page gateway.
test.setTimeout(90_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function actAs(page: Page, name: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
}

/** The page's list, behind the panel. */
const list = (page: Page) => page.locator('.app-object-drawer__content');
/** The object panel. */
const panel = (page: Page) => page.locator('.app-object-panel');
const listCard = (page: Page, id: string) => list(page).locator('.pf-v6-c-card').filter({ has: eyebrow(page, id) });
const panelCard = (page: Page, id: string) => panel(page).locator('.pf-v6-c-card').filter({ has: eyebrow(page, id) });

async function openStudies(page: Page) {
  await page.goto('/');
  await actAs(page, 'Ben Okafor');
  await page.goto('/#/type/Study');
  await expect(listCard(page, 'ST-01')).toBeVisible({ timeout: 30_000 });
}

test('a study opens from anywhere on its card, with its patients first, and the way in and back again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudies(page);

  // Anywhere on the card but its buttons opens the study; focus moves to its heading.
  await listCard(page, 'ST-01').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const heading = panel(page).getByRole('heading', { level: 2 }).first();
  await expect(heading).toContainText('VELOCITY-2');
  await expect(heading).toBeFocused();
  await expect(panel(page).getByText('ST-01 · Study', { exact: true })).toBeVisible();
  const tabs = panel(page).getByRole('tab');
  await expect(tabs).toHaveText(['Overview', 'Patients 12', 'Formulations 1', 'Sites 3']);

  // Patients: the relationship in words, then cards that open in turn.
  await panel(page).getByRole('tab', { name: 'Patients 12' }).click();
  await expect(panel(page).getByText('This study enrolls these patients.')).toBeVisible();
  await panelCard(page, 'PT-03').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('PT-03 · Patient', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('tab')).toHaveText(['Overview', 'Visits 3', 'Adverse Events 1', 'Batches 1']);

  // The overview links the one study the patient is part of; Back returns to the study, on the tab it was on.
  await panel(page).getByRole('button', { name: 'Back to ST-01' }).click();
  await expect(panel(page).getByText('ST-01 · Study', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('tab', { name: 'Patients 12' })).toHaveAttribute('aria-selected', 'true');

  // Expand takes the whole content area; Restore gives the list back.
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  const wide = await panel(page).boundingBox();
  const area = await page.locator('.app-object-drawer').boundingBox();
  expect(Math.round(wide!.width)).toBe(Math.round(area!.width));
  await page.getByRole('button', { name: 'Restore' }).click();

  // Escape closes the whole panel, and focus goes back to the card it was opened from.
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('tab')).toHaveCount(0);
  await expect(listCard(page, 'ST-01').locator('.app-card-open')).toBeFocused();
});

test('a linked object opens from the overview, and Close ends the whole panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudies(page);
  await listCard(page, 'ST-01').getByRole('button', { name: /VELOCITY-2/ }).click();
  await panel(page).getByRole('tab', { name: 'Patients 12' }).click();
  await panelCard(page, 'PT-03').getByRole('button', { name: /Patient at/ }).click();
  await expect(panel(page).getByText('PT-03 · Patient', { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: /^SITE-3 · / }).click();
  await expect(panel(page).getByText('SITE-3 · Site', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Back to PT-03' })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await expect(panel(page).getByRole('tab')).toHaveCount(0);
});

test('a method runs from the panel header, and the panel then shows the object as it now is', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const card = page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'SC-004') });
  await expect(card).toBeVisible({ timeout: 30_000 });
  // A method's button on a card runs the method; it does not open the object.
  await card.getByRole('button', { name: 'Triage' }).click();
  await expect(page.getByRole('dialog', { name: 'Triage SC-004' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page).getByRole('tab')).toHaveCount(0);

  await card.locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('SC-004 · Safety Case', { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Triage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Triage SC-004' });
  await dialog.getByRole('radio', { name: 'serious', exact: true }).check();
  await dialog.getByRole('radio', { name: 'unexpected', exact: true }).check();
  await dialog.getByRole('button', { name: 'Triage', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByText('Workflow: triaged')).toBeVisible({ timeout: 10_000 });
  await expect(panel(page).locator('.pf-v6-c-description-list__group').filter({ hasText: 'Last change' })).toContainText('Triage by Chloé Martin');
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the object panel has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 800 });
      await openStudies(page);
      await listCard(page, 'ST-01').getByRole('button', { name: /VELOCITY-2/ }).click();
      await panel(page).getByRole('tab', { name: 'Sites 3' }).click();
      await expect(panelCard(page, 'SITE-1')).toBeVisible();
      await page.waitForTimeout(500);
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
