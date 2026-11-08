import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Design system spec, section 5.4: tested at 320px, md and xl, with an accessibility scan.
const require = createRequire(import.meta.url);
const componentsFile = JSON.parse(readFileSync(new URL('../design-system/components.json', import.meta.url), 'utf8')) as { components: { id: string }[] };
const axePath = require.resolve('axe-core/axe.min.js');

const widths = [
  { label: '320px', width: 320 },
  { label: 'md', width: 768 },
  { label: 'xl', width: 1200 },
];

for (const { label, width } of widths) {
  test.describe(`catalog preview at ${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/#/catalog');
      await expect(page.getByRole('heading', { level: 1, name: 'Design system catalog' })).toBeVisible();
    });

    test('shows every component', async ({ page }) => {
      for (const { id } of componentsFile.components) {
        await expect(page.getByRole('heading', { level: 3, name: id, exact: true })).toBeVisible();
      }
    });

    test('never scrolls sideways', async ({ page }) => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });

    test('has no accessibility violations', async ({ page }) => {
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  });
}

test('tooltip opens on keyboard focus', async ({ page }) => {
  await page.goto('/#/catalog');
  await page.getByRole('button', { name: 'Deadline' }).focus();
  await expect(page.getByRole('tooltip')).toHaveText('Expedited report due in 3 days');
});

test('the logo returns home from the catalog', async ({ page }) => {
  await page.goto('/#/catalog');
  await page.getByRole('link', { name: 'LS&H' }).click();
  await expect(page.getByRole('heading', { name: 'Design system catalog' })).toHaveCount(0);
});
