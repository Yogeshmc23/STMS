/**
 * Notifications page (F7): full list, unread-only filter, mark all read,
 * dismiss, deep-links to the task editor. Real loading/empty/error states.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Notification, Paginated } from '@stms/shared';
import { ApiError } from '../api/client';
import { notificationsApi } from '../api/endpoints';
import { EmptyState } from '../components/EmptyState';
import { FormAlert } from '../components/FormControls';
import { Icon } from '../components/Icons';
import { ListSkeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const PAGE_SIZE = 20;

function whenLabel(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationsPage() {
  useDocumentTitle('Notifications');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { push } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] }); // completion may change buckets
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const list = useInfiniteQuery({
    queryKey: ['notifications', 'page', unreadOnly],
    queryFn: ({ pageParam }) =>
      notificationsApi.list({
        page: pageParam,
        limit: PAGE_SIZE,
        unreadOnly: unreadOnly || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<Notification>, all: Paginated<Notification>[]) =>
      all.reduce((n, p) => n + p.items.length, 0) < last.total ? all.length + 1 : undefined,
  });

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      refresh();
      push('success', 'All notifications marked as read.');
    },
  });

  const act = useMutation({
    mutationFn: async ({ n, action }: { n: Notification; action: 'read' | 'dismiss' }) => {
      if (action === 'read') await notificationsApi.markRead(n.id);
      else await notificationsApi.remove(n.id);
    },
    onSuccess: (_d, v) => {
      refresh();
      if (v.action === 'read' && v.n.taskId) navigate(`/tasks?open=${v.n.taskId}`);
    },
    onError: (err) => push('danger', err instanceof ApiError ? err.message : 'Action failed.'),
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="text-muted">Deadline reminders land here as they approach and pass.</p>
        </div>
        <div className="page-head-actions">
          <button
            type="button"
            className={`seg ${unreadOnly ? 'seg-active' : ''}`}
            onClick={() => setUnreadOnly((u) => !u)}
            aria-pressed={unreadOnly}
          >
            Unread only
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || items.length === 0}
          >
            Mark all read
          </button>
        </div>
      </div>

      {list.isPending ? (
        <ListSkeleton rows={4} />
      ) : list.isError ? (
        <div className="card">
          <FormAlert message="Couldn’t load notifications." />
          <button type="button" className="btn btn-primary" onClick={() => list.refetch()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="bell"
          title={unreadOnly ? 'No unread notifications' : 'Nothing here yet'}
          body={
            unreadOnly
              ? 'You are all caught up — switch the filter to see older items.'
              : 'Reminders appear automatically as task deadlines approach.'
          }
        />
      ) : (
        <>
          <ul className="notif-page-list">
            {items.map((n) => (
              <li key={n.id} className={`card notif-row${n.readAt ? '' : ' notif-unread'}`}>
                <div className="notif-row-main">
                  <span className="notif-row-title">
                    {!n.readAt && <span className="notif-dot" aria-label="Unread" />}
                    {n.title}
                  </span>
                  <span className="notif-row-body">{n.body}</span>
                  <span className="text-muted notif-row-when">{whenLabel(n.createdAt)}</span>
                </div>
                <div className="notif-row-actions">
                  {!n.readAt && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => act.mutate({ n, action: 'read' })}
                    >
                      {n.taskId ? 'Open & mark read' : 'Mark read'}
                    </button>
                  )}
                  {n.readAt && n.taskId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => navigate(`/tasks?open=${n.taskId}`)}
                    >
                      Open task <Icon name="chevron-right" size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    aria-label={`Dismiss: ${n.title}`}
                    onClick={() => act.mutate({ n, action: 'dismiss' })}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <div className="load-more">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
