import { expect, test } from '@playwright/test';

// Profile's list of people, grouped by the work domain each role is mainly in (design system spec 4.1, Profile).
test('the persona list is grouped by domain, and choosing someone still opens their Home', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  for (const domain of ['Clinical Development', 'Design and Plan', 'Safety and Regulatory', 'Scientific Innovation', 'Structure']) {
    await expect(page.getByRole('listbox', { name: new RegExp(`: ${domain}$`) })).toBeVisible();
  }
  await expect(page.getByRole('listbox', { name: /: Structure$/ }).getByRole('option', { name: /^Noor Rahman/ })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/profile-groups.png' });
  await page.getByRole('listbox', { name: /: Design and Plan$/ }).getByRole('option', { name: /^Marcus Bell/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Marcus/ })).toBeVisible({ timeout: 30_000 });
});
