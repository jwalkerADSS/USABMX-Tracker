'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { PasswordInput } from './password-input';
import { adminReset, changeMyPassword, requestReset, signUp, type FormState } from './auth-actions';

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  return (
    <form action={action} className="card stack">
      <h2>Sign up</h2>
      <label>
        Username
        <input name="username" defaultValue={state.username} autoComplete="username" autoCapitalize="none" autoCorrect="off"
          required minLength={3} maxLength={20} pattern="[A-Za-z0-9_.\-]+" />
        <span className="muted small">3 to 20 letters, numbers, dots, dashes or underscores.</span>
      </label>
      <label>
        Password
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Confirm password
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={state.email} autoComplete="email" required />
        <span className="muted small">Only used to reset your password.</span>
      </label>
      <label>
        Invite code
        <input name="code" autoComplete="off" autoCapitalize="none" autoCorrect="off" required />
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
      <Link href="/login" className="auth-link">Already have an account? Sign in</Link>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestReset, {});
  if (state.done) {
    return (
      <div className="card stack">
        <h2>Reset requested</h2>
        {state.mailto ? (
          <>
            <p>One more step: send the request email so the admin sees it. It opens in your email app, ready to send.</p>
            <a href={state.mailto} className="button">Email the admin</a>
          </>
        ) : null}
        <p className="muted">
          The admin will email you a temporary password at the address on your account. Sign in with it, and you&apos;ll
          choose a new password right away.
        </p>
        <Link href="/login" className="auth-link">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card stack">
      <h2>Forgot password</h2>
      <p className="muted">Ask for a reset and the admin will email you a temporary password.</p>
      <label>
        Username
        <input name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Reset password'}</button>
      <Link href="/login" className="auth-link">Back to sign in</Link>
    </form>
  );
}

export function ChangePasswordForm({ temporary }: { temporary: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeMyPassword, {});
  return (
    <form action={action} className="card stack">
      <h1>{temporary ? 'Choose a new password' : 'Change password'}</h1>
      {temporary ? <p className="muted">You signed in with a temporary password. Pick your own to keep going.</p> : null}
      <label>
        {temporary ? 'Temporary password' : 'Current password'}
        <PasswordInput name="current" autoComplete="current-password" required />
      </label>
      <label>
        New password
        <PasswordInput name="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Confirm new password
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={8} />
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save password'}</button>
    </form>
  );
}

// One per account on the admin page.
export function AdminResetForm({ username }: { username?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(adminReset, {});
  if (state.done) {
    return (
      <div className="admin-result stack">
        <p>
          Temporary password for <strong>{state.username}</strong>: <code className="temp-password">{state.password}</code>
        </p>
        <a href={state.mailto} className="button">Email it to {state.email}</a>
        <p className="muted small">This is the only time it&apos;s shown. They&apos;ll choose a new password when they sign in.</p>
      </div>
    );
  }
  return (
    <form action={action} className="admin-reset">
      {username ? (
        <input type="hidden" name="username" value={username} />
      ) : (
        <input name="username" placeholder="Username" autoCapitalize="none" autoCorrect="off" required />
      )}
      <button type="submit" disabled={pending}>{pending ? 'Resetting…' : 'Set temporary password'}</button>
      {state.error ? <p className="error">{state.error}</p> : null}
    </form>
  );
}
