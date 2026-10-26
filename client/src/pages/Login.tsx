/** Login screen (F1). Client pre-validates with the SAME zod schema the server uses. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { APP_NAME, LIMITS, loginSchema } from '@stms/shared';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { safeNext } from '../auth/ProtectedRoute';
import { FormAlert, FormStatus, TextInput } from '../components/FormControls';
import { useZodForm } from '../hooks/useZodForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const form = useZodForm(loginSchema, { email: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const values = form.validate();
    if (!values) return;
    setSubmitting(true);
    try {
      await login(values);
      navigate(next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && form.applyApiDetails(err.details)) {
          /* field errors already shown */
        } else if (err.status === 401) {
          setFormError('Invalid email or password.');
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Welcome back</h1>
          <p className="text-muted">Sign in to {APP_NAME} to see your deadlines.</p>
        </div>

        {sessionExpired && (
          <FormStatus message="You were signed out — your session expired. Sign in again to continue." />
        )}
        {formError && <FormAlert message={formError} />}

        <TextInput
          id="login-email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={LIMITS.email}
          value={form.values.email}
          onChange={(v) => form.setField('email', v)}
          error={form.errors.email}
          autoFocus
        />
        <TextInput
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={LIMITS.passwordMax}
          value={form.values.password}
          onChange={(v) => form.setField('password', v)}
          error={form.errors.password}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-alt">
          New here?{' '}
          <Link to={`/register${params.get('next') ? `?next=${params.get('next')}` : ''}`}>
            Create an account
          </Link>
        </p>
      </form>
    </main>
  );
}
