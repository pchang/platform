import { eyebrow } from './cards';
import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

// The chat panel (design system spec 4.1, Ask; platform spec 5.2), on the in-page gateway: with no model connected,
// each question is searched, and the reply says so.
test.setTimeout(90_000);
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const chat = (page: Page) => page.locator('.pf-chatbot');
const bar = (page: Page) => chat(page).locator('.pf-chatbot__message-bar').getByRole('textbox');

async function openTodo(page: Page, person?: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
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
  const button = page.getByRole('banner').getByRole('button', { name: 'Ask', exact: true });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('banner').getByRole('textbox')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(chat(page).getByRole('heading', { level: 2, name: 'Ask', exact: true })).toBeVisible();
  await expect(chat(page).getByText('Search or ask anything')).toBeVisible();

  // The page makes room: the content ends where the chat begins.
  const panel = (await chat(page).boundingBox())!;
  const main = (await page.getByRole('main').boundingBox())!;
  expect(main.x + main.width).toBeLessThanOrEqual(panel.x + 1);

  await ask(page, 'serious adverse events');
  await expect(chat(page).getByText(/No model is connected to answer questions, so the question was searched\. Here is what a search found for “serious adverse events”: 2 matches\./)).toBeVisible();
  await chat(page).getByRole('link', { name: /^Jaundice/ }).click();
  await expect(page.locator('.app-object-panel').getByRole('heading', { level: 2, name: /Jaundice/ })).toBeVisible();
  await expect(chat(page)).toBeVisible();

  await chat(page).getByRole('link', { name: 'See all 2 on the search page' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
});

test('the conversation holds until New conversation, and another person starts their own', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openTodo(page);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await chat(page).getByRole('button', { name: /What is overdue or due this week\?/ }).click();
  await expect(chat(page).getByText('What is overdue or due this week?')).toBeVisible();
  await expect(chat(page).getByText(/the question was searched/)).toBeVisible();
  await ask(page, 'serious cases');
  await expect(chat(page).getByText(/the question was searched/)).toHaveCount(2);

  // Closing keeps it; Escape closes and gives focus back to Ask.
  await bar(page).press('Escape');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toBeVisible();

  await chat(page).getByRole('button', { name: 'New conversation' }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toHaveCount(0);

  await ask(page, 'serious cases');
  await expect(chat(page).getByText(/the question was searched/)).toBeVisible();
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Ben Okafor/ }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toHaveCount(0);
  await expect(chat(page).getByText('Search or ask anything')).toBeVisible();
  // Each person has their own history: back as Chloé, her conversation is back.
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: /^Chloé Martin/ }).click();
  await expect(chat(page).getByText('serious cases', { exact: true })).toBeVisible();
});

test('each object asked about starts a new conversation, and the history returns to any of them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodo(page, 'Ben Okafor');
  for (const id of ['AE-003', 'AE-005']) {
    await page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, id) }).getByRole('button', { name: `Ask about ${id}` }).click();
    await expect(chat(page).locator('.app-chat__about').getByText(`${id} · Adverse Event`)).toBeVisible();
    await chat(page).getByRole('button', { name: new RegExp(`Summarize ${id}`) }).click();
    await expect(chat(page).getByText(/here is what you asked about/)).toBeVisible();
  }
  await chat(page).getByRole('button', { name: 'Conversations' }).click();
  const history = chat(page).getByRole('menu');
  await expect(history.getByRole('menuitem')).toHaveText([/^AE-005 · Fever and cough/, /^AE-003 · Jaundice/]);
  await history.getByRole('menuitem', { name: /^AE-003/ }).click();
  await expect(chat(page).locator('.app-chat__about').getByText('AE-003 · Adverse Event')).toBeVisible();
  await expect(chat(page).getByText('Summarize AE-003', { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveAttribute('placeholder', 'Ask about AE-003');
});

test('on a phone the chat fills the screen, and opening an object closes it, keeping the conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTodo(page, 'Ben Okafor');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const box = (await chat(page).boundingBox())!;
  expect(box.width).toBeCloseTo(390, 0);
  expect(box.height).toBeCloseTo(844, 0);
  await ask(page, 'pneumonia');
  await chat(page).getByRole('link', { name: /pneumonia/ }).click();
  await expect(page.locator('.app-object-panel').getByRole('heading', { level: 2, name: /pneumonia/ })).toBeVisible();
  await expect(chat(page).getByRole('heading', { level: 2, name: 'Ask', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(chat(page).getByText('pneumonia', { exact: true })).toBeVisible();
});

test('asking from a card loads the object into the chat, with its methods ready to run', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodo(page, 'Ben Okafor');
  const card = page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'AE-003') });
  await card.getByRole('button', { name: 'Ask about AE-003' }).click();
  await expect(chat(page).getByText('Ask about AE-003', { exact: true })).toBeVisible();
  const about = chat(page).locator('.app-chat__about');
  await expect(about.getByText('AE-003 · Adverse Event')).toBeVisible();
  await expect(about.getByText('Reporting: not reported')).toBeVisible();
  await expect(bar(page)).toHaveAttribute('placeholder', 'Ask about AE-003');

  // A prompt about it needs no description; without a model, the reply is the object itself.
  await chat(page).getByRole('button', { name: /Summarize AE-003/ }).click();
  await expect(chat(page).getByText(/No model is connected to answer questions, so here is what you asked about\./)).toBeVisible();
  await expect(chat(page).locator('.pf-chatbot__sources-card').getByRole('link', { name: /^Jaundice/ })).toBeVisible();

  // Its methods run as they do anywhere.
  await about.getByRole('button', { name: 'Report to safety' }).click();
  await expect(page.getByRole('dialog', { name: /^Report to safety/ })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
});

