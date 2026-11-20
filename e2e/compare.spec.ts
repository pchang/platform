import { expect, test } from '@playwright/test';

// Acting on a set (platform spec 5.4; design system spec 4.3, Set actions): choosing study scenarios together offers
// Compare study scenarios, which compares them side by side and selects one in a single commit.
test.setTimeout(120_000);

test('choose study scenarios together, compare them side by side, and select one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Marcus Bell/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Marcus/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios 3/ }).click();

  const card = (name: string) => panel.locator('.pf-v6-c-card').filter({ hasText: name });
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  // One scenario alone is not a set: no set action, and Run trial simulation needs inputs, so nothing applies to all.
  await card('VELOCITY-3 baseline').getByRole('checkbox').check();
  await expect(panel.getByRole('button', { name: 'Compare study scenarios' })).toHaveCount(0);
  await card('VELOCITY-3 without hand MRI').getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Compare study scenarios' }).click();

  const modal = page.getByRole('dialog', { name: 'Compare study scenarios: 2 study scenarios' });
  await expect(modal.getByRole('heading', { name: 'Side by side' })).toBeVisible();
  // Neither has been simulated in the seed: the comparison says so rather than inventing values.
  await expect(modal.getByText('Nothing to compare yet.')).toHaveCount(2);
  const choice = modal.getByRole('combobox', { name: 'Scenario to select' });
  const option = (await choice.locator('option').allTextContents()).find((o) => o.startsWith('SSC-3'))!;
  await choice.selectOption({ label: option });
  await modal.getByRole('textbox', { name: 'Rationale' }).fill('Within budget, without hand MRI');
  await expect(modal.getByText('SSC-1 Status')).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText('SSC-3 Status')).toBeVisible();
  await modal.getByRole('button', { name: 'Compare study scenarios' }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });

  await expect(panel.getByText('Compare study scenarios: SSC-3 chosen of 2 study scenarios')).toBeVisible();
  await expect(card('VELOCITY-3 without hand MRI').getByText('Status: selected')).toBeVisible();
  await expect(card('VELOCITY-3 baseline').getByText('Status: set aside')).toBeVisible();
  await expect(panel.getByRole('tab', { name: /^Decisions 1/ })).toBeVisible();
});
