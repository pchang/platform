import { expect, test } from '@playwright/test';
import { cardFor } from './cards';

// Review a draft in a preview (platform spec 3.4, Generated drafts): a page never holds a model's credential, so no model
// is connected and Generate narrative is not offered. The page itself is tested in src/views/ReviewDraft.test.tsx, and
// drafting with a connected model in src/gateway/drafting.test.ts.
test.setTimeout(60_000);

test('Generate narrative is not offered in a preview, where no model is connected', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/type/SafetyCase');
  const card = cardFor(page, 'SC-003');
  // The serious case is triaged, so Flag duplicate is offered; drafting its narrative is not.
  await expect(card.getByRole('button', { name: 'Flag duplicate' })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole('button', { name: 'Generate narrative' })).toHaveCount(0);
  await expect(card.getByText(/Generate narrative/)).toHaveCount(0);
});
