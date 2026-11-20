import { expect, test } from '@playwright/test';

// Simulating a study scenario (domain spec 3.4.4 and 3.7): from the program to the scenario, choosing the measures as
// checkboxes and the assumptions as numbers, then following the run to its forecasts.
test.setTimeout(120_000);

test('run a trial simulation on a study scenario and read its forecasts against their targets', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Marcus Bell/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Marcus/ })).toBeVisible({ timeout: 30_000 });

  // Programs are where the Clinical Operations Lead starts; the study concept and its scenarios open inside.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios 3/ }).click();
  await panel.getByText('VELOCITY-3 baseline: 640 patients, 9 countries').first().click();

  await panel.getByRole('button', { name: 'Run trial simulation' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Run trial simulation SSC-1/ });
  const measures = dialog.getByRole('group', { name: /Outcome measures/ });
  await expect(measures.getByRole('checkbox')).toHaveCount(6);
  for (const m of ['last patient in', 'total cost']) await measures.getByRole('checkbox', { name: m }).check();
  await dialog.getByRole('spinbutton', { name: 'Screen failure rate, percent' }).fill('48');
  await dialog.getByRole('spinbutton', { name: 'Dropout rate, percent' }).fill('15');
  await dialog.getByRole('spinbutton', { name: 'Response on control, percent' }).fill('35');
  await dialog.getByRole('spinbutton', { name: 'Response on treatment, percent' }).fill('46');
  await dialog.getByRole('spinbutton', { name: 'Serious adverse events per 100 patient-years' }).fill('6');
  await expect(dialog.getByText('In the background')).toBeVisible();

  await dialog.getByRole('button', { name: 'Run trial simulation' }).click();
  await expect(dialog.getByText(/^Reference trial model, not validated for decisions about real studies\. Last patient in/)).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText(/Over the budget's ceiling of 45 million USD/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  await panel.getByRole('tab', { name: /^Trial Simulations 1/ }).click();
  await panel.getByText(/^Simulation of VELOCITY-3 baseline/).first().click();
  await panel.getByRole('tab', { name: /^Forecasts 2/ }).click();
  await expect(panel.getByText(/^Last patient in: \d+(\.\d)? months$/)).toBeVisible();
  await expect(panel.getByText(/^Total cost: \d+(\.\d)? million USD$/)).toBeVisible();
  await expect(panel.getByText('Against target: missed').first()).toBeVisible();
});
