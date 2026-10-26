/**
 * Typed API endpoints (AGENTS.md §3 — shapes come from @stms/shared types).
 * One module per domain; components never call fetch directly.
 */
import type {
  AnalyticsOverview,
  CalendarResponse,
  DashboardSummary,
  DueBucket,
  Notification,
  LoginInput,
  Paginated,
  PasswordChangeInput,
  ProfilePatchInput,
  RegisterInput,
  Task,
  TaskCreateInput,
  TaskSort,
  TaskUpdateInput,
  User,
} from '@stms/shared';
import { apiFetch } from './client';

/** Minutes east of UTC (inverse of Date#getTimezoneOffset) — server buckets need it. */
function tzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}

export const authApi = {
  me: () => apiFetch<{ user: User }>('/auth/me'),
  login: (input: LoginInput) =>
    apiFetch<{ user: User }>('/auth/login', { method: 'POST', body: input }),
  register: (input: RegisterInput) =>
    apiFetch<{ user: User }>('/auth/register', { method: 'POST', body: input }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  patchProfile: (patch: ProfilePatchInput) =>
    apiFetch<{ user: User }>('/auth/profile', { method: 'PATCH', body: patch }),
  changePassword: (input: PasswordChangeInput) =>
    apiFetch<void>('/auth/password', { method: 'PUT', body: input }),
};

export interface TaskListQuery {
  page: number;
  limit: number;
  sort: TaskSort;
  due?: DueBucket;
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  subject?: string[];
  priority?: string[];
  status?: string[];
  type?: string[];
}

export const tasksApi = {
  list: (q: TaskListQuery) =>
    apiFetch<Paginated<Task>>('/tasks', { query: { ...q, tzOffset: tzOffsetMin() } }),
  get: (id: number) => apiFetch<{ task: Task }>(`/tasks/${id}`),
  create: (input: TaskCreateInput) =>
    apiFetch<{ task: Task }>('/tasks', { method: 'POST', body: input }),
  update: (id: number, input: TaskUpdateInput) =>
    apiFetch<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: input }),
  remove: (id: number) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
  subjects: () => apiFetch<{ subjects: string[] }>('/tasks/meta/subjects'),
};

export const dashboardApi = {
  summary: () =>
    apiFetch<DashboardSummary>('/dashboard/summary', { query: { tzOffset: tzOffsetMin() } }),
};

export const calendarApi = {
  /** Tasks with due dates inside [from, to] — one request per visible grid range. */
  range: (from: Date, to: Date) =>
    apiFetch<CalendarResponse>('/calendar', {
      query: { from: from.toISOString(), to: to.toISOString() },
    }),
};

export interface NotificationListQuery {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export const notificationsApi = {
  list: (q: NotificationListQuery) =>
    apiFetch<Paginated<Notification>>('/notifications', { query: { ...q } }),
  unreadCount: () => apiFetch<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) =>
    apiFetch<{ notification: Notification }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiFetch<void>('/notifications/read-all', { method: 'POST' }),
  remove: (id: number) => apiFetch<void>(`/notifications/${id}`, { method: 'DELETE' }),
};

export const analyticsApi = {
  overview: (days: 14 | 30) =>
    apiFetch<AnalyticsOverview>('/analytics/overview', { query: { days } }),
};
