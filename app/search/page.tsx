import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { indexBuiltAt, indexSize, searchRiders } from '@/lib/search';
import { num } from '@/lib/format';
import { currentSeason } from '@/lib/riders';
import { DISTRICT_CLASSES, getDistrictPlace, type PlateHolder } from '@/lib/usabmx';

// "NV01 #63", "nv01 63" or "NV01-63": a district and plate number.
const PLATE = /^([a-z]{2}\d{2})\s*[-#]?\s*#?\s*(\d{1,4})$/i;

async function plateHolders(district: string, place: number, year: number): Promise<PlateHolder[]> {
  const found = await Promise.all(DISTRICT_CLASSES.map(c => getDistrictPlace(district, c, year, place).catch(() => null)));
  return found.filter((h): h is PlateHolder => h !== null);
}

export const metadata = { title: 'Search riders' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  // A USA BMX profile number (from a profile URL) opens that rider directly.
  if (/^\d+$/.test(q)) redirect(`/riders/${q}`);
  const plate = q.match(PLATE);
  const season = currentSeason();
  // Plates are earned by final district place and run the following season.
  const [plateNow, plateNext] = plate
    ? await Promise.all([
        plateHolders(plate[1].toUpperCase(), Number(plate[2]), season - 1),
        plateHolders(plate[1].toUpperCase(), Number(plate[2]), season),
      ])
    : [[], []];
  const results = q && !plate ? searchRiders(q) : [];

  return (
    <>
      <Nav back />
      <main className="stack">
        <form className="card search" action="/search">
          <input name="q" defaultValue={q} placeholder="Rider name or plate, e.g. NV01 #63" autoFocus enterKeyHint="search" />
          <button type="submit">Search</button>
        </form>
        {plate ? (
          <>
            <PlateSection
              title={`Running ${plate[1].toUpperCase()} #${Number(plate[2])} in ${season}`}
              note={`Earned by finishing #${Number(plate[2])} in the ${season - 1} ${plate[1].toUpperCase()} standings.`}
              holders={plateNow}
              year={season - 1}
            />
            <PlateSection
              title={`#${Number(plate[2])} in ${plate[1].toUpperCase()} right now`}
              note={`Current ${season} standings. Finishing here earns this plate for ${season + 1}.`}
              holders={plateNext}
              year={season}
            />
          </>
        ) : q ? (
          results.length ? (
            <ul className="card results">
              {results.map(r => {
                const best = [...r.sources].sort((a, b) => a.place - b.place)[0];
                return (
                  <li key={r.profileId}>
                    <Link href={`/riders/${r.profileId}`}>
                      <strong>{r.name}</strong>
                      <span className="muted small">
                        {[r.ageGroup, r.district, best ? `${best.table === 'national' ? 'National' : 'District'} #${num(best.place)}` : null]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="card muted">No riders found for &ldquo;{q}&rdquo;.</p>
          )
        ) : null}
        <p className="muted small">
          {indexSize
            ? `Searching ${num(indexSize)} riders from the national standings and Nevada district standings${indexBuiltAt ? `, updated ${new Date(indexBuiltAt).toLocaleDateString('en-US')}` : ''}.`
            : 'The rider list hasn’t been built yet. It updates every night.'}{' '}
          You can also search a district plate like NV01 #63, or paste a USA BMX profile number.
        </p>
      </main>
    </>
  );
}

function PlateSection({ title, note, holders, year }: { title: string; note: string; holders: PlateHolder[]; year: number }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted small">{note}</p>
      {holders.length ? (
        <ul className="results plate-results">
          {holders.map(h => {
            const body = (
              <>
                <strong>{h.name}</strong>
                <span className="muted small">{[h.className, h.ageGroup, `${num(h.points)} pts in ${year}`].filter(Boolean).join(' · ')}</span>
              </>
            );
            return <li key={h.className}>{h.profileId ? <Link href={`/riders/${h.profileId}`}>{body}</Link> : <div className="plain">{body}</div>}</li>;
          })}
        </ul>
      ) : (
        <p className="muted">Nobody holds that number in any class.</p>
      )}
    </section>
  );
}
