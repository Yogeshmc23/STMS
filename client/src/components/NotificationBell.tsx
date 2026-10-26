/**
 * Header bell + dropdown panel (F7, DESIGN.md §6). Unread count polls every
 * 60 s and on window focus; clicking an item marks it read and deep-links to
 * the task (Tasks page opens it in the edit sheet via ?open=<id>).
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { Notification } from '@stms/shared';
import { notificationsApi } from '../api/endpoints';
import { Icon } from './Icons';

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.unreadCount,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function NotificationBell({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const count = useUnreadCount(signedIn);
  const panel = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: () => notificationsApi.list({ page: 1, limit: 5 }),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (n: Notification) => notificationsApi.markRead(n.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close on outside click / Escape (panel is a lightweight popover).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = count.data?.count ?? 0;

  const openItem = (n: Notification) => {
    if (n.readAt === null) markRead.mutate(n);
    setOpen(false);
    navigate(n.taskId ? `/tasks?open=${n.taskId}` : '/notifications');
  };

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel card" role="dialog" aria-label="Recent notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            <Link to="/notifications" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          {panel.isPending ? (
            <p className="text-muted" role="status">
              Loading…
            </p>
          ) : panel.isError ? (
            <p className="text-danger" role="alert">
              Couldn’t load notifications.
            </p>
          ) : (panel.data?.items.length ?? 0) === 0 ? (
            <p className="text-muted">You’re all caught up 🎉</p>
          ) : (
            <ul className="notif-list">
              {panel.data!.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-item${n.readAt ? '' : ' notif-unread'}`}
                    onClick={() => openItem(n)}
                  >
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-body">
                      <span className="notif-title">{n.title}</span>
                      <span className="notif-text">{n.body}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
