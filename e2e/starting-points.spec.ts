import { expect, test, type Page } from '@playwright/test';

// Starting points (platform spec 3.3; design system spec 5.1): New Protocol asks how to begin, as the Start a protocol
// skill names (domain spec 3.9); only Author from scratch runs, and opens the create form.
test.setTimeout(120_000);

async function actAs(page: Page, person: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
}

test('New Protocol asks how to start, and Author from scratch opens the form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Ben Okafor');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Protocols/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'New Protocol' }).click();

  const start = page.getByRole('dialog', { name: 'New Protocol' });
  await expect(start.getByText('How do you want to start?')).toBeVisible();
  await expect(start.getByRole('heading', { name: 'Author from scratch' })).toBeVisible();
  await expect(start.getByRole('heading', { name: 'Start from a template' })).toBeVisible();
  await expect(start.getByRole('heading', { name: 'Import a protocol document' })).toBeVisible();
  await expect(start.getByText('Coming soon')).toHaveCount(2);
  // Only from scratch can be chosen, and it is, to begin with.
  await expect(start.getByRole('radio')).toHaveCount(1);
  await expect(start.getByRole('radio')).toBeChecked();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/starting-points.png' });

  await start.getByRole('button', { name: 'Continue' }).click();
  // The create form, as before.
  const form = page.getByRole('dialog', { name: 'New Protocol' });
  await expect(form.getByRole('button', { name: 'Create' })).toBeVisible();
  await expect(form.getByText('How do you want to start?')).toHaveCount(0);
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toBeHidden();
});
