import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { currentSeason, findTracked } from '@/lib/riders';
import { formatDate, num } from '@/lib/format';
import {
  LEVEL_LABELS, getNationals, getPoints, getRaceHistory, getStandingsTable, levelOfPointsType, rankPage, tableTitle,
  type Level, type National,
} from '@/lib/usabmx';

export const maxDuration = 60;

type Props = { params: Promise<{ level: string }>; searchParams: Promise<{ rider?: string; page?: string }> };

const isLevel = (l: string): l is Level => l in LEVEL_LABELS;

export async function generateMetadata({ params, searchParams }: Props) {
  const { level } = await params;
  const tracked = findTracked(Number((await searchParams).rider));
  return { title: (isLevel(level) && tracked && tableTitle(level, tracked.tables)) || 'Standings' };
}

export default async function StandingsPage({ params, searchParams }: Props) {
  const { level } = await params;
  const { rider, page: pageParam } = await searchParams;
  const tracked = findTracked(Number(rider));
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
  // NAG and national points come from the nationals, so those pages also list the season's nationals.
  const showNationals = level === 'nag' || level === 'national';
  const [nationals, raced] = showNationals
    ? await Promise.all([
        getNationals(year).catch(() => null),
        getRaceHistory(tracked.memberId, year).then(rs => new Set(rs.map(r => r.raceId))).catch(() => new Set<number>()),
      ])
    : [null, new Set<number>()];
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
          {showNationals ? <p className="small"><a href="#nationals">{year} nationals and results ↓</a></p> : null}
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
            A dash means USA BMX lists the rider without a ranking. <a href={table.url}>View on USA BMX</a>
          </p>
        </section>
        {showNationals ? <NationalsList year={year} nationals={nationals} raced={raced} rider={tracked.name.split(' ')[0]} /> : null}
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

function NationalsList({ year, nationals, raced, rider }: { year: number; nationals: National[] | null; raced: Set<number>; rider: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const racedCount = nationals?.filter(n => raced.has(n.raceId)).length ?? 0;
  return (
    <section className="card" id="nationals">
      <h2>{year} nationals</h2>
      <p className="muted small">
        {nationals
          ? `${nationals.length} nationals this season. ${racedCount ? `${rider} raced ${racedCount}, marked in green.` : `${rider} hasn't raced one yet this season.`} Tap one for every moto and finish.`
          : "USA BMX's race list didn't load. Try again in a bit."}
      </p>
      {nationals?.length ? (
        <ul className="nationals">
          {nationals.map(n => {
            const dates = n.begins === n.ends ? formatDate(n.begins) : `${formatDate(n.begins)}–${formatDate(n.ends)}`;
            const status = n.hasResults ? dates : n.begins > today ? `${dates} · Upcoming` : `${dates} · Results pending`;
            const where = [n.venue, [n.city, n.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
            const body = (
              <>
                <span className="nat-main">
                  <strong>{n.name}{raced.has(n.raceId) ? ' ✓' : ''}</strong>
                  {where ? <span className="muted small">{where}</span> : null}
                </span>
                <span className="nat-when">{status}</span>
              </>
            );
            return (
              <li key={n.raceId} className={raced.has(n.raceId) ? 'raced' : ''}>
                {n.hasResults ? <Link href={`/events/${n.raceId}`}>{body}</Link> : <div className="plain">{body}</div>}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
