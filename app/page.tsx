import Link from 'next/link';
import { Nav } from './nav';
import { redirect } from 'next/navigation';
import { TRACKED, currentSeason, getRiderTables } from '@/lib/riders';
import { chosenRider, currentAccount, currentUser, isTestUser } from '@/lib/session';
import { ACCOUNT_PREFIX } from '@/lib/auth';
import { searchRiders } from '@/lib/search';
import { getEvent, getPoints, getProfile, getRaceHistory, getStanding, type Tables } from '@/lib/usabmx';
import { RankRow } from './rank-row';
import { Tour } from './tour';
import { districtAge, formatDate, ordinal } from '@/lib/format';

export const maxDuration = 60;

// When tables is set the rank tiles open the full standings and a Gold Cup tile is added.
async function RiderCard({ profileId, altProfileIds, memberId, name, tables }: { profileId: number; altProfileIds?: number[]; memberId: number; name: string; tables?: Tables }) {
  const year = currentSeason();
  const [profile, points, races] = await Promise.all([getProfile(profileId), getPoints(profileId), getRaceHistory(memberId, year)]);
  const goldCup = tables?.goldCup
    ? await getStanding('goldCup', tables, year, { memberId, name, profileIds: [profileId, ...(altProfileIds ?? [])] }, points).catch(() => null)
    : null;
  const wins = races.filter(r => r.finish === 1).length;
  const last = races[0];
  const lastTrackId = last ? await getEvent(last.raceId).then(e => e.trackId, () => null) : null;
  // District age (the age the rider turns this year) goes with the level, the way classes are named: "10 Inter".
  const age = districtAge(profile?.birthdate ?? null, year);
  const badge = [age, profile?.level].filter(x => x != null).join(' ');
  return (
    <section className="card rider-card">
      <div className="rider-head">
        <h2><Link href={`/riders/${profileId}`}>{profile ? `${profile.firstName} ${profile.lastName}` : name} ›</Link></h2>
        {badge ? <span className="badge">{badge}</span> : null}
      </div>
      {profile?.homeTrack ? <p className="muted">{profile.homeTrack}</p> : null}
      <RankRow points={points} profileId={profileId} tables={tables} goldCup={goldCup} />
      <p className="record">
        {year}: <strong>{wins}</strong> wins in <strong>{races.length}</strong> races
        {races.length ? ` (${Math.round((wins / races.length) * 100)}%)` : ''}
      </p>
      {last ? (
        <p className="muted small">
          Last race {formatDate(last.date)} at {lastTrackId ? <Link href={`/tracks/${lastTrackId}?race=${last.raceId}`}>{last.track}</Link> : last.track}: {ordinal(last.finish)} of {last.riders}
        </p>
      ) : null}
      <Link href={`/riders/${profileId}`} className="card-more">Races, points and gaps ›</Link>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (await isTestUser()) return <TestHome q={((await searchParams).q ?? '').trim()} />;
  const account = await currentAccount();
  if (!account && (await currentUser())?.startsWith(ACCOUNT_PREFIX)) {
    return (
      <>
        <Nav />
        <main className="stack">
          <p className="card muted">Your account couldn&apos;t be loaded. Sign out and sign in again.</p>
        </main>
      </>
    );
  }
  if (account) {
    // Account holders follow up to five riders of their own, chosen after sign-up.
    if (account.mustChangePassword) redirect('/change-password');
    if (!account.riders.length) redirect('/my-riders?welcome=1');
    const [profiles, tables] = await Promise.all([
      Promise.all(account.riders.map(id => getProfile(id).catch(() => null))),
      // Every rider gets the Gold Cup tile and clickable standings tiles, not just the family's.
      Promise.all(account.riders.map(id => getRiderTables(id).catch(() => null))),
    ]);
    return (
      <>
        <Nav />
        <main className="stack">
          {account.trialEndsAt ? (
            <p className="card small trial-note">
              Free trial: ends {new Date(account.trialEndsAt).toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
              })}. Ask the admin to renew it.
            </p>
          ) : null}
          {profiles.map((p, i) => {
            if (!p) return <p key={account.riders[i]} className="card muted">USA BMX profile {account.riders[i]} didn&apos;t load.</p>;
            const tracked = tables[i];
            return (
              <RiderCard key={p.profileId} profileId={tracked?.profileId ?? p.profileId} altProfileIds={tracked?.altProfileIds}
                memberId={p.memberId} name={`${p.firstName} ${p.lastName}`} tables={tracked?.tables} />
            );
          })}
          <Link href="/change-password" className="change-rider">Change password</Link>
          <Tour />
        </main>
      </>
    );
  }
  return (
    <>
      <Nav />
      <main className="stack">
        {TRACKED.map(r => (
          <RiderCard key={r.profileId} profileId={r.profileId} altProfileIds={r.altProfileIds} memberId={r.memberId} name={r.name} tables={r.tables} />
        ))}
        <Tour />
      </main>
    </>
  );
}

// The Test user follows one rider of their choosing. Until they pick one, the landing page asks them to.
async function TestHome({ q }: { q: string }) {
  const chosen = await chosenRider();
  const profile = chosen && !q ? await getProfile(chosen).catch(() => null) : null;
  if (profile) {
    return (
      <>
        <Nav />
        <main className="stack">
          <RiderCard profileId={profile.profileId} memberId={profile.memberId} name={`${profile.firstName} ${profile.lastName}`} />
          <form method="post" action="/api/rider" className="change-rider">
            <button type="submit" className="link">Choose a different rider</button>
          </form>
          <Tour />
        </main>
      </>
    );
  }
  // A USA BMX profile number (from a profile URL) works as well as a name.
  const byNumber = /^\d+$/.test(q) ? await getProfile(Number(q)).catch(() => null) : null;
  const results = byNumber
    ? [{ profileId: byNumber.profileId, name: `${byNumber.firstName} ${byNumber.lastName}`, ageGroup: byNumber.level, district: byNumber.homeTrack }]
    : q && !/^\d+$/.test(q) ? searchRiders(q) : [];
  return (
    <>
      <Nav />
      <main className="stack">
        <section className="card">
          <h1>Choose your rider</h1>
          <p className="muted">Search for the rider you want to follow. You can change this later.</p>
          <form className="search" action="/">
            <input name="q" defaultValue={q} placeholder="Rider name" autoFocus enterKeyHint="search" />
            <button type="submit">Search</button>
          </form>
        </section>
        {q ? (
          results.length ? (
            <ul className="card results choose-results">
              {results.map(r => (
                <li key={r.profileId}>
                  <form method="post" action="/api/rider">
                    <input type="hidden" name="profileId" value={r.profileId} />
                    <button type="submit" className="choose">
                      <strong>{r.name}</strong>
                      <span className="muted small">{[r.ageGroup, r.district].filter(Boolean).join(' · ') || 'Choose this rider'}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card muted">No riders found for &ldquo;{q}&rdquo;. Try a last name, or paste a USA BMX profile number.</p>
          )
        ) : null}
      </main>
    </>
  );
}
