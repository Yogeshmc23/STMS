/**
 * Phase 1 client tests: login/register forms (validation + server errors),
 * protected-route redirect, and auth bootstrap.
 * The full auth HTTP flow (register/login/logout/expiry) is covered by
 * server/tests/auth.test.ts against the real app — no mocks there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const UNAUTH = () => jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'no' } }, 401);

/** Renders the whole App with a scripted fetch router (path or "METHOD path" → response). */
function renderApp(
  route: Record<string, () => Response> = {},
  { initialPath = '/' }: { initialPath?: string } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = route[key] ?? route[path] ?? (path === '/api/auth/me' ? UNAUTH : undefined);
    if (!handler) throw new Error(`unexpected fetch: ${key}`);
    return handler();
  });
  vi.stubGlobal('fetch', fetchMock);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, fetchMock };
}

const DEMO_USER = {
  id: 1,
  name: 'Riya',
  email: 'riya@example.com',
  emailRemindersEnabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('auth screens (client)', () => {
  it('unauthenticated visit to a protected route lands on the login screen', async () => {
    renderApp();
    await screen.findByRole('heading', { name: /welcome back/i });
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create an account/i })).toBeInTheDocument();
  });

  it('login validates required fields client-side before any request', async () => {
    const { fetchMock } = renderApp({}, { initialPath: '/login' });
    await screen.findByRole('button', { name: /sign in/i });
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(2);
    });
    const loginCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/auth/login'));
    expect(loginCalls).toHaveLength(0);
  });

  it('login submits credentials and routes to the protected app', async () => {
    const { fetchMock } = renderApp(
      { 'POST /api/auth/login': () => jsonResponse({ user: DEMO_USER }) },
      { initialPath: '/login' },
    );
    await userEvent.type(await screen.findByLabelText(/^email/i), 'riya@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'CorrectHorse99');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /welcome back, riya/i })).toBeInTheDocument(),
    );
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/login'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      email: 'riya@example.com',
      password: 'CorrectHorse99',
    });
  });

  it('shows the server error for invalid credentials', async () => {
    renderApp(
      {
        'POST /api/auth/login': () =>
          jsonResponse(
            { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
            401,
          ),
      },
      { initialPath: '/login' },
    );
    await userEvent.type(await screen.findByLabelText(/^email/i), 'riya@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'WrongPass123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument());
  });

  it('register enforces password confirmation before submitting', async () => {
    const { fetchMock } = renderApp({}, { initialPath: '/register' });
    await userEvent.type(await screen.findByLabelText(/^name/i), 'Riya');
    await userEvent.type(screen.getByLabelText(/^email/i), 'riya@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'Sup3rSecret!');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Different1!');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/register'))).toBe(false);
  });

  it('authenticated users get the app shell with nav and profile', async () => {
    renderApp({ '/api/auth/me': () => jsonResponse({ user: DEMO_USER }) });
    await waitFor(() => expect(screen.getByRole('banner')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Your profile' })).toHaveTextContent('Riya');
    expect(screen.getByRole('navigation', { name: /^primary$/i })).toBeInTheDocument();
  });
});
