/** Migration runner + schema integrity (DATABASE.md §4-§6). */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

const now = new Date().toISOString();

describe('runMigrations', () => {
  it('applies 001_init.sql once, records it, and is idempotent', () => {
    const db = openDb(':memory:');
    const applied = runMigrations(db);
    expect(applied).toEqual(['001_init.sql']);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const expected of [
      'users',
      'sessions',
      'tasks',
      'notifications',
      'email_queue',
      'schema_migrations',
    ]) {
      expect(tables).toContain(expected);
    }

    const recorded = db.prepare('SELECT version, name FROM schema_migrations').all() as {
      version: number;
      name: string;
    }[];
    expect(recorded).toEqual([{ version: 1, name: '001_init.sql' }]);

    // Second run is a no-op.
    expect(runMigrations(db)).toEqual([]);
    db.close();
  });

  it('creates the indexes DATABASE.md §3 requires', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all()
      .map((row) => (row as { name: string }).name);
    for (const expected of [
      'idx_tasks_user_due',
      'idx_tasks_user_status_due',
      'idx_tasks_user_priority',
      'idx_tasks_user_subject',
      'idx_tasks_user_updated',
      'idx_sessions_user',
      'idx_sessions_expires',
      'idx_notifs_user_unread',
      'idx_notifs_user_created',
      'idx_emailq_state',
    ]) {
      expect(indexes).toContain(expected);
    }
    db.close();
  });
});

describe('schema integrity', () => {
  it('enforces foreign keys (tasks belong to a real user)', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (user_id, title, subject, type, created_at, updated_at)
           VALUES (999, 'orphan', 'Math', 'exam', ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });

  it('enforces CHECK constraints (enum values)', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    db.prepare(
      'INSERT INTO users (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run('Test', 'test@example.com', 'hash', now, now);
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (user_id, title, subject, type, priority, created_at, updated_at)
           VALUES (1, 't', 'Math', 'invalid-type', 'high', ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/CHECK/);
    db.close();
  });

  it('cascades user deletion to tasks and sessions', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
    ).run('Test', 'cascade@example.com', 'hash', now, now);
    db.prepare(
      `INSERT INTO tasks (user_id, title, subject, type, created_at, updated_at)
       VALUES (1, 'task', 'Math', 'study', ?, ?)`,
    ).run(now, now);
    db.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 1, ?, ?)',
    ).run('hash1', now, now);

    db.prepare('DELETE FROM users WHERE id = 1').run();
    const tasks = db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number };
    const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number };
    expect(tasks.n).toBe(0);
    expect(sessions.n).toBe(0);
    db.close();
  });

  it('deduplicates reminders via UNIQUE(user_id, kind, task_id)', () => {
    const db = openDb(':memory:');
    runMigrations(db);
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?)',
    ).run('Test', 'dedup@example.com', 'hash', now, now);
    db.prepare(
      `INSERT INTO tasks (id, user_id, title, subject, type, created_at, updated_at)
       VALUES (1, 1, 'task', 'Math', 'exam', ?, ?)`,
    ).run(now, now);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO notifications (user_id, task_id, kind, title, body, created_at)
       VALUES (1, 1, 'overdue', 'Overdue', 'Body', ?)`,
    );
    insert.run(now);
    insert.run(now); // duplicate → ignored
    const count = db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number };
    expect(count.n).toBe(1);
    db.close();
  });
});
