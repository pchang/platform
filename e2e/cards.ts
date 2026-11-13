import type { Locator, Page } from '@playwright/test';

// Object cards lead with "identifier · type" in small text, then the object's title as their heading (design system
// spec 4.3). Tests find cards by the identifier, which is stable, rather than by the title.

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The small "identifier · type" line of the card for an object. */
export const eyebrow = (scope: Page | Locator, id: string) => scope.getByText(new RegExp(`^${escape(id)} · `));

/** The card for an object, anywhere in the main area. */
export const cardFor = (page: Page, id: string) => page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, id) });

/** The identifiers of the cards in a scope, in order. */
export async function cardIds(scope: Locator): Promise<string[]> {
  const lines = await scope.locator('.pf-v6-c-card__header').getByText(/ · /).allTextContents();
  return lines.map((line) => line.split(' · ')[0]);
}
