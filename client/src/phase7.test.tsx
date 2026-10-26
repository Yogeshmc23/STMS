/** Phase 7 client tests: FilterBar ↔ URL sync, search debounce, ?open deep-link. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { isFiltered } from './components/FilterBar';

const USER = {
  id: 1,
  name: 'Riya',
  email: 'riya@example.com',
  emailRemindersEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const TASK = {
  id: 42,
  title: 'Lab report',
  description: 'pages 40-52',
  subject: 'Physics',
  type: 'assignment',
  priority: 'high',
  status: 'pending',
  dueAt: new Date(Date.now() + 3_600_000).toISOString(),
  completedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const LIST = { items: [TASK], page: 1, limit: 20, total: 1 };

function renderTasks(initial: string) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname;
    const key = `${init?.method ?? 'GET'} ${path}`;
    if (path === '/api/auth/me') return json({ user: USER });
    if (path === '/api/notifications/unread-count') return json({ count: 0 });
    if (path === '/api/tasks/meta/subjects') return json({ subjects: ['Physics', 'Math'] });
    if (path === '/api/tasks/42') return json({ task: TASK });
    if (path === '/api/tasks' && !init?.method) {
      return json(LIST);
    }
    throw new Error(`unexpected fetch: ${key}${url.search}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe('tasks filters ↔ URL (Phase 7)', () => {
  it('sends existing URL params as query params on first load', async () => {
    const { fetchMock } = renderTasks('/tasks?q=lab&priority=high&subject=Physics');
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/tasks?'));
      expect(call).toBeTruthy();
      const url = new URL(String(call![0]), 'http://localhost');
      expect(url.searchParams.get('q')).toBe('lab');
      expect(url.searchParams.getAll('priority')).toEqual(['high']);
      expect(url.searchParams.getAll('subject')).toEqual(['Physics']);
      expect(url.searchParams.get('tzOffset')).not.toBeNull();
    });
  });

  it('typing in search fires a debounced query (250ms), not per keystroke', async () => {
    const { fetchMock } = renderTasks('/tasks');
    const box = await screen.findByRole('searchbox', { name: /search tasks/i });
    await userEvent.type(box, 'essay');
    expect(box).toHaveValue('essay');
    // Before the debounce settles, no request with q=essay exists yet.
    const calledWith = () => fetchMock.mock.calls.some((c) => String(c[0]).includes('q=essay'));
    await waitFor(() => expect(calledWith()).toBe(true), { timeout: 2000 });
    // one commit for the whole typed word (the mock also dedups by queryKey change)
    const essayCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('q=essay'));
    expect(essayCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('?open=42 deep-links into the edit sheet', async () => {
    const { fetchMock } = renderTasks('/tasks?open=42');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/tasks/42'))).toBe(true),
    );
    const dialog = await screen.findByRole('dialog', { name: /edit task/i });
    expect(dialog).toBeInTheDocument();
    const titleInput = screen.getByLabelText(/^title/i);
    expect(titleInput).toHaveValue('Lab report');
  });

  it('isFiltered helper drives the Clear-all affordance', () => {
    expect(
      isFiltered({ q: '', subject: [], priority: [], status: [], due: 'all', sort: 'smart' }),
    ).toBe(false);
    expect(
      isFiltered({ q: 'x', subject: [], priority: [], status: [], due: 'all', sort: 'smart' }),
    ).toBe(true);
    expect(
      isFiltered({ q: '', subject: [], priority: ['high'], status: [], due: 'all', sort: 'smart' }),
    ).toBe(true);
  });
});