test('asking from a list row or the object panel does the same', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodo(page, 'Ben Okafor');
  await page.goto('/#/type/AdverseEvent');
  await page.getByRole('main').getByRole('button', { name: 'List' }).click();
  await page.getByRole('button', { name: 'Ask about AE-005' }).click();
  await expect(chat(page).locator('.app-chat__about').getByText('AE-005 · Adverse Event')).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: /^Jaundice/ }).click();
  await page.locator('.app-object-panel').getByRole('button', { name: 'Ask about AE-003' }).click();
  await expect(chat(page).locator('.app-chat__about').getByText('AE-003 · Adverse Event')).toBeVisible();
  await expect(chat(page).getByText('AE-005 · Adverse Event')).toHaveCount(0);
});

for (const mode of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`the chat has no accessibility violations and fits at ${width}px in ${mode} mode`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('lsh.appearance', m), mode);
      await page.setViewportSize({ width, height: 800 });
      await openTodo(page);
      await page.getByRole('button', { name: 'Ask', exact: true }).click();
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

test('a conversation is set aside in the dock like a process, and comes back with the process left where it is (design system spec 4.1)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTodo(page, 'Ben Okafor');
  const card = page.getByRole('main').locator('.pf-v6-c-card').filter({ has: eyebrow(page, 'AE-003') });
  await card.getByRole('button', { name: 'Ask about AE-003' }).click();
  await chat(page).getByRole('button', { name: /Summarize AE-003/ }).click();
  await expect(chat(page).getByText(/No model is connected/)).toBeVisible();

  // Minimize sits between New conversation and Close, and sends the conversation to the dock.
  const actions = chat(page).locator('.pf-chatbot__actions').getByRole('button');
  await expect(actions).toHaveText(['', '', '']);
  expect(await actions.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).toEqual(['New conversation', 'Minimize', 'Close']);
  await chat(page).getByRole('button', { name: 'Minimize' }).click();
  await expect(chat(page).getByRole('heading', { name: 'Ask', exact: true })).toHaveCount(0);
  const dock = page.getByRole('region', { name: 'Processes set aside' });
  await expect(dock.getByRole('heading', { name: 'Set aside (1)' })).toBeVisible();
  const entry = dock.getByRole('button', { name: /^Ask: AE-003 · / });
  await expect(entry).toBeVisible();
  await expect(dock.getByText('1 question')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/chat-aside-dock.png' });

  // Opening the chat again starts a new conversation.
  await page.getByRole('banner').getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(chat(page).getByText('Search or ask anything')).toBeVisible();
  await chat(page).getByRole('button', { name: 'Close' }).click();

  // A process set aside stays in the dock when the conversation comes back: the two are independent.
  await card.getByRole('button', { name: 'Report to safety' }).click();
  const dialog = page.getByRole('dialog', { name: /^Report to safety/ });
  await dialog.getByRole('button', { name: 'Minimize' }).click();
  await expect(dock.getByRole('heading', { name: 'Set aside (2)' })).toBeVisible();
  await entry.click();
  await expect(chat(page).locator('.app-chat__about').getByText('AE-003 · Adverse Event')).toBeVisible();
  await expect(chat(page).getByText(/No model is connected/)).toBeVisible();
  await expect(dock.getByRole('heading', { name: 'Set aside (1)' })).toBeVisible();
  await expect(dock.getByRole('button', { name: /^Report to safety/ })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/chat-aside-restored.png' });

  // Set aside again, then closed from the dock: it leaves the dock and stays in the history.
  await chat(page).getByRole('button', { name: 'Minimize' }).click();
  await dock.getByRole('button', { name: /^Close Ask: AE-003/ }).click();
  await expect(dock.getByRole('button', { name: /^Ask: / })).toHaveCount(0);
  await page.getByRole('banner').getByRole('button', { name: 'Ask', exact: true }).click();
  await chat(page).getByRole('button', { name: 'Conversations' }).click();
  await expect(page.getByRole('menuitem', { name: /^AE-003 · / })).toBeVisible();
});
