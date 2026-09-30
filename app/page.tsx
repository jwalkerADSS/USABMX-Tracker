import Link from 'next/link';
import { Nav } from './nav';
import { TRACKED, currentSeason } from '@/lib/riders';
import { getPoints, getProfile, getRaceHistory, getStanding, type Tables } from '@/lib/usabmx';
import { RankRow } from './rank-row';
import { formatDate, ordinal } from '@/lib/format';

export const maxDuration = 60;

async function RiderCard({ profileId, altProfileIds, memberId, name, tables }: { profileId: number; altProfileIds?: number[]; memberId: number; name: string; tables: Tables }) {
  const year = currentSeason();
  const [profile, points, races] = await Promise.all([getProfile(profileId), getPoints(profileId), getRaceHistory(memberId, year)]);
  const goldCup = await getStanding('goldCup', tables, year, { memberId, name, profileIds: [profileId, ...(altProfileIds ?? [])] }, points).catch(() => null);
  const wins = races.filter(r => r.finish === 1).length;
  const last = races[0];
  return (
    <section className="card rider-card">
      <div className="rider-head">
        <h2><Link href={`/riders/${profileId}`}>{profile ? `${profile.firstName} ${profile.lastName}` : name} ›</Link></h2>
        {profile?.level ? <span className="badge">{profile.level}</span> : null}
      </div>
      {profile?.homeTrack ? <p className="muted">{profile.homeTrack}</p> : null}
      <RankRow points={points} profileId={profileId} goldCup={goldCup} />
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

export default function Home() {
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
