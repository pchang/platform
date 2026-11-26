import { expect, test, type Page } from '@playwright/test';

// The External agent journey, the people's side (domain spec section 10; platform spec 3.4, Outside agents): the CRO Data
// Manager confirms what Northbridge's query agent proposed, and the Clinical Operations Lead oversees the agent. The agent
// itself has no UI; it works over the Model Context Protocol.
test.setTimeout(180_000);

async function actAs(page: Page, person: string) {
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
}

test('the CRO Data Manager confirms the agent’s proposal; the sponsor sees the agent and suspends it', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 400)));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });

  // The agent is not a person: nobody acts as it.
  await page.getByRole('button', { name: /^Profile/ }).click();
  await expect(page.getByRole('option', { name: /^Northbridge query agent/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await actAs(page, 'Mira Castellanos');
  const metric = page.getByRole('main').getByText('Agent proposals to decide');
  await expect(metric.first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-1-mira-home.png' });

  // In her work on Home: the proposal, with Confirm.
  const proposal = page.getByRole('main').locator('.pf-v6-c-card').filter({ hasText: 'AgentProposal-1' });
  await expect(proposal).toBeVisible({ timeout: 30_000 });
  await proposal.locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const panel = page.locator('.app-object-panel');
  await expect(panel.getByText("The site's answer cites the source document and the value matches it; nothing is left to resolve.")).toBeVisible();
  await expect(panel.getByText('Written by Northbridge query agent').first()).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-2-proposal.png' });

  await panel.getByRole('button', { name: 'Confirm', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Confirm/ });
  // What confirming commits, as Mira: the query closes.
  await expect(dialog.getByText('closed').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-3-confirm.png' });
  await dialog.getByRole('button', { name: 'Confirm' }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(panel.getByText('Status: confirmed').first()).toBeVisible({ timeout: 30_000 });

  // The sponsor's overseer: the agent's page, its journey and activity, and the off switch.
  await actAs(page, 'Marcus Bell');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Agents/ }).click();
  await page.getByRole('main').getByText('Northbridge query agent').first().click();
  await expect(panel.getByRole('heading', { name: 'Northbridge query agent' })).toBeVisible();
  await expect(panel.getByRole('list', { name: /^Journey: Status, now active/ })).toBeVisible();
  await expect(panel.getByRole('tab', { name: /^Activity/ })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-4-agent.png' });

  await panel.getByRole('button', { name: 'Suspend', exact: true }).first().click();
  const suspend = page.getByRole('dialog', { name: /^Suspend/ });
  await suspend.getByRole('textbox', { name: 'Why' }).fill('Contract amendment under review');
  await suspend.getByRole('button', { name: 'Suspend' }).last().click();
  await expect(suspend).toBeHidden({ timeout: 30_000 });
  await expect(panel.getByText('Status: suspended').first()).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText('Contract amendment under review', { exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-5-suspended.png' });
});

test('site staff see only their own sites', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Sam Whitfield');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Sites/ }).click();
  await expect(page.getByRole('main').getByText('Northfield General Hospital')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('main').getByText('Lakeside Clinical Research Center')).toHaveCount(0);
  await expect(page.getByRole('main').getByText("St. Brendan's University Hospital")).toHaveCount(0);
});

test('the Clinical Operations Lead manages assignments: an organization’s names its contract, and widens a site at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await actAs(page, 'Marcus Bell');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Assignments/ }).click();
  await expect(page.getByRole('main').getByRole('button', { name: 'New Assignment' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('main').locator('.pf-v6-c-card').filter({ hasText: 'ASG-1' }).locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  const panel = page.locator('.app-object-panel');
  await expect(panel.getByText('NB-2026-014')).toBeVisible();
  await panel.getByRole('button', { name: 'Cover a site', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /^Cover a site/ });
  await dialog.getByRole('combobox').first().selectOption({ label: "SITE-3 · St. Brendan's University Hospital" });
  await dialog.getByRole('button', { name: 'Cover a site' }).last().click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(panel.getByRole('tab', { name: /^Sites 3/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/agents-6-assignment.png' });
});
