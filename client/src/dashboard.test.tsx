/** Phase 4 client tests: dashboard renders server aggregates, quick-complete PATCHes. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';

const USER = {
  id: 1,
  name: 'Riya',
  email: 'riya@example.com',
  emailRemindersEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function summaryBody(overrides: Record<string, unknown> = {}) {
  return {
    counts: {
      total: 5,
      pending: 4,
      inProgress: 0,
      completed: 1,
      overdue: 1,
      dueToday: 1,
      dueThisWeek: 2,
      unscheduled: 1,
    },
    completionRate: 0.2,
    upNext: [
      {
        id: 42,
        title: 'Lab report',
        description: '',
        subject: 'Physics',
        type: 'assignment',
        priority: 'high',
        status: 'pending',
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
        completedAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    workloadBySubject: [
      { subject: 'Physics', open: 2, total: 3 },
      { subject: 'Math', open: 1, total: 1 },
    ],
    recentActivity: [
      { id: 42, title: 'Lab report', kind: 'created', at: '2026-10-01T00:00:00.000Z' },
    ],
    ...overrides,
  };
}

function renderApp(route: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\?.*$/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = route[key] ?? route[path];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return handler();
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('dashboard (Phase 4)', () => {
  const authed = { '/api/auth/me': () => json({ user: USER }) };

  it('renders stat cards from server aggregates', async () => {
    renderApp({ ...authed, '/api/dashboard/summary': () => json(summaryBody()) });
    await screen.findByRole('heading', { name: /welcome back, riya/i });
    expect(screen.getByText('20%')).toBeInTheDocument(); // completion rate
    expect(screen.getByText('4')).toBeInTheDocument(); // open tasks
    expect(screen.getByRole('heading', { name: /up next/i })).toBeInTheDocument();
    // "Lab report" appears in both Up next and Recent activity (shared fixture id) — assert both.
    expect(screen.getAllByText('Lab report')).toHaveLength(2);
    // Workload rows live in their own section — scope to avoid the subject-chip collision.
    // Physics: open 2/total 3 → "2 open · 3 total"; Math: open 1/total 1 → "1 open".
    const workload = screen.getByRole('region', { name: /workload by subject/i });
    expect(within(workload).getByText('Physics')).toBeInTheDocument();
    expect(within(workload).getByText('2 open · 3 total')).toBeInTheDocument();
    expect(within(workload).getByText('1 open')).toBeInTheDocument();
  });

  it('shows the zero-data CTA instead of widgets', async () => {
    const zero = summaryBody({
      counts: {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
        dueToday: 0,
        dueThisWeek: 0,
        unscheduled: 0,
      },
      completionRate: null,
      upNext: [],
      workloadBySubject: [],
      recentActivity: [],
    });
    renderApp({ ...authed, '/api/dashboard/summary': () => json(zero) });
    await screen.findByText(/nothing on your plate yet/i);
    expect(screen.getByRole('link', { name: /create your first task/i })).toBeInTheDocument();
  });

  it('quick-complete PATCHes the task and refreshes the dashboard', async () => {
    const { fetchMock } = renderApp({
      ...authed,
      '/api/dashboard/summary': () => json(summaryBody()),
      'PATCH /api/tasks/42': () =>
        json({ task: { ...summaryBody().upNext[0], status: 'completed' } }),
    });
    const btn = await screen.findByRole('button', { name: /mark lab report as completed/i });
    await userEvent.click(btn);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          (c) => String(c[0]).includes('/api/tasks/42') && (c[1] as RequestInit).method === 'PATCH',
        ),
      ).toBe(true),
    );
    expect(await screen.findByRole('status')).toBeInTheDocument(); // toast region
  });
});
