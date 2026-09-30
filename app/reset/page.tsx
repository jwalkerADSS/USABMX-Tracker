import Link from 'next/link';
import { ResetForm } from '../auth-forms';
import { getAccount, resetTokenUser } from '@/lib/accounts';

export const metadata = { title: 'Reset password' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? '';
  const username = token ? await resetTokenUser(token).catch(() => null) : null;
  const account = username ? await getAccount(username).catch(() => null) : null;
  return (
    <main className="login">
      <h1>BMX Tracker</h1>
      {account ? (
        <ResetForm token={token} name={account.displayName} />
      ) : (
        <div className="card stack">
          <h2>Link expired</h2>
          <p className="muted">That reset link has expired or was already used.</p>
          <Link href="/forgot" className="auth-link">Get a new link</Link>
        </div>
      )}
    </main>
  );
}
