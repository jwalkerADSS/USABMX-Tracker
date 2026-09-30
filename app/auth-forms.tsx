'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { chooseNewPassword, requestReset, signUp, type FormState } from './auth-actions';

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
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Confirm password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
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
        <h2>Check your email</h2>
        <p>If that account has an email address, a reset link is on its way. It works once, for the next hour.</p>
        <Link href="/login" className="auth-link">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card stack">
      <h2>Forgot password</h2>
      <label>
        Username or email
        <input name="who" autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Email me a reset link'}</button>
      <Link href="/login" className="auth-link">Back to sign in</Link>
    </form>
  );
}

export function ResetForm({ token, name }: { token: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(chooseNewPassword, {});
  return (
    <form action={action} className="card stack">
      <h2>New password for {name}</h2>
      <input type="hidden" name="token" value={token} />
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      <label>
        Confirm password
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </label>
      {state.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save and sign in'}</button>
    </form>
  );
}
