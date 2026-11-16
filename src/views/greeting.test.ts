import { describe, expect, it } from 'vitest';
import { validateView } from '../design-system/validateView';
import { dayPart, firstName, greeting } from './greeting';
import { buildTodoView } from './orientView';

// The greeting at the top of To do (design system spec 4.3, The greeting).
const at = (iso: string) => new Date(iso);

describe('the greeting', () => {
  it('reads the part of the day from the person’s own clock', () => {
    expect(['04:59', '05:00', '11:59', '12:00', '16:59', '17:00', '21:59', '22:00'].map((t) => dayPart(at(`2026-11-17T${t}:00`)))).toEqual([
      'late night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'late night',
    ]);
  });

  it('addresses the person by first name, fitting the part of the day', () => {
    expect(firstName('Chloé Martin')).toBe('Chloé');
    const tuesday = (time: string) => greeting('Chloé Martin', at(`2026-11-17T${time}:00`));
    expect(tuesday('08:00')).toMatch(/^(Good morning|Morning|Rise and shine|Coffee first), Chloé\??$/);
    expect(tuesday('14:00')).toMatch(/^(Good afternoon|Afternoon|Back at it), Chloé$/);
    expect(tuesday('19:00')).toMatch(/^(Good evening|Evening|Winding down), Chloé\??$/);
    expect(tuesday('23:30')).toMatch(/^(Burning the midnight oil|Up late|Night owl mode), Chloé\?$/);
  });

  it('holds all through a part of the day, and varies from one day to the next', () => {
    expect(greeting('Ben Okafor', at('2026-11-17T06:00:00'))).toBe(greeting('Ben Okafor', at('2026-11-17T11:30:00')));
    const mornings = new Set(Array.from({ length: 14 }, (_, d) => greeting('Ben Okafor', new Date(2026, 10, 2 + d, 9))));
    expect(mornings.size).toBeGreaterThan(2);
  });

  it('offers greetings that fit the day of the week', () => {
    const all = (day: number, hour: number) => new Set(Array.from({ length: 70 }, (_, w) => greeting('Ada Lin', new Date(2026, 0, day + w * 7, hour))));
    expect(all(5, 9)).toContain('Happy Monday, Ada'); // 5 January 2026 is a Monday
    expect(all(9, 15)).toContain('Happy Friday, Ada');
    expect(all(10, 11)).toContain('Weekend shift, Ada?');
    expect(all(6, 9)).not.toContain('Happy Monday, Ada');
  });

  it('is the main heading of To do, with what is waiting for the person in their role', () => {
    const view = buildTodoView([], { name: 'Ben Okafor', role: 'Clinical Data Manager' }, undefined, [], { today: at('2026-11-17T19:00:00') });
    expect(validateView(view).errors).toEqual([]);
    const json = JSON.stringify(view);
    expect(json).toContain(`{"component":"Title","props":{"label":"${greeting('Ben Okafor', at('2026-11-17T19:00:00'))}","headingLevel":"h1"}}`);
    expect(json).toContain('Nothing needs you as Clinical Data Manager right now.');
    expect(json).not.toContain('"label":"To do","headingLevel":"h1"');
  });
});
