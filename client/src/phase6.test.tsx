/** Phase 6 client tests: analytics page renders aggregates, toggles period, states. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const OVERVIEW = {
  totals: { created: 10, completed: 4, open: 6, overdue: 2 },
  completionRate: 0.4,
  completedLastPeriod: 3,
  completedPreviousPeriod: 1,
  trend: [
    { date: '2026-10-25', completed: 1, created: 2 },
    { date: '2026-10-26', completed: 2, created: 1 },
  ],
  byPriority: [
    { priority: 'high', open: 3, completed: 1 },
    { priority: 'medium', open: 2, completed: 2 },
    { priority: 'low', open: 1, completed: 1 },
  ],
  bySubject: [
    { subject: 'Mathematics', open: 4, completed: 2 },
    { subject: 'Physics', open: 2, completed: 2 },
  ],
  byType: [{ type: 'exam', open: 2, completed: 1 }],
};

const EMPTY_OVERVIEW = {
  ...OVERVIEW,
  totals: { created: 0, completed: 0, open: 0, overdue: 0 },
  completionRate: null,
  bySubject: [],
  byPriority: [],
  byType: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAt(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\?.*$/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key] ?? routes[path];
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return handler();
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/analytics']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

const auth = { '/api/auth/me': () => json({ user: USER }) };
const zero: Record<string, () => Response> = {
  '/api/notifications/unread-count': () => json({ count: 0 }),
};

afterEach(() => vi.unstubAllGlobals());

describe('analytics page (Phase 6)', () => {
  it('renders stat cards, chart, and distributions', async () => {
    renderAt({
      ...auth,
      ...zero,
      '/api/analytics/overview': () => json(OVERVIEW),
    });
    await screen.findByRole('heading', { name: /analytics/i });
    // async queries resolve in microtasks after the header paints — await each value
    expect(await screen.findByText('40%')).toBeInTheDocument();
    expect(screen.getByText('+200% vs previous period')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /daily activity chart, 2 days/i })).toBeInTheDocument();
    expect(screen.getByText('2/6')).toBeInTheDocument(); // Mathematics done/total
    expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('period toggle re-queries with days=30', async () => {
    const { fetchMock } = renderAt({
      ...auth,
      ...zero,
      '/api/analytics/overview': () => json(OVERVIEW),
    });
    await userEvent.click(await screen.findByRole('button', { name: '30 days' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('days=30'))).toBe(true),
    );
  });

  it('shows the empty state for zero data', async () => {
    renderAt({
      ...auth,
      ...zero,
      '/api/analytics/overview': () => json(EMPTY_OVERVIEW),
    });
    await screen.findByText(/no data to chart yet/i);
  });

  it('shows a retry affordance on error', async () => {
    renderAt({
      ...auth,
      ...zero,
      '/api/analytics/overview': () =>
        json({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500),
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
