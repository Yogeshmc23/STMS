/** Phase 2 client tests: time helpers (pure) + TaskCard interactions. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@stms/shared';
import { dayDelta, formatDue, fromInputValue, toInputValue } from './utils/time';
import { TaskCard } from './components/TaskCard';

describe('time utils', () => {
  it('dayDelta counts local calendar days', () => {
    const now = new Date('2026-10-26T23:30:00');
    expect(dayDelta('2026-10-26T23:45:00', now)).toBe(0);
    expect(dayDelta('2026-10-27T00:15:00', now)).toBe(1);
    expect(dayDelta('2026-10-25T10:00:00', now)).toBe(-1);
  });

  it('formatDue tones: overdue / today / soon / normal / none', () => {
    const now = new Date('2026-10-26T12:00:00');
    expect(formatDue('2026-10-20T12:00:00', now).tone).toBe('overdue');
    expect(formatDue('2026-10-26T23:00:00', now).tone).toBe('today');
    expect(formatDue('2026-10-27T09:00:00', now).tone).toBe('soon');
    expect(formatDue('2026-12-01T09:00:00', now).tone).toBe('normal');
    expect(formatDue(null).tone).toBe('none');
  });

  it('datetime-local round trip preserves the instant', () => {
    const iso = '2026-11-02T13:00:00.000Z';
    const round = fromInputValue(toInputValue(iso));
    expect(round).toBe(iso);
    expect(fromInputValue('')).toBeNull();
    expect(toInputValue(null)).toBe('');
  });
});

const TASK: Task = {
  id: 7,
  title: 'Lab report',
  description: '',
  subject: 'Physics',
  type: 'assignment',
  priority: 'high',
  status: 'pending',
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('TaskCard', () => {
  it('fires edit and toggle intents', async () => {
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TaskCard task={TASK} onToggleStatus={onToggle} onEdit={onEdit} onDelete={onDelete} />);
    expect(screen.getByText('Lab report')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mark lab report as completed/i }));
    expect(onToggle).toHaveBeenCalledWith(TASK);
    await userEvent.click(screen.getByRole('button', { name: /^edit lab report$/i }));
    expect(onEdit).toHaveBeenCalledWith(TASK);
    await userEvent.click(screen.getByRole('button', { name: /delete lab report/i }));
    expect(onDelete).toHaveBeenCalledWith(TASK);
  });

  it('shows completed styling and reopen label', () => {
    render(
      <TaskCard
        task={{ ...TASK, status: 'completed', completedAt: new Date().toISOString() }}
        onToggleStatus={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /reopen lab report/i })).toBeInTheDocument();
  });
});
