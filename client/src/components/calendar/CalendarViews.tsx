/**
 * Calendar views (F6, DESIGN.md §6): month grid, week columns, day detail.
 * Data is grouped by LOCAL due-day; clicks in month/week drill into day view.
 */
import type { Task } from '@stms/shared';
import {
  dayKey,
  isSameDay,
  isSameMonth,
  monthMatrix,
  startOfWeek,
  WEEKDAYS,
  addDays,
} from '../../utils/calendar';
import { Icon } from '../Icons';

type DayMap = Map<string, Task[]>;

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function CalendarMonth({
  anchor,
  tasksByDay,
  today,
  onSelectDay,
}: {
  anchor: Date;
  tasksByDay: DayMap;
  today: Date;
  onSelectDay: (day: Date) => void;
}) {
  const cells = monthMatrix(anchor);
  return (
    <div className="cal-wrap">
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {cells.map((day) => {
          const tasks = tasksByDay.get(dayKey(day)) ?? [];
          const other = !isSameMonth(day, anchor);
          const cls = [
            'cal-cell',
            other ? 'cal-cell-other' : '',
            isSameDay(day, today) ? 'cal-cell-today' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const visible = tasks.slice(0, 3);
          const extra = tasks.length - visible.length;
          return (
            <button
              type="button"
              key={day.toISOString()}
              className={cls}
              onClick={() => onSelectDay(day)}
              aria-label={`${dayKey(day)}${tasks.length ? ` — ${tasks.length} task${tasks.length === 1 ? '' : 's'}` : ''}`}
            >
              <span className="cal-daynum">{day.getDate()}</span>
              <span className="cal-chips">
                {visible.map((t) => (
                  <span key={t.id} className="cal-chip">
                    <span className={`dot dot-${t.priority}`} aria-hidden="true" />
                    <span className="cal-chip-text">{t.title}</span>
                  </span>
                ))}
                {extra > 0 ? <span className="cal-more">+{extra} more</span> : null}
              </span>
              <span className="cal-dots" aria-hidden="true">
                {tasks.slice(0, 4).map((t) => (
                  <span key={t.id} className={`dot dot-${t.priority}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColTasks({ day, tasksByDay }: { day: Date; tasksByDay: DayMap }) {
  const tasks = tasksByDay.get(dayKey(day)) ?? [];
  return (
    <div className="cal-col-body">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={`cal-item cal-item-${t.priority}${t.status === 'completed' ? ' cal-item-done' : ''}`}
        >
          <span className={`dot dot-${t.priority}`} aria-hidden="true" />
          <span className="cal-item-time">{timeLabel(t.dueAt!)}</span>
          <span className="cal-item-title">{t.title}</span>
        </div>
      ))}
      {tasks.length === 0 ? <span className="cal-empty">—</span> : null}
    </div>
  );
}

export function CalendarWeek({
  anchor,
  tasksByDay,
  today,
  onSelectDay,
}: {
  anchor: Date;
  tasksByDay: DayMap;
  today: Date;
  onSelectDay: (day: Date) => void;
}) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="cal-week">
      {days.map((day, i) => (
        <div key={i} className={`cal-col${isSameDay(day, today) ? ' cal-col-today' : ''}`}>
          <button type="button" className="cal-col-head" onClick={() => onSelectDay(day)}>
            <span className="cal-col-weekday">{WEEKDAYS[i]}</span>
            <span className="cal-col-daynum">{day.getDate()}</span>
          </button>
          <ColTasks day={day} tasksByDay={tasksByDay} />
        </div>
      ))}
    </div>
  );
}

export function CalendarDay({
  day,
  tasks,
  unscheduled,
  onGoToTasks,
}: {
  day: Date;
  tasks: Task[];
  unscheduled: Task[];
  onGoToTasks: () => void;
}) {
  return (
    <div className="cal-day">
      <section aria-label="Tasks due this day">
        <h3>Due {dayKey(day)}</h3>
        {tasks.length === 0 ? (
          <p className="text-muted" role="status">
            Nothing due on this day.
          </p>
        ) : (
          <ul className="cal-day-list">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={`cal-item cal-item-${t.priority}${t.status === 'completed' ? ' cal-item-done' : ''}`}
              >
                <span className={`dot dot-${t.priority}`} aria-hidden="true" />
                <span className="cal-item-time">{timeLabel(t.dueAt!)}</span>
                <span className="cal-item-title">
                  {t.title} <span className="text-muted">· {t.subject}</span>
                </span>
                <span className={`badge badge-${t.priority}`}>
                  <span className="badge-dot" aria-hidden="true" />
                  {t.priority === 'high' ? 'High' : t.priority === 'low' ? 'Low' : 'Medium'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Unscheduled tasks">
        <h3>Unscheduled</h3>
        {unscheduled.length === 0 ? (
          <p className="text-muted" role="status">
            Everything has a deadline — nice.
          </p>
        ) : (
          <ul className="cal-day-list">
            {unscheduled.slice(0, 10).map((t) => (
              <li key={t.id} className="cal-item cal-item-flat">
                <Icon name="circle" size={16} />
                <span className="cal-item-title">
                  {t.title} <span className="text-muted">· {t.subject}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-secondary btn-small" onClick={onGoToTasks}>
          Manage in Tasks
        </button>
      </section>
    </div>
  );
}
