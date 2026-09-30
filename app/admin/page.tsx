import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { AdminResetForm } from '../auth-forms';
import { getAccount, isAdmin, resetRequests } from '@/lib/accounts';
import { currentAccount } from '@/lib/session';

export const metadata = { title: 'Admin' };

// Password resets for the admins named in ADMIN_USERNAMES.
export default async function AdminPage() {
  const me = await currentAccount();
  if (!isAdmin(me)) redirect('/');
  const requests = await Promise.all((await resetRequests()).map(async r => ({ ...r, account: await getAccount(r.username) })));
  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>Password resets</h1>
          {requests.length ? (
            <ul className="results admin-requests">
              {requests.map(r => (
                <li key={r.username}>
                  <div className="plain">
                    <strong>{r.account?.displayName ?? r.username}</strong>
                    <span className="muted small">
                      {r.account?.email} · asked {new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}
                    </span>
                  </div>
                  <AdminResetForm username={r.username} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No reset requests right now.</p>
          )}
        </section>
        <section className="card">
          <h2>Reset any account</h2>
          <p className="muted small">For someone who asked you another way.</p>
          <AdminResetForm />
        </section>
      </main>
    </>
  );
}
