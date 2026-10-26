/**
 * Client-side time rendering (browser timezone; storage is UTC).
 * Pure helpers — unit-tested.
 */

const DAY_MS = 86_400_000;

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole-day difference from "today" in the browser timezone. */
export function dayDelta(iso: string, now: Date = new Date()): number {
  const due = new Date(iso);
  return Math.round((dayStart(due) - dayStart(now)) / DAY_MS);
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'none';

export interface DueView {
  label: string;
  tone: DueTone;
  /** e.g. "2d overdue" / "Today 17:00" — short enough for badges. */
  short: string;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDue(iso: string | null, now: Date = new Date()): DueView {
  if (!iso) return { label: 'No due date', tone: 'none', short: 'No due date' };
  const due = new Date(iso);
  const dd = dayDelta(iso, now);
  const time = timeFmt.format(due);
  if (dd < 0) {
    const n = Math.abs(dd);
    const rel = n === 0 ? 'hours' : `${n}d`;
    return {
      label: `Overdue by ${n === 0 ? 'less than a day' : `${n} day${n === 1 ? '' : 's'}`}`,
      tone: 'overdue',
      short: `${rel} overdue`,
    };
  }
  if (dd === 0) {
    const late = due.getTime() < now.getTime();
    return {
      label: late ? `Due today at ${time} — finish it now` : `Due today at ${time}`,
      tone: 'today',
      short: late ? `Today ${time} · past due` : `Today ${time}`,
    };
  }
  if (dd === 1)
    return { label: `Due tomorrow at ${time}`, tone: 'soon', short: `Tomorrow ${time}` };
  if (dd <= 6) return { label: `Due in ${dd} days`, tone: 'soon', short: `${dd} days` };
  return { label: fullFmt.format(due), tone: 'normal', short: weekdayFmt.format(due) };
}

export function formatDateTime(iso: string): string {
  return fullFmt.format(new Date(iso));
}

/**
 * Convert a stored UTC ISO string to the value shape of <input type="datetime-local">
 * (browser-local wall clock), rounded to the minute.
 */
export function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inverse of toInputValue: local wall-clock string → UTC ISO (null when empty). */
export function fromInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value); // datetime-local parses as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
