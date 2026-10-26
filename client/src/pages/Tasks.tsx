/**
 * Tasks list (F2/F3/F9): FilterBar state lives in the router query string
 * (shareable URLs, back-button friendly), load-more pagination, create/edit
 * sheet — including ?open=<id> deep-links from notifications — delete confirm,
 * optimistic complete toggle with rollback (DESIGN.md §7).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { DueBucket, Paginated, Task, TaskCreateInput, TaskSort } from '@stms/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@stms/shared';
import { ApiError } from '../api/client';
import { tasksApi } from '../api/endpoints';
import { FilterBar, isFiltered, type TaskFilters } from '../components/FilterBar';
import { TaskCard } from '../components/TaskCard';
import { TaskForm } from '../components/TaskForm';
import { ConfirmDialog } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { ListSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { Icon } from '../components/Icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const PAGE_SIZE = 20;
const DUE_VALUES: (DueBucket | 'all')[] = ['all', 'overdue', 'today', 'week', 'later', 'none'];
const SORT_VALUES: TaskSort[] = [
  'smart',
  'due_asc',
  'due_desc',
  'priority_desc',
  'created_desc',
  'title_asc',
];

function firstErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

function onlyIn<T extends string>(values: string[], allowed: readonly T[]): T[] {
  return values.filter((v): v is T => (allowed as readonly string[]).includes(v));
}

function readFilters(params: URLSearchParams): TaskFilters {
  const dueRaw = params.get('due');
  const sortRaw = params.get('sort');
  return {
    q: params.get('q') ?? '',
    subject: params.getAll('subject'),
    priority: onlyIn(params.getAll('priority'), TASK_PRIORITIES),
    status: onlyIn(params.getAll('status'), TASK_STATUSES),
    due: DUE_VALUES.includes(dueRaw as DueBucket) ? (dueRaw as DueBucket) : 'all',
    sort: SORT_VALUES.includes(sortRaw as TaskSort) ? (sortRaw as TaskSort) : 'smart',
  };
}

function writeFilters(f: TaskFilters, keepOpen?: string | null): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const s of f.subject) p.append('subject', s);
  for (const s of f.priority) p.append('priority', s);
  for (const s of f.status) p.append('status', s);
  if (f.due !== 'all') p.set('due', f.due);
  if (f.sort !== 'smart') p.set('sort', f.sort);
  if (keepOpen) p.set('open', keepOpen);
  return p;
}

export function TasksPage() {
  useDocumentTitle('Tasks');
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { push } = useToast();

  const filters = useMemo(() => readFilters(params), [params]);
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const applyPatch = useCallback(
    (patch: Partial<TaskFilters>) => {
      const merged: TaskFilters = { ...filters, ...patch };
      setParams(writeFilters(merged, params.get('open')));
    },
    [filters, params, setParams],
  );

  const apiQuery = useMemo(
    () => ({
      q: filters.q || undefined,
      subject: filters.subject.length ? filters.subject : undefined,
      priority: filters.priority.length ? filters.priority : undefined,
      status: filters.status.length ? filters.status : undefined,
      due: filters.due === 'all' ? undefined : filters.due,
      sort: filters.sort,
    }),
    [filters],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ['tasks', 'list', filtersKey],
    queryFn: ({ pageParam }) => tasksApi.list({ page: pageParam, limit: PAGE_SIZE, ...apiQuery }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<Task>, all: Paginated<Task>[]) => {
      const seen = all.reduce((n, p) => n + p.items.length, 0);
      return seen < last.total ? all.length + 1 : undefined;
    },
  });

  const subjectsQuery = useQuery({ queryKey: ['task-subjects'], queryFn: tasksApi.subjects });

  const pages = useMemo(() => listQuery.data?.pages ?? [], [listQuery.data]);
  const items = useMemo(() => pages.flatMap((p) => p.items), [pages]);
  const total = pages.at(-1)?.total ?? 0;

  // ---- notification deep-link: /tasks?open=<id> opens the edit sheet ----
  const openId = params.get('open');
  const openTask = useQuery({
    queryKey: ['tasks', 'one', openId],
    queryFn: () => tasksApi.get(Number(openId)),
    enabled: openId !== null && /^\d+$/.test(openId ?? ''),
  });
  const clearOpen = useCallback(() => {
    if (!params.has('open')) return;
    const p = new URLSearchParams(params);
    p.delete('open');
    setParams(p, { replace: true });
  }, [params, setParams]);
  useEffect(() => {
    if (openTask.data) {
      setEditing(openTask.data.task);
      setFormOpen(true);
    }
  }, [openTask.data]);
  useEffect(() => {
    if (openTask.isError) {
      push('info', 'That task could not be opened.');
      clearOpen();
    }
  }, [openTask.isError, clearOpen, push]);

  /** Replace a task inside every cached page across list queries (infinite shape). */
  const patchTaskInCaches = useCallback(
    (next: Task) => {
      queryClient.setQueriesData<InfiniteData<Paginated<Task>>>(
        { queryKey: ['tasks', 'list'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  items: p.items.map((t) => (t.id === next.id ? next : t)),
                })),
              }
            : old,
      );
    },
    [queryClient],
  );

  const refreshDerived = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['calendar'] });
    void queryClient.invalidateQueries({ queryKey: ['task-subjects'] });
  }, [queryClient]);

  const saveMutation = useMutation({
    mutationFn: (payload: TaskCreateInput & { id?: number }) =>
      payload.id ? tasksApi.update(payload.id, payload) : tasksApi.create(payload),
    onSuccess: ({ task }, variables) => {
      patchTaskInCaches(task);
      void queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] }); // ordering may change
      refreshDerived();
      push('success', variables.id ? 'Task updated.' : 'Task created.');
    },
    onError: (err) => push('danger', firstErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => tasksApi.remove(id),
    onSuccess: (_d, id) => {
      queryClient.setQueriesData<InfiniteData<Paginated<Task>>>(
        { queryKey: ['tasks', 'list'] },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  items: p.items.filter((t) => t.id !== id),
                  total: Math.max(0, p.total - 1),
                })),
              }
            : old,
      );
      refreshDerived();
      setPendingDelete(null);
      push('success', 'Task deleted.');
    },
    onError: (err) => {
      push('danger', firstErrorMessage(err));
      setPendingDelete(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (task: Task) =>
      tasksApi.update(task.id, { status: task.status === 'completed' ? 'pending' : 'completed' }),
    onMutate: async (task) => {
      const optimistic: Task = {
        ...task,
        status: task.status === 'completed' ? 'pending' : 'completed',
        completedAt: task.status === 'completed' ? null : new Date().toISOString(),
      };
      patchTaskInCaches(optimistic);
      return { previous: task };
    },
    onSuccess: ({ task }) => {
      patchTaskInCaches(task);
      refreshDerived(); // completion stats
    },
    onError: (err, _task, ctx) => {
      if (ctx) patchTaskInCaches(ctx.previous); // rollback
      push('danger', firstErrorMessage(err));
    },
  });

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    clearOpen();
  };

  const headerBusy = listQuery.isFetching && !listQuery.isLoading;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="text-muted" aria-live="polite">
            {listQuery.isLoading
              ? 'Loading…'
              : `${total} task${total === 1 ? '' : 's'}${headerBusy ? ' · refreshing…' : ''}`}
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="btn btn-primary" onClick={openNew}>
            <Icon name="plus" /> New task
          </button>
        </div>
      </div>

      <FilterBar
        filters={filters}
        subjectOptions={subjectsQuery.data?.subjects ?? []}
        onChange={applyPatch}
      />

      {listQuery.isPending ? (
        <ListSkeleton rows={5} />
      ) : listQuery.isError ? (
        <EmptyState
          icon="alert"
          title="Couldn’t load your tasks"
          body={firstErrorMessage(listQuery.error)}
          action={
            <button type="button" className="btn btn-primary" onClick={() => listQuery.refetch()}>
              Retry
            </button>
          }
        />
      ) : items.length === 0 ? (
        isFiltered(filters) ? (
          <EmptyState
            icon="search"
            title="No tasks match these filters"
            body="Try removing a filter or two — your search may be too narrow."
            action={
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setParams(
                    writeFilters({
                      ...filters,
                      q: '',
                      subject: [],
                      priority: [],
                      status: [],
                      due: 'all',
                    }),
                  )
                }
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="tasks"
            title="No tasks yet"
            body="Add your first assignment, project or exam — deadlines, priorities and reminders start here."
            action={
              <button type="button" className="btn btn-primary" onClick={openNew}>
                <Icon name="plus" /> Create your first task
              </button>
            }
          />
        )
      ) : (
        <>
          <div className="task-list">
            {items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                busy={toggleMutation.isPending && toggleMutation.variables?.id === task.id}
                onToggleStatus={(t) => toggleMutation.mutate(t)}
                onEdit={(t) => {
                  setEditing(t);
                  setFormOpen(true);
                }}
                onDelete={(t) => setPendingDelete(t)}
              />
            ))}
          </div>
          {listQuery.hasNextPage && (
            <div className="load-more">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => listQuery.fetchNextPage()}
                disabled={listQuery.isFetchingNextPage}
              >
                {listQuery.isFetchingNextPage
                  ? 'Loading…'
                  : `Load more (${Math.max(0, total - items.length)} left)`}
              </button>
            </div>
          )}
        </>
      )}

      <button type="button" className="fab btn btn-primary" onClick={openNew} aria-label="New task">
        <Icon name="plus" size={22} />
      </button>

      <TaskForm
        open={formOpen}
        task={editing}
        subjectOptions={subjectsQuery.data?.subjects ?? []}
        onClose={closeForm}
        onSubmit={async (payload) => {
          await saveMutation.mutateAsync(editing ? { ...payload, id: editing.id } : payload);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this task?"
        body={`“${pendingDelete?.title ?? ''}” will be permanently removed, along with its reminders.`}
        confirmLabel="Delete task"
        danger
        busy={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
