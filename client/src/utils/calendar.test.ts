/** Calendar grid math — pure helpers (week starts Monday, PRD A7). */
import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  isSameDay,
  monthMatrix,
  monthRangeUtc,
  startOfWeek,
  stepDate,
  weekRangeUtc,
} from './calendar';

describe('startOfWeek', () => {
  it('returns Monday for any day of the week', () => {
    // Sunday 2026-11-01 → Monday 2026-10-26
    expect(dayKey(startOfWeek(new Date(2026, 10, 1)))).toBe('2026-10-26');
    // Monday → itself
    expect(dayKey(startOfWeek(new Date(2026, 10, 2)))).toBe('2026-11-02');
    // Saturday 2026-10-31 → Monday 2026-10-26
    expect(dayKey(startOfWeek(new Date(2026, 9, 31)))).toBe('2026-10-26');
  });

  it('starts at local midnight', () => {
    const s = startOfWeek(new Date(2026, 10, 5, 14, 30));
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
  });
});

describe('monthMatrix', () => {
  it('produces 42 cells starting on the Monday on/before the 1st', () => {
    const cells = monthMatrix(new Date(2026, 10, 1)); // Nov 2026: 1st is Sunday
    expect(cells).toHaveLength(42);
    expect(dayKey(cells[0])).toBe('2026-10-26'); // Monday
    expect(cells[0].getDay()).toBe(1);
    // The 1st must be inside the grid
    expect(cells.some((d) => isSameDay(d, new Date(2026, 10, 1)))).toBe(true);
  });

  it('a Monday-start month begins on the 1st', () => {
    const cells = monthMatrix(new Date(2026, 5, 15)); // Jun 2026: 1st is a Monday
    expect(dayKey(cells[0])).toBe('2026-06-01');
  });
});

describe('ranges', () => {
  it('monthRangeUtc covers the full grid inclusive', () => {
    const { from, to } = monthRangeUtc(new Date(2026, 10, 15));
    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getTime()).toBe(new Date(2026, 9, 26).getTime()); // grid start Mon Oct 26, 00:00 local
    // to = end of the 42nd day (Dec 6) → Dec 6 23:59:59.999 local
    expect(toDate.getFullYear()).toBe(2026);
    expect(toDate.getMonth()).toBe(11);
    expect(toDate.getDate()).toBe(6);
    expect(toDate.getHours()).toBe(23);
  });

  it('weekRangeUtc spans Mon..Sun inclusive', () => {
    const { from, to } = weekRangeUtc(new Date(2026, 10, 5)); // Thu
    expect(dayKey(new Date(from))).toBe('2026-11-02');
    expect(dayKey(new Date(to))).toBe('2026-11-08'); // to = Sun 23:59:59.999 local
  });
});

describe('navigation', () => {
  it('month step lands on the 1st of prev/next month', () => {
    expect(stepDate(new Date(2026, 10, 17), 'month', -1).getMonth()).toBe(9);
    expect(stepDate(new Date(2026, 10, 17), 'month', 1).getMonth()).toBe(11);
    expect(stepDate(new Date(2026, 0, 5), 'month', -1).getFullYear()).toBe(2025);
    expect(stepDate(new Date(2026, 0, 5), 'month', -1).getMonth()).toBe(11);
  });

  it('week/day steps move by 7/1 days', () => {
    expect(dayKey(addDays(new Date(2026, 10, 4), 7))).toBe('2026-11-11');
    expect(dayKey(stepDate(new Date(2026, 10, 4), 'day', -1))).toBe('2026-11-03');
  });
});
