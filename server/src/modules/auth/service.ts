/**
 * Auth service (Stage 11 / ARCHITECTURE.md §4): bcrypt password handling,
 * server-side sessions, ownership. Routes never touch SQL or bcrypt directly.
 */
import bcrypt from 'bcryptjs';
import type { Db } from '../../db/connection.js';
import type { AppConfig } from '../../config.js';
import type { User } from '@stms/shared';
import { httpError } from '../../util/httpError.js';
import { generateSessionToken, hashSessionToken } from '../../util/session.js';
import { DAY_MS, toIso } from '../../util/time.js';
import * as repo from './repo.js';

const BCRYPT_ROUNDS = 12;

export interface AuthenticatedSession {
  user: User;
  token: string;
  expiresAt: string;
}

function toUser(row: repo.UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailRemindersEnabled: row.email_reminders_enabled === 1,
    createdAt: row.created_at,
  };
}

function sessionExpiry(config: AppConfig, nowMs: number): string {
  return toIso(nowMs + config.SESSION_TTL_DAYS * DAY_MS);
}

async function newSession(
  config: AppConfig,
  db: Db,
  userId: number,
): Promise<{ token: string; expiresAt: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(config.sessionSecret, token);
  const nowMs = Date.now();
  const expiresAt = sessionExpiry(config, nowMs);
  repo.createSession(db, {
    tokenHash,
    userId,
    now: toIso(nowMs),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function register(
  config: AppConfig,
  db: Db,
  input: { name: string; email: string; password: string },
): Promise<AuthenticatedSession> {
  if (repo.findUserByEmail(db, input.email)) {
    throw httpError.emailTaken();
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const row = repo.insertUser(db, {
    name: input.name,
    email: input.email,
    passwordHash,
    now: toIso(Date.now()),
  });
  const session = await newSession(config, db, row.id);
  return { user: toUser(row), ...session };
}

// Lazily-built dummy hash so unknown-email logins still spend a bcrypt round
// (constant-time-ish against user enumeration via response timing).
let nopeHash: string | undefined;
function getNopeHash(): string {
  nopeHash ??= bcrypt.hashSync('stms-timing-equalizer-never-matches', BCRYPT_ROUNDS);
  return nopeHash;
}

export async function login(
  config: AppConfig,
  db: Db,
  input: { email: string; password: string },
): Promise<AuthenticatedSession> {
  const row = repo.findUserByEmail(db, input.email);
  // Same error + comparable work for unknown email and wrong password (no enumeration).
  const ok = row
    ? await bcrypt.compare(input.password, row.password_hash)
    : await bcrypt.compare(input.password, getNopeHash());
  if (!row || !ok) {
    throw httpError.invalidCredentials();
  }
  const session = await newSession(config, db, row.id);
  return { user: toUser(row), ...session };
}

export function getUserById(db: Db, id: number): User | undefined {
  const row = repo.findUserById(db, id);
  return row ? toUser(row) : undefined;
}

export function updateProfile(
  db: Db,
  userId: number,
  patch: { name?: string; emailRemindersEnabled?: boolean },
): User {
  const row = repo.updateUserProfile(db, userId, patch, toIso(Date.now()));
  return toUser(row);
}

export async function changePassword(
  db: Db,
  userId: number,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const row = repo.findUserById(db, userId);
  if (!row) {
    throw httpError.unauthenticated();
  }
  const ok = await bcrypt.compare(input.currentPassword, row.password_hash);
  if (!ok) {
    throw httpError.invalidCredentials();
  }
  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  repo.updateUserPassword(db, userId, passwordHash, toIso(Date.now()));
}

// ---------- session lifecycle ----------

export function resolveSession(
  config: AppConfig,
  db: Db,
  rawToken: string,
): { userId: number; user: User; refresh: boolean; expiresAt?: string } | undefined {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return undefined;
  const tokenHash = hashSessionToken(config.sessionSecret, rawToken);
  const session = repo.findSession(db, tokenHash);
  if (!session) return undefined;

  const nowMs = Date.now();
  if (Date.parse(session.expires_at) <= nowMs) {
    repo.deleteSession(db, tokenHash); // expired → revoked (session expiry, Stage 11)
    return undefined;
  }
  const userRow = repo.findUserById(db, session.user_id);
  if (!userRow) {
    repo.deleteSession(db, tokenHash);
    return undefined;
  }
  // Sliding expiry: refresh when less than a day would remain after this request.
  const refresh =
    Date.parse(session.expires_at) - nowMs < config.SESSION_TTL_DAYS * DAY_MS - DAY_MS;
  const expiresAt = refresh ? sessionExpiry(config, nowMs) : undefined;
  if (refresh) {
    repo.touchSession(db, tokenHash, expiresAt!);
  }
  return { userId: userRow.id, user: toUser(userRow), refresh, expiresAt };
}

export function logout(config: AppConfig, db: Db, rawToken: string): void {
  if (!/^[0-9a-f]{64}$/.test(rawToken)) return;
  repo.deleteSession(db, hashSessionToken(config.sessionSecret, rawToken));
}
