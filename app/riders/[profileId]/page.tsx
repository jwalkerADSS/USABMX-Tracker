import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Nav } from '../../nav';
import { RankRow } from '../../rank-row';
import { currentSeason, findTracked } from '@/lib/riders';
import { formatDate, num, ordinal } from '@/lib/format';
import {
  LEVEL_LABELS, getPoints, getProfile, getRaceField, getRaceHistory, getStanding,
  type Level, type Race, type RaceField, type Standing,
} from '@/lib/usabmx';

export const maxDuration = 60;

type Props = { params: Promise<{ profileId: string }>; searchParams: Promise<{ year?: string }> };

export async function generateMetadata({ params }: Props) {
  const profile = await getProfile(Number((await params).profileId)).catch(() => null);
  return { title: profile ? `${profile.firstName} ${profile.lastName}` : 'Rider' };
}

export default async function RiderPage({ params, searchParams }: Props) {
  const profileId = Number((await params).profileId);
  const year = Number((await searchParams).year) || currentSeason();
  if (!Number.isInteger(profileId) || profileId <= 0) notFound();
  // Some riders have an older duplicate profile that USA BMX only shows to the account owner.
  const alias = findTracked(profileId);
  if (alias && alias.profileId !== profileId) redirect(`/riders/${alias.profileId}`);

  const profile = await getProfile(profileId);
  if (!profile) notFound();
  const tracked = findTracked(profileId);
  const name = `${profile.firstName} ${profile.lastName}`;

  const [points, races] = await Promise.all([getPoints(profileId), getRaceHistory(profile.memberId, year)]);
  const last5 = races.slice(0, 5);
  const [standings, fields] = await Promise.all([
    tracked
      ? Promise.all((Object.keys(LEVEL_LABELS) as Level[]).map(level =>
          getStanding(level, tracked.tables, year, {
            memberId: profile.memberId, name, profileIds: [tracked.profileId, ...(tracked.altProfileIds ?? [])],
          }, points).catch(() => null)))
      : Promise.resolve([]),
    Promise.all(last5.map(r => getRaceField(r, profile.memberId).catch((): RaceField => ({ moto: null, field: null })))),
  ]);

  const wins = races.filter(r => r.finish === 1).length;
  const podiums = races.filter(r => r.finish <= 3).length;

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <div className="rider-head">
            <h1>{name}</h1>
            {profile.level ? <span className="badge">{profile.level}</span> : null}
          </div>
          <p className="muted">
            {[profile.homeTrack, [profile.city, profile.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <RankRow points={points} />
          {points.plates.length ? (
            <p className="muted small">
              Plates: {points.plates.map(p => `${p.plateType} #${p.value} (${p.season})`).join(', ')}
            </p>
          ) : null}
        </section>

        <section className="card">
          <h2>{year} record</h2>
          <div className="stats">
            <Stat label="Races" value={races.length} />
            <Stat label="Wins" value={wins} />
            <Stat label="Other finishes" value={races.length - wins} />
            <Stat label="Podiums" value={podiums} />
          </div>
        </section>

        {tracked ? (
          <section className="card">
            <h2>Standings and points gaps</h2>
            <ul className="standings">
              {standings.map((s, i) => <StandingItem key={i} s={s} />)}
            </ul>
          </section>
        ) : null}

        <section className="card">
          <h2>Last {last5.length} races</h2>
          {last5.length ? (
            <ul className="races">
              {last5.map((r, i) => <RaceItem key={`${r.raceId}-${r.date}-${i}`} race={r} field={fields[i]} />)}
            </ul>
          ) : (
            <p className="muted">No races in {year} yet.</p>
          )}
          <p className="muted small">USA BMX doesn&apos;t publish the points earned for each race, so they aren&apos;t shown here yet.</p>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{num(value)}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function StandingItem({ s }: { s: Standing | null }) {
  if (!s) return null;
  return (
    <li>
      <div className="standing-head">
        <strong>{s.label}</strong>
        {s.found ? <span>#{num(s.place!)} · {num(s.points!)} pts</span> : <span className="muted">Not ranked</span>}
      </div>
      {s.gaps.map(g => (
        <p key={g.place} className="gap">
          {g.pointsBehind === 0 ? `Tied with #${g.place}` : `${num(g.pointsBehind)} pts behind #${g.place}`}{' '}
          <span className="muted">({g.name}, {num(g.points)})</span>
        </p>
      ))}
      {s.found && s.place === 1 ? <p className="gap">Leading this table</p> : null}
    </li>
  );
}

function RaceItem({ race, field }: { race: Race; field: RaceField }) {
  const opponents = field.field?.filter(f => !f.self) ?? [];
  return (
    <li>
      <div className="race-head">
        <span className={`finish ${race.finish === 1 ? 'win' : ''}`}>{ordinal(race.finish)}</span>
        <div>
          <strong>{race.track}</strong>
          <p className="muted small">
            {formatDate(race.date)} · {race.raceType} · {race.ageGroup}{race.bike === 'cruiser' ? ' Cruiser' : ''} · {race.riders} riders
          </p>
        </div>
      </div>
      {opponents.length ? (
        <p className="opponents">
          vs{' '}
          {opponents.map((o, i) => (
            <span key={o.memberId}>
              {i ? ', ' : ''}
              {o.profileId ? <Link href={`/riders/${o.profileId}`}>{o.name}</Link> : o.name} ({ordinal(o.place)})
            </span>
          ))}
        </p>
      ) : field.field === null ? (
        <p className="muted small">Opponents not available for this race.</p>
      ) : null}
    </li>
  );
}
