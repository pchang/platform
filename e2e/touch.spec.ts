import { devices, expect, test } from '@playwright/test';

// No zoom on focus (design system spec 4.1): on touch screens, text fields use 16px text, so phones do not zoom in
// when one takes focus and the page does not run wider than the screen.
test.setTimeout(60_000);
test.use({ ...devices['Pixel 7'] });

const fontSize = (el: Element) => parseFloat(getComputedStyle(el).fontSize);

test('the chat’s message bar and form fields use 16px text on a phone, the page stays the width of the screen, and pinch zoom stays', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const field = page.locator('.pf-chatbot').getByRole('textbox');
  await field.click();
  expect(await field.evaluate(fontSize)).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  // The viewport never blocks zoom.
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).not.toMatch(/maximum-scale|user-scalable/);

  // A text area in a method's form is the same.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pf-chatbot').getByRole('heading', { name: 'Ask', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Elena/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/#/type/Batch');
  await page.getByRole('main').getByRole('button', { name: 'Quarantine batch' }).first().click();
  const reason = page.getByRole('textbox', { name: 'Reason' });
  await expect(reason).toBeVisible();
  expect(await reason.evaluate(fontSize)).toBeGreaterThanOrEqual(16);
});
