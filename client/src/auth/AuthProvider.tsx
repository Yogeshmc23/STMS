/**
 * Auth state (ARCHITECTURE.md §4). The ['me'] bootstrap query runs exactly once
 * on mount; afterward state is owned imperatively:
 * - login/register set the user directly (no refetch needed)
 * - logout clears it
 * - any 401 (event 'stms:unauthorized' from the API client) clears it + flags
 *   sessionExpired, so ProtectedRoute redirects to /login?next=… with an honest
 *   "You were signed out" notice (DESIGN.md §7).
 * A state machine (not a live ['me'] cache) avoids a 401 → invalidate → refetch-401 loop.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LoginInput, RegisterInput, User } from '@stms/shared';
import { authApi } from '../api/endpoints';
import { UNAUTHORIZED_EVENT } from '../api/client';

export type AuthStatus = 'loading' | 'authed' | 'anon';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** True when a live session was killed by a 401 (session expiry notice on /login). */
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Bootstrap: is there a valid session cookie? (401 → anon; other errors → anon too,
  // honest for a login-gated app; user can retry by signing in.)
  const me = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    enabled: !bootstrapped,
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (bootstrapped) return;
    if (me.isSuccess) {
      setUserState(me.data.user);
      setBootstrapped(true);
    } else if (me.isError) {
      setUserState(null);
      setBootstrapped(true);
    }
  }, [me.isSuccess, me.isError, me.data, bootstrapped]);

  // Global sign-out signal from the API client (any request returning 401).
  useEffect(() => {
    const onUnauthorized = () => {
      setUserState((prev) => {
        if (prev !== null) setSessionExpired(true); // only "expired" if we believed we were in
        return null;
      });
      setBootstrapped(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const status: AuthStatus = bootstrapped ? (user ? 'authed' : 'anon') : 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
      setUser: (u: User) => setUserState(u),
      login: async (input) => {
        const res = await authApi.login(input);
        setUserState(res.user);
        setSessionExpired(false);
        setBootstrapped(true);
        return res.user;
      },
      register: async (input) => {
        const res = await authApi.register(input);
        setUserState(res.user);
        setBootstrapped(true);
        return res.user;
      },
      logout: async () => {
        try {
          await authApi.logout();
        } finally {
          setUserState(null);
        }
      },
    }),
    [user, status, sessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
