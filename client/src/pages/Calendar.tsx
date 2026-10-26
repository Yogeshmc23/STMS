/**
 * Calendar page (F6): month / week / day views fed by ONE range endpoint per
 * visible grid. Tasks without due dates never appear on the grid — they are
 * surfaced in the day view's "Unscheduled" section instead (API.md).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Task } from '@stms/shared';
import { calendarApi, tasksApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import {
  dayKey,
  dayRangeUtc,
  monthRangeUtc,
  monthTitle,
  stepDate,
  weekRangeUtc,
  weekTitle,
} from '../utils/calendar';
import { CalendarDay, CalendarMonth, CalendarWeek } from '../components/calendar/CalendarViews';
import { FormAlert } from '../components/FormControls';
import { Icon } from '../components/Icons';
import { SkeletonBlock } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useNavigate } from 'react-router-dom';

type View = 'month' | 'week' | 'day';

export function CalendarPage() {
  useDocumentTitle('Calendar');
  const navigate = useNavigate();
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const today = useMemo(() => new Date(), []);

  const range = useMemo(() => {
    if (view === 'month') return monthRangeUtc(anchor);
    if (view === 'week') return weekRangeUtc(anchor);
    return dayRangeUtc(anchor);
  }, [view, anchor]);

  const cal = useQuery({
    queryKey: ['calendar', range.from, range.to],
    queryFn: () => calendarApi.range(new Date(range.from), new Date(range.to)),
  });

  const unscheduled = useQuery({
    queryKey: ['tasks-unscheduled'],
    queryFn: () => tasksApi.list({ page: 1, limit: 50, sort: 'created_desc', due: 'none' }),
    enabled: view === 'day',
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of cal.data?.tasks ?? []) {
      if (!t.dueAt) continue;
      const key = dayKey(new Date(t.dueAt));
      const arr = map.get(key);
      if (arr) arr.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [cal.data]);

  const title =
    view === 'month' ? monthTitle(anchor) : view === 'week' ? weekTitle(anchor) : dayKey(anchor);

  const selectDay = (day: Date) => {
    setAnchor(day);
    setView('day');
  };

  const shift = (dir: 1 | -1) => setAnchor((a) => stepDate(a, view, dir));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="text-muted">Weeks start Monday · click any day for detail.</p>
        </div>
        <div className="cal-toolbar">
          <div className="seg-row" role="group" aria-label="Calendar view">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`seg ${view === v ? 'seg-active' : ''}`}
                onClick={() => setView(v)}
                aria-pressed={view === v}
              >
                {v === 'month' ? 'Month' : v === 'week' ? 'Week' : 'Day'}
              </button>
            ))}
          </div>
          <div className="cal-nav">
            <button
              type="button"
              className="icon-btn"
              onClick={() => shift(-1)}
              aria-label="Previous"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setAnchor(new Date())}
            >
              Today
            </button>
            <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Next">
              <Icon name="chevron-right" />
            </button>
          </div>
        </div>
      </div>

      <h2 className="cal-title">{title}</h2>

      {cal.isPending ? (
        <div className="stack">
          <SkeletonBlock height={42} />
          <SkeletonBlock height={360} />
        </div>
      ) : cal.isError ? (
        <FormAlert
          message={`Calendar failed to load: ${cal.error instanceof ApiError ? cal.error.message : 'unknown error'}`}
        />
      ) : view === 'month' ? (
        <CalendarMonth
          anchor={anchor}
          tasksByDay={tasksByDay}
          today={today}
          onSelectDay={selectDay}
        />
      ) : view === 'week' ? (
        <CalendarWeek
          anchor={anchor}
          tasksByDay={tasksByDay}
          today={today}
          onSelectDay={selectDay}
        />
      ) : (
        <CalendarDay
          day={anchor}
          tasks={tasksByDay.get(dayKey(anchor)) ?? []}
          unscheduled={unscheduled.data?.items ?? []}
          onGoToTasks={() => navigate('/tasks')}
        />
      )}
    </main>
  );
}
