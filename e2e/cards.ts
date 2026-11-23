import type { Locator, Page } from '@playwright/test';

// An object's card leads with its title; its identifier is quiet, in small, subtle text at the end of its row of state
// labels, such as "SC-004" (design system spec 4.3). Where a card stands for an object in a comparison or a step of a batch,
// the identifier stays in front as "SC-004 · Safety Case". Tests find cards by the identifier, which is stable, rather
// than by the title.

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The identifier of an object in its card: quiet ("SC-004"), or in front ("SC-004 · Safety Case") in a comparison or a batch step. */
export const eyebrow = (scope: Page | Locator, id: string) => scope.locator('small').filter({ hasText: new RegExp(`^${escape(id)}( · .*)?$`) });

/** The card for an object, anywhere in the main area. */
export const cardFor = (page: Page, id: string) => page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, id) });

/** The identifiers of the cards in a scope, in order. */
export async function cardIds(scope: Locator): Promise<string[]> {
  return scope.locator('.pf-v6-c-card .app-subtle').allTextContents();
}
