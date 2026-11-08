import { expect, test } from '@playwright/test';
import { product } from '../src/config/product';

// Design system spec, section 4: tested at 320px, md and xl.
const widths = [
  { label: '320px', width: 320 },
  { label: 'md', width: 768 },
  { label: 'xl', width: 1200 },
];

for (const { label, width } of widths) {
  test(`chrome works at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('link', { name: product.name })).toBeVisible();
    for (const name of ['Notifications', 'Settings', 'Profile']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }

    // Logo and actions share one row at every width (design system spec 4.1).
    const logoBox = await page.getByRole('link', { name: product.name }).boundingBox();
    const profileBox = await page.getByRole('button', { name: 'Profile' }).boundingBox();
    expect(Math.abs(logoBox!.y + logoBox!.height / 2 - (profileBox!.y + profileBox!.height / 2))).toBeLessThan(8);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'no horizontal page scroll').toBe(0);
  });
}
