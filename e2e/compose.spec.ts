import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { cardFor, eyebrow } from './cards';

// Confirm and Fill in, end to end on the in-page gateway (platform spec 5.4, design system spec 5.1).
test.setTimeout(60_000);
const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

async function openTodo(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'To do' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('main').getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
}
const card = cardFor;

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
  // The next task, Submit, is Review and sign.
  await expect(card(page, 'SUB-1').getByRole('button', { name: 'Submit' })).toBeVisible();
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

test('Compare and decide: flag a duplicate side by side, then merge it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await card(page, 'SC-003').getByRole('button', { name: 'Flag duplicate' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Flag duplicate SC-003' })).toBeVisible();
  await expect(page.getByText('Choose candidate case to compare')).toBeVisible();
  await page.getByLabel('Candidate case').selectOption({ label: 'SC-006' });
  await expect(eyebrow(page, 'SC-006')).toBeVisible();
  await expect(page.getByText('Different').first()).toBeVisible();
  await expect(page.getByText('set to SC-006')).toBeVisible();
  await page.getByRole('button', { name: 'Flag duplicate' }).click();

  await expect(page.getByText('Flag duplicate done on SC-003')).toBeVisible();
  await card(page, 'SC-003').getByRole('button', { name: 'Merge duplicate' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Merge duplicate SC-003' })).toBeVisible();
  await page.getByLabel('Target case').selectOption({ label: 'SC-006' });
  await expect(page.getByText('assessed → closed')).toBeVisible();
  await expect(page.getByText("Moves this case's information into the target case and links them.")).toBeVisible();
  await page.getByRole('button', { name: 'Merge duplicate' }).click();
  await expect(page.getByText('Merge duplicate done on SC-003')).toBeVisible();
});

test('Compare and decide stacks the cards on a phone, with no accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openTodo(page);
  await card(page, 'SC-003').getByRole('button', { name: 'Flag duplicate' }).click();
  await page.getByLabel('Candidate case').selectOption({ label: 'SC-006' });
  await expect(page.getByText('set to SC-006')).toBeVisible();
  const [a, b] = await Promise.all([
    eyebrow(page, 'SC-003').boundingBox(),
    eyebrow(page, 'SC-006').boundingBox(),
  ]);
  expect(b!.y).toBeGreaterThan(a!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  expect(violations).toEqual([]);
});

async function actAs(page: Page, name: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 30_000 });
}

/** Chloé sends SUB-1 to Dev for review, so it can be submitted. */
async function sendToDev(page: Page) {
  await openTodo(page);
  await card(page, 'SUB-1').getByRole('button', { name: 'Send for review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send for review SUB-1' });
  await dialog.getByLabel('Reviewer').selectOption({ label: 'Dev Raman' });
  await expect(dialog.getByText('draft → in review')).toBeVisible();
  await dialog.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText('Send for review done on SUB-1')).toBeVisible();
}

test('Review and sign: the preparer is blocked by rule 5; a second physician reviews and signs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await sendToDev(page);

  // Chloé prepared SUB-1, so she cannot approve it: the Review step says why, and Next stays disabled.
  await card(page, 'SUB-1').getByRole('button', { name: 'Submit' }).click();
  let dialog = page.getByRole('dialog', { name: 'Submit SUB-1' });
  await expect(dialog.getByText('Approver must be someone else (rule 5: separation of duties)')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await actAs(page, 'Dev Raman');
  await card(page, 'SUB-1').getByRole('button', { name: 'Submit' }).click();
  dialog = page.getByRole('dialog', { name: 'Submit SUB-1' });
  await expect(dialog.getByText('in review → submitted')).toBeVisible();
  await expect(dialog.getByText('assessed → reported')).toBeVisible();
  await dialog.getByRole('button', { name: 'Next' }).click();

  await expect(dialog.getByText('Approval: I approve this report for submission to the regulatory authority.')).toBeVisible();
  await expect(dialog.getByText('This is not a valid electronic signature.', { exact: false })).toBeVisible();
  const sign = dialog.getByRole('button', { name: 'Submit', exact: true });
  await expect(sign).toBeDisabled();
  await dialog.getByLabel('Type your full name to sign').fill('Chloé Martin');
  await expect(sign).toBeDisabled();
  await dialog.getByLabel('Type your full name to sign').fill('Dev Raman');
  await expect(sign).toBeEnabled();
  await sign.click();

  await expect(page.getByText('Submit done on SUB-1')).toBeVisible();
  await expect(page.getByText('Signed by: Dev Raman (development signature, not valid)')).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the Sign step has no accessibility violations at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 900 });
      await sendToDev(page);
      await actAs(page, 'Dev Raman');
      await card(page, 'SUB-1').getByRole('button', { name: 'Submit' }).click();
      const dialog = page.getByRole('dialog', { name: 'Submit SUB-1' });
      await expect(dialog.getByText('in review → submitted')).toBeVisible();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await expect(dialog.getByLabel('Type your full name to sign')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
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
