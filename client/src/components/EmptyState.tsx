import type { ReactNode } from 'react';
import { Icon } from './Icons';

/** Shared empty/error state (DESIGN.md §6/§7): icon + explanation + single CTA. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p className="text-muted">{body}</p>
      {action}
    </div>
  );
}
