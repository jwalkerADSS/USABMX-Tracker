import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Nav } from '../../nav';
import { RankRow } from '../../rank-row';
import { currentSeason, findTracked } from '@/lib/riders';
import { districtAge, formatDate, num, ordinal, pts } from '@/lib/format';
import {
  LEVEL_LABELS, getPoints, getProfile, getRaceField, getRaceHistory, getStanding,
  type FieldEntry, type Level, type Race, type RaceField, type Standing,
} from '@/lib/usabmx';
import { higherLevel, raceLabel, racePoints, raisedRaces } from '@/lib/points';
import { winsByTrack, worstTrack, type TrackRecord } from '@/lib/records';

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
  const age = districtAge(profile.birthdate, currentSeason());

  const [points, races] = await Promise.all([getPoints(profileId), getRaceHistory(profile.memberId, year)]);
  const last5 = races.slice(0, 5);
  // Only this season's races can be compared with riders' current levels.
  const thisSeason = year === currentSeason();
  const raised = thisSeason ? raisedRaces(races, profile.level) : new Set<Race>();
  const [standings, fields] = await Promise.all([
    tracked
      ? Promise.all((Object.keys(LEVEL_LABELS) as Level[]).map(level =>
          getStanding(level, tracked.tables, year, {
            memberId: profile.memberId, name, profileIds: [tracked.profileId, ...(tracked.altProfileIds ?? [])],
          }, points).catch(() => null)))
      : Promise.resolve([]),
    Promise.all(last5.map(r => getRaceField(r, profile.memberId).catch((): RaceField => ({ trackId: null, moto: null, field: null })))),
  ]);

  // Wins, podiums (2nd and 3rd) and other finishes add up to the race count.
  const wins = races.filter(r => r.finish === 1).length;
  const podiums = races.filter(r => r.finish === 2 || r.finish === 3).length;
  const tracks = winsByTrack(races);
  const top = tracks[0];
  const worst = tracks.length > 1 ? worstTrack(tracks) : undefined;
  // Track pages need the USA BMX track id, which only the recent races have looked up.
  const trackIds = new Map(last5.map((r, i) => [r.track, fields[i]?.trackId] as const).filter(([, id]) => id));

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <div className="rider-head">
            <h1>{name}</h1>
            <div className="badges">
              {age != null ? <span className="badge age">District age {age}</span> : null}
              {profile.level ? <span className="badge">{profile.level}</span> : null}
            </div>
          </div>
          <p className="muted">
            {[profile.homeTrack, [profile.city, profile.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <RankRow points={points} profileId={tracked?.profileId} goldCup={standings.find(s => s?.level === 'goldCup')} />
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
            <Stat label="Podiums (2nd–3rd)" value={podiums} />
            <Stat label="Other finishes" value={races.length - wins - podiums} />
          </div>
          {top ? (
            <div className="track-best">
              <TrackTile label="Top track" t={top} id={trackIds.get(top.track)} />
              {worst && worst.track !== top.track ? <TrackTile label="Worst track" t={worst} id={trackIds.get(worst.track)} /> : null}
            </div>
          ) : null}
        </section>

        {tracks.length > 1 ? (
          <section className="card">
            <h2>Wins by track</h2>
            <table className="track-table">
              <thead>
                <tr><th>Track</th><th>Wins</th><th>Races</th><th>Win %</th></tr>
              </thead>
              <tbody>
                {tracks.map(t => {
                  const id = trackIds.get(t.track);
                  return (
                    <tr key={t.track}>
                      <td>{id ? <Link href={`/tracks/${id}`}>{t.track}</Link> : t.track}</td>
                      <td>{t.wins}</td>
                      <td>{t.races}</td>
                      <td>{Math.round((t.wins / t.races) * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

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
              {last5.map((r, i) => <RaceItem key={`${r.raceId}-${r.date}-${i}`} race={r} field={fields[i]} ownLevel={raised.has(r) ? profile.level : null} useLevels={thisSeason} />)}
            </ul>
          ) : (
            <p className="muted">No races in {year} yet.</p>
          )}
          <p className="muted small">
            Points are worked out from the USA BMX rule book: finish points plus one point per rider in the moto, times the
            race&apos;s multiplier. USA BMX doesn&apos;t publish points per race, so season totals can differ slightly.
          </p>
        </section>
      </main>
    </>
  );
}

function TrackTile({ label, t, id }: { label: string; t: TrackRecord; id?: number | null }) {
  return (
    <div className="track-tile">
      <span className="stat-label">{label}</span>
      <strong>{id ? <Link href={`/tracks/${id}`}>{t.track}</Link> : t.track}</strong>
      <span className="muted small">{t.wins} {t.wins === 1 ? 'win' : 'wins'} in {t.races} {t.races === 1 ? 'race' : 'races'}</span>
    </div>
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
        {s.found ? <span>#{num(s.place!)} · {pts(s.points!)}</span> : <span className="muted">Not ranked</span>}
      </div>
      {s.gaps.map(g => (
        <p key={g.place} className="gap">
          {g.pointsBehind === 0 ? `Tied with #${g.place}` : `${pts(g.pointsBehind)} behind #${g.place}`}{' '}
          <span className="muted">({g.name}, {num(g.points)})</span>
        </p>
      ))}
      {s.found && s.place === 1 ? <p className="gap">Leading this table</p> : null}
    </li>
  );
}

function RaceItem({ race, field, ownLevel, useLevels }: { race: Race; field: RaceField; ownLevel: string | null; useLevels: boolean }) {
  const opponents = field.field?.filter(f => !f.self) ?? [];
  // The highest level in the moto sets everyone's points. Profiles only show today's level, so older seasons skip this.
  const top = useLevels ? opponents.reduce<FieldEntry | null>((t, o) => (higherLevel(o.level, t?.level) ? o : t), null) : null;
  const points = racePoints(race, [ownLevel, top?.level]);
  const lifted = points && higherLevel(points.level, race.level) ? points.level : null;
  const why = !lifted ? ''
    : top && !higherLevel(lifted, top.level) ? ` · ${lifted} points: ${top.name} (${top.level}) raced in this moto`
    : ` · ${lifted} points (rider’s own level)`;
  return (
    <li>
      <div className="race-head">
        <span className={`finish ${race.finish === 1 ? 'win' : ''}`}>{ordinal(race.finish)}</span>
        <div className="race-body">
          <div className="race-title">
            <strong><Link href={field.trackId ? `/tracks/${field.trackId}?race=${race.raceId}` : `/events/${race.raceId}`}>{race.track}</Link></strong>
            {points ? <span className="race-points">+{pts(points.district)}</span> : null}

          </div>
          <p className="muted small">
            {formatDate(race.date)} · {raceLabel(race.raceType)} · {race.ageGroup}{race.bike === 'cruiser' ? ' Cruiser' : ''} · {race.riders} riders
            {why}
          </p>
          {points && (points.state != null || points.goldCup != null) ? (
            <p className="muted small">
              {pts(points.district)} district
              {points.state != null ? ` · ${pts(points.state)} state` : ''}
              {points.goldCup != null ? ` · ${pts(points.goldCup)} Gold Cup` : ''}
            </p>
          ) : null}
        </div>
      </div>
      {opponents.length ? (
        <p className="opponents">
          vs{' '}
          {opponents.map((o, i) => (
            <span key={o.memberId}>
              {i ? ', ' : ''}
              {o.profileId ? <Link href={`/riders/${o.profileId}`}>{o.name}</Link> : o.name}{o.place ? ` (${ordinal(o.place)})` : ''}
            </span>
          ))}
        </p>
      ) : field.field === null ? (
        <p className="muted small">Opponents not available for this race.</p>
      ) : null}
    </li>
  );
}
