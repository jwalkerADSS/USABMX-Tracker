import Link from 'next/link';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { Nav } from '../../nav';
import { RankRow } from '../../rank-row';
import { currentSeason, findTracked, getRiderTables } from '@/lib/riders';
import { formatDate, num, ordinal, pts } from '@/lib/format';
import {
  LEVEL_LABELS, getNationals, getPoints, getProfile, getRaceField, racedSeasons, getRaceHistory, getRiderAge, getStanding, getTrackIds,
  type FieldEntry, type Level, type National, type Race, type RaceField, type Standing,
} from '@/lib/usabmx';
import { higherLevel, multiplier, raceLabel, racePoints, raisedRaces } from '@/lib/points';
import { winsByTrack, worstTrack, type TrackRecord } from '@/lib/records';
import { getLapTimes, type RiderMatch } from '@/lib/sqorz';
import { LapTimesView } from './lap-times';
import { RaceControls, type RaceSort } from './race-controls';

export const maxDuration = 60;

type Props = { params: Promise<{ profileId: string }>; searchParams: Promise<{ year?: string; sort?: string; more?: string }> };

export async function generateMetadata({ params }: Props) {
  const profile = await getProfile(Number((await params).profileId)).catch(() => null);
  return { title: profile ? `${profile.firstName} ${profile.lastName}` : 'Rider' };
}

