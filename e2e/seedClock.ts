import { test as base } from '@playwright/test';

/**
 * The day the seed graph (data/life-sciences/seed.ttl) was written for. Its deadlines and visits are dated around
 * it, so To do's "Due" and "Overdue" labels and counts only hold on this day.
 */
export const SEED_TODAY = new Date('2026-11-15T12:00:00Z');

/**
 * A test whose page sees the seed's day as "now", whatever the real date. The clock is fixed before the page loads,
 * so the in-page gateway (which reads `new Date()` in the page) and the views agree on it. Timers still run.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(SEED_TODAY);
    await use(page);
  },
});

export { expect } from '@playwright/test';
