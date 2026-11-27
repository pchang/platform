import { expect, test, type Page } from '@playwright/test';

// Journey J7, Evolving the structure (domain spec section 10; platform spec 3.7): the Structure Steward drafts a change
// set through forms, sees its impact, an owner approves it, the Steward applies it and the new status shows, then rolls
// it back.
test.setTimeout(90_000);

async function actAs(page: Page, person: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
}

test('J7: add an on hold status to study scenarios, approve, apply and roll back', async ({ page }) => {
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Noor Rahman');
  await page.screenshot({ path: 'test-results/j7-1-steward-home.png' });

  // The structure is the Steward's world: change sets are made like any object.
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: /^Change Sets/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'New Change Set' }).click();
  const create = page.getByRole('dialog', { name: 'New Change Set' });
  await create.getByRole('textbox', { name: 'What it changes' }).fill('Study scenarios can wait on a budget decision: add an on hold status');
  await expect(create.getByRole('button', { name: 'Create' })).toBeEnabled({ timeout: 15_000 });
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(create).toBeHidden({ timeout: 15_000 });
  const panel = page.locator('.app-object-panel');
  await page.getByRole('main').getByText('Study scenarios can wait on a budget decision').first().click();
  await expect(panel.getByRole('heading', { level: 2, name: /^Study scenarios can wait/ })).toBeVisible();

  // One operation: add a value to the study scenario status value set.
  await panel.getByRole('button', { name: 'Add a value' }).first().click();
  const add = page.getByRole('dialog', { name: /^Add a value/ });
  // A searchable list: typing narrows the value sets.
  await add.getByRole('searchbox', { name: 'Search value set' }).fill('study scenario status');
  const set = add.getByRole('combobox', { name: 'Value set' });
  await expect(set.locator('option')).toHaveCount(2);
  const option = (await set.locator('option').allTextContents()).find((o) => o.startsWith('StudyScenarioStatus'))!;
  await set.selectOption({ label: option });
  await expect(add.getByText('Study Scenario status: adds on hold')).toBeHidden();
  await add.getByRole('textbox', { name: 'Label' }).fill('on hold');
  await add.getByRole('button', { name: 'Add a value' }).click();
  await expect(add).toBeHidden({ timeout: 15_000 });

  // Propose: the impact says what changes, that nothing moves or breaks, and what refers to the statuses.
  await panel.getByRole('button', { name: 'Propose' }).first().click();
  const propose = page.getByRole('dialog', { name: /^Propose/ });
  await expect(propose.getByRole('heading', { name: 'Impact' })).toBeVisible({ timeout: 15_000 });
  await expect(propose.getByText('Study Scenario status: adds on hold')).toBeVisible();
  await expect(propose.getByText('Method Compare study scenarios: its precondition allows only some of these values')).toBeVisible();
  await expect(propose.getByText(/LS&H life sciences terms 0\.3\.0 → 0\.4\.0/)).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/j7-2-propose-impact.png' });
  await propose.getByRole('button', { name: 'Propose' }).click();
  await expect(propose).toBeHidden({ timeout: 15_000 });

  // The owner of study scenarios approves it from To do.
  await actAs(page, 'Marcus Bell');
  const todo = page.getByRole('main');
  await todo.getByText(/^Study scenarios can wait on a budget decision/).first().click();
  await panel.getByRole('button', { name: 'Approve' }).first().click();
  const approve = page.getByRole('dialog', { name: /^Approve/ });
  await expect(approve.getByText('Study Scenario status: adds on hold')).toBeVisible({ timeout: 15_000 });
  await approve.getByRole('button', { name: 'Approve' }).click();
  await expect(approve).toBeHidden({ timeout: 15_000 });

  // The Steward applies it.
  await actAs(page, 'Noor Rahman');
  await nav.getByRole('link', { name: /^Change Sets/ }).click();
  await page.getByRole('main').getByText('Study scenarios can wait on a budget decision').first().click();
  await panel.getByRole('button', { name: 'Apply' }).first().click();
  const apply = page.getByRole('dialog', { name: /^Apply/ });
  await expect(apply.getByText('Study Scenario status: adds on hold')).toBeVisible({ timeout: 15_000 });
  await apply.getByRole('button', { name: 'Apply' }).click();
  await expect(apply).toBeHidden({ timeout: 30_000 });
  await expect(panel.getByText('Status: applied').first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/j7-3-applied.png' });

  // The new status is one of a study scenario's stages now.
  await actAs(page, 'Marcus Bell');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios 3/ }).click();
  await panel.getByText('VELOCITY-3 baseline: 640 patients, 9 countries').first().click();
  await expect(panel.getByText(/stage 1 of 4/).first()).toBeVisible({ timeout: 15_000 });

  // Rolled back: the stage goes again.
  await actAs(page, 'Noor Rahman');
  await nav.getByRole('link', { name: /^Change Sets/ }).click();
  await page.getByRole('main').getByText('Study scenarios can wait on a budget decision').first().click();
  await panel.getByRole('button', { name: 'Roll back' }).first().click();
  const back = page.getByRole('dialog', { name: /^Roll back/ });
  await expect(back.getByText('Study Scenario status: removes on hold')).toBeVisible({ timeout: 15_000 });
  await back.getByRole('button', { name: 'Roll back' }).click();
  await expect(back).toBeHidden({ timeout: 30_000 });
  await expect(panel.getByText('Outcome: rolled back').first()).toBeVisible();
});
