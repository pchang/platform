import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// Several processes at once (platform spec 5.4; design system spec 4.1 and 5.1), on the in-page gateway.
test.setTimeout(90_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

const card = (page: Page, id: string) => page.getByRole('main').locator('.pf-v6-c-card').filter({ has: page.getByRole('heading', { level: 2, name: id, exact: true }) });
const dock = (page: Page) => page.getByRole('region', { name: 'Processes set aside' });

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await expect(card(page, 'SC-004')).toBeVisible({ timeout: 30_000 });
}

test('set a process aside, start another, and come back to the first with what was given', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await expect(dock(page)).toHaveCount(0);

  await card(page, 'SC-004').getByRole('button', { name: 'Triage' }).click();
  const triage = page.getByRole('dialog', { name: 'Triage SC-004' });
  await triage.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('serious', { exact: true }).check();
  await triage.getByRole('button', { name: 'Minimize' }).click();
  await expect(triage).toBeHidden();
  await expect(dock(page).getByRole('button', { name: 'Triage SC-004', exact: true })).toBeVisible();
  await expect(dock(page).getByText('1 of 2 fields')).toBeVisible();
  await expect(dock(page).getByRole('progressbar', { name: 'Triage SC-004: 1 of 2 fields' })).toBeVisible();

  // Starting another process sets the one in front aside: here, Send for review, ready at once.
  await card(page, 'SUB-1').getByRole('button', { name: 'Send for review' }).click();
  const send = page.getByRole('dialog', { name: 'Send for review SUB-1' });
  await expect(send.getByText('draft → in review')).toBeVisible();
  // A modal covers the page, dock included, so the person sets it aside before choosing another.
  await send.getByRole('button', { name: 'Minimize' }).click();
  await expect(dock(page).getByText('Ready to commit')).toBeVisible();
  await dock(page).getByRole('button', { name: 'Triage SC-004', exact: true }).click();
  await expect(send).toBeHidden();

  // Triage comes back with what was given, and finishes.
  await expect(triage.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('serious', { exact: true })).toBeChecked();
  await triage.getByRole('radiogroup', { name: 'Expectedness' }).getByLabel('unexpected').check();
  await expect(triage.getByText('received → triaged')).toBeVisible();
  await triage.getByRole('button', { name: 'Triage' }).click();
  await expect(page.getByText('Triage done on SC-004')).toBeVisible();
  await expect(dock(page).getByRole('button', { name: 'Send for review SUB-1', exact: true })).toBeVisible();

  // Closing a set-aside process commits nothing.
  await dock(page).getByRole('button', { name: 'Close Send for review SUB-1' }).click();
  await expect(dock(page)).toHaveCount(0);
  await expect(card(page, 'SUB-1').getByRole('button', { name: 'Send for review' })).toBeVisible();
});

test('the dock is kept on this device across a reload, without opening anything over the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SC-004').getByRole('button', { name: 'Triage' }).click();
  const triage = page.getByRole('dialog', { name: 'Triage SC-004' });
  await triage.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('non-serious').check();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await dock(page).getByRole('button', { name: 'Triage SC-004', exact: true }).click();
  await expect(triage.getByRole('radiogroup', { name: 'Seriousness' }).getByLabel('non-serious')).toBeChecked();
});

test('a background run keeps going in the dock, with its progress', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/type/Product');
  await card(page, 'P-101').getByRole('button', { name: 'Run signal detection' }).click({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Run signal detection P-101' });
  await dialog.getByRole('button', { name: 'Run signal detection' }).click();
  await dialog.getByRole('button', { name: 'Minimize' }).click();
  await expect(dock(page).getByText('Finished')).toBeVisible({ timeout: 30_000 });
  await dock(page).getByRole('button', { name: 'Run signal detection P-101', exact: true }).click();
  await expect(dialog.getByText('Found 1 new signal')).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  test(`the dock fits a phone and has no accessibility violations in ${mode} mode`, async ({ page }) => {
    await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
    await page.setViewportSize({ width: 320, height: 800 });
    await openTodo(page);
    for (const [id, method] of [['SC-004', 'Triage'], ['SC-005', 'Triage'], ['SUB-1', 'Send for review']] as const) {
      await card(page, id).getByRole('button', { name: method }).click();
      await page.getByRole('dialog', { name: `${method} ${id}` }).getByRole('button', { name: 'Minimize' }).click();
    }
    await expect(dock(page).getByRole('listitem')).toHaveCount(3);
    await expect(dock(page).getByRole('heading', { name: 'Set aside (3)' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no horizontal page scroll').toBe(0);
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
      return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    });
    expect(violations).toEqual([]);
  });
}
