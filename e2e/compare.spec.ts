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
  await card('VELOCITY-3 with prior biologic').getByRole('checkbox').check();
  await card('VELOCITY-3 without hand MRI').getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Compare study scenarios' }).click();

  const modal = page.getByRole('dialog', { name: 'Compare study scenarios: 3 study scenarios' });
  await expect(modal.getByRole('heading', { name: 'Side by side' })).toBeVisible();
  // Each was simulated in the seed by the reference model: its forecasts, against the concept's targets.
  const figure = (text: string) => {
    const [value, against] = text.split(' Against target: ');
    return modal.getByRole('definition').filter({ hasText: value }).filter({ hasText: `Against target: ${against}` });
  };
  await expect(figure('19.6 months Against target: missed')).toBeVisible();
  await expect(figure('16.8 months Against target: met')).toBeVisible();
  await expect(figure('47.5 percent Against target: missed')).toBeVisible();
  await expect(figure('14.6 months Against target: met')).toBeVisible();
  await expect(figure('37.7 million USD Against target: met')).toBeVisible();
  await expect(modal.getByText('Nothing to compare yet.')).toHaveCount(0);
  // The Recommend a study scenario skill (domain spec 3.9) recommends SSC-3 by its reference procedure: its card is outlined
  // and labeled, its reasoning sits between Side by side and Decide, and the choice starts with it.
  await expect(modal.getByRole('heading', { name: 'Recommendation' })).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText(/^SSC-3 is the only one with nothing flagged in the comparison\./)).toBeVisible();
  const recommended = modal.locator('.pf-v6-c-card.app-highlighted');
  await expect(recommended).toHaveCount(1);
  await expect(recommended).toContainText('VELOCITY-3 without hand MRI');
  await expect(recommended.getByText('Recommended', { exact: true })).toBeVisible();
  const choice = modal.getByRole('combobox', { name: 'Scenario to select' });
  await expect(choice.locator('option:checked')).toHaveText(/^SSC-3/);
  // The rationale is the person's own: empty, so the decision cannot be made yet. The button already names the choice.
  await expect(modal.getByRole('textbox', { name: 'Rationale' })).toHaveValue('');
  await expect(modal.getByRole('button', { name: 'Select SSC-3', exact: true })).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Compare study scenarios' })).toHaveCount(0);
  await modal.getByRole('heading', { name: 'Side by side' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/compare-recommendation.png' });
  await modal.getByRole('textbox', { name: 'Rationale' }).fill('Within budget, without hand MRI');
  await expect(modal.getByText('SSC-1 Status')).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText('SSC-2 Status')).toBeVisible();
  await expect(modal.getByText('SSC-3 Status')).toBeVisible();
  // The button names the decision, with the scenario chosen.
  await modal.getByRole('button', { name: 'Select SSC-3', exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });

  await expect(panel.getByText('Compare study scenarios: SSC-3 chosen of 3 study scenarios')).toBeVisible();
  await expect(card('VELOCITY-3 without hand MRI').getByText('Status: selected')).toBeVisible();
  await expect(card('VELOCITY-3 baseline').getByText('Status: set aside')).toBeVisible();
  await expect(card('VELOCITY-3 with prior biologic').getByText('Status: set aside')).toBeVisible();
  await expect(panel.getByRole('tab', { name: /^Decisions 1/ })).toBeVisible();
});
