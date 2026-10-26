/**
 * Data access for users + sessions (AGENTS.md §6: all SQL here, all parameterized,
 * ownership scoping on user-owned resources).
 */
import type { Db } from '../../db/connection.js';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  email_reminders_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  token_hash: string;
  user_id: number;
  created_at: string;
  expires_at: string;
}

const USER_COLUMNS = `id, name, email, password_hash, email_reminders_enabled, created_at, updated_at`;

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).get(email) as
    UserRow | undefined;
}

export function findUserById(db: Db, id: number): UserRow | undefined {
  return db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as
    UserRow | undefined;
}

export function insertUser(
  db: Db,
  input: { name: string; email: string; passwordHash: string; now: string },
): UserRow {
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.name, input.email, input.passwordHash, input.now, input.now);
    // Welcome notification — one per user, at registration only (API.md §2).
    db.prepare(
      `INSERT INTO notifications (user_id, task_id, kind, title, body, created_at)
       VALUES (?, NULL, 'welcome', ?, ?, ?)`,
    ).run(
      Number(info.lastInsertRowid),
      'Welcome to the Student Task Manager 🎓',
      'Create your first task with a subject, priority and due date — reminders will show up here before deadlines.',
      input.now,
    );
    return findUserById(db, Number(info.lastInsertRowid))!;
  });
  return tx();
}

export function updateUserProfile(
  db: Db,
  id: number,
  patch: { name?: string; emailRemindersEnabled?: boolean },
  now: string,
): UserRow {
  const sets: string[] = ['updated_at = ?'];
  const params: (string | number)[] = [now];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(patch.name);
  }
  if (patch.emailRemindersEnabled !== undefined) {
    sets.push('email_reminders_enabled = ?');
    params.push(patch.emailRemindersEnabled ? 1 : 0);
  }
  params.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return findUserById(db, id)!;
}

export function updateUserPassword(db: Db, id: number, passwordHash: string, now: string): void {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    now,
    id,
  );
}

export function createSession(
  db: Db,
  input: { tokenHash: string; userId: number; now: string; expiresAt: string },
): void {
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(input.tokenHash, input.userId, input.now, input.expiresAt);
}

export function findSession(db: Db, tokenHash: string): SessionRow | undefined {
  return db
    .prepare(
      'SELECT token_hash, user_id, created_at, expires_at FROM sessions WHERE token_hash = ?',
    )
    .get(tokenHash) as SessionRow | undefined;
}

export function deleteSession(db: Db, tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function touchSession(db: Db, tokenHash: string, expiresAt: string): void {
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, tokenHash);
}
