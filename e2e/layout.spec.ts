import { expect, test, type Page } from '@playwright/test';

// Spacing and grouping (design system spec 4.5): at a small phone's width nothing runs off the screen or is cut short, and
// the page's distances say what belongs together.
test.setTimeout(120_000);

async function start(page: Page, who: string, width = 320) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Your work' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Profile/ }).click();
  await page.getByRole('option', { name: new RegExp(`^${who}`) }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
}

const sidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('at 320px no page scrolls sideways, and the product name is whole over two lines', async ({ page }) => {
  await start(page, 'Ben Okafor');
  // The logo is whole: the product name as text, over two lines at most and not clipped, or the brand's images inside the masthead.
  const logo = page.locator('.app-masthead__brand a');
  await expect(logo).toHaveAccessibleName('LS&H Ecosystem');
  const name = page.locator('.app-masthead__name');
  if (await name.count()) expect(await name.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  else {
    const box = (await logo.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  for (const route of ['#/', '#/metric/Metric-OpenDataQueries', '#/type/DataQuery', '#/type/Visit', '#/catalog', '#/search/open%20queries']) {
    await page.goto(`/${route}`);
    await page.waitForTimeout(800);
    expect(await sidewaysScroll(page), route).toBeLessThanOrEqual(0);
  }
});

test('on Home, a heading is nearer what it heads, and the health labels of a row of tiles line up', async ({ page }) => {
  await start(page, 'Ben Okafor', 1280);
  const box = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!;
  const heading = page.getByRole('heading', { level: 2, name: 'Your world' });
  const tiles = page.locator('.pf-v6-l-grid__item .pf-v6-c-card');
  const above = (await box(heading)).y - (await box(page.getByRole('main').getByRole('heading', { level: 1 }))).y;
  const nearest = (await box(tiles.first())).y - ((await box(heading)).y + (await box(heading)).height);
  const sectionGap = (await box(heading)).y - (await box(page.getByText(/items? need you as|Nothing needs you as/))).y;
  expect(nearest, 'heading to its tiles').toBeLessThan(sectionGap - (await box(page.getByText(/items? need you as|Nothing needs you as/))).height);
  expect(above).toBeGreaterThan(0);
  const labels = tiles.locator('.pf-v6-c-label');
  const bottoms = await labels.evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().bottom)));
  expect(new Set(bottoms).size, `label bottoms ${bottoms}`).toBe(1);
});

