import { expect, test } from '@playwright/test';

// Ask about the chosen (design system spec 4.1 and 4.3): once objects are chosen in a list, the list bar ends with the
// Ask speech bubbles, after the set and batch actions, and opens a conversation about all of them.
test.setTimeout(120_000);

test('choose study scenarios, then ask about them together in the chat', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Marcus Bell/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Marcus/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios 3/ }).click();

  const card = (name: string) => panel.locator('.pf-v6-c-card').filter({ hasText: name });
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Ask about the \d+ selected$/ })).toHaveCount(0);
  await card('VELOCITY-3 baseline').getByRole('checkbox').check();
  await card('VELOCITY-3 without hand MRI').getByRole('checkbox').check();
  // The set action comes first, Ask last.
  await expect(panel.getByRole('button', { name: 'Compare study scenarios' })).toBeVisible();
  await panel.getByRole('button', { name: 'Ask about the 2 selected' }).click();

  const chat = page.locator('.app-chat');
  await expect(chat.getByText('Ask about these 2')).toBeVisible({ timeout: 15_000 });
  await expect(chat.getByText('SSC-1, SSC-3')).toBeVisible();
  await expect(chat.getByRole('textbox', { name: /Ask about these 2/ })).toBeVisible();
  await chat.getByRole('button', { name: /How do they differ\?/ }).click();
  // Without a model, a question about objects shows those objects.
  await expect(chat.getByText('No model is connected to answer questions, so here is what you asked about.')).toBeVisible({ timeout: 15_000 });
});
