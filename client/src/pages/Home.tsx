/**
 * Dashboard (F5): real server-computed aggregates — completion stats, deadline
 * buckets, "up next" with quick-complete, workload by subject, recent activity.
 * All states per DESIGN.md §7 (loading skeleton / error retry / zero-data CTA).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DashboardSummary, Task } from '@stms/shared';
import { ApiError } from '../api/client';
import { dashboardApi, tasksApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { PriorityBadge } from '../components/Badges';
import { EmptyState } from '../components/EmptyState';
import { FormAlert } from '../components/FormControls';
import { Icon } from '../components/Icons';
import { SkeletonBlock } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDue } from '../utils/time';

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | 'warning' | 'success';
}) {
  const toneClass = tone ? ` stat-${tone}` : '';
  return (
    <div className={`card stat-card${toneClass}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function HomePage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const firstName = (user?.name ?? '').split(/\s+/)[0] ?? '';

  const dash = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.summary });

  const completeTask = useMutation({
    mutationFn: (task: Task) => tasksApi.update(task.id, { status: 'completed' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      push('success', 'Task completed — nice work 🎉');
    },
    onError: (err) =>
      push('danger', err instanceof ApiError ? err.message : 'Could not complete the task.'),
  });

  if (dash.isPending) {
    return (
      <main className="page" aria-busy="true" aria-label="Loading dashboard">
        <SkeletonBlock height={34} width="260px" />
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} height={88} />
          ))}
        </div>
        <SkeletonBlock height={200} />
      </main>
    );
  }

  if (dash.isError || !dash.data) {
    return (
      <main className="page">
        <h1>Welcome back{firstName ? `, ${firstName}` : ''} 👋</h1>
        <FormAlert message="Couldn’t load your dashboard." />
        <div>
          <button type="button" className="btn btn-primary" onClick={() => dash.refetch()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const s: DashboardSummary = dash.data;
  const { counts } = s;
  const rate = s.completionRate === null ? null : Math.round(s.completionRate * 100);
  const maxOpen = Math.max(1, ...s.workloadBySubject.map((w) => w.open));

  if (counts.total === 0) {
    return (
      <main className="page">
        <h1>Welcome back{firstName ? `, ${firstName}` : ''} 👋</h1>
        <EmptyState
          icon="tasks"
          title="Nothing on your plate yet"
          body="Add your first assignment, project or exam — deadlines, priorities and reminders start here."
          action={
            <Link to="/tasks" className="btn btn-primary">
              <Icon name="plus" /> Create your first task
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Welcome back{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p className="text-muted">Here’s where your academic work stands right now.</p>
        </div>
        <Link to="/tasks" className="btn btn-primary">
          <Icon name="plus" /> New task
        </Link>
      </div>

      <section className="stat-grid" aria-label="Task summary">
        <StatCard label="Completion" value={rate === null ? '—' : `${rate}%`} tone="success" />
        <StatCard label="Open tasks" value={String(counts.pending + counts.inProgress)} />
        <StatCard
          label="Overdue"
          value={String(counts.overdue)}
          tone={counts.overdue > 0 ? 'danger' : undefined}
        />
        <StatCard
          label="Due today"
          value={String(counts.dueToday)}
          tone={counts.dueToday > 0 ? 'warning' : undefined}
        />
        <StatCard label="Next 7 days" value={String(counts.dueThisWeek)} />
        <StatCard label="Unscheduled" value={String(counts.unscheduled)} />
      </section>

      <div className="dash-columns">
        <section className="card" aria-label="Up next">
          <h2>Up next</h2>
          {s.upNext.length === 0 ? (
            <p className="text-muted" role="status">
              Nothing scheduled with a deadline — you’re all caught up 🎉
            </p>
          ) : (
            <ul className="upnext-list">
              {s.upNext.map((t) => {
                const due = formatDue(t.dueAt);
                return (
                  <li key={t.id} className="upnext-item">
                    <button
                      type="button"
                      className="task-check"
                      onClick={() => completeTask.mutate(t)}
                      disabled={completeTask.isPending}
                      aria-label={`Mark ${t.title} as completed`}
                    >
                      <Icon name="circle" />
                    </button>
                    <button
                      type="button"
                      className="upnext-main"
                      onClick={() => navigate('/tasks')}
                      title={due.label}
                    >
                      <span className="upnext-title">{t.title}</span>
                      <span className="upnext-meta">
                        <span className="chip chip-subject">{t.subject}</span>
                        <span className={`chip chip-due-${due.tone}`}>{due.short}</span>
                      </span>
                    </button>
                    <PriorityBadge priority={t.priority} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="stack-lg">
          <section className="card" aria-label="Workload by subject">
            <h2>Workload by subject</h2>
            {s.workloadBySubject.length === 0 ? (
              <p className="text-muted">All subjects are clear.</p>
            ) : (
              <ul className="workload-list">
                {s.workloadBySubject.map((w) => (
                  <li key={w.subject} className="workload-row">
                    <span className="workload-name">{w.subject}</span>
                    <span className="workload-bar" aria-hidden="true">
                      <span
                        className="workload-fill"
                        style={{ width: `${Math.round((w.open / maxOpen) * 100)}%` }}
                      />
                    </span>
                    <span className="workload-count">
                      {w.open} open
                      {w.total !== w.open ? ` · ${w.total} total` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-label="Recent activity">
            <h2>Recent activity</h2>
            {s.recentActivity.length === 0 ? (
              <p className="text-muted">Your completed and new tasks will show up here.</p>
            ) : (
              <ul className="activity-list">
                {s.recentActivity.map((a) => (
                  <li key={`${a.kind}-${a.id}`} className="activity-item">
                    <span
                      className={`activity-icon${a.kind === 'completed' ? ' activity-done' : ''}`}
                      aria-hidden="true"
                    >
                      <Icon name={a.kind === 'completed' ? 'check' : 'plus'} size={14} />
                    </span>
                    <span className="activity-title">{a.title}</span>
                    <span className="activity-when text-muted">{formatDue(a.at).short}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
