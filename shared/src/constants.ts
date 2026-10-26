/**
 * Shared domain constants — single source of truth for enums and limits,
 * used by both server (validation/SQL) and client (UI options).
 * Mirrors DATABASE.md §1 and API.md.
 */

export const TASK_TYPES = ['assignment', 'project', 'exam', 'study', 'other'] as const;
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const DUE_BUCKETS = ['overdue', 'today', 'week', 'later', 'none'] as const;
export const TASK_SORTS = [
  'smart',
  'due_asc',
  'due_desc',
  'priority_desc',
  'created_desc',
  'title_asc',
] as const;
export const NOTIFICATION_KINDS = [
  'deadline_soon_24h',
  'deadline_soon_1h',
  'overdue',
  'welcome',
] as const;

/** Field limits enforced by zod schemas (shared) and SQL CHECKs (DATABASE.md). */
export const LIMITS = {
  name: 100,
  email: 254,
  title: 200,
  description: 5000,
  subject: 100,
  searchMax: 200,
  passwordMin: 8,
  passwordMax: 200,
  pageLimitMax: 100,
  calendarMaxSpanDays: 92,
} as const;

/** Higher = more urgent. Used for priority ordering in SQL and UI. */
export const PRIORITY_RANK = { high: 3, medium: 2, low: 1 } as const;

/** Machine-readable error codes (API.md §1). */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  ORIGIN_MISMATCH: 'ORIGIN_MISMATCH',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** Reminder thresholds for the scheduler (PRD F7). */
export const REMINDER = {
  soonHours: 24,
  imminentMinutes: 60,
  maxEmailAttempts: 3,
} as const;

export const APP_NAME = 'Student Task Manager';
