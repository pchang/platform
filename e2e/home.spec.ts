import { expect, test } from '@playwright/test';

// Home (platform spec 5.1; design system spec 4.3, Home): the person's world, where things stand and their work, and
// from a metric straight to the objects it counts.
test.setTimeout(90_000);

test('goes from a metric on Home to exactly the objects it counts', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });
  for (const heading of ['Your world', 'Where things stand', 'Your work']) await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();

  const link = page.getByRole('link', { name: 'View 3: open data queries' });
  await expect(link).toHaveAttribute('href', '#/metric/Metric-OpenDataQueries');
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Open data queries' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('3 of 8 data queries.')).toBeVisible();
  await expect(page.getByRole('main').locator('.pf-v6-c-card').filter({ hasText: 'Data Query' })).toHaveCount(3);
  await expect(page.getByRole('main').getByText('Status: open')).toHaveCount(3);
});
