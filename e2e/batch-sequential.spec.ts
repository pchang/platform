import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { eyebrow } from './cards';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

// A batch whose method has an input about each object runs one after another (platform spec 5.4; design system
// spec 4.3): reporting two adverse events to safety asks for each event's note in turn, then reviews both.
test.setTimeout(90_000);

const bar = (page: Page) => page.getByRole('main').locator('.pf-v6-c-toolbar');
const card = (page: Page, id: string) => page.locator('.app-object-drawer__content .pf-v6-c-card').filter({ has: eyebrow(page, id) });

test('reporting two adverse events to safety goes through each event for its note, then commits both', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(card(page, 'AE-003')).toBeVisible({ timeout: 30_000 });

  await bar(page).getByRole('button', { name: 'Select', exact: true }).click();
  await card(page, 'AE-003').getByRole('checkbox').click();
  await card(page, 'AE-005').getByRole('checkbox').click();
  await bar(page).getByRole('button', { name: 'Report to safety' }).click();

  const dialog = page.getByRole('dialog', { name: 'Report to safety 2 adverse events' });
  const steps = dialog.getByRole('navigation', { name: 'Report to safety 2 adverse events steps' });
  await expect(steps.getByRole('button')).toHaveText([/AE-003/, /AE-005/, /Review/]);
  const next = dialog.getByRole('button', { name: 'Next' });

  // The first event: its own note, then its own preview, before moving on.
  await expect(dialog.getByRole('heading', { level: 3 })).toBeVisible();
  await expect(dialog.getByText('AE-003 · Adverse Event')).toBeVisible();
  await expect(next).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Note to safety' }).fill('Rash with fever two days after the second dose.');
  await expect(dialog.getByText('not reported → reported to safety')).toBeVisible({ timeout: 20_000 });
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  expect(violations).toEqual([]);
  await next.click();

  // The second event starts with an empty note of its own.
  await expect(dialog.getByText('AE-005 · Adverse Event')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Note to safety' })).toHaveValue('');
  await dialog.getByRole('textbox', { name: 'Note to safety' }).fill('Dizziness at the week 8 visit, resolved the same day.');
  await expect(dialog.getByText('not reported → reported to safety')).toBeVisible({ timeout: 20_000 });
  await next.click();

  // Review: both events, each with its own note, then one commit each.
  await expect(dialog.getByRole('heading', { level: 4, name: /^AE-003 · / })).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 4, name: /^AE-005 · / })).toBeVisible();
  await expect(dialog.getByText(/Rash with fever two days after the second dose/)).toBeVisible();
  await expect(dialog.getByText(/Dizziness at the week 8 visit/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Report to safety 2 adverse events' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Report to safety done on 2 adverse events')).toBeVisible();
  await expect(page.getByText('Done on AE-003, AE-005.')).toBeVisible();
});
