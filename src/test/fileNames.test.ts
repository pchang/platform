import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * macOS and Windows file systems ignore letter case, so `orientViews.ts` and `OrientViews.tsx` are one file to them, and
 * an import that leaves out the extension can load the wrong module. Every module must differ from the others in more
 * than case once its script extension is dropped.
 */
describe('Source file names', () => {
  it('never differ only in letter case', () => {
    const root = join(__dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(m?[jt]sx?)$/.test(entry.name)) files.push(relative(root, path));
      }
    };
    for (const dir of ['src', 'e2e']) walk(join(root, dir));

    const byKey = new Map<string, string[]>();
    for (const file of files) {
      const key = file.replace(/\.(m?[jt]sx?)$/, '').toLowerCase();
      byKey.set(key, [...(byKey.get(key) ?? []), file]);
    }
    const clashes = [...byKey.values()].filter((group) => group.length > 1);
    expect(clashes).toEqual([]);
  });
});
