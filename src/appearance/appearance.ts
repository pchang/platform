import { appearanceConfig } from '../config/appearance';

/** What the person chose. */
export type AppearanceSetting = 'auto' | 'light' | 'dark';
/** What is shown. */
export type Mode = 'light' | 'dark';

const SETTINGS: AppearanceSetting[] = ['auto', 'light', 'dark'];
/** PatternFly's own dark theme class. */
export const DARK_CLASS = 'pf-v6-theme-dark';

function at(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function resolveMode(setting: AppearanceSetting, now: Date, config = appearanceConfig): Mode {
  if (setting !== 'auto') return setting;
  const hour = now.getHours();
  return hour >= config.dayStartHour && hour < config.dayEndHour ? 'light' : 'dark';
}

/** Milliseconds until Automatic next switches, at the start or end of the day hours. */
export function msUntilNextChange(now: Date, config = appearanceConfig): number {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const next = [at(now, config.dayStartHour), at(now, config.dayEndHour), at(tomorrow, config.dayStartHour)].find(
    (boundary) => boundary.getTime() > now.getTime(),
  )!;
  return next.getTime() - now.getTime();
}

/** Device storage can be missing or blocked; the setting then falls back to Automatic. */
export function loadSetting(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): AppearanceSetting {
  try {
    const value = storage?.getItem(appearanceConfig.storageKey);
    return SETTINGS.includes(value as AppearanceSetting) ? (value as AppearanceSetting) : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveSetting(setting: AppearanceSetting, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(appearanceConfig.storageKey, setting);
  } catch {
    // Not saved on this device; the choice still applies until the page closes.
  }
}

export function applyMode(mode: Mode, root: HTMLElement = document.documentElement): void {
  root.classList.toggle(DARK_CLASS, mode === 'dark');
  root.style.colorScheme = mode;
}

/** The day hours as local times, for the Automatic description, such as "7:00 AM". */
export function dayHours(locale?: string, config = appearanceConfig): { start: string; end: string } {
  const format = (hour: number) => at(new Date(2000, 0, 1), hour).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  return { start: format(config.dayStartHour), end: format(config.dayEndHour) };
}
