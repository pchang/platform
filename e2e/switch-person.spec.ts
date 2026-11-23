import { expect, test } from '@playwright/test';

// Profile (design system spec 4.1): choosing another person opens their Home, so no one is left on a page that does
// not apply to them; choosing the one already acted as changes nothing.
test.setTimeout(90_000);

test('choosing another person in Profile opens their Home', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });

  // Ben's metric page, which a portfolio strategist may not read.
  await page.goto('/#/metric/Metric-OpenDataQueries');
  await expect(page.getByRole('heading', { level: 1, name: 'Open data queries' })).toBeVisible({ timeout: 30_000 });
  // Choosing Ben again changes nothing.
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page).toHaveURL(/#\/metric\/Metric-OpenDataQueries$/);

  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ingrid Solberg/ }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ingrid/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Open data queries' })).toHaveCount(0);
});