test('a dialog’s title wraps whole, its choices stack, and its buttons keep their padding at 320px', async ({ page }) => {
  await start(page, 'Marcus Bell');
  // The sidebar is a drawer on a phone, so go by route.
  await page.goto('/#/type/Program');
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios/ }).click();
  await panel.getByRole('button', { name: 'Run trial simulation' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Run trial simulation SSC-1/ });
  const title = dialog.locator('.pf-v6-c-modal-box__title');
  await expect(title).toBeVisible();
  expect(await title.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis')).toBe(true);
  // The measures are rows at least 24px tall (WCAG 2.2), with the box on the label's center line.
  const rows = dialog.locator('.pf-v6-c-check');
  expect(await rows.first().evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(24);
  expect(await rows.first().evaluate((e) => { const i = e.querySelector('input')!.getBoundingClientRect(); const l = e.querySelector('label')!.getBoundingClientRect(); return Math.abs(i.y + i.height / 2 - (l.y + l.height / 2)); })).toBeLessThan(1);
  const primary = dialog.getByRole('button', { name: 'Run trial simulation' });
  expect(await primary.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
});

test('the Settings and Profile menus keep an even margin to the screen’s edge at 320px, and the people list scrolls', async ({ page }) => {
  await start(page, 'Ben Okafor');
  for (const name of ['Settings', /^Profile/]) {
    await page.getByRole('button', { name }).click();
    const menu = page.locator('.pf-v6-c-menu.app-header-menu');
    await expect(menu).toBeVisible();
    const b = (await menu.boundingBox())!;
    expect(Math.round(b.x), 'left margin').toBe(16);
    expect(Math.round(320 - (b.x + b.width)), 'right margin').toBe(16);
    expect(b.y + b.height).toBeLessThanOrEqual(800);
    await page.keyboard.press('Escape');
  }
});

test('a list bar never clips beside an open chat: its controls wrap, and "selected" stays on one line', async ({ page }) => {
  await start(page, 'Marcus Bell', 1280);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: /^Programs/ }).click();
  await page.getByText('Velcorin in immune-mediated inflammatory disease').first().click();
  const panel = page.locator('.app-object-panel');
  await panel.getByRole('tab', { name: /^Study Concepts/ }).click();
  await panel.getByText(/^VELOCITY-3: Phase III/).first().click();
  await panel.getByRole('tab', { name: /^Study Scenarios/ }).click();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  for (const n of ['baseline', 'prior biologic']) await panel.locator('.pf-v6-c-card').filter({ hasText: n }).getByRole('checkbox').check();
  const bar = panel.locator('.pf-v6-c-toolbar');
  const clipped = await bar.evaluate((el) => [...el.querySelectorAll('button, .pf-v6-c-menu-toggle')].filter((b) => b.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length);
  expect(clipped).toBe(0);
  const selected = bar.getByText('2 selected');
  expect(await selected.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(30);
  // New and Add wait while objects are chosen.
  await expect(bar.getByRole('button', { name: /^Add Study Scenario/ })).toHaveCount(0);
});

test('beside an open chat the count tiles go two across, each select circle stays inside its card, and the list bar stands clear of its list', async ({ page }) => {
  await start(page, 'Chloé Martin', 1280);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('heading', { level: 2, name: 'Your work' }).scrollIntoViewIfNeeded();
  const tiles = await page.locator('.pf-v6-c-card.pf-m-selectable').evaluateAll((cards) =>
    cards.map((c) => {
      const card = c.getBoundingClientRect();
      const circle = c.querySelector('input')!.getBoundingClientRect();
      return { width: Math.round(card.width), x: Math.round(card.x), inset: Math.round(card.right - circle.right), top: Math.round(circle.top - card.top) };
    }),
  );
  expect(tiles).toHaveLength(4);
  // Two across: only two distinct left edges, and no tile so narrow its title and circle collide.
  expect(new Set(tiles.map((t) => t.x)).size).toBe(2);
  for (const t of tiles) {
    expect(t.width, 'tile width').toBeGreaterThanOrEqual(140);
    expect(t.inset, 'circle inside the card').toBeGreaterThanOrEqual(8);
    expect(t.top, 'circle inside the card').toBeGreaterThanOrEqual(0);
  }
  // The view toggle stands clear of the first card.
  const gap = await page.evaluate(() => {
    const bar = document.querySelector('.pf-v6-c-toolbar.pf-m-sticky')!.getBoundingClientRect();
    const card = document.querySelector('.pf-v6-l-gallery .pf-v6-c-card')!.getBoundingClientRect();
    return card.top - bar.bottom;
  });
  expect(gap, 'bar to first card').toBeGreaterThanOrEqual(14);
});

test('the navigation stays together at the top of the sidebar, however tall the sidebar is (design system spec 4.5)', async ({ page }) => {
  await start(page, 'Marcus Bell', 390);
  await page.getByRole('button', { name: /navigation/i }).first().click();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: /^Agents/ })).toBeVisible();
  // Safari on iPhone lets the nav fill the sidebar; give it that height here, and the items must not spread apart.
  await nav.evaluate((n) => { n.style.minHeight = '1800px'; });
  const items = await nav.locator('.pf-v6-c-nav__item').evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect()).map((r) => ({ top: r.top, height: r.height })));
  for (const item of items) expect(item.height).toBeLessThan(48);
  const within = items.slice(1, 5);
  for (let i = 1; i < within.length; i++) expect(Math.round(within[i].top - within[i - 1].top - within[i - 1].height)).toBe(8);
});
