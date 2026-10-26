/** Skeleton loading placeholders (DESIGN.md §6/§7). */

export function SkeletonBlock({
  height = 16,
  width = '100%',
}: {
  height?: number;
  width?: string;
}) {
  return (
    <div className="skeleton" style={{ height, width, borderRadius: 'var(--radius-control)' }} />
  );
}

/** Full-page placeholder while auth bootstrap or a route query is in flight. */
export function PageSkeleton() {
  return (
    <main className="page" aria-busy="true" aria-label="Loading">
      <SkeletonBlock height={28} width="220px" />
      <div className="stack-lg" style={{ marginTop: 'var(--space-6)' }}>
        <SkeletonBlock height={120} />
        <SkeletonBlock height={120} />
        <SkeletonBlock height={80} />
      </div>
    </main>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading items">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} height={64} />
      ))}
    </div>
  );
}
