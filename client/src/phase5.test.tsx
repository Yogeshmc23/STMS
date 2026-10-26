/** Phase 5 client tests: bell badge + panel, notifications page actions. */
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

const NOTIF = {
  id: 11,
  kind: 'overdue' as const,
  title: '🔴 Overdue: Lab report',
  body: '“Lab report” was due 2 hours ago. Reschedule it or knock it out now.',
  taskId: 42,
  readAt: null,
  createdAt: new Date(Date.now() - 60_000).toISOString(),
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderApp(routes: Record<string, () => Response>, initialPath = '/') {
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
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

const authRoutes: Record<string, () => Response> = {
  '/api/auth/me': () => jsonResponse({ user: USER }),
  '/api/dashboard/summary': () =>
    jsonResponse({
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
    }),
};

afterEach(() => vi.unstubAllGlobals());

describe('notification bell (Phase 5)', () => {
  it('shows the unread badge and lists recent items in the panel', async () => {
    const { fetchMock } = renderApp(
      {
        ...authRoutes,
        '/api/notifications/unread-count': () => jsonResponse({ count: 3 }),
        'GET /api/notifications': () =>
          jsonResponse({ items: [NOTIF], page: 1, limit: 5, total: 1 }),
        'POST /api/notifications/11/read': () =>
          jsonResponse({ notification: { ...NOTIF, readAt: new Date().toISOString() } }),
      },
      '/',
    );
    const bellBtn = await screen.findByRole('button', { name: /notifications \(3 unread\)/i });
    expect(bellBtn).toBeInTheDocument();
    await userEvent.click(bellBtn);
    const panel = await screen.findByRole('dialog', { name: /recent notifications/i });
    expect(panel).toHaveTextContent('Overdue: Lab report');

    await userEvent.click(screen.getByRole('button', { name: /overdue: lab report/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).includes('/notifications/11/read')),
      ).toBe(true),
    );
  });
});

describe('notifications page (Phase 5)', () => {
  it('renders items and marks all read via POST', async () => {
    const { fetchMock } = renderApp(
      {
        ...authRoutes,
        'GET /api/notifications': () =>
          jsonResponse({ items: [NOTIF], page: 1, limit: 20, total: 1 }),
        'POST /api/notifications/read-all': () => new Response(null, { status: 204 }),
      },
      '/notifications',
    );
    await screen.findByRole('heading', { name: /^notifications$/i });
    await screen.findByText(/was due 2 hours ago/i); // wait for the list query to resolve
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) => String(c[0]).includes('/notifications/read-all')),
      ).toBe(true),
    );
  });

  it('dismiss calls DELETE on the item', async () => {
    const { fetchMock } = renderApp(
      {
        ...authRoutes,
        'GET /api/notifications': () =>
          jsonResponse({ items: [NOTIF], page: 1, limit: 20, total: 1 }),
        'DELETE /api/notifications/11': () => new Response(null, { status: 204 }),
      },
      '/notifications',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: /dismiss: 🔴 overdue: lab report/i }),
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'DELETE')).toBe(
        true,
      ),
    );
  });

  it('shows the all-caught-up empty state', async () => {
    renderApp(
      {
        ...authRoutes,
        'GET /api/notifications': () => jsonResponse({ items: [], page: 1, limit: 20, total: 0 }),
      },
      '/notifications',
    );
    await screen.findByText(/reminders appear automatically/i);
  });
});
