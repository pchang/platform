/**
 * Appearance configuration (design system spec, section 4.2).
 * Automatic is light from dayStartHour until dayEndHour, local time, and dark otherwise.
 */
export const appearanceConfig = {
  dayStartHour: 7,
  dayEndHour: 19,
  /** Device storage key, until the setting can live in the person's user context. */
  storageKey: 'lsh.appearance',
} as const;
