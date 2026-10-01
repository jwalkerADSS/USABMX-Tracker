import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { currentSeason, getRiderTables } from '@/lib/riders';
import { formatDate, num, ordinal } from '@/lib/format';
import {
  LEVEL_LABELS, getPoints, getProfile, getRiderNationals, getStandingsTable, levelOfPointsType, rankPage, tableTitle,
  type Level,
} from '@/lib/usabmx';

export const maxDuration = 60;

type Props = { params: Promise<{ level: string }>; searchParams: Promise<{ rider?: string; page?: string }> };

const isLevel = (l: string): l is Level => l in LEVEL_LABELS;

export async function generateMetadata({ params, searchParams }: Props) {
  const { level } = await params;
  const rider = Number((await searchParams).rider);
  const tracked = Number.isInteger(rider) && rider > 0 ? await getRiderTables(rider).catch(() => null) : null;
  return { title: (isLevel(level) && tracked && tableTitle(level, tracked.tables)) || 'Standings' };
}

export default async function StandingsPage({ params, searchParams }: Props) {
  const { level } = await params;
  const { rider, page: pageParam } = await searchParams;
  const riderId = Number(rider);
  const tracked = Number.isInteger(riderId) && riderId > 0 ? await getRiderTables(riderId).catch(() => null) : null;
  if (!isLevel(level) || !tracked || !tableTitle(level, tracked.tables)) notFound();
  const year = currentSeason();
  const ids = new Set([tracked.profileId, ...(tracked.altProfileIds ?? [])]);
  const isMe = (r: { memberId: number | null; profileId: number | null }) =>
    r.memberId === tracked.memberId || (r.profileId != null && ids.has(r.profileId));

  // Open on the page the rider is on, using the rank USA BMX reports for them.
  let page = Number(pageParam) || 0;
  if (!page) {
    const points = await getPoints(tracked.profileId).catch(() => null);
    page = rankPage(points?.class.find(p => levelOfPointsType(p.type) === level)?.rank);
  }
  let table = await getStandingsTable(level, tracked.tables, year, page);
  // Unranked riders (place 0) are mixed in by points, so the rider can land one page later.
  if (table && !pageParam && !table.rows.some(isMe) && page < table.lastPage) {
    table = (await getStandingsTable(level, tracked.tables, year, page + 1)) ?? table;
  }
  if (!table) notFound();
  // NAG and national points come from the nationals, so those pages also list the nationals the rider raced.
  const showNationals = level === 'nag' || level === 'national';
  const me = table.rows.find(isMe);
  const href = (p: number) => `/standings/${level}?rider=${tracked.profileId}&page=${p}`;

  return (
    <>
      <Nav back />
      <main className="stack">
        <section className="card">
          <h1>{table.title}</h1>
          <p className="muted">
            {year} standings
            {me ? ` · ${tracked.name.split(' ')[0]} is ${me.place ? `#${num(me.place)}` : 'unranked'} with ${num(me.points)} pts` : ` · ${tracked.name} ${pageParam ? "isn't on this page" : "isn't ranked here yet"}`}
          </p>
          <Pager page={table.page} lastPage={table.lastPage} href={href} />
          {showNationals ? <p className="small"><a href="#nationals">{tracked.name.split(' ')[0]}&apos;s {year} nationals ↓</a></p> : null}
        </section>
        <section className="card">
          {table.rows.length ? (
            <table className="standings-table">
              <thead>
                <tr><th>#</th><th>Rider</th><th>Points</th></tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={`${r.memberId ?? r.name}-${i}`} id={isMe(r) ? 'me' : undefined} className={isMe(r) ? 'ours' : ''}>
                    <td>{r.place ? num(r.place) : '–'}</td>
                    <td>
                      {r.profileId ? <Link href={`/riders/${r.profileId}`}>{r.name}</Link> : r.name}
                      {r.ageGroup ? <span className="muted small"> · {r.ageGroup}</span> : null}
                    </td>
                    <td>{num(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Nobody has points in this table yet.</p>
          )}
          <Pager page={table.page} lastPage={table.lastPage} href={href} />
          <p className="muted small">
            {level === 'district'
              ? "A dash (-) next to a rider's name means they are currently ranked in the top 10 nationwide for NAG standings. "
              : 'A dash means USA BMX lists the rider without a ranking. '}
            <a href={table.url}>View on USA BMX</a>
          </p>
        </section>
        {showNationals ? (
          <section className="card" id="nationals">
            <h2>{tracked.name.split(' ')[0]}&apos;s {year} nationals</h2>
            <Suspense fallback={<p className="muted small">Searching this season&apos;s national results…</p>}>
              <RiderNationals year={year} name={tracked.name} profileId={tracked.profileId} />
            </Suspense>
          </section>
        ) : null}
      </main>
    </>
  );
}

function Pager({ page, lastPage, href }: { page: number; lastPage: number; href: (p: number) => string }) {
  if (lastPage <= 1) return null;
  return (
    <nav className="pager">
      {page > 1 ? <Link href={href(page - 1)}>‹ Places {num((page - 2) * 100 + 1)}–{num((page - 1) * 100)}</Link> : <span />}
      <span className="muted small">Page {page} of {lastPage}</span>
      {page < lastPage ? <Link href={href(page + 1)}>Places {num(page * 100 + 1)}+ ›</Link> : <span />}
    </nav>
  );
}

// Searching every national's results takes a few seconds the first time, so this streams in after the table.
async function RiderNationals({ year, name, profileId }: { year: number; name: string; profileId: number }) {
  const profile = await getProfile(profileId).catch(() => null);
  const nationals = await getRiderNationals(year, { name, state: profile?.state ?? null }).catch(() => null);
  const first = name.split(' ')[0];
  const note = `USA BMX posts only each class's main event at nationals, so a national shows up here when ${first} made a main.`;
  if (!nationals) return <p className="muted small">USA BMX&apos;s national results didn&apos;t load. Try again in a bit.</p>;
  if (!nationals.length) return <p className="muted small">No nationals found for {first} this season. {note}</p>;
  return (
    <>
      <p className="muted small">{note} Tap one for every moto and finish.</p>
      <ul className="nationals">
        {nationals.map(n => {
          const dates = n.begins === n.ends ? formatDate(n.begins) : `${formatDate(n.begins)}–${formatDate(n.ends)}`;
          const where = [n.venue, [n.city, n.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
          return (
            <li key={n.raceId}>
              <Link href={`/events/${n.raceId}?day=${n.finishes[0].raceDayId}`}>
                <span className="nat-main">
                  <strong>{n.name}</strong>
                  {where ? <span className="muted small">{where}</span> : null}
                  {n.finishes.map(f => (
                    <span key={f.raceDayId + f.className} className="small nat-finish">
                      {formatDate(f.date)}: {f.place ? ordinal(f.place) : '–'} in the {f.className} main{f.totalRiders ? ` (${f.totalRiders} riders)` : ''}
                    </span>
                  ))}
                </span>
                <span className="nat-when">{dates}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
