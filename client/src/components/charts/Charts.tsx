/**
 * Hand-rolled SVG charts (DESIGN.md: no chart-lib dependency). Both charts ship
 * text labels — never color/shape alone — so they stay readable and accessible.
 */
import type { AnalyticsOverview } from '@stms/shared';

/** Grouped daily bars: created vs completed, last 14/30 days. */
export function TrendChart({ trend }: { trend: AnalyticsOverview['trend'] }) {
  const W = 640;
  const H = 180;
  const pad = { t: 10, b: 22, l: 4, r: 4 };
  const max = Math.max(1, ...trend.map((p) => Math.max(p.created, p.completed)));
  const groupW = (W - pad.l - pad.r) / Math.max(1, trend.length);
  const barW = Math.min(10, groupW / 2.4);

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Daily activity chart, ${trend.length} days`}
        preserveAspectRatio="none"
        className="chart-svg"
      >
        {trend.map((p, i) => {
          const x = pad.l + i * groupW + groupW / 2;
          const hCreated = (p.created / max) * (H - pad.t - pad.b);
          const hDone = (p.completed / max) * (H - pad.t - pad.b);
          return (
            <g key={p.date}>
              <title>{`${p.date}: ${p.created} created, ${p.completed} completed`}</title>
              <rect
                x={x - barW - 1}
                y={H - pad.b - hCreated}
                width={barW}
                height={Math.max(p.created > 0 ? 2 : 0, hCreated)}
                className="bar bar-created"
                rx={2}
              />
              <rect
                x={x + 1}
                y={H - pad.b - hDone}
                width={barW}
                height={Math.max(p.completed > 0 ? 2 : 0, hDone)}
                className="bar bar-done"
                rx={2}
              />
            </g>
          );
        })}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="chart-axis" />
      </svg>
      <div className="chart-caption">
        <span className="legend">
          <i className="sw sw-created" aria-hidden="true" /> Created
        </span>
        <span className="legend">
          <i className="sw sw-done" aria-hidden="true" /> Completed
        </span>
        <span className="text-muted">peak: {max}/day · hover bars for exact values</span>
      </div>
    </div>
  );
}

/** Horizontal distribution bars with numeric labels. */
export function DistributionBars({
  rows,
  emptyLabel,
}: {
  rows: { name: string; open: number; completed: number }[];
  emptyLabel: string;
}) {
  if (rows.length === 0) return <p className="text-muted">{emptyLabel}</p>;
  const max = Math.max(1, ...rows.map((r) => r.open + r.completed));
  return (
    <ul className="dist-list">
      {rows.map((r) => {
        const total = r.open + r.completed;
        return (
          <li key={r.name} className="dist-row">
            <span className="dist-name" title={r.name}>
              {r.name}
            </span>
            <span className="dist-bar" aria-hidden="true">
              <span
                className="dist-seg dist-done"
                style={{ width: `${(r.completed / max) * 100}%` }}
              />
              <span className="dist-seg dist-open" style={{ width: `${(r.open / max) * 100}%` }} />
            </span>
            <span className="dist-count">{total === 0 ? '0' : `${r.completed}/${total}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
