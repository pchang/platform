import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// The chat panel (design system spec 4.1, Ask; platform spec 5.2), on the in-page gateway: with no model connected,
// each question is searched, and the reply says so.
test.setTimeout(90_000);
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const chat = (page: Page) => page.locator('.pf-chatbot');
const bar = (page: Page) => chat(page).getByRole('textbox');

async function openTodo(page: Page, person?: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'At a glance' })).toBeVisible({ timeout: 30_000 });
  if (person) {
    await page.getByRole('button', { name: /^Profile/ }).click();
    await page.getByRole('option', { name: new RegExp(`^${person}`) }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: new RegExp(person.split(' ')[0]) })).toBeVisible({ timeout: 30_000 });
  }
}

async function ask(page: Page, question: string) {
  await bar(page).fill(question);
  await bar(page).press('Enter');
}

test('Ask opens the chat docked beside the page; a reply cites objects that open next to it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodo(page, 'Ben Okafor');
  const button = page.getByRole('banner').getByRole('button', { name: 'Ask' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('banner').getByRole('textbox')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(chat(page).getByRole('heading', { level: 2, name: 'Ask' })).toBeVisible();
  await expect(chat(page).getByText('Ask about the work you may see, or search for it.')).toBeVisible();

  // The page makes room: the content ends where the chat begins.
  const panel = (await chat(page).boundingBox())!;
  const main = (await page.getByRole('main').boundingBox())!;
  expect(main.x + main.width).toBeLessThanOrEqual(panel.x + 1);

  await ask(page, 'serious adverse events');
  await expect(chat(page).getByText(/No model is connected to answer questions, so the question was searched\. Here is what a search found for “serious adverse events”: 2 matches\./)).toBeVisible();
  await chat(page).getByRole('link', { name: 'AE-003 · Adverse Event' }).click();
  await expect(page.locator('.app-object-panel').getByRole('heading', { level: 2, name: /Jaundice/ })).toBeVisible();
  await expect(chat(page)).toBeVisible();

  await chat(page).getByRole('link', { name: 'See all 2 on the search page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
});

test('the conversation holds until New conversation, and another person starts their own', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await page.getByRole('button', { name: 'Ask' }).click();
  await chat(page).getByRole('button', { name: /What is overdue or due this week\?/ }).click();
  await expect(chat(page).getByText('What is overdue or due this week?')).toBeVisible();
  await expect(chat(page).getByText(/the question was searched/)).toBeVisible();
  await ask(page, 'serious cases');
  await expect(chat(page).getByText(/the question was searched/)).toHaveCount(2);

  // Closing keeps it; Escape closes and gives focus back to Ask.
  await bar(page).press('Escape');
  await expect(page.getByRole('button', { name: 'Ask' })).toBeFocused();
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toBeVisible();

  await chat(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toHaveCount(0);

  await ask(page, 'serious cases');
  await expect(chat(page).getByText(/the question was searched/)).toBeVisible();
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toHaveCount(0);
  await expect(chat(page).getByText(/Ben\b/).first()).toBeVisible();
});

test('on a phone the chat fills the screen, and opening an object closes it, keeping the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTodo(page, 'Ben Okafor');
  await page.getByRole('button', { name: 'Ask' }).click();
  const box = (await chat(page).boundingBox())!;
  expect(box.width).toBeCloseTo(390, 0);
  expect(box.height).toBeCloseTo(844, 0);
  await ask(page, 'pneumonia');
  await chat(page).getByRole('link', { name: 'AE-005 · Adverse Event' }).click();
  await expect(page.locator('.app-object-panel').getByRole('heading', { level: 2, name: /pneumonia/ })).toBeVisible();
  await expect(chat(page).getByRole('heading', { level: 2, name: 'Ask' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(chat(page).getByText('pneumonia', { exact: true })).toBeVisible();
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the chat has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 800 });
      await openTodo(page);
      await page.getByRole('button', { name: 'Ask' }).click();
      await ask(page, 'serious cases');
      await expect(chat(page).getByText(/the question was searched/)).toBeVisible();
      await page.mouse.move(0, 0);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBe(0);
    });
  }
}
