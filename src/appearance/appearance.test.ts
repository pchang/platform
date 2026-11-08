import { describe, expect, it } from 'vitest';
import { applyMode, DARK_CLASS, loadSetting, msUntilNextChange, resolveMode, saveSetting } from './appearance';

const time = (h: number, m = 0, s = 0) => new Date(2026, 10, 8, h, m, s);

describe('resolveMode', () => {
  it.each([
    [time(6, 59, 59), 'dark'],
    [time(7), 'light'],
    [time(12), 'light'],
    [time(18, 59, 59), 'light'],
    [time(19), 'dark'],
    [time(0), 'dark'],
  ])('Automatic at %s is %s', (now, mode) => {
    expect(resolveMode('auto', now)).toBe(mode);
  });

  it('honors a forced setting at any time', () => {
    expect(resolveMode('light', time(23))).toBe('light');
    expect(resolveMode('dark', time(12))).toBe('dark');
  });
});

describe('msUntilNextChange', () => {
  it('counts to the end of the day hours during the day', () => {
    expect(msUntilNextChange(time(18, 59))).toBe(60_000);
  });

  it('counts to the start of the day hours before dawn', () => {
    expect(msUntilNextChange(time(6))).toBe(60 * 60_000);
  });

  it('counts to tomorrow morning in the evening', () => {
    expect(msUntilNextChange(time(23))).toBe(8 * 60 * 60_000);
  });
});

describe('device storage', () => {
  it('reads back a saved setting', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveSetting('dark', storage);
    expect(loadSetting(storage)).toBe('dark');
  });

  it('falls back to Automatic when storage is blocked or holds something else', () => {
    expect(loadSetting({ getItem: () => { throw new Error('blocked'); } })).toBe('auto');
    expect(loadSetting({ getItem: () => 'sepia' })).toBe('auto');
    expect(() => saveSetting('dark', { setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
});

it('applies PatternFly dark mode to the page root', () => {
  const root = document.createElement('html');
  applyMode('dark', root);
  expect(root).toHaveClass(DARK_CLASS);
  expect(root.style.colorScheme).toBe('dark');
  applyMode('light', root);
  expect(root).not.toHaveClass(DARK_CLASS);
});
