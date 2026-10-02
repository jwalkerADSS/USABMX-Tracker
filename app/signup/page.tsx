import Link from 'next/link';
import { SignUpForm } from '../auth-forms';
import { storeReady } from '@/lib/store';

export const metadata = { title: 'Sign up' };

export default function SignUpPage() {
  // Sign-up needs the account database, plus the invite code (SIGNUP_CODE, set in Vercel) or a trial code from
  // the admin page.
  const open = storeReady();
  return (
    <main className="login">
      <h1><img src="/logo.webp" alt="BMX Tracker" width={220} height={220} className="login-logo" /></h1>
      {open ? (
        <SignUpForm />
      ) : (
        <div className="card stack">
          <h2>Sign up</h2>
          <p className="muted">Sign-up isn&apos;t open on this site yet.</p>
          <Link href="/login" className="auth-link">Back to sign in</Link>
        </div>
      )}
    </main>
  );
}
