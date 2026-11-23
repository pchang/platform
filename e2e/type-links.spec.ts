import { expect, test } from '@playwright/test';

// Identifiers are quiet in list views, and a type's name links to that type's list (design system spec 4.3, Type links, and 4.4).
test.setTimeout(120_000);

test('a card leads with its title and keeps its identifier quiet; the type’s name, plain text, appears only in a list of several types', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });

  // A list of one type: no type name on any card, and the identifier is subtle, small, and after the state, not first.
  await page.goto('/#/type/DataQuery');
  const first = page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card').first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await expect(first.locator('.pf-v6-c-card__header small')).toHaveCount(0);
  await expect(first.getByRole('link', { name: 'Data Query', exact: true })).toHaveCount(0);
  const id = first.locator('small.app-subtle');
  await expect(id).toHaveText('Q-01');
  const title = (await first.locator('.pf-v6-c-card__title').boundingBox())!;
  const quiet = (await id.boundingBox())!;
  expect(quiet.y, 'the identifier comes after the title').toBeGreaterThan(title.y);
  expect(await id.evaluate((e) => getComputedStyle(e).fontSize), 'small').toBe('12px');

  // The list view has no Identifier column; the identifier follows the title on the same line.
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const table = page.getByRole('grid', { name: 'Data Queries' });
  await expect(table.getByRole('columnheader', { name: 'Identifier' })).toHaveCount(0);
  const row = table.locator('tbody tr').first();
  const link = (await row.getByRole('button', { name: /Units missing/ }).boundingBox())!;
  const rowId = (await row.locator('small.app-subtle').boundingBox())!;
  expect(Math.abs(link.y + link.height / 2 - (rowId.y + rowId.height / 2)), 'same line').toBeLessThan(8);
  expect(rowId.x).toBeGreaterThan(link.x + link.width);
  await page.getByRole('button', { name: 'Cards', exact: true }).click();

  // To do holds several types: each card names its type as plain text, never a link, and choosing the card anywhere, the
  // type's name included, opens the object.
  await page.goto('/#/');
  const todo = page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card').first();
  await expect(todo).toBeVisible({ timeout: 30_000 });
  await expect(todo.locator('.pf-v6-c-card__header a')).toHaveCount(0);
  const name = (await todo.locator('.pf-v6-c-card__header small').first().textContent())!.trim();
  await todo.locator('.pf-v6-c-card__header small', { hasText: name }).first().click();
  const panel = page.locator('.app-object-panel');
  await expect(panel.getByRole('link', { name, exact: true })).toBeVisible({ timeout: 30_000 });
  // The list view's Type column is plain text too.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'To do' }).locator('tbody a[href^="#/type/"]')).toHaveCount(0);
});

test('the type’s name in an object’s header opens the list of its objects, and choosing one in the list opens it again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });

  // From Home, open an object: its header reads "Type · identifier", and the type's name is a link.
  const panel = page.locator('.app-object-panel');
  await page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card').first().locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const type = panel.locator('a[href^="#/type/"]').first();
  await expect(type).toBeVisible({ timeout: 30_000 });
  const name = (await type.textContent())!.trim();
  const href = (await type.getAttribute('href'))!;
  // Following it shows that type's list, with the panel closed so the list is seen.
  await type.click();
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${href.replace('#', '#')}$`));
  await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible({ timeout: 30_000 });
  const listed = page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card, .app-object-table tbody tr');
  await expect(listed.first()).toBeVisible();

  // And back: choosing an object in the list opens it again, with the same type name to bounce from.
  await listed.first().locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel.getByRole('link', { name, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
});

test('on a phone the panel steps aside, so the list is not left hidden behind it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: /Ben/ })).toBeVisible({ timeout: 30_000 });
  await page.goto('/#/type/Visit');
  await page.getByRole('main').locator('.pf-v6-l-gallery .pf-v6-c-card').first().locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('link', { name: 'Visit', exact: true }).click();
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Visits' })).toBeVisible();
});
