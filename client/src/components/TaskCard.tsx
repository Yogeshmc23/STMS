/**
 * Task row/card (DESIGN.md §6): status toggle, badges, edit/delete actions.
 * Whole header area is clickable to edit; actions are keyboard-reachable.
 */
import type { Task } from '@stms/shared';
import { DueBadge, PriorityBadge, StatusChip } from './Badges';
import { Icon } from './Icons';

export function TaskCard({
  task,
  onToggleStatus,
  onEdit,
  onDelete,
  busy,
}: {
  task: Task;
  onToggleStatus: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  busy?: boolean;
}) {
  const done = task.status === 'completed';
  return (
    <article className={`card task-card${done ? ' task-card-done' : ''}`}>
      <button
        type="button"
        className="task-check"
        onClick={() => onToggleStatus(task)}
        disabled={busy}
        aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} as completed`}
        title={done ? 'Reopen task' : 'Mark completed'}
      >
        <Icon name={done ? 'check-circle' : 'circle'} />
      </button>

      <button type="button" className="task-main" onClick={() => onEdit(task)} disabled={busy}>
        <span className={`task-title${done ? ' task-title-done' : ''}`}>{task.title}</span>
        <span className="task-meta">
          <span className="chip chip-subject">{task.subject}</span>
          <DueBadge dueAt={task.dueAt} completed={done} />
          <StatusChip status={task.status} />
        </span>
        {task.description ? <span className="task-desc">{task.description}</span> : null}
      </button>

      <div className="task-side">
        <PriorityBadge priority={task.priority} />
        <div className="task-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onEdit(task)}
            aria-label={`Edit ${task.title}`}
            disabled={busy}
          >
            <Icon name="pencil" />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => onDelete(task)}
            aria-label={`Delete ${task.title}`}
            disabled={busy}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </article>
  );
}
