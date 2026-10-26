/**
 * FilterBar (F9, DESIGN.md §6): debounced full-text search, subject/priority/
 * status multi-selects, deadline buckets, sort — all reflected in URL query
 * params by the parent (shareable links, working back button).
 */
import { useEffect, useRef, useState } from 'react';
import type { DueBucket, TaskPriority, TaskSort, TaskStatus } from '@stms/shared';
import { Icon } from './Icons';

export interface TaskFilters {
  q: string;
  subject: string[];
  priority: TaskPriority[];
  status: TaskStatus[];
  due: DueBucket | 'all';
  sort: TaskSort;
}

const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
};
const BUCKET_LABEL: Record<DueBucket | 'all', string> = {
  all: 'All',
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Next 7 days',
  later: 'Later',
  none: 'Unscheduled',
};
const SORT_LABEL: Record<TaskSort, string> = {
  smart: 'Smart (overdue → due → priority)',
  due_asc: 'Due date ↑',
  due_desc: 'Due date ↓',
  priority_desc: 'Priority',
  created_desc: 'Newest first',
  title_asc: 'Title A–Z',
};

export function isFiltered(f: TaskFilters): boolean {
  return (
    Boolean(f.q) ||
    f.subject.length > 0 ||
    f.priority.length > 0 ||
    f.status.length > 0 ||
    f.due !== 'all'
  );
}

export function FilterBar({
  filters,
  subjectOptions,
  onChange,
}: {
  filters: TaskFilters;
  subjectOptions: string[];
  onChange: (patch: Partial<TaskFilters>) => void;
}) {
  const [text, setText] = useState(filters.q);
  const lastExternal = useRef(filters.q);

  // Debounced commit; resync when URL changes externally (back button, clear).
  useEffect(() => {
    if (filters.q !== lastExternal.current) {
      lastExternal.current = filters.q;
      setText(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (text === lastExternal.current) return;
    const t = setTimeout(() => {
      lastExternal.current = text;
      onChange({ q: text });
    }, 250);
    return () => clearTimeout(t);
  }, [text, onChange]);

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="filter-bar card">
      <form
        className="filter-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          lastExternal.current = text;
          onChange({ q: text });
        }}
      >
        <label className="sr-only" htmlFor="task-search">
          Search tasks
        </label>
        <span className="filter-search-icon" aria-hidden="true">
          <Icon name="search" size={16} />
        </span>
        <input
          id="task-search"
          className="input input-compact"
          type="search"
          placeholder="Search title, notes, subject…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </form>

      <div className="filter-groups">
        <div className="filter-group" role="group" aria-label="Deadline filter">
          {(['all', 'overdue', 'today', 'week', 'later', 'none'] as const).map((b) => (
            <button
              key={b}
              type="button"
              className={`seg ${filters.due === b ? 'seg-active' : ''}`}
              aria-pressed={filters.due === b}
              onClick={() => onChange({ due: b })}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Priority filter">
          {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`seg ${filters.priority.includes(p) ? 'seg-active' : ''}`}
              aria-pressed={filters.priority.includes(p)}
              onClick={() => onChange({ priority: toggle(filters.priority, p) })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Status filter">
          {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`seg ${filters.status.includes(s) ? 'seg-active' : ''}`}
              aria-pressed={filters.status.includes(s)}
              onClick={() => onChange({ status: toggle(filters.status, s) })}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {subjectOptions.length > 0 && (
          <div className="filter-group" role="group" aria-label="Subject filter">
            {subjectOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`seg ${filters.subject.includes(s) ? 'seg-active' : ''}`}
                aria-pressed={filters.subject.includes(s)}
                onClick={() => onChange({ subject: toggle(filters.subject, s) })}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="filter-foot">
        <label className="sort-control">
          <span className="sr-only">Sort tasks</span>
          <select
            className="input input-compact"
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as TaskSort })}
          >
            {(Object.keys(SORT_LABEL) as TaskSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {isFiltered(filters) && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              lastExternal.current = '';
              setText('');
              onChange({ q: '', subject: [], priority: [], status: [], due: 'all' });
            }}
          >
            <Icon name="x" size={14} /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
