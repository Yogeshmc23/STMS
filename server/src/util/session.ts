/**
 * Session token utilities (ARCHITECTURE.md §4):
 * raw token lives ONLY in the httpOnly cookie; the DB stores sha256(secret:token).
 */
import { createHash, randomBytes } from 'node:crypto';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

export function hashSessionToken(secret: string, token: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}
