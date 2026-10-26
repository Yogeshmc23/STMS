/**
 * Progress analytics (F8). All numbers are SQL aggregates over the caller's
 * rows — zero-filled trend buckets so charts never lie about gaps; period
 * comparison = last N days vs the N days before that (API.md).
 */
import type { AnalyticsOverview, TaskPriority, TaskType } from '@stms/shared';
import { PRIORITY_RANK, TASK_PRIORITIES, TASK_TYPES } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { DAY_MS, dueBucketBoundaries, toIso } from '../../util/time.js';

/** UTC day part (YYYY-MM-DD) of an ISO timestamp. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

export function overview(db: Db, userId: number, days: number): AnalyticsOverview {
  const b = dueBucketBoundaries(Date.now(), 0);

  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS created,
        SUM(status = 'completed') AS completed,
        SUM(status != 'completed') AS open,
        SUM(due_at IS NOT NULL AND due_at < ? AND status != 'completed') AS overdue
       FROM tasks WHERE user_id = ?`,
    )
    .get(b.nowIso, userId) as {
    created: number;
    completed: number;
    open: number;
    overdue: number;
  };

  const nowMs = Date.parse(b.nowIso);
  const periodStart = toIso(nowMs - days * DAY_MS);
  const prevStart = toIso(nowMs - 2 * days * DAY_MS);

  const periods = db
    .prepare(
      `SELECT
        SUM(completed_at >= ?) AS last_n,
        SUM(completed_at >= ? AND completed_at < ?) AS prev_n
       FROM tasks WHERE user_id = ? AND status = 'completed' AND completed_at >= ?`,
    )
    .get(periodStart, prevStart, periodStart, userId, prevStart) as {
    last_n: number | null;
    prev_n: number | null;
  };

  // ---- trend: exactly `days` day-aligned UTC buckets ending today ----
  const todayMs = Date.parse(dayOf(b.nowIso) + 'T00:00:00.000Z');
  const startMs = todayMs - (days - 1) * DAY_MS;
  const dayAlignedStart = new Date(startMs).toISOString();

  const trendRows = db
    .prepare(
      `SELECT
        substr(completed_at, 1, 10) AS cday,
        COUNT(*) AS n
       FROM tasks
       WHERE user_id = ? AND status = 'completed' AND completed_at >= ?
       GROUP BY cday`,
    )
    .all(userId, dayAlignedStart) as { cday: string; n: number }[];
  const createdRows = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS cday, COUNT(*) AS n
       FROM tasks WHERE user_id = ? AND created_at >= ?
       GROUP BY cday`,
    )
    .all(userId, dayAlignedStart) as { cday: string; n: number }[];

  const byDay = new Map<string, { completed: number; created: number }>();
  for (let i = 0; i < days; i++) {
    const key = new Date(startMs + i * DAY_MS).toISOString().slice(0, 10);
    byDay.set(key, { completed: 0, created: 0 });
  }
  for (const r of trendRows) {
    const slot = byDay.get(r.cday);
    if (slot) slot.completed = r.n;
  }
  for (const r of createdRows) {
    const slot = byDay.get(r.cday);
    if (slot) slot.created = r.n;
  }

  const byPriorityRows = db
    .prepare(
      `SELECT priority,
        SUM(status != 'completed') AS open,
        SUM(status = 'completed') AS completed
       FROM tasks WHERE user_id = ? GROUP BY priority`,
    )
    .all(userId) as { priority: TaskPriority; open: number; completed: number }[];
  // Fixed order high → medium → low; every level present even when count is 0.
  const byPriority = TASK_PRIORITIES.map((p) => {
    const row = byPriorityRows.find((r) => r.priority === p);
    return { priority: p, open: row?.open ?? 0, completed: row?.completed ?? 0 };
  }).sort((a, x) => PRIORITY_RANK[x.priority] - PRIORITY_RANK[a.priority]);

  const bySubject = db
    .prepare(
      `SELECT subject,
        SUM(status != 'completed') AS open,
        SUM(status = 'completed') AS completed
       FROM tasks WHERE user_id = ?
       GROUP BY subject ORDER BY COUNT(*) DESC, subject COLLATE NOCASE ASC`,
    )
    .all(userId) as { subject: string; open: number; completed: number }[];

  const byTypeRows = db
    .prepare(
      `SELECT type,
        SUM(status != 'completed') AS open,
        SUM(status = 'completed') AS completed
       FROM tasks WHERE user_id = ? GROUP BY type`,
    )
    .all(userId) as { type: TaskType; open: number; completed: number }[];
  const byType = TASK_TYPES.map((t) => {
    const row = byTypeRows.find((r) => r.type === t);
    return { type: t, open: row?.open ?? 0, completed: row?.completed ?? 0 };
  }).filter((r) => r.open > 0 || r.completed > 0);

  const total = totals.created ?? 0;
  const completed = totals.completed ?? 0;

  return {
    totals: {
      created: total,
      completed,
      open: totals.open ?? 0,
      overdue: totals.overdue ?? 0,
    },
    completionRate: total === 0 ? null : Math.round((completed / total) * 1000) / 1000,
    completedLastPeriod: periods.last_n ?? 0,
    completedPreviousPeriod: periods.prev_n ?? 0,
    trend: [...byDay.entries()]
      .sort(([a], [x]) => (a < x ? -1 : 1))
      .map(([date, v]) => ({ date, completed: v.completed, created: v.created })),
    byPriority: byPriority.map(({ priority, open, completed: c }) => ({
      priority,
      open: open ?? 0,
      completed: c ?? 0,
    })),
    bySubject: bySubject.map((r) => ({
      subject: r.subject,
      open: r.open ?? 0,
      completed: r.completed ?? 0,
    })),
    byType,
  };
}
