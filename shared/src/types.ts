/**
 * Shared API contract types (API.md). Camel-case JSON shapes as they cross the wire.
 * The server maps DB rows (snake_case) to these; the client consumes them directly.
 */
import type {
  DUE_BUCKETS,
  NOTIFICATION_KINDS,
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  TASK_TYPES,
} from './constants.js';

export type TaskType = (typeof TASK_TYPES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type DueBucket = (typeof DUE_BUCKETS)[number];
export type TaskSort = (typeof TASK_SORTS)[number];
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface User {
  id: number;
  name: string;
  email: string;
  emailRemindersEnabled: boolean;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  subject: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  /** UTC ISO-8601 or null when unscheduled. */
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface SubjectWorkload {
  subject: string;
  open: number;
  total: number;
}

export interface ActivityItem {
  id: number;
  title: string;
  kind: 'completed' | 'created';
  at: string;
}

export interface DashboardSummary {
  counts: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    unscheduled: number;
  };
  /** 0..1, or null when the user has no tasks (PRD F8 zero-data rule). */
  completionRate: number | null;
  upNext: Task[];
  workloadBySubject: SubjectWorkload[];
  recentActivity: ActivityItem[];
}

export interface TrendPoint {
  /** UTC day bucket, YYYY-MM-DD. */
  date: string;
  completed: number;
  created: number;
}

export interface AnalyticsOverview {
  totals: { created: number; completed: number; open: number; overdue: number };
  completionRate: number | null;
  completedLastPeriod: number;
  completedPreviousPeriod: number;
  trend: TrendPoint[];
  byPriority: { priority: TaskPriority; open: number; completed: number }[];
  bySubject: { subject: string; open: number; completed: number }[];
  byType: { type: TaskType; open: number; completed: number }[];
}

export interface CalendarResponse {
  tasks: Task[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'unavailable';
  uptime: number;
  version: string;
}

export interface FieldDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: FieldDetail[];
  };
}
