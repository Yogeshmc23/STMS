/** Registration screen (F1). Same zod schema as server + client-only confirm-password check. */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { APP_NAME, LIMITS, registerSchema } from '@stms/shared';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { FormAlert, TextInput } from '../components/FormControls';
import { useZodForm } from '../hooks/useZodForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function RegisterPage() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const navigate = useNavigate();
  const form = useZodForm(registerSchema, { name: '', email: '', password: '' });
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const mismatch = confirm !== form.values.password;
    setConfirmError(mismatch ? 'Passwords do not match.' : undefined);
    const values = form.validate();
    if (!values || mismatch) return;
    setSubmitting(true);
    try {
      await register(values);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && form.applyApiDetails(err.details)) {
          /* field errors shown inline */
        } else if (err.status === 409) {
          setFormError(err.message); // "An account with this email already exists."
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
          <h1>Create your account</h1>
          <p className="text-muted">
            One place for every assignment, project and exam — {APP_NAME}.
          </p>
        </div>

        {formError && <FormAlert message={formError} />}

        <TextInput
          id="reg-name"
          label="Name"
          autoComplete="name"
          required
          maxLength={LIMITS.name}
          placeholder="Riya Sharma"
          value={form.values.name}
          onChange={(v) => form.setField('name', v)}
          error={form.errors.name}
          autoFocus
        />
        <TextInput
          id="reg-email"
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={LIMITS.email}
          placeholder="you@college.edu"
          value={form.values.email}
          onChange={(v) => form.setField('email', v)}
          error={form.errors.email}
        />
        <TextInput
          id="reg-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={LIMITS.passwordMax}
          hint={`At least ${LIMITS.passwordMin} characters.`}
          value={form.values.password}
          onChange={(v) => form.setField('password', v)}
          error={form.errors.password}
        />
        <TextInput
          id="reg-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={LIMITS.passwordMax}
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setConfirmError(undefined);
          }}
          error={confirmError}
        />

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
