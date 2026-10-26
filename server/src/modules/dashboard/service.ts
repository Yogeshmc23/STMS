/**
 * Dashboard aggregates (F5) — all numbers computed server-side over the caller's
 * rows with indexed queries (no client-side guessing). Zero-data safe:
 * completionRate is null when the user has no tasks (PRD F8 rule).
 */
import type { ActivityItem, DashboardSummary, SubjectWorkload, Task } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { dueBucketBoundaries } from '../../util/time.js';
import { SELECT_COLUMNS, toTask, type TaskRow } from '../tasks/repo.js';

interface CountRow {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
  unscheduled: number;
}

export function summary(db: Db, userId: number, tzOffsetMin: number): DashboardSummary {
  const b = dueBucketBoundaries(Date.now(), tzOffsetMin);

  const c = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(status = 'pending') AS pending,
        SUM(status = 'in_progress') AS in_progress,
        SUM(status = 'completed') AS completed,
        SUM(due_at IS NOT NULL AND due_at < ? AND status != 'completed') AS overdue,
        SUM(due_at IS NOT NULL AND due_at >= ? AND due_at < ?) AS due_today,
        SUM(due_at IS NOT NULL AND due_at >= ? AND due_at < ?) AS due_this_week,
        SUM(due_at IS NULL) AS unscheduled
       FROM tasks WHERE user_id = ?`,
    )
    .get(b.nowIso, b.todayStart, b.tomorrowStart, b.todayStart, b.weekEnd, userId) as CountRow;

  const completed = c.completed ?? 0;
  const total = c.total ?? 0;

  const upNext = (
    db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM tasks
         WHERE user_id = ? AND status != 'completed' AND due_at IS NOT NULL
         ORDER BY (due_at < ?) DESC, due_at ASC, id DESC
         LIMIT 5`,
      )
      .all(userId, b.nowIso) as TaskRow[]
  ).map(toTask) as Task[];

  const workloadBySubject = db
    .prepare(
      `SELECT subject,
        SUM(status != 'completed') AS open,
        COUNT(*) AS total
       FROM tasks WHERE user_id = ?
       GROUP BY subject
       HAVING open > 0
       ORDER BY open DESC, total DESC, subject COLLATE NOCASE ASC`,
    )
    .all(userId) as SubjectWorkload[];

  const completedRows = db
    .prepare(
      `SELECT id, title, completed_at AS at FROM tasks
       WHERE user_id = ? AND status = 'completed' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC LIMIT 5`,
    )
    .all(userId) as { id: number; title: string; at: string }[];
  const createdRows = db
    .prepare(
      `SELECT id, title, created_at AS at FROM tasks
       WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5`,
    )
    .all(userId) as { id: number; title: string; at: string }[];

  const recentActivity: ActivityItem[] = [
    ...completedRows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: 'completed' as const,
      at: r.at,
    })),
    ...createdRows.map((r) => ({ id: r.id, title: r.title, kind: 'created' as const, at: r.at })),
  ]
    .sort((a, x) => (a.at === x.at ? x.id - a.id : a.at < x.at ? 1 : -1))
    // dedupe by task id (a just-created task can appear in both feeds)
    .filter((item, i, arr) => arr.findIndex((o) => o.id === item.id) === i)
    .slice(0, 8);

  return {
    counts: {
      total,
      pending: c.pending ?? 0,
      inProgress: c.in_progress ?? 0,
      completed,
      overdue: c.overdue ?? 0,
      dueToday: c.due_today ?? 0,
      dueThisWeek: c.due_this_week ?? 0,
      unscheduled: c.unscheduled ?? 0,
    },
    completionRate: total === 0 ? null : Math.round((completed / total) * 1000) / 1000,
    upNext,
    workloadBySubject,
    recentActivity,
  };
}
