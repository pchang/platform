import { expect, test, type Page } from '@playwright/test';

// Creating and editing objects (platform spec 5.3; design system spec 4.3 and 4.4): Add on a containing tab, Edit in the
// object panel's header, and no Edit on a record a rule freezes.
test.setTimeout(120_000);

async function actAs(page: Page, person: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
}

test('add a study concept inside a program, then edit it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Nadia Haddad');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts 1/ }).click();

  await panel.getByRole('button', { name: 'Add Study Concept' }).click();
  const create = page.getByRole('dialog', { name: 'New Study Concept' });
  await expect(create.getByText('In PRG-1 · Velcorin in immune-mediated inflammatory disease')).toBeVisible();
  await expect(create.getByRole('button', { name: 'Create' })).toBeDisabled();
  await create.getByRole('textbox', { name: 'Name' }).fill('VELOCITY-4: long-term extension');
  await expect(create.getByText('What will be created')).toBeVisible();
  await expect(create.getByText('draft', { exact: true })).toBeVisible({ timeout: 15_000 });
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(create).toBeHidden({ timeout: 15_000 });
  await expect(panel.getByRole('tab', { name: /^Study Concepts 2/ })).toBeVisible();

  await panel.getByText('VELOCITY-4: long-term extension').first().click();
  await expect(panel.getByRole('heading', { level: 2, name: 'VELOCITY-4: long-term extension' })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: /^Edit / });
  await expect(edit.getByRole('textbox', { name: 'Name' })).toHaveValue('VELOCITY-4: long-term extension');
  await edit.getByRole('textbox', { name: 'Name' }).fill('VELOCITY-4: open-label extension');
  await expect(edit.getByText('VELOCITY-4: long-term extension → VELOCITY-4: open-label extension')).toBeVisible({ timeout: 15_000 });
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden({ timeout: 15_000 });
  await expect(panel.getByRole('heading', { level: 2, name: 'VELOCITY-4: open-label extension' })).toBeVisible();
});

test('offers New on a list the person may create, and no Edit on an approved protocol', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Ben Okafor');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Protocols/ }).click();
  await expect(page.getByRole('main').getByRole('button', { name: 'New Protocol' })).toBeVisible();
  const panel = page.locator('.app-object-panel');
  const open = async (id: string) => {
    await page.getByRole('main').locator('.pf-v6-c-card').filter({ hasText: `${id} · Protocol` }).locator('.pf-v6-c-card__body').first().click({ position: { x: 4, y: 4 } });
    await expect(panel.getByText(`${id} · Protocol`, { exact: true })).toBeVisible();
  };
  // PROT-2 is approved, so rule 4 freezes it; PROT-3 is a draft amendment.
  await open('PROT-2');
  await expect(panel.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  // Its draft amendment opens from its tab.
  await panel.getByRole('tab', { name: /^Is amended by 1/ }).click();
  await panel.locator('.pf-v6-c-card').filter({ hasText: 'PROT-3 · Protocol' }).locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel.getByText('PROT-3 · Protocol', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
});
