import { expect, test, type Page } from '@playwright/test';
import { eyebrow } from './cards';

// Protocol, added to the ontology and seed alone, appears across the generated platform with no code of its own
// (domain spec 3.1 and 3.3): navigation, To do, its list, its panel and its links.
test.setTimeout(90_000);

async function asBen(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
}
const panel = (page: Page) => page.locator('.app-object-panel');

test('a protocol type added to the ontology appears in navigation, To do, its list and the object panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await asBen(page);
  // To do: the draft amendment waits to be sent for review.
  const draft = page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'PROT-3') });
  await expect(draft.getByRole('button', { name: 'Send protocol for review' })).toBeVisible();

  // Navigation: Protocols, with its count, in Clinical Development.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Protocols 3/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Protocols' })).toBeVisible();

  // The panel: its overview, the version it amends, and tabs for the studies it governs and its amendments.
  await page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'PROT-2') }).getByRole('button', { name: /version 2\.0/ }).click();
  await expect(panel(page).getByRole('heading', { level: 2, name: 'VELOCITY-2 protocol, version 2.0' })).toBeVisible();
  await expect(panel(page).getByRole('tab')).toHaveText(['Overview', 'Studies 1', 'Is amended by 1']);
  await expect(panel(page).getByText('Raises planned enrollment to 240 and adds a Week 8 visit')).toBeVisible();
  // Its amendment, PROT-3, is in progress, so the ontology's precondition withholds Amend protocol.
  await expect(panel(page).getByRole('button', { name: 'Amend protocol' })).toHaveCount(0);

  // The study it governs, opened from the Studies tab, links back to it.
  await panel(page).getByRole('tab', { name: 'Studies 1' }).click();
  await expect(panel(page).getByText('This protocol governs this study.')).toBeVisible();
  await panel(page).locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'ST-01') }).locator('.pf-v6-c-card__body').click({ position: { x: 4, y: 4 } });
  await expect(panel(page).getByText('ST-01 · Study', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'PROT-2 · VELOCITY-2 protocol, version 2.0' })).toBeVisible();
});
