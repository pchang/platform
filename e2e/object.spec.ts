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
  await expect(panel(page).getByText('· ST-01', { exact: true })).toBeVisible();
  const tabs = panel(page).getByRole('tab');
  await expect(tabs).toHaveText(['Overview', 'Patients 12', 'Study Scenarios 1', 'Outcome Targets 0', 'Decisions 0', 'Formulations 1', 'Sites 3', 'Study Concepts 0', 'Assignments 3', 'Datasets 1']);
  // Its journey along its lifecycle, its status: named for where it is, each stage said in words.
  const journey = panel(page).getByRole('list', { name: 'Journey: Status, now enrolling, stage 2 of 5' });
  await expect(journey).toBeVisible();
  await expect(panel(page).getByLabel('enrolling, now')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/object-journey.png' });

  // Patients: the relationship in words, then cards that open in turn.
  await panel(page).getByRole('tab', { name: 'Patients 12' }).click();
  await expect(panel(page).getByText('This study enrolls these patients.')).toBeVisible();
  await panelCard(page, 'PT-03').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('· PT-03', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('tab')).toHaveText(['Overview', 'Visits 3', 'Adverse Events 1', 'Batches 1', 'Data Points 0']);

  // The overview links the one study the patient is part of; Back returns to the study, on the tab it was on.
  await panel(page).getByRole('button', { name: 'Back to ST-01' }).click();
  await expect(panel(page).getByText('· ST-01', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('tab', { name: 'Patients 12' })).toHaveAttribute('aria-selected', 'true');

  // Expand covers everything below the masthead, the sidebar too, so no destination is chosen behind the panel.
  const sidebar = page.locator('.pf-v6-c-page__sidebar');
  await expect(sidebar).not.toHaveClass(/pf-m-collapsed/);
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(sidebar).toHaveClass(/pf-m-collapsed/);
  // The panel spans the content surface from edge to edge, inset from the window as the content area always is.
  const wide = await panel(page).boundingBox();
  expect(wide!.x).toBeLessThan(32);
  expect(wide!.width).toBeGreaterThan(1280 - 64);
  // Restore brings the sidebar back.
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(sidebar).not.toHaveClass(/pf-m-collapsed/);
  // So does opening the sidebar with the menu button, which restores the panel.
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(sidebar).toHaveClass(/pf-m-collapsed/);
  await page.getByRole('button', { name: 'Navigation' }).click();
  await expect(sidebar).not.toHaveClass(/pf-m-collapsed/);
  await expect(page.getByRole('button', { name: 'Expand' })).toBeVisible();

  // A tab's objects are an object list like any other: the list bar, and the choice of cards or a list.
  await panel(page).getByRole('button', { name: 'List' }).click();
  await expect(panel(page).getByRole('grid').or(panel(page).getByRole('table')).first()).toContainText('PT-03');
  await panel(page).getByRole('button', { name: 'Cards' }).click();
  await expect(panelCard(page, 'PT-03')).toBeVisible();

  // Escape closes the whole panel, and focus goes back to the card it was opened from.
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('tab')).toHaveCount(0);
  await expect(listCard(page, 'ST-01').locator('.app-card-open')).toBeFocused();

  // As in Notion, an object opened from the page always opens at three quarters, whatever size the panel last had.
  await listCard(page, 'ST-01').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await page.getByRole('button', { name: 'Expand' }).click();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  await page.keyboard.press('Escape');
  await listCard(page, 'ST-01').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('button', { name: 'Expand' })).toBeVisible();
  await expect(page.locator('.pf-v6-c-page__sidebar')).not.toHaveClass(/pf-m-collapsed/);
});

test('a linked object opens from the overview, and Close ends the whole panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudies(page);
  await listCard(page, 'ST-01').getByRole('button', { name: /VELOCITY-2/ }).click();
  await panel(page).getByRole('tab', { name: 'Patients 12' }).click();
  await panelCard(page, 'PT-03').getByRole('button', { name: /Patient at/ }).click();
  await expect(panel(page).getByText('· PT-03', { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: /^SITE-3 · / }).click();
  await expect(panel(page).getByText('· SITE-3', { exact: true })).toBeVisible();
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
  await expect(panel(page).getByRole('link', { name: 'Safety Case', exact: true })).toBeVisible();
  await expect(panel(page).getByText('· SC-004', { exact: true })).toBeVisible();
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

test('Previous and Next step through the list an object was opened from, in its order, without closing the panel (design system spec 4.4)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await actAs(page, 'Ben Okafor');
  await page.goto('/#/type/AdverseEvent');
  await expect(listCard(page, 'AE-001')).toBeVisible({ timeout: 30_000 });
  const order = await list(page).locator('.pf-v6-l-gallery .pf-v6-c-card').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-opens')!.split('/').pop()));
  expect(order.length).toBeGreaterThan(2);

  await listCard(page, order[0]).locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const previous = panel(page).getByRole('button', { name: 'Previous', exact: true });
  const next = panel(page).getByRole('button', { name: 'Next', exact: true });
  await expect(panel(page).getByText(`· ${order[0]}`, { exact: true })).toBeVisible();
  // At the first, Previous stays in place, unavailable; the chevrons sit just left of Close.
  await expect(previous).toHaveAttribute('aria-disabled', 'true');
  const names = await panel(page).locator('.pf-v6-c-drawer__actions button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  expect(names.slice(-3)).toEqual(['Previous', 'Next', 'Close']);

  await next.click();
  await expect(panel(page).getByText(`· ${order[1]}`, { exact: true })).toBeVisible();
  await next.click();
  await expect(panel(page).getByText(`· ${order[2]}`, { exact: true })).toBeVisible();
  await previous.click();
  await expect(panel(page).getByText(`· ${order[1]}`, { exact: true })).toBeVisible();
  await expect(previous).not.toHaveAttribute('aria-disabled', 'true');
  await next.hover();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/object-previous-next.png' });

  // The same in a list of rows.
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await list(page).getByRole('button', { name: 'List', exact: true }).click();
  const rows = list(page).locator('table');
  await expect(rows).toBeVisible();
  await rows.getByRole('button', { name: /^Raised liver enzymes/ }).click();
  await expect(next).toBeVisible();

  // Moving in through a link in the overview has no list to step through.
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await list(page).getByRole('button', { name: 'Cards', exact: true }).click();
  await page.goto('/#/type/Study');
  await listCard(page, 'ST-01').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('· ST-01', { exact: true })).toBeVisible();
  // Opened from a list of one, it has nothing to step through.
  await expect(next).toHaveCount(0);
  // A tab's list steps through its objects.
  await panel(page).getByRole('tab', { name: /^Patients/ }).click();
  await panelCard(page, 'PT-03').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('· PT-03', { exact: true })).toBeVisible();
  await next.click();
  await expect(panel(page).getByText('· PT-04', { exact: true })).toBeVisible();
  // Back still returns to the study.
  await panel(page).getByRole('button', { name: 'Back to ST-01' }).click();
  await expect(panel(page).getByText('· ST-01', { exact: true })).toBeVisible();
});
