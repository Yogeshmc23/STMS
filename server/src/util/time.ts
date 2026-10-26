/** Time helpers — all storage/computation in UTC ISO-8601 (DATABASE.md preamble). */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: Date | number): string {
  return new Date(value).toISOString();
}

export function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

/** Start of the UTC day containing `iso`, as ISO string. */
export function startOfUtcDay(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * Human-ish duration label for notification bodies ("in 3 hours", "2 days overdue").
 * Deliberately simple: notifications store text; clients re-render relative times themselves.
 */
export function relativeLabel(fromIso: string, toIso: string): string {
  const diffMs = Date.parse(toIso) - Date.parse(fromIso);
  const abs = Math.abs(diffMs);
  const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let label: string;
  if (abs < HOUR_MS) label = unit(Math.max(1, Math.round(abs / MINUTE_MS)), 'minute', 'minutes');
  else if (abs < DAY_MS) label = unit(Math.round(abs / HOUR_MS), 'hour', 'hours');
  else label = unit(Math.round(abs / DAY_MS), 'day', 'days');
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}

/**
 * Start of the user-LOCAL day containing `utcMs`, returned as a UTC ISO string.
 * `tzOffsetMin` = minutes east of UTC (client sends -Date.getTimezoneOffset()).
 * `dayShift` offsets by whole local days (1 → tomorrow, 7 → start of next week+).
 * This makes "due today/this week" correct for any student timezone while all
 * storage stays UTC (PRD assumption §9.2).
 */
export function localDayStartIso(utcMs: number, tzOffsetMin: number, dayShift = 0): string {
  const local = new Date(utcMs + tzOffsetMin * MINUTE_MS);
  const fakeUtcDayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(fakeUtcDayStart - tzOffsetMin * MINUTE_MS + dayShift * DAY_MS).toISOString();
}

export interface DueBucketBoundaries {
  nowIso: string;
  todayStart: string;
  tomorrowStart: string;
  weekEnd: string; // start of today + 7 days
}

export function dueBucketBoundaries(nowMs: number, tzOffsetMin: number): DueBucketBoundaries {
  return {
    nowIso: new Date(nowMs).toISOString(),
    todayStart: localDayStartIso(nowMs, tzOffsetMin, 0),
    tomorrowStart: localDayStartIso(nowMs, tzOffsetMin, 1),
    weekEnd: localDayStartIso(nowMs, tzOffsetMin, 7),
  };
}
