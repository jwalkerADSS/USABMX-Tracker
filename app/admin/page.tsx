import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { AdminResetForm } from '../auth-forms';
import { ConfirmButton } from '../confirm-button';
import { TRIAL_DAYS, getAccount, isAdmin, listAccounts, resetRequests, trialCodes, trialEnds } from '@/lib/accounts';
import { newTrialCode, removeUserAction, renewTrialAction } from '../auth-actions';
import { currentAccount } from '@/lib/session';

export const metadata = { title: 'Admin' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

// Users, password resets and trial codes, for the admins named in ADMIN_USERNAMES.
export default async function AdminPage() {
  const me = await currentAccount();
  if (!isAdmin(me)) redirect('/');
  const requests = await Promise.all((await resetRequests()).map(async r => ({ ...r, account: await getAccount(r.username) })));
  const codes = (await trialCodes()).reverse();
  const unused = codes.filter(c => !c.usedBy);
  const users = await listAccounts();
  const now = Date.now();
  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card stack" id="users">
          <h1>Users ({users.length})</h1>
          <p className="muted small">
            Most recently active first. Last active is the last time they opened the app or signed in. Removing an account
            signs it out and frees its username and email.
          </p>
          <ul className="results admin-requests">
            {users.map(u => {
              const ends = trialEnds(u);
              const admin = isAdmin(u);
              return (
                <li key={u.username}>
                  <div className="plain">
                    <strong>
                      {u.displayName}
                      {admin ? <span className="badge">Admin</span> : null}
                      {ends != null ? <span className="badge trial">{ends > now ? 'Trial' : 'Trial ended'}</span> : null}
                    </strong>
                    <span className="muted small">{u.email}</span>
                    <span className="muted small">
                      Last active {u.lastSeen ? when(u.lastSeen) : 'never since sign-up'} · joined {when(u.createdAt)} ·{' '}
                      {u.riders.length} {u.riders.length === 1 ? 'rider' : 'riders'}
                      {ends != null ? ` · trial ${ends > now ? 'ends' : 'ended'} ${when(u.trialEndsAt!)}` : ''}
                    </span>
                  </div>
                  {admin ? null : (
                    <div className="admin-reset">
                      {ends != null ? (
                        <form action={renewTrialAction}>
                          <input type="hidden" name="username" value={u.username} />
                          <button type="submit" className="secondary">Add {TRIAL_DAYS} days</button>
                        </form>
                      ) : null}
                      <form action={removeUserAction}>
                        <input type="hidden" name="username" value={u.username} />
                        <ConfirmButton className="danger" message={`Remove ${u.displayName}? Their account is deleted and they're signed out. This can't be undone.`}>
                          Remove
                        </ConfirmButton>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card">
          <h2>Password resets</h2>
          {requests.length ? (
            <ul className="results admin-requests">
              {requests.map(r => (
                <li key={r.username}>
                  <div className="plain">
                    <strong>{r.account?.displayName ?? r.username}</strong>
                    <span className="muted small">
                      {r.account?.email} · asked {when(r.at)}
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
        <section className="card stack" id="trials">
          <h2>Trial codes</h2>
          <p className="muted small">
            Each code signs up one account for {TRIAL_DAYS} days, then can&apos;t be used again. When a trial ends, sign-in
            stops working until you tap Add {TRIAL_DAYS} days next to them under Users.
          </p>
          <form action={newTrialCode}>
            <button type="submit">Make a trial code</button>
          </form>
          {unused.length ? (
            <ul className="results admin-requests">
              {unused.map(c => (
                <li key={c.code}>
                  <div className="plain">
                    <code className="temp-password">{c.code}</code>
                    <span className="muted small">Not used yet · made {when(c.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    </>
  );
}
