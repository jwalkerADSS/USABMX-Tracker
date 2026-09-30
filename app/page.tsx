import Link from 'next/link';
import { Nav } from './nav';
import { TRACKED, currentSeason } from '@/lib/riders';
import { chosenRider, isTestUser } from '@/lib/session';
import { searchRiders } from '@/lib/search';
import { getPoints, getProfile, getRaceHistory, getStanding, type Tables } from '@/lib/usabmx';
import { RankRow } from './rank-row';
import { formatDate, ordinal } from '@/lib/format';

export const maxDuration = 60;

// tables is set for the family's tracked riders, whose rank tiles open the full standings.
async function RiderCard({ profileId, altProfileIds, memberId, name, tables }: { profileId: number; altProfileIds?: number[]; memberId: number; name: string; tables?: Tables }) {
  const year = currentSeason();
  const [profile, points, races] = await Promise.all([getProfile(profileId), getPoints(profileId), getRaceHistory(memberId, year)]);
  const goldCup = tables
    ? await getStanding('goldCup', tables, year, { memberId, name, profileIds: [profileId, ...(altProfileIds ?? [])] }, points).catch(() => null)
    : null;
  const wins = races.filter(r => r.finish === 1).length;
  const last = races[0];
  return (
    <section className="card rider-card">
      <div className="rider-head">
        <h2><Link href={`/riders/${profileId}`}>{profile ? `${profile.firstName} ${profile.lastName}` : name} ›</Link></h2>
        {profile?.level ? <span className="badge">{profile.level}</span> : null}
      </div>
      {profile?.homeTrack ? <p className="muted">{profile.homeTrack}</p> : null}
      <RankRow points={points} profileId={tables ? profileId : undefined} goldCup={goldCup} />
      <p className="record">
        {year}: <strong>{wins}</strong> wins in <strong>{races.length}</strong> races
        {races.length ? ` (${Math.round((wins / races.length) * 100)}%)` : ''}
      </p>
      {last ? (
        <p className="muted small">
          Last race {formatDate(last.date)} at {last.track}: {ordinal(last.finish)} of {last.riders}
        </p>
      ) : null}
      <Link href={`/riders/${profileId}`} className="card-more">Races, points and gaps ›</Link>
    </section>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (await isTestUser()) return <TestHome q={((await searchParams).q ?? '').trim()} />;
  return (
    <>
      <Nav />
      <main className="stack">
        {TRACKED.map(r => (
          <RiderCard key={r.profileId} profileId={r.profileId} altProfileIds={r.altProfileIds} memberId={r.memberId} name={r.name} tables={r.tables} />
        ))}
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
