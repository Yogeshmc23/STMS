/**
 * Versioned SQL migration runner (DATABASE.md §6).
 * Applies server/src/db/migrations/NNN_name.sql in order, inside transactions,
 * recording each in schema_migrations. Idempotent: already-applied versions are skipped.
 * Fails fast on gaps or missing files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './connection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(here, 'migrations');

const FILENAME_RE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

export function runMigrations(db: Db, dir = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const files = fs
    .readdirSync(dir)
    .filter((f) => FILENAME_RE.test(f))
    .sort();

  const known = new Map<number, string>();
  for (const file of files) {
    const match = FILENAME_RE.exec(file)!;
    const version = Number(match[1]);
    const existing = known.get(version);
    if (existing) {
      throw new Error(`Duplicate migration version ${version}: ${existing} and ${file}`);
    }
    known.set(version, file);
  }

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  const nowApplied: string[] = [];
  const versions = [...known.keys()].sort((a, b) => a - b);
  for (const version of versions) {
    const file = known.get(version)!;
    if (applied.has(version)) continue;
    // No gaps: every version below the one being applied must already exist.
    for (let v = 1; v < version; v++) {
      if (!known.has(v)) {
        throw new Error(`Missing migration file for version ${v} (before applying ${file})`);
      }
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        version,
        file,
        new Date().toISOString(),
      );
    });
    apply();
    nowApplied.push(file);
  }
  return nowApplied;
}