export default async function RiderPage({ params, searchParams }: Props) {
  const profileId = Number((await params).profileId);
  const query = await searchParams;
  const year = Number(query.year) || currentSeason();
  const sort: RaceSort = query.sort === 'oldest' || query.sort === 'track' ? query.sort : 'newest';
  const more = query.more === '1';
  if (!Number.isInteger(profileId) || profileId <= 0) notFound();
  // Some riders have an older duplicate profile that USA BMX only shows to the account owner.
  const alias = findTracked(profileId);
  if (alias && alias.profileId !== profileId) redirect(`/riders/${alias.profileId}`);

  const profile = await getProfile(profileId);
  if (!profile) notFound();
  const tracked = await getRiderTables(profileId).catch(() => null);
  const name = `${profile.firstName} ${profile.lastName}`;
  const [points, races] = await Promise.all([getPoints(profileId), getRaceHistory(profile.memberId, year)]);
  const riderAge = getRiderAge(profile, currentSeason());
  const age = riderAge.label;
  // Newest or oldest first; the first five shown also get who they raced against.
  const ordered = sort === 'oldest' ? [...races].reverse() : races;
  const detailed = sort === 'track' ? [] : ordered.slice(0, 5);
  // Only this season's races can be compared with riders' current levels.
  const thisSeason = year === currentSeason();
  const raised = thisSeason ? raisedRaces(races, profile.level) : new Set<Race>();
  const [standings, fields, trackIds, nationals] = await Promise.all([
    tracked
      ? Promise.all((Object.keys(LEVEL_LABELS) as Level[]).map(level =>
          getStanding(level, tracked.tables, year, {
            memberId: profile.memberId, name, profileIds: [tracked.profileId, ...(tracked.altProfileIds ?? [])],
          }, points).catch(() => null)))
      : Promise.resolve([]),
    Promise.all(detailed.map(r => getRaceField(r, profile.memberId).catch((): RaceField => ({ trackId: null, moto: null, field: null })))),
    getTrackIds(races),
    // Grouped by track, events USA BMX runs itself are named after the national on those dates.
    sort === 'track' && races.some(r => r.track === 'USA BMX') ? getNationals(year).catch(() => []) : Promise.resolve([]),
  ]);

  // Races past the first five list without opponents, which would take a lookup per race.
  // The season picker lists the seasons the rider raced, plus this one and the one shown.
  const first = Math.max(2017, Number(profile.memberSince?.slice(0, 4)) || 2017);
  const raced = await racedSeasons(profile.memberId, first, currentSeason()).catch(() => [] as number[]);
  const years = [...new Set([currentSeason(), year, ...raced])].sort((a, b) => b - a);
  const noField = (r: Race): RaceField => ({ trackId: trackIds.get(r.track) ?? null, moto: null, field: null });

  // Wins, podiums (2nd and 3rd) and other finishes add up to the race count.
  const wins = races.filter(r => r.finish === 1).length;
  const podiums = races.filter(r => r.finish === 2 || r.finish === 3).length;
  const tracks = winsByTrack(races);
  const top = tracks[0];
  const worst = tracks.length > 1 ? worstTrack(tracks) : undefined;

  return (
    <>
      <Nav back title={
        <>
          <h1>{name}</h1>
          {/* District age with the level, like the landing page cards: "10 Inter". */}
          {age != null || profile.level ? <span className="badge">{[age, profile.level].filter(x => x != null).join(' ')}</span> : null}
        </>
      } />
      <main className="stack">
        <section className="card">
          <p className="muted">
            {[profile.homeTrack, [profile.city, profile.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
          <RankRow points={points} profileId={tracked?.profileId} tables={tracked?.tables} goldCup={tracked?.tables.goldCup ? standings.find(s => s?.level === 'goldCup') : null} />
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

        <section className="card" id="races">
          <h2>
            {sort === 'track' ? `${year} races by track` : more ? `All ${races.length} races in ${year}`
              : `${sort === 'oldest' ? 'First' : 'Last'} ${detailed.length} ${detailed.length === 1 ? 'race' : 'races'}`}
          </h2>
          <RaceControls profileId={profileId} year={year} years={years} sort={sort} />
          {!races.length ? (
            <p className="muted">
              No races in {year} yet.{' '}
              {thisSeason ? <Link href={`/riders/${profileId}?year=${year - 1}#races`}>See {year - 1} races</Link> : null}
            </p>
          ) : sort === 'track' ? (
            <div className="lap-groups">
              {byTrack(races, nationals, profile.state).map(g => (
                <details key={g.track} className="lap-group race-group">
                  <summary>
                    <span className="lap-group-head">
                      <strong>{g.track}</strong>
                      <span className="muted small">
                        {g.races.length} {g.races.length === 1 ? 'race' : 'races'} · {winsText(g.races)} · last {formatDate(g.races[0].date)}
                      </span>
                    </span>
                  </summary>
                  <ul className="races">
                    {g.races.map((r, i) => <RaceItem key={`${r.raceId}-${r.date}-${i}`} race={r} field={noField(r)} ownLevel={raised.has(r) ? profile.level : null} useLevels={false} compact />)}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <>
              <ul className="races">
                {(more ? ordered : detailed).map((r, i) => i < detailed.length
                  ? <RaceItem key={`${r.raceId}-${r.date}-${i}`} race={r} field={fields[i]} ownLevel={raised.has(r) ? profile.level : null} useLevels={thisSeason} />
                  : <RaceItem key={`${r.raceId}-${r.date}-${i}`} race={r} field={noField(r)} ownLevel={raised.has(r) ? profile.level : null} useLevels={false} compact />)}
              </ul>
              {races.length > detailed.length ? (
                <Link className="card-more" href={`/riders/${profileId}?year=${year}${sort === 'oldest' ? '&sort=oldest' : ''}${more ? '' : '&more=1'}#races`}>
                  {more ? 'Show fewer' : `Show all ${races.length} races ›`}
                </Link>
              ) : null}
            </>
          )}
          <p className="muted small">
            Points are worked out from the USA BMX rule book: finish points plus one point per rider in the moto, times the
            race&apos;s multiplier. USA BMX doesn&apos;t publish points per race, so season totals can differ slightly.
          </p>
        </section>

        <Suspense fallback={<section className="card"><h2>Lap times</h2><p className="muted">Loading lap times…</p></section>}>
          <LapTimesSection
            year={year}
            races={races}
            rider={{
              firstName: profile.firstName, lastName: profile.lastName, state: profile.state,
              birthYear: riderAge.birthYear, transponders: tracked?.transponders,
            }}
          />
        </Suspense>
      </main>
    </>
  );
}

// Streams in after the rest of the page: Sqorz can take a few seconds the first time a track is read.
async function LapTimesSection({ rider, year, races }: { rider: RiderMatch; year: number; races: Race[] }) {
  const data = await getLapTimes(rider, year, races).catch(() => null);
  return (
    <section className="card" id="lap-times">
      <h2>{year} lap times</h2>
      {!data ? (
        <p className="muted">Sqorz didn&apos;t answer, so lap times can&apos;t be shown right now.</p>
      ) : data.laps.length ? (
        <LapTimesView data={data} name={`${rider.firstName} ${rider.lastName}`} />
      ) : (
        <p className="muted">No lap times for {rider.firstName} in {year}.</p>
      )}
      <p className="muted small">
        Lap times come from Sqorz timing{data?.sources.length ? ` (${data.sources.join(', ')})` : ''}. Tracks only time riders who
        carry a transponder, and nationals don&apos;t time Novice or Intermediate motos.{data?.laps.length ? ' Tap a time to compare it with other riders there.' : ''}
      </p>
    </section>
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
        {s.found ? <span>{s.place ? `#${num(s.place)}` : '–'} · {pts(s.points!)}</span> : <span className="muted">Not ranked</span>}
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

function RaceItem({ race, field, ownLevel, useLevels, compact = false }: { race: Race; field: RaceField; ownLevel: string | null; useLevels: boolean; compact?: boolean }) {
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
        {/* USA BMX lists 0 when no place was recorded: shown as DNQ (did not qualify). */}
        <span className={`finish ${race.finish === 1 ? 'win' : ''}`}>{race.finish > 0 ? ordinal(race.finish) : /bal(ance|\.)?\s*bike/i.test(race.ageGroup) ? '–' : 'DNQ'}</span>
        <div className="race-body">
          <div className="race-title">
            <strong><Link href={field.trackId ? `/tracks/${field.trackId}?race=${race.raceId}` : `/events/${race.raceId}`}>{race.track}</Link></strong>
            {points ? <span className="race-points">+{pts(points.district)}</span> : null}

          </div>
          <p className="muted small">
            {formatDate(race.date)} · {raceLabel(race.raceType)} · {race.ageGroup}{race.bike === 'cruiser' ? ' Cruiser' : ''} · {race.riders} riders
            {race.finish > 0 || /bal(ance|\.)?\s*bike/i.test(race.ageGroup) ? '' : ' · DNQ (did not qualify)'}
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
      ) : field.field === null && !compact ? (
        <p className="muted small">Opponents not available for this race.</p>
      ) : null}
    </li>
  );
}

// One group per track, most recent first. Events USA BMX runs itself (nationals, Gold Cup finals) list
// "USA BMX" as the track and each day as its own race, so their days are grouped by date instead: days
// within a few days of each other make one event. Its race pages only say "Standard TRIPLE" at USA BMX in
// Desoto TX (the head office), so the event is named after the national running on those dates, or else
// after its race name ("Gold Cup Final"), and dated.
function byTrack(races: Race[], nationals: National[], riderState: string | null): { track: string; races: Race[] }[] {
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  const groups: { key: string; races: Race[] }[] = [];
  for (const r of races) {
    const g = groups.find(x => x.key === r.track && (r.track !== 'USA BMX' || days(x.races.at(-1)!.date, r.date) <= 3));
    if (g) g.races.push(r);
    else groups.push({ key: r.track, races: [r] });
  }
  return groups.map(({ key, races: list }) => {
    if (key !== 'USA BMX') return { track: key, races: list };
    const first = list.at(-1)!.date, last = list[0].date;
    const name = nationalOn(nationals, first, last, riderState)?.name ?? eventName(list) ?? 'USA BMX event';
    return { track: `${name} · ${formatDate(first)}${first === last ? '' : `–${formatDate(last)}`}`, races: list };
  });
}

const CANADA = /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/;

// Some nationals add a practice or pre-race day before their listed dates, so any overlap counts.
// A US and a Canadian national sometimes run the same weekend; pick the one in the rider's own country.
function nationalOn(nationals: National[], first: string, last: string, riderState: string | null): National | undefined {
  const on = nationals.filter(n => n.begins <= last && first <= n.ends);
  const canadian = (s: string | null) => !!s && CANADA.test(s.toUpperCase());
  return on.find(n => canadian(n.state) === canadian(riderState)) ?? on[0];
}

// The race name of the event's biggest day, unless it's just "Standard": "Gold Cup Final QUADRUPLE" -> "Gold Cup Final".
function eventName(list: Race[]): string | null {
  const top = [...list].sort((a, b) => multiplier(b.raceType) - multiplier(a.raceType))[0];
  const name = raceLabel(top.raceType).split(' · ')[0];
  return /^standard$/i.test(name) ? null : name;
}

function winsText(races: Race[]): string {
  const n = races.filter(r => r.finish === 1).length;
  return `${n} ${n === 1 ? 'win' : 'wins'}`;
}
