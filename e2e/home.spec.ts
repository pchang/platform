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

  // No View link: the tile is chosen as a whole, and its title is the link.
  await expect(page.getByRole('link', { name: /^View \d/ })).toHaveCount(0);
  const tile = page.locator('.app-openable-card').filter({ has: page.getByRole('heading', { level: 3, name: 'Open data queries' }) });
  await expect(tile.getByRole('link', { name: 'Open data queries' })).toHaveAttribute('href', '#/metric/Metric-OpenDataQueries');
  // Choosing the card away from its title opens the page.
  await tile.getByText('of 8 data queries').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Open data queries' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('3 of 8 data queries')).toBeVisible();
  await expect(page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card')).toHaveCount(3);
  await expect(page.getByRole('main').getByText('Status: open')).toHaveCount(3);

  // The way back: a link to Home above the heading, which returns to Home however the page was reached.
  const back = page.getByRole('link', { name: 'Back to Home' });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', '#/');
  await back.click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Your world' })).toBeVisible({ timeout: 30_000 });
  // From a bookmarked address, too.
  await page.goto('/#/metric/Metric-OpenDataQueries');
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Your world' })).toBeVisible({ timeout: 30_000 });
});

test('each Where things stand row links to its type’s list of objects, and back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });
  // The row's name is a heading and a link, to the same page as the sidebar's entry for it.
  const row = page.getByRole('heading', { level: 3, name: 'Data Queries', exact: true }).getByRole('link', { name: 'Data Queries', exact: true });
  await expect(row).toHaveAttribute('href', '#/type/DataQuery');
  await row.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Data Queries' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('main').getByText('8 data queries')).toBeVisible();
  // The list begins with a way back to Home, above its heading; the sidebar's Home returns too.
  const back = page.getByRole('link', { name: 'Back to Home' });
  await expect(back).toHaveAttribute('href', '#/');
  expect((await back.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { level: 1, name: 'Data Queries' }).boundingBox())!.y);
  await back.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Where things stand' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Data Queries' }).click();
  await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Where things stand' })).toBeVisible({ timeout: 30_000 });
});
