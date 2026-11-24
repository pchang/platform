import { expect, test, type Page } from '@playwright/test';

// Measures and observations (platform spec 3.2; domain spec 3.10): the Clinical Data Manager checks the Phase II study's
// vital signs against Blood Pressure, and only the values that need action become data points.
test.setTimeout(180_000);

async function actAs(page: Page, person: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
}

test('check a vital signs dataset version against Blood Pressure, and see the two values that need action', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Ben Okafor');

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Datasets/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Datasets' })).toBeVisible();
  await page.getByRole('main').getByText('VELOCITY-2 vital signs').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Dataset Versions 1/ }).click();
  await panel.getByText(/^VELOCITY-2 vital signs, cut/).first().click();
  await expect(panel.getByText('Status: loaded').first()).toBeVisible();

  await panel.getByRole('button', { name: 'Check against measures' }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Check against measures/ });
  // What the check would record: 40 expected, 39 received, 1 missing, 1 not allowed; and two data points.
  for (const [term, value] of [['expected', '40'], ['received', '39'], ['missing', '1'], ['not allowed', '1']]) {
    await expect(dialog.getByRole('term').filter({ hasText: new RegExp(`^${term}$`) })).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole('definition').filter({ hasText: `set to ${value}` }).first()).toBeVisible();
  }
  await expect(dialog.getByText(/^DataPoint-2, Status: open, Kind: not allowed/)).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/observations-1-check.png' });
  await dialog.getByRole('button', { name: 'Check against measures' }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await expect(panel.getByText('Status: checked').first()).toBeVisible();
  await panel.getByRole('tab', { name: /^Data Points 2/ }).click();
  await expect(panel.getByText('Missing: Diastolic blood pressure, Week 8 visit for PT-04')).toBeVisible();
  await expect(panel.getByText('Not allowed: Systolic blood pressure, Week 4 visit for PT-07')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/observations-2-points.png' });

  // The data point refers to the value; it is not a copy of the dataset.
  await panel.getByText('Not allowed: Systolic blood pressure, Week 4 visit for PT-07').click();
  await expect(panel.getByText('310 mmHg is above the plausible 250')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/observations-3-point.png' });
});
