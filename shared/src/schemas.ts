/**
 * Zod schemas — the single source of validation truth (AGENTS.md §3).
 * Server: mandatory request validation. Client: form pre-checks with the same rules.
 * All shapes follow API.md.
 */
import { z } from 'zod';
import {
  DUE_BUCKETS,
  LIMITS,
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  TASK_TYPES,
} from './constants.js';

// ---------- helpers ----------

/** UTC ISO-8601 datetime (offsets allowed on input; server normalizes to Z). */
export const isoDateTime = z.string().datetime({ offset: true });

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Express query values arrive as string | string[]; normalize to array. */
function repeated<T extends z.ZodTypeAny>(item: T) {
  return z
    .preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(item))
    .optional();
}

/** Query-string boolean: only 'true'/'1' count as true. */
const queryBoolean = z
  .preprocess((v) => (v === undefined ? undefined : v === 'true' || v === '1'), z.boolean())
  .optional();

const pageParam = z.coerce.number().int().min(1).max(1_000_000).default(1);
const limitParam = z.coerce.number().int().min(1).max(LIMITS.pageLimitMax).default(20);

/** Date (YYYY-MM-DD) or full ISO datetime, as accepted by the calendar API. */
const isoDateOrDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/, {
    message: 'Must be an ISO date (YYYY-MM-DD) or ISO datetime',
  });

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(LIMITS.email);
const password = z
  .string()
  .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax);

// ---------- auth ----------

export const registerSchema = z.object({
  name: trimmed(1, LIMITS.name),
  email,
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(LIMITS.passwordMax),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const profilePatchSchema = z
  .object({
    name: trimmed(1, LIMITS.name).optional(),
    emailRemindersEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

// ---------- tasks ----------

const taskCoreShape = {
  title: trimmed(1, LIMITS.title),
  description: z.string().max(LIMITS.description).optional(),
  subject: trimmed(1, LIMITS.subject),
  type: z.enum(TASK_TYPES),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  /** null clears the due date (PATCH); undefined leaves it unchanged. */
  dueAt: isoDateTime.nullish(),
};

export const taskCreateSchema = z.object(taskCoreShape);
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: taskCoreShape.title.optional(),
    description: taskCoreShape.description,
    subject: taskCoreShape.subject.optional(),
    type: taskCoreShape.type.optional(),
    priority: taskCoreShape.priority,
    status: taskCoreShape.status,
    dueAt: taskCoreShape.dueAt,
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.searchMax).optional(),
  subject: repeated(trimmed(1, LIMITS.subject)),
  priority: repeated(z.enum(TASK_PRIORITIES)),
  status: repeated(z.enum(TASK_STATUSES)),
  type: repeated(z.enum(TASK_TYPES)),
  due: z.enum(DUE_BUCKETS).optional(),
  dueFrom: isoDateTime.optional(),
  dueTo: isoDateTime.optional(),
  /** Minutes EAST of UTC (client: -Date.getTimezoneOffset()); scopes due-today/week buckets. */
  tzOffset: z.coerce
    .number()
    .int()
    .min(-12 * 60)
    .max(14 * 60)
    .default(0),
  sort: z.enum(TASK_SORTS).default('smart'),
  page: pageParam,
  limit: limitParam,
});
export type TaskQuery = z.infer<typeof taskQuerySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});
export type IdParam = z.infer<typeof idParamSchema>;

// ---------- calendar ----------

export const calendarQuerySchema = z
  .object({
    from: isoDateOrDateTime,
    to: isoDateOrDateTime,
  })
  .superRefine((val, ctx) => {
    const from = Date.parse(val.from);
    const to = Date.parse(val.to);
    if (Number.isNaN(from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: 'Invalid date' });
      return;
    }
    if (Number.isNaN(to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Invalid date' });
      return;
    }
    if (to < from) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to must be >= from' });
      return;
    }
    if (to - from > LIMITS.calendarMaxSpanDays * 86_400_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Range must be at most ${LIMITS.calendarMaxSpanDays} days`,
      });
    }
  });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

// ---------- notifications ----------

export const notificationQuerySchema = z.object({
  unreadOnly: queryBoolean,
  page: pageParam,
  limit: limitParam,
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

// ---------- dashboard ----------

export const dashboardQuerySchema = z.object({
  tzOffset: z.coerce
    .number()
    .int()
    .min(-12 * 60)
    .max(14 * 60)
    .default(0),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// ---------- analytics ----------

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => d === 14 || d === 30, { message: 'days must be 14 or 30' })
    .default(14),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
