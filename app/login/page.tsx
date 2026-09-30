import Link from 'next/link';
import { PasswordInput } from '../password-input';

export const metadata = { title: 'Sign in' };

const ERRORS: Record<string, string> = {
  '1': 'That username or password didn’t match.',
  locked: 'Too many wrong passwords. Wait 15 minutes, or reset your password.',
  setup: 'Accounts aren’t set up on this site yet.',
  removed: 'Your account has been deleted. Please contact the admin.',
  trial: 'Your free trial has ended. Ask the admin to renew it, then sign in again.',
};

// The "Email the admin" button for an ended trial or a deleted account.
const ADMIN_MAIL: Record<string, { subject: string; body: string }> = {
  trial: { subject: 'BMX Tracker trial renewal', body: 'Hi, my BMX Tracker trial has ended. Please renew it. My username is: ' },
  removed: { subject: 'BMX Tracker account deleted', body: 'Hi, my BMX Tracker account was deleted. Can you help? My username is: ' },
};

function adminMailto(error: string | undefined): string | null {
  const admin = process.env.ADMIN_EMAIL;
  const mail = error ? ADMIN_MAIL[error] : undefined;
  return admin && mail ? `mailto:${admin}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}` : null;
}

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
        {adminMailto(error) ? <a href={adminMailto(error)!} className="button secondary">Email the admin</a> : null}
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
