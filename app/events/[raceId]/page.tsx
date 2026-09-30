import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { DayResults, oursMatcher } from '../../results';
import { TRACKED } from '@/lib/riders';
import { formatDate } from '@/lib/format';
import { getEvent, getRaceDayResults } from '@/lib/usabmx';

export const maxDuration = 60;

type Props = { params: Promise<{ raceId: string }>; searchParams: Promise<{ day?: string }> };

export async function generateMetadata({ params }: Props) {
  const event = await getEvent(Number((await params).raceId)).catch(() => null);
  return { title: event?.raceType ?? 'Race results' };
}

// One event's results, day by day: every moto with its riders and finishes. Used for nationals,
// which run at venues with no track page.
export default async function EventPage({ params, searchParams }: Props) {
  const raceId = Number((await params).raceId);
  if (!Number.isInteger(raceId) || raceId <= 0) notFound();
  const event = await getEvent(raceId).catch(() => null);
  if (!event) notFound();
  const { day: dayParam } = await searchParams;
  const day = event.hasResults ? event.days.find(d => d.raceDayId === Number(dayParam)) ?? event.days.at(-1) : undefined;
  const groups = day ? await getRaceDayResults(day.raceDayId).catch(() => []) : [];
  const where = [event.venue, [event.city, event.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>{event.raceType ?? 'Race results'}</h1>
          {where ? <p className="muted">{where}</p> : null}
          {event.trackId ? <p className="small"><Link href={`/tracks/${event.trackId}?race=${raceId}`}>Track page ›</Link></p> : null}
          {day && event.days.length > 1 ? (
            <nav className="day-tabs">
              {event.days.map(d => (
                <Link key={d.raceDayId} href={`/events/${raceId}?day=${d.raceDayId}`} className={d.raceDayId === day?.raceDayId ? 'active' : ''}>
                  {formatDate(d.date)}
                </Link>
              ))}
            </nav>
          ) : null}
          {!day ? <p className="muted">Results for this race haven&apos;t been posted yet.</p> : null}
          <p className="muted small">
            <a href={`https://www.usabmx.com/events/${raceId}/results`} target="_blank" rel="noreferrer">See it on USA BMX ›</a>
          </p>
        </section>
        {day ? (
          <DayResults groups={groups} isOurs={oursMatcher(TRACKED)} title={`${formatDate(day.date)}${day.name ? ` · ${day.name}` : ''}`} />
        ) : null}
      </main>
    </>
  );
}
