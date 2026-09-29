import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { indexBuiltAt, indexSize, searchRiders } from '@/lib/search';
import { num } from '@/lib/format';

export const metadata = { title: 'Search riders' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim();
  // A USA BMX profile number (from a profile URL) opens that rider directly.
  if (/^\d+$/.test(q)) redirect(`/riders/${q}`);
  const results = q ? searchRiders(q) : [];

  return (
    <>
      <Nav back />
      <main className="stack">
        <form className="card search" action="/search">
          <input name="q" defaultValue={q} placeholder="Rider name" autoFocus enterKeyHint="search" />
          <button type="submit">Search</button>
        </form>
        {q ? (
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
          You can also paste a USA BMX profile number.
        </p>
      </main>
    </>
  );
}
