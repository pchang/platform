/**
 * The greeting at the top of To do (design system spec 4.3, The greeting): the time of day and the person's first name.
 * Domain-free, and chosen by the date, so it holds all day and changes from day to day.
 */

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'late night';

/** The part of the day on the person's own clock: morning from 5:00, afternoon from 12:00, evening from 17:00, late night from 22:00. */
export function dayPart(at: Date): DayPart {
  const hour = at.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late night';
}

const BY_PART: Record<DayPart, ((name: string) => string)[]> = {
  morning: [(n) => `Good morning, ${n}`, (n) => `Morning, ${n}`, (n) => `Rise and shine, ${n}`, (n) => `Coffee first, ${n}?`],
  afternoon: [(n) => `Good afternoon, ${n}`, (n) => `Afternoon, ${n}`, (n) => `Back at it, ${n}`],
  evening: [(n) => `Good evening, ${n}`, (n) => `Evening, ${n}`, (n) => `Winding down, ${n}?`],
  'late night': [(n) => `Burning the midnight oil, ${n}?`, (n) => `Up late, ${n}?`, (n) => `Night owl mode, ${n}?`],
};

/** Greetings that fit a day of the week, offered alongside the part of the day's own. */
function byDay(at: Date, part: DayPart): ((name: string) => string)[] {
  const day = at.getDay();
  if ((day === 0 || day === 6) && part !== 'late night') return [(n) => `Weekend shift, ${n}?`];
  if (day === 1 && part === 'morning') return [(n) => `Happy Monday, ${n}`];
  if (day === 5 && part === 'afternoon') return [(n) => `Happy Friday, ${n}`];
  return [];
}

/** The day's number in its year, so the same date always picks the same greeting. */
const dayOfYear = (at: Date) => Math.floor((Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) - Date.UTC(at.getFullYear(), 0, 0)) / 86_400_000);

/** The person's first name: the first word of the name they go by. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The greeting for a person at a moment: one of the part of the day's greetings and the day's own, chosen by the date. */
export function greeting(name: string, at: Date): string {
  const part = dayPart(at);
  const choices = [...BY_PART[part], ...byDay(at, part)];
  return choices[dayOfYear(at) % choices.length](firstName(name));
}
