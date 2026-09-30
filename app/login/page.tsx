import Link from 'next/link';
import { PasswordInput } from '../password-input';

export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  '1': 'That username or password didn’t match.',
  locked: 'Too many wrong passwords. Wait 15 minutes, or reset your password.',
  setup: 'Accounts aren’t set up on this site yet.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="login">
      <h1>BMX Tracker</h1>
      <form method="post" action="/api/login" className="card stack">
        <h2>Sign in</h2>
        <label>
          Username
          <input name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
        </label>
        <label>
          Password
          <PasswordInput name="password" autoComplete="current-password" required />
        </label>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {error ? <p className="error">{ERRORS[error] ?? ERRORS['1']}</p> : null}
        <button type="submit">Sign in</button>
        <Link href="/forgot" className="auth-link">Forgot password?</Link>
      </form>
      <div className="card stack signup-cta">
        <p>New here? Create an account with the invite code you were given.</p>
        <Link href="/signup" className="button secondary">Sign up</Link>
      </div>
    </main>
  );
}
