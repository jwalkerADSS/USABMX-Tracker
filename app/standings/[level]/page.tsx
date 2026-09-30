import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '../../nav';
import { currentSeason, findTracked } from '@/lib/riders';
import { num } from '@/lib/format';
import { LEVEL_LABELS, getPoints, getStandingsTable, levelOfPointsType, rankPage, tableTitle, type Level } from '@/lib/usabmx';

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
