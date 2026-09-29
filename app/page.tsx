import Link from 'next/link';
import { Nav } from './nav';
import { TRACKED, currentSeason } from '@/lib/riders';
import { getPoints, getProfile, getRaceHistory } from '@/lib/usabmx';
import { RankRow } from './rank-row';
import { formatDate, ordinal } from '@/lib/format';

export const maxDuration = 60;

async function RiderCard({ profileId, memberId, name }: { profileId: number; memberId: number; name: string }) {
  const year = currentSeason();
  const [profile, points, races] = await Promise.all([getProfile(profileId), getPoints(profileId), getRaceHistory(memberId, year)]);
  const wins = races.filter(r => r.finish === 1).length;
  const last = races[0];
  return (
    <Link href={`/riders/${profileId}`} className="card rider-card">
      <div className="rider-head">
        <h2>{profile ? `${profile.firstName} ${profile.lastName}` : name}</h2>
        {profile?.level ? <span className="badge">{profile.level}</span> : null}
      </div>
      {profile?.homeTrack ? <p className="muted">{profile.homeTrack}</p> : null}
      <RankRow points={points} />
      <p className="record">
        {year}: <strong>{wins}</strong> wins in <strong>{races.length}</strong> races
        {races.length ? ` (${Math.round((wins / races.length) * 100)}%)` : ''}
      </p>
      {last ? (
        <p className="muted small">
          Last race {formatDate(last.date)} at {last.track}: {ordinal(last.finish)} of {last.riders}
        </p>
      ) : null}
    </Link>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main className="stack">
        {TRACKED.map(r => (
          <RiderCard key={r.profileId} profileId={r.profileId} memberId={r.memberId} name={r.name} />
        ))}
      </main>
    </>
  );
}
