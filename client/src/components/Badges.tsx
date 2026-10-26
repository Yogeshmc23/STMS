/**
 * Priority / status / due badges (DESIGN.md §6). Priority is conveyed with
 * dot + label, never color alone (accessibility).
 */
import type { TaskPriority, TaskStatus } from '@stms/shared';
import { formatDue } from '../utils/time';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const label = priority === 'high' ? 'High' : priority === 'low' ? 'Low' : 'Medium';
  return (
    <span className={`badge badge-${priority}`}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
};

export function StatusChip({ status }: { status: TaskStatus }) {
  return <span className={`chip chip-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function DueBadge({ dueAt, completed }: { dueAt: string | null; completed?: boolean }) {
  const view = formatDue(dueAt);
  if (completed && view.tone !== 'none') {
    return (
      <span className="chip chip-muted" title={view.label}>
        {view.short}
      </span>
    );
  }
  return (
    <span className={`chip chip-due-${view.tone}`} title={view.label}>
      {view.short}
    </span>
  );
}
