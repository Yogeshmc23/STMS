/**
 * Route guards (Stage 11): ProtectedRoute enforces auth client-side; the real
 * enforcement is server-side (401s), this is UX only. GuestOnly keeps signed-in
 * users out of the auth screens.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { PageSkeleton } from '../components/Skeleton';

/** Open-redirect guard: only same-site relative paths are honored. */
export function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'anon') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'authed') {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    return <Navigate to={next} replace />;
  }
  return <>{children}</>;
}
