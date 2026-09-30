import Link from 'next/link';
import { SignUpForm } from '../auth-forms';
import { storeReady } from '@/lib/store';

export const metadata = { title: 'Sign up' };

export default function SignUpPage() {
  // Sign-up needs the invite code (SIGNUP_CODE) and the account database, both set up in Vercel.
  const open = !!process.env.SIGNUP_CODE && storeReady();
  return (
    <main className="login">
      <h1>BMX Tracker</h1>
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
