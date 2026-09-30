import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { RacePicker } from './race-picker';
import { TRACKED } from '@/lib/riders';
import { formatDate } from '@/lib/format';
import { raceLabel } from '@/lib/points';
import { getEvent, getRaceDayResults, getTrack, getTrackRaces } from '@/lib/usabmx';
import { DayResults, oursMatcher } from '../../results';

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
          <DayResults groups={groups} isOurs={oursMatcher(TRACKED)} title={`${formatDate(day.date)} · ${raceLabel(event?.raceType ?? 'Race')}`} />
        ) : null}
      </main>
    </>
  );
}
