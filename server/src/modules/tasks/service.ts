/**
 * Tasks service: business rules only (no HTTP). Enforces the
 * status/completed_at invariant in a transaction (DATABASE.md §4) and maps
 * "not found" to 404 (ownership — never leaks existence).
 */
import type { DueBucket, Task, TaskCreateInput, TaskSort, TaskUpdateInput } from '@stms/shared';
import type { Db } from '../../db/connection.js';
import { httpError } from '../../util/httpError.js';
import { dueBucketBoundaries, toIso } from '../../util/time.js';
import * as repo from './repo.js';

export interface ListParams {
  sort: TaskSort;
  page: number;
  limit: number;
  q?: string;
  subject?: string[];
  priority?: string[];
  status?: string[];
  type?: string[];
  due?: DueBucket;
  dueFrom?: string;
  dueTo?: string;
  /** Minutes east of UTC from the client (default 0 = UTC days). */
  tzOffset: number;
}

export function createTask(db: Db, userId: number, input: TaskCreateInput): Task {
  const now = toIso(Date.now());
  const status = input.status ?? 'pending';
  return repo.insertTask(db, userId, {
    title: input.title,
    description: input.description ?? '',
    subject: input.subject,
    type: input.type,
    priority: input.priority ?? 'medium',
    status,
    dueAt: normalizeDue(input.dueAt),
    completedAt: status === 'completed' ? now : null,
    now,
  });
}

export function getTask(db: Db, userId: number, id: number): Task {
  const task = repo.findTask(db, userId, id);
  if (!task) throw httpError.notFound('Task');
  return task;
}

export function patchTask(db: Db, userId: number, id: number, input: TaskUpdateInput): Task {
  const existing = repo.findTask(db, userId, id);
  if (!existing) throw httpError.notFound('Task');

  const now = toIso(Date.now());
  const nextStatus = input.status ?? existing.status;
  // Invariant: completed_at is set exactly while status === 'completed'.
  let completedAt: string | null = existing.completedAt;
  if (nextStatus === 'completed') {
    completedAt = existing.completedAt ?? now;
  } else if (input.status !== undefined) {
    completedAt = null; // reopening
  }

  const tx = db.transaction(() => {
    repo.updateTask(db, userId, id, {
      title: input.title,
      description: input.description,
      subject: input.subject,
      type: input.type,
      priority: input.priority,
      status: input.status,
      dueAt: 'dueAt' in input ? normalizeDue(input.dueAt) : undefined,
      completedAt,
      now,
    });
    return repo.findTask(db, userId, id)!;
  });
  return tx();
}

export function removeTask(db: Db, userId: number, id: number): void {
  const existing = repo.findTask(db, userId, id);
  if (!existing) throw httpError.notFound('Task');
  repo.deleteTask(db, userId, id); // cascades notifications + email_queue rows
}

export function list(db: Db, userId: number, params: ListParams): { items: Task[]; total: number } {
  const { sort, page, limit, tzOffset, ...filters } = params;
  return repo.listTasks(db, userId, {
    sort,
    page,
    limit,
    filters,
    boundaries: dueBucketBoundaries(Date.now(), tzOffset),
  });
}

export function subjects(db: Db, userId: number): string[] {
  return repo.distinctSubjects(db, userId);
}

function normalizeDue(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString(); // stored UTC Z (DATABASE.md preamble)
}
