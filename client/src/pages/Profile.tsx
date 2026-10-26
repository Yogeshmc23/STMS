/** Profile management (F1): name, email-reminder preference, password. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LIMITS, passwordChangeSchema, profilePatchSchema } from '@stms/shared';
import { ApiError } from '../api/client';
import { authApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { FormAlert, TextInput, Toggle } from '../components/FormControls';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../components/Toast';
import { useZodForm } from '../hooks/useZodForm';

export function ProfilePage() {
  useDocumentTitle('Profile');
  const { user, setUser } = useAuth();
  const { push } = useToast();
  const [savingName, setSavingName] = useState(false);
  const [togglingReminders, setTogglingReminders] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);
  const initialName = useRef(user?.name ?? '');

  const profileForm = useZodForm(profilePatchSchema, { name: user?.name ?? '' });
  useEffect(() => {
    if (user) {
      profileForm.reset({ name: user.name });
      initialName.current = user.name;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from user object only
  }, [user?.name]);

  const pwdForm = useZodForm(passwordChangeSchema, { currentPassword: '', newPassword: '' });

  if (!user) return null; // guarded by ProtectedRoute

  const nameDirty =
    profileForm.values.name !== undefined && profileForm.values.name.trim() !== initialName.current;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const values = profileForm.validate();
    if (!values || !values.name) return;
    setSavingName(true);
    try {
      const res = await authApi.patchProfile({ name: values.name });
      setUser(res.user);
      push('success', 'Profile updated.');
    } catch (err) {
      push('danger', err instanceof ApiError ? err.message : 'Could not save — try again.');
    } finally {
      setSavingName(false);
    }
  };

  const toggleReminders = async (checked: boolean) => {
    setTogglingReminders(true);
    try {
      const res = await authApi.patchProfile({ emailRemindersEnabled: checked });
      setUser(res.user);
      push('success', checked ? 'Email reminders enabled.' : 'Email reminders disabled.');
    } catch (err) {
      push('danger', err instanceof ApiError ? err.message : 'Could not update preference.');
    } finally {
      setTogglingReminders(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    const values = pwdForm.validate();
    if (!values) return;
    setPwdSaving(true);
    try {
      await authApi.changePassword(values);
      pwdForm.reset({ currentPassword: '', newPassword: '' });
      push('success', 'Password changed. Other sessions stay signed in.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPwdError('Current password is incorrect.');
      } else if (err instanceof ApiError && err.status === 400 && err.details) {
        pwdForm.applyApiDetails(err.details);
      } else {
        setPwdError('Could not change password. Try again.');
      }
    } finally {
      setPwdSaving(false);
    }
  };

  const memberSince = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
    new Date(user.createdAt),
  );

  return (
    <main className="page">
      <div className="page-head">
        <h1>Profile</h1>
        <p className="text-muted">
          {user.email} · member since {memberSince}
        </p>
      </div>

      <div className="stack-lg">
        <form className="card" onSubmit={saveName} noValidate aria-label="Account details">
          <h2>Account</h2>
          <div className="stack">
            <TextInput
              id="profile-name"
              label="Display name"
              required
              maxLength={LIMITS.name}
              value={profileForm.values.name ?? ''}
              onChange={(v) => profileForm.setField('name', v)}
              error={profileForm.errors.name}
            />
            <div className="field">
              <span className="field-label">Email</span>
              <input className="input" value={user.email} readOnly aria-readonly="true" disabled />
              <p className="field-hint">
                Your email is your sign-in identity and can’t be changed in this version.
              </p>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={!nameDirty || savingName}>
                {savingName ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>

        <section className="card" aria-label="Reminder preferences">
          <h2>Reminders</h2>
          <Toggle
            id="pref-email-reminders"
            label="Email me about upcoming deadlines"
            hint="In-app reminders are always on. Emails are sent only when the server has an email account configured; otherwise reminders stay in-app."
            checked={user.emailRemindersEnabled}
            onChange={toggleReminders}
            disabled={togglingReminders}
          />
        </section>

        <form className="card" onSubmit={changePassword} noValidate aria-label="Change password">
          <h2>Security</h2>
          {pwdError && <FormAlert message={pwdError} />}
          <div className="stack">
            <TextInput
              id="pwd-current"
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={LIMITS.passwordMax}
              value={pwdForm.values.currentPassword}
              onChange={(v) => pwdForm.setField('currentPassword', v)}
              error={pwdForm.errors.currentPassword}
            />
            <TextInput
              id="pwd-new"
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              maxLength={LIMITS.passwordMax}
              hint={`At least ${LIMITS.passwordMin} characters.`}
              value={pwdForm.values.newPassword}
              onChange={(v) => pwdForm.setField('newPassword', v)}
              error={pwdForm.errors.newPassword}
            />
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={pwdSaving}>
                {pwdSaving ? 'Updating…' : 'Change password'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
