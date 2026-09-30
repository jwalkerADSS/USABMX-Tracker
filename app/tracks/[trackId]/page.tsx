import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { RacePicker } from './race-picker';
import { TRACKED } from '@/lib/riders';
import { formatDate, ordinal } from '@/lib/format';
import { raceLabel } from '@/lib/points';
import { getEvent, getRaceDayResults, getTrack, getTrackRaces, type ResultGroup } from '@/lib/usabmx';

export const maxDuration = 60;

type Props = { params: Promise<{ trackId: string }>; searchParams: Promise<{ race?: string; day?: string }> };

export async function generateMetadata({ params }: Props) {
  const track = await getTrack(Number((await params).trackId)).catch(() => null);
  return { title: track?.name ?? 'Track' };
}

export default async function TrackPage({ params, searchParams }: Props) {
  const trackId = Number((await params).trackId);
  if (!Number.isInteger(trackId) || trackId <= 0) notFound();
  const { race: raceParam, day: dayParam } = await searchParams;

  const [track, races] = await Promise.all([getTrack(trackId), getTrackRaces(trackId)]);
  if (!track) notFound();

  // Default to the newest race with results posted.
  const raceId = Number(raceParam) || races.find(r => r.hasResults)?.raceId;
  const event = raceId ? await getEvent(raceId) : null;
  const day = event?.days.find(d => d.raceDayId === Number(dayParam)) ?? event?.days.at(-1);
  const groups = day ? await getRaceDayResults(day.raceDayId) : [];
  // Keep the picker usable when an older race (not in the recent list) is open.
  const pickerRaces = raceId && !races.some(r => r.raceId === raceId) && event && day
    ? [{ raceId, date: day.date, raceType: event.raceType ?? 'Race', hasResults: true }, ...races]
    : races;

  const trackedIds = new Set(TRACKED.map(r => r.memberId));
  const ours = groups.flatMap(g => g.riders.filter(r => trackedIds.has(r.memberId)).map(r => ({ ...r, group: g })));

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>{track.name}</h1>
          {track.city ? <p className="muted">{[track.city, track.state].filter(Boolean).join(', ')}</p> : null}
          {raceId ? (
            <div className="track-controls">
              <RacePicker trackId={trackId} races={pickerRaces} selected={raceId} />
              {event && event.days.length > 1 ? (
                <nav className="day-tabs">
                  {event.days.map(d => (
                    <Link key={d.raceDayId} href={`/tracks/${trackId}?race=${raceId}&day=${d.raceDayId}`}
                      className={d.raceDayId === day?.raceDayId ? 'active' : ''}>
                      {formatDate(d.date)}
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          ) : (
            <p className="muted">No race results posted for this track yet.</p>
          )}
        </section>

        {day ? (
          <>
            <section className="card">
              <h2>{formatDate(day.date)} · {raceLabel(event?.raceType ?? 'Race')}</h2>
              <p className="muted small">
                {groups.length} classes · {groups.reduce((n, g) => n + g.riders.length, 0)} riders
              </p>
              {ours.length ? (
                <ul className="our-results">
                  {ours.map(r => (
                    <li key={`${r.memberId}-${r.group.name}`}>
                      <span className={`finish ${r.place === 1 ? 'win' : ''}`}>{r.place ? ordinal(r.place) : '–'}</span>
                      <span>
                        {r.profileId ? <Link href={`/riders/${r.profileId}`}>{r.name}</Link> : r.name}
                        <span className="muted small"> · {r.group.className}, {r.group.riders.length} riders</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            {groups.length ? (
              groups.map(g => <GroupCard key={g.name} group={g} trackedIds={trackedIds} />)
            ) : (
              <p className="card muted">No results were posted for this day.</p>
            )}
          </>
        ) : null}
      </main>
    </>
  );
}

function GroupCard({ group, trackedIds }: { group: ResultGroup; trackedIds: Set<number> }) {
  return (
    <section className="card group">
      <div className="group-head">
        <strong>{group.className}</strong>
        <span className="muted small">{[group.pointsType, `${group.riders.length} riders`].filter(Boolean).join(' · ')}</span>
      </div>
      <ol className="group-riders">
        {group.riders.map(r => (
          <li key={r.memberId} className={trackedIds.has(r.memberId) ? 'ours' : ''}>
            <span className="place">{r.place ? ordinal(r.place) : '–'}</span>
            {r.profileId ? <Link href={`/riders/${r.profileId}`}>{r.name}</Link> : <span>{r.name}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
