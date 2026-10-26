/**
 * Tasks repo (AGENTS.md §6). All SQL parameterized; EVERY statement is scoped
 * by user_id (ownership enforced here, not only in routes). Returns mapped
 * camelCase Task objects.
 */
import type { DueBucket, Task, TaskPriority, TaskSort, TaskStatus, TaskType } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import type { DueBucketBoundaries } from '../../util/time.js';

export const SELECT_COLUMNS = `id, user_id, title, description, subject, type, priority, status,
  due_at, completed_at, created_at, updated_at`;

export interface TaskRow {
  id: number;
  user_id: number;
  title: string;
  description: string;
  subject: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    type: row.type,
    priority: row.priority,
    status: row.status,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function insertTask(
  db: Db,
  userId: number,
  t: {
    title: string;
    description: string;
    subject: string;
    type: TaskType;
    priority: TaskPriority;
    status: TaskStatus;
    dueAt: string | null;
    completedAt: string | null;
    now: string;
  },
): Task {
  const info = db
    .prepare(
      `INSERT INTO tasks (user_id, title, description, subject, type, priority, status, due_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      t.title,
      t.description,
      t.subject,
      t.type,
      t.priority,
      t.status,
      t.dueAt,
      t.completedAt,
      t.now,
      t.now,
    );
  return findTask(db, userId, Number(info.lastInsertRowid))!;
}

export function findTask(db: Db, userId: number, id: number): Task | undefined {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`)
    .get(id, userId) as TaskRow | undefined;
  return row ? toTask(row) : undefined;
}

export interface TaskUpdateFields {
  title?: string;
  description?: string;
  subject?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: string | null;
}

export function updateTask(
  db: Db,
  userId: number,
  id: number,
  fields: TaskUpdateFields & { completedAt: string | null; now: string },
): void {
  const sets: string[] = ['updated_at = ?', 'completed_at = ?'];
  const params: (string | number | null)[] = [fields.now, fields.completedAt];
  for (const key of ['title', 'description', 'subject', 'type', 'priority', 'status'] as const) {
    const value = fields[key];
    if (value !== undefined) {
      sets.push(`${key} = ?`); // fixed allowlist — never user-controlled identifiers
      params.push(value);
    }
  }
  // Presence-by-VALUE, not by key: the service only sets dueAt when the client
  // sent it (null = clear; undefined = leave unchanged). A `in` check would be
  // wrong because the property always exists on the constructed object.
  if (fields.dueAt !== undefined) {
    sets.push('due_at = ?');
    params.push(fields.dueAt);
  }
  params.push(userId, id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`).run(...params);
}

export function deleteTask(db: Db, userId: number, id: number): void {
  db.prepare('DELETE FROM tasks WHERE user_id = ? AND id = ?').run(userId, id);
}

// ---------- listing with sort + due buckets (filters land in Phase 7) ----------

const PRIORITY_CASE = `CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

function orderBy(sort: TaskSort, nowIso: string): { sql: string; params: string[] } {
  switch (sort) {
    case 'due_asc':
      return { sql: 'ORDER BY (due_at IS NULL), due_at ASC, id DESC', params: [] };
    case 'due_desc':
      return { sql: 'ORDER BY due_at DESC, id DESC', params: [] };
    case 'priority_desc':
      return {
        sql: `ORDER BY ${PRIORITY_CASE} DESC, (due_at IS NULL), due_at ASC, id DESC`,
        params: [],
      };
    case 'created_desc':
      return { sql: 'ORDER BY created_at DESC, id DESC', params: [] };
    case 'title_asc':
      return { sql: 'ORDER BY title COLLATE NOCASE ASC, id DESC', params: [] };
    case 'smart':
    default:
      // PRD F3: overdue first, then nearest deadline, then priority, then newest.
      return {
        sql: `ORDER BY
          (due_at IS NOT NULL AND status != 'completed' AND due_at < ?) DESC,
          (due_at IS NULL),
          due_at ASC,
          ${PRIORITY_CASE} DESC,
          created_at DESC,
          id DESC`,
        params: [nowIso],
      };
  }
}

/**
 * WHERE fragments for the due-bucket quick filters (API.md). Buckets are
 * status-agnostic EXCEPT `overdue`, which by definition excludes completed
 * work (PRD F4). `week` spans [today, today+7d) and therefore includes today;
 * chips are filters, not a partition. todayStart/tomorrowStart/weekEnd come
 * from dueBucketBoundaries() — UTC-day based, or user-local when the client
 * sends tzOffset.
 */
export function dueFilterSql(
  due: DueBucket | undefined,
  b: DueBucketBoundaries,
  dueFrom?: string,
  dueTo?: string,
): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  switch (due) {
    case 'overdue':
      parts.push("due_at IS NOT NULL AND due_at < ? AND status != 'completed'");
      params.push(b.nowIso);
      break;
    case 'today':
      parts.push('due_at IS NOT NULL AND due_at >= ? AND due_at < ?');
      params.push(b.todayStart, b.tomorrowStart);
      break;
    case 'week':
      parts.push('due_at IS NOT NULL AND due_at >= ? AND due_at < ?');
      params.push(b.todayStart, b.weekEnd);
      break;
    case 'later':
      parts.push('due_at IS NOT NULL AND due_at >= ?');
      params.push(b.weekEnd);
      break;
    case 'none':
      parts.push('due_at IS NULL');
      break;
    default:
      break;
  }
  if (dueFrom) {
    parts.push('due_at >= ?');
    params.push(dueFrom);
  }
  if (dueTo) {
    parts.push('due_at <= ?');
    params.push(dueTo);
  }
  return { sql: parts.join(' AND '), params };
}

/** Full filter set for GET /api/tasks (F9). Multi-values are ORs within a field, AND across fields. */
export interface TaskFilters {
  q?: string;
  subject?: string[];
  priority?: string[];
  status?: string[];
  type?: string[];
  due?: DueBucket;
  dueFrom?: string;
  dueTo?: string;
}

/** SQLite LIKE escapes; user text must match literally (ASCII case-insensitive via LIKE). */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function buildWhere(
  userId: number,
  filters: TaskFilters,
  boundaries: DueBucketBoundaries,
): { sql: string; params: (string | number)[] } {
  const parts: string[] = ['user_id = ?'];
  const params: (string | number)[] = [userId];

  if (filters.q) {
    parts.push(
      "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\')",
    );
    const p = `%${likeEscape(filters.q)}%`;
    params.push(p, p, p);
  }
  for (const [col, values] of [
    ['subject', filters.subject],
    ['priority', filters.priority],
    ['status', filters.status],
    ['type', filters.type],
  ] as const) {
    if (values && values.length > 0) {
      parts.push(`${col} IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    }
  }
  const due = dueFilterSql(filters.due, boundaries, filters.dueFrom, filters.dueTo);
  if (due.sql) {
    parts.push(due.sql); // internal AND-chain of plain predicates — safe to join at top level
    params.push(...due.params);
  }
  return { sql: `WHERE ${parts.join(' AND ')}`, params };
}

export function listTasks(
  db: Db,
  userId: number,
  opts: {
    sort: TaskSort;
    page: number;
    limit: number;
    boundaries: DueBucketBoundaries;
    filters: TaskFilters;
  },
): { items: Task[]; total: number } {
  const { sql: orderSql, params: orderParams } = orderBy(opts.sort, opts.boundaries.nowIso);
  const where = buildWhere(userId, opts.filters, opts.boundaries);
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM tasks ${where.sql}`).get(...where.params) as {
      n: number;
    }
  ).n;
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM tasks ${where.sql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
    )
    .all(...where.params, ...orderParams, opts.limit, (opts.page - 1) * opts.limit) as TaskRow[];
  return { items: rows.map(toTask), total };
}

/** Tasks with a due date inside [from, to] (inclusive), for calendar ranges. */
export function tasksInRange(db: Db, userId: number, fromIso: string, toIso: string): Task[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM tasks
       WHERE user_id = ? AND due_at IS NOT NULL AND due_at >= ? AND due_at <= ?
       ORDER BY due_at ASC, id ASC`,
    )
    .all(userId, fromIso, toIso) as TaskRow[];
  return rows.map(toTask);
}

export function distinctSubjects(db: Db, userId: number): string[] {
  const rows = db
    .prepare(
      'SELECT DISTINCT subject FROM tasks WHERE user_id = ? ORDER BY subject COLLATE NOCASE ASC',
    )
    .all(userId) as { subject: string }[];
  return rows.map((r) => r.subject);
}
