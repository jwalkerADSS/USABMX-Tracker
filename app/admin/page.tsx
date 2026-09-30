import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { AdminResetForm } from '../auth-forms';
import { TRIAL_DAYS, getAccount, isAdmin, resetRequests, trialCodes, trialEnds } from '@/lib/accounts';
import { newTrialCode, renewTrialAction } from '../auth-actions';
import { currentAccount } from '@/lib/session';

export const metadata = { title: 'Admin' };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

// Password resets and trial codes, for the admins named in ADMIN_USERNAMES.
export default async function AdminPage() {
  const me = await currentAccount();
  if (!isAdmin(me)) redirect('/');
  const requests = await Promise.all((await resetRequests()).map(async r => ({ ...r, account: await getAccount(r.username) })));
  const codes = (await trialCodes()).reverse();
  const unused = codes.filter(c => !c.usedBy);
  const trials = (await Promise.all(codes.filter(c => c.usedBy).map(c => getAccount(c.usedBy!)))).filter(a => a && trialEnds(a) != null);
  const now = Date.now();
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
            stops working until you add {TRIAL_DAYS} more days here.
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
          <h3>Trial accounts</h3>
          {trials.length ? (
            <ul className="results admin-requests">
              {trials.map(a => {
                const ends = trialEnds(a!)!;
                return (
                  <li key={a!.username}>
                    <div className="plain">
                      <strong>{a!.displayName}</strong>
                      <span className="muted small">
                        {a!.email} · {ends > now ? `ends ${when(a!.trialEndsAt!)}` : `ended ${when(a!.trialEndsAt!)}`}
                      </span>
                    </div>
                    <form action={renewTrialAction} className="admin-reset">
                      <input type="hidden" name="username" value={a!.username} />
                      <button type="submit" className={ends > now ? 'secondary' : undefined}>Add {TRIAL_DAYS} days</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No one has used a trial code yet.</p>
          )}
        </section>
      </main>
    </>
  );
}
