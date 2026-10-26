/**
 * Progress analytics (F8): completion rate, period-over-period productivity,
 * daily trend, and workload distributions — all server-computed aggregates.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { DistributionBars, TrendChart } from '../components/charts/Charts';
import { EmptyState } from '../components/EmptyState';
import { FormAlert } from '../components/FormControls';
import { SkeletonBlock } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

function deltaLabel(cur: number, prev: number): string {
  const diff = cur - prev;
  if (prev === 0 && cur === 0) return 'no activity yet';
  if (prev === 0) return `+${cur} vs previous period`;
  const pct = Math.round((diff / prev) * 100);
  if (diff === 0) return 'steady vs previous period';
  return `${diff > 0 ? '+' : ''}${pct}% vs previous period`;
}

export function AnalyticsPage() {
  useDocumentTitle('Analytics');
  const [days, setDays] = useState<14 | 30>(14);

  const q = useQuery({
    queryKey: ['analytics', days],
    queryFn: () => analyticsApi.overview(days),
  });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="text-muted">How your work moves — computed from your real task history.</p>
        </div>
        <div className="seg-row" role="group" aria-label="Period">
          {([14, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`seg ${days === d ? 'seg-active' : ''}`}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <div className="stack">
          <div className="stat-grid">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} height={88} />
            ))}
          </div>
          <SkeletonBlock height={220} />
        </div>
      ) : q.isError ? (
        <div className="card stack">
          <FormAlert
            message={`Analytics failed to load: ${q.error instanceof ApiError ? q.error.message : 'unknown error'}`}
          />
          <div>
            <button type="button" className="btn btn-primary" onClick={() => q.refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : q.data.totals.created === 0 ? (
        <EmptyState
          icon="chart"
          title="No data to chart yet"
          body="Create and complete a few tasks — trends, rates and workload appear as soon as there is history."
        />
      ) : (
        <>
          <section className="stat-grid" aria-label="Totals">
            <div className="card stat-card">
              <span className="stat-value">
                {q.data.completionRate === null
                  ? '—'
                  : `${Math.round(q.data.completionRate * 100)}%`}
              </span>
              <span className="stat-label">All-time completion</span>
            </div>
            <div className="card stat-card">
              <span className="stat-value">{q.data.completedLastPeriod}</span>
              <span className="stat-label">Completed · last {days} days</span>
              <span className="stat-delta text-muted">
                {deltaLabel(q.data.completedLastPeriod, q.data.completedPreviousPeriod)}
              </span>
            </div>
            <div className="card stat-card">
              <span className="stat-value">{q.data.totals.open}</span>
              <span className="stat-label">Open now</span>
            </div>
            <div className={`card stat-card${q.data.totals.overdue > 0 ? ' stat-danger' : ''}`}>
              <span className="stat-value">{q.data.totals.overdue}</span>
              <span className="stat-label">Overdue</span>
            </div>
          </section>

          <section className="card" aria-label="Daily activity">
            <h2>Daily activity</h2>
            <TrendChart trend={q.data.trend} />
          </section>

          <div className="analytics-columns">
            <section className="card" aria-label="By subject">
              <h2>
                By subject <span className="text-muted chart-hint">done/total</span>
              </h2>
              <DistributionBars
                rows={q.data.bySubject.map((s) => ({
                  name: s.subject,
                  open: s.open,
                  completed: s.completed,
                }))}
                emptyLabel="No subjects yet."
              />
            </section>
            <section className="card" aria-label="By priority">
              <h2>By priority</h2>
              <DistributionBars
                rows={q.data.byPriority.map((p) => ({
                  name: p.priority === 'high' ? 'High' : p.priority === 'low' ? 'Low' : 'Medium',
                  open: p.open,
                  completed: p.completed,
                }))}
                emptyLabel="No priorities set yet."
              />
            </section>
            <section className="card" aria-label="By type">
              <h2>By type</h2>
              <DistributionBars
                rows={q.data.byType.map((t) => ({
                  name: t.type.charAt(0).toUpperCase() + t.type.slice(1).replace('_', ' '),
                  open: t.open,
                  completed: t.completed,
                }))}
                emptyLabel="No task types yet."
              />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
