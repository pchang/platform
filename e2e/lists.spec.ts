import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { eyebrow } from './cards';

// Object lists in cards or a list, the list bar and batch actions (design system spec 4.3; platform spec 5.4).
test.setTimeout(90_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const bar = (page: Page) => page.getByRole('main').locator('.pf-v6-c-toolbar');
const card = (page: Page, id: string) => page.locator('.app-object-drawer__content .pf-v6-c-card').filter({ has: eyebrow(page, id) });
const row = (page: Page, id: string) => page.locator('.pf-v6-c-data-list__item').filter({ has: eyebrow(page, id) });

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  await expect(card(page, 'SC-004')).toBeVisible({ timeout: 30_000 });
}

test('the notification bell is a plain icon button like settings and profile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  const classes = async (name: string | RegExp) => (await page.getByRole('banner').getByRole('button', { name }).getAttribute('class')) ?? '';
  expect(await classes(/^Notifications/)).toContain('pf-m-plain');
  expect(await classes(/^Notifications/)).not.toContain('pf-m-stateful');
  expect(await classes('Settings')).toContain('pf-m-plain');
});

test('cards: Select shows a round control on each card; choosing three cases offers Triage, which runs once for all three', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(0);
  await bar(page).getByRole('button', { name: 'Select', exact: true }).click();
  // Choosing a card anywhere but its buttons chooses it; its control is a checkbox named for it.
  await card(page, 'SC-004').locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(card(page, 'SC-004').getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await card(page, 'SC-005').getByRole('checkbox').click();
  await card(page, 'SC-002').getByRole('checkbox').click();
  await expect(bar(page).getByText('3 selected')).toBeVisible();
  // SC-002 waits to be assessed, not triaged: nothing applies to all three.
  await expect(bar(page).getByText('No action applies to all of them.')).toBeVisible();
  await card(page, 'SC-002').getByRole('checkbox').click();
  await card(page, 'SC-006').getByRole('checkbox').click();
  await bar(page).getByRole('button', { name: 'Triage' }).click();

  const dialog = page.getByRole('dialog', { name: 'Triage 3 safety cases' });
  await expect(dialog.getByText('SC-004, SC-005, SC-006').first()).toBeVisible();
  await dialog.getByRole('radio', { name: 'serious', exact: true }).check();
  await dialog.getByRole('radio', { name: 'unexpected', exact: true }).check();
  await expect(dialog.getByRole('heading', { level: 3, name: 'SC-004, SC-005, SC-006' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Triage 3 safety cases' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Triage done on 3 safety cases')).toBeVisible();
  await expect(page.getByText('Done on SC-004, SC-005, SC-006.')).toBeVisible();
  // The choice is cleared, and select mode ends.
  await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(0);
});

test('list: a checkbox on every row, one method raised and the rest in a … menu, kept on the device', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/type/SafetyCase');
  await expect(card(page, 'SC-001')).toBeVisible({ timeout: 30_000 });
  await bar(page).getByRole('button', { name: 'List' }).click();
  await expect(bar(page).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'SC-001').getByRole('checkbox', { name: /^Select SC-001 · Safety Case/ })).toBeVisible();
  await expect(row(page, 'SC-002').getByRole('button', { name: 'Assess' })).toBeVisible();
  await row(page, 'SC-002').getByRole('button', { name: 'More actions for SC-002' }).click();
  await page.getByRole('menuitem', { name: 'Flag duplicate' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Flag duplicate/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The title opens the object; the choice of view is kept on the device.
  await row(page, 'SC-002').getByRole('button', { name: /Skin rash, nausea/ }).click();
  await expect(page.locator('.app-object-panel').getByText('SC-002 · Safety Case', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(row(page, 'SC-001')).toBeVisible({ timeout: 30_000 });

  // Choosing rows offers what they have in common.
  await row(page, 'SC-004').getByRole('checkbox').check();
  await row(page, 'SC-005').getByRole('checkbox').check();
  await expect(bar(page).getByText('2 selected')).toBeVisible();
  await expect(bar(page).getByRole('button', { name: 'Triage' })).toBeVisible();
  await bar(page).getByRole('button', { name: 'Clear' }).click();
  await expect(bar(page).getByText('2 selected')).toHaveCount(0);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    for (const view of ['cards in select mode', 'list'] as const) {
      test(`${view} has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
        await page.addInitScript(([m, v]) => {
          localStorage.setItem('lsh.appearance', m);
          localStorage.setItem('lsh.listMode', v === 'list' ? 'list' : 'cards');
        }, [mode, view] as const);
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/#/type/SafetyCase');
        if (view === 'list') {
          await expect(row(page, 'SC-004')).toBeVisible({ timeout: 30_000 });
          await row(page, 'SC-004').getByRole('checkbox').check();
        } else {
          await expect(card(page, 'SC-004')).toBeVisible({ timeout: 30_000 });
          await bar(page).getByRole('button', { name: 'Select', exact: true }).click();
          await card(page, 'SC-004').getByRole('checkbox').click();
        }
        await expect(bar(page).getByText('1 selected')).toBeVisible();
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
}
