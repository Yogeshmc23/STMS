/**
 * Calendar grid math (F6). Weeks start Monday (PRD assumption A7). All day
 * boundaries computed in the BROWSER timezone, then converted to UTC ISO for
 * the range API — storage stays UTC everywhere.
 */

const DAY_MS = 86_400_000;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday-based start of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const mondayIndex = (s.getDay() + 6) % 7; // Sun=6, Mon=0 …
  return addDays(s, -mondayIndex);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Local YYYY-MM-DD key used to bucket tasks by due day. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthMatrix(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export interface UtcRange {
  from: string;
  to: string;
}

export function dayRangeUtc(day: Date): UtcRange {
  const s = startOfDay(day);
  return { from: s.toISOString(), to: new Date(s.getTime() + DAY_MS - 1).toISOString() };
}

export function weekRangeUtc(anchor: Date): UtcRange {
  const s = startOfWeek(anchor);
  return { from: s.toISOString(), to: new Date(s.getTime() + 7 * DAY_MS - 1).toISOString() };
}

/** Covers the whole 6×7 grid, adjacent-month days included (they render too). */
export function monthRangeUtc(anchor: Date): UtcRange {
  const cells = monthMatrix(anchor);
  const first = cells[0];
  const last = cells[cells.length - 1];
  return {
    from: startOfDay(first).toISOString(),
    to: new Date(startOfDay(last).getTime() + DAY_MS - 1).toISOString(),
  };
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayLongFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function monthTitle(anchor: Date): string {
  return monthFmt.format(anchor);
}

export function weekTitle(anchor: Date): string {
  const s = startOfWeek(anchor);
  return `${shortDayFmt.format(s)} – ${shortDayFmt.format(addDays(s, 6))}, ${s.getFullYear()}`;
}

export function dayTitle(anchor: Date): string {
  return weekdayLongFmt.format(anchor);
}

export function stepDate(anchor: Date, view: 'month' | 'week' | 'day', dir: 1 | -1): Date {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  if (view === 'week') return addDays(anchor, 7 * dir);
  return addDays(anchor, dir);
}
