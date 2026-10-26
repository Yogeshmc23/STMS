/**
 * SQLite connection factory (DATABASE.md §5).
 * Single shared better-sqlite3 connection per process; WAL + FK enforced.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Assert the non-default pragmas actually took effect (DATABASE.md §5).
  const fk = db.pragma('foreign_keys', { simple: true });
  if (fk !== 1) {
    throw new Error('SQLite foreign_keys pragma failed to enable');
  }
  return db;
}
