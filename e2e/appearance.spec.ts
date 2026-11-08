import { expect, test, type Page } from '@playwright/test';

const DARK = /pf-v6-theme-dark/;
const at = (h: number, m = 0) => new Date(2026, 10, 8, h, m);

async function chooseAppearance(page: Page, option: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('option', { name: new RegExp(`^${option}`) }).click();
}

test('Automatic is light during the day', async ({ page }) => {
  await page.clock.install({ time: at(12) });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(DARK);
});

test('Automatic is dark at night', async ({ page }) => {
  await page.clock.install({ time: at(22) });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(DARK);
});

test('Automatic switches to dark at the end of the day without a reload', async ({ page }) => {
  await page.clock.install({ time: at(18, 59) });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(DARK);
  await page.clock.runFor(61_000);
  await expect(page.locator('html')).toHaveClass(DARK);
});

test('a forced Light setting holds at night and after a reload', async ({ page }) => {
  await page.clock.install({ time: at(22) });
  await page.goto('/');
  await chooseAppearance(page, 'Light');
  await expect(page.locator('html')).not.toHaveClass(DARK);
  await page.reload();
  await expect(page.locator('html')).not.toHaveClass(DARK);
});

test('a forced Dark setting holds during the day', async ({ page }) => {
  await page.clock.install({ time: at(12) });
  await page.goto('/');
  await chooseAppearance(page, 'Dark');
  await expect(page.locator('html')).toHaveClass(DARK);
});

test('the settings menu stays on screen at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = await page.getByRole('listbox', { name: 'Appearance' }).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});
