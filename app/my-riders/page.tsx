import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { addRider, removeRider } from '../auth-actions';
import { MAX_RIDERS } from '@/lib/accounts';
import { searchRiders } from '@/lib/search';
import { findTracked } from '@/lib/riders';
import { currentAccount } from '@/lib/session';
import { getProfile } from '@/lib/usabmx';

export const metadata = { title: 'My riders' };

// Pick the riders (up to five) shown on the landing page. Part of sign-up, and open any time after.
export default async function MyRidersPage({ searchParams }: { searchParams: Promise<{ q?: string; welcome?: string }> }) {
  const account = await currentAccount();
  if (!account) redirect('/');
  if (account.mustChangePassword) redirect('/change-password');
  const { q: rawQ, welcome } = await searchParams;
  const q = (rawQ ?? '').trim();
  const mine = await Promise.all(account.riders.map(async id => ({ id, profile: await getProfile(id).catch(() => null) })));
  const full = account.riders.length >= MAX_RIDERS;
  // A USA BMX profile number (from a profile URL) works as well as a name.
  const byNumber = /^\d+$/.test(q) ? await getProfile(Number(q)).catch(() => null) : null;
  const results = byNumber
    ? [{ profileId: byNumber.profileId, name: `${byNumber.firstName} ${byNumber.lastName}`, ageGroup: byNumber.level, district: byNumber.homeTrack }]
    : q && !/^\d+$/.test(q) ? searchRiders(q, 20) : [];

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>{welcome && !account.riders.length ? `Welcome, ${account.displayName}` : 'My riders'}</h1>
          <p className="muted">
            Choose up to {MAX_RIDERS} riders to follow on your landing page. {account.riders.length} of {MAX_RIDERS} chosen.
          </p>
          {mine.length ? (
            <ul className="results my-riders">
              {mine.map(({ id, profile }) => (
                <li key={id}>
                  <span className="plain">
                    <strong>{profile ? `${profile.firstName} ${profile.lastName}` : `Profile ${id}`}</strong>
                    <span className="muted small">{[profile?.level, profile?.homeTrack].filter(Boolean).join(' · ')}</span>
                  </span>
                  <form action={removeRider}>
                    <input type="hidden" name="profileId" value={id} />
                    <button type="submit" className="link">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {mine.length ? <Link href="/" className="button done-button">Done</Link> : null}
          <p className="small"><Link href="/change-password" className="muted">Change password</Link></p>
        </section>
        {full ? (
          <p className="card muted">You&apos;re following {MAX_RIDERS} riders. Remove one to add another.</p>
        ) : (
          <>
            <form className="card search" action="/my-riders">
              <input name="q" defaultValue={q} placeholder="Search a rider’s name" autoFocus={!mine.length} enterKeyHint="search" />
              <button type="submit">Search</button>
            </form>
            {q ? (
              results.length ? (
                <ul className="card results choose-results">
                  {results.map(r => {
                    const added = account.riders.includes(findTracked(r.profileId)?.profileId ?? r.profileId);
                    return (
                      <li key={r.profileId}>
                        <form action={addRider}>
                          <input type="hidden" name="profileId" value={r.profileId} />
                          <button type="submit" className="choose" disabled={added}>
                            <strong>{r.name}{added ? ' ✓' : ''}</strong>
                            <span className="muted small">{[r.ageGroup, r.district].filter(Boolean).join(' · ') || 'Add this rider'}</span>
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="card muted">No riders found for &ldquo;{q}&rdquo;. Try a last name, or paste a USA BMX profile number.</p>
              )
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
