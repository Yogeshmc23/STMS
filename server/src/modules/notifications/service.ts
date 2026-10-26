/**
 * Reminder scan + notification list/read operations (ARCHITECTURE.md §6).
 *
 * The scan is a PURE function of (db, now) so tests drive it deterministically;
 * the scheduler tick (services/scheduler.ts) calls it once a minute in prod.
 * Dedup is enforced by the DB unique index (user_id, kind, task_id) via
 * INSERT OR IGNORE — a restart or an extra tick can never duplicate a reminder.
 */
import type { Notification } from '@stms/shared';
import { REMINDER } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { httpError } from '../../util/httpError.js';
import { HOUR_MS, relativeLabel, toIso } from '../../util/time.js';

export interface NotificationRow {
  id: number;
  user_id: number;
  task_id: number | null;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind as Notification['kind'],
    title: row.title,
    body: row.body,
    taskId: row.task_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

interface ScanCandidate {
  task_id: number;
  user_id: number;
  title: string;
  due_at: string;
  email_reminders_enabled: number;
  email: string;
}

/**
 * Create reminders for OPEN tasks (completed never notified):
 *  - deadline_soon_24h : due within (now+1h, now+24h]
 *  - deadline_soon_1h  : due within (now,     now+1h ]
 *  - overdue           : due <= now (30-day lookback floor bounds inserts)
 * Windows are mutually exclusive so one tick never double-pings the same task;
 * across ticks a task may legitimately get both 24h and 1h reminders.
 * Returns the number of NEW notifications (0 on every no-op tick).
 */
export function runReminderScan(db: Db, nowMs: number = Date.now()): number {
  const nowIso = toIso(nowMs);
  const plus1h = toIso(nowMs + HOUR_MS);
  const plus24h = toIso(nowMs + REMINDER.soonHours * HOUR_MS);
  const floor = toIso(nowMs - 30 * 24 * HOUR_MS);

  const windows = [
    {
      kind: 'deadline_soon_24h',
      lo: plus1h,
      hi: plus24h,
      title: (t: string) => `📅 Due within 24 hours: ${t}`,
    },
    {
      kind: 'deadline_soon_1h',
      lo: nowIso,
      hi: plus1h,
      title: (t: string) => `⏰ Due within the hour: ${t}`,
    },
    {
      kind: 'overdue',
      lo: floor,
      hi: nowIso,
      inclusiveLo: true,
      title: (t: string) => `🔴 Overdue: ${t}`,
    },
  ] as const;

  const insertNotification = db.prepare(
    `INSERT OR IGNORE INTO notifications (user_id, task_id, kind, title, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertEmail = db.prepare(
    `INSERT INTO email_queue (notification_id, user_id, to_email, subject, body_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const selectCandidates = (inclusiveLo: boolean) =>
    db.prepare(
      `SELECT t.id AS task_id, t.user_id, t.title, t.due_at,
              u.email_reminders_enabled, u.email
       FROM tasks t
       JOIN users u ON u.id = t.user_id
       WHERE t.status != 'completed' AND t.due_at IS NOT NULL
         AND t.due_at ${inclusiveLo ? '>=' : '>'} ? AND t.due_at <= ?`,
    );

  const scan = db.transaction((): number => {
    let created = 0;
    for (const w of windows) {
      const rows = selectCandidates('inclusiveLo' in w ? w.inclusiveLo : false).all(
        w.lo,
        w.hi,
      ) as ScanCandidate[];
      for (const r of rows) {
        const rel = relativeLabel(nowIso, r.due_at);
        const body =
          w.kind === 'overdue'
            ? `“${r.title}” was due ${rel}. Reschedule it or knock it out now.`
            : `“${r.title}” is due ${rel}. Plan a block of time for it.`;
        const info = insertNotification.run(
          r.user_id,
          r.task_id,
          w.kind,
          w.title(r.title),
          body,
          nowIso,
        );
        if (info.changes === 0) continue; // unique index → exactly-once per (task, kind)
        created += info.changes;
        if (r.email_reminders_enabled === 1) {
          insertEmail.run(
            Number(info.lastInsertRowid),
            r.user_id,
            r.email,
            w.title(r.title),
            `${body}\n\n— Student Task Manager`,
            nowIso,
          );
        }
      }
    }
    return created;
  });
  return scan();
}

// ---------- reads / writes ----------

const SELECT_COLS = `id, user_id, task_id, kind, title, body, read_at, created_at`;

export function list(
  db: Db,
  userId: number,
  opts: { unreadOnly?: boolean; page: number; limit: number },
): { items: Notification[]; total: number } {
  const where = `WHERE user_id = ? ${opts.unreadOnly ? 'AND read_at IS NULL' : ''}`;
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM notifications ${where}`).get(userId) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLS} FROM notifications ${where}
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, opts.limit, (opts.page - 1) * opts.limit) as NotificationRow[];
  return { items: rows.map(toNotification), total };
}

export function unreadCount(db: Db, userId: number): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId) as { n: number }
  ).n;
}

function getOwned(db: Db, userId: number, id: number): NotificationRow {
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM notifications WHERE id = ? AND user_id = ?`)
    .get(id, userId) as NotificationRow | undefined;
  if (!row) throw httpError.notFound('Notification');
  return row;
}

export function markRead(db: Db, userId: number, id: number): Notification {
  getOwned(db, userId, id); // 404 for foreign ids
  db.prepare(
    'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
  ).run(toIso(Date.now()), id, userId); // idempotent
  return toNotification(getOwned(db, userId, id));
}

export function markAllRead(db: Db, userId: number): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(
    toIso(Date.now()),
    userId,
  );
}

export function remove(db: Db, userId: number, id: number): void {
  getOwned(db, userId, id);
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId);
}

/** Expired-session pruning rides the same scheduler tick (ARCHITECTURE.md §6). */
export function pruneExpiredSessions(db: Db): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(toIso(Date.now())).changes;
}
