'use client';

import { useRouter } from 'next/navigation';

export type RaceSort = 'newest' | 'oldest' | 'track';
const SORTS: [RaceSort, string][] = [['newest', 'Newest'], ['oldest', 'Oldest'], ['track', 'Track / event']];

// Season and sort for the races list. Changing either reloads the page for that season, back at the races.
export function RaceControls({ profileId, year, years, sort }: { profileId: number; year: number; years: number[]; sort: RaceSort }) {
  const router = useRouter();
  const go = (y: number, s: RaceSort) => router.push(`/riders/${profileId}?year=${y}${s === 'newest' ? '' : `&sort=${s}`}#races`);
  return (
    <div className="lap-controls race-controls">
      <label className="lap-sort">
        <span className="muted small">Season</span>
        <select value={year} onChange={e => go(Number(e.target.value), sort)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <label className="lap-sort">
        <span className="muted small">Sort by</span>
        <select value={sort} onChange={e => go(year, e.target.value as RaceSort)}>
          {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}

// A drop-down where each choice opens its own link (the server works out each link).
export function LinkSelect({ label, value, options }: { label: string; value: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <label className="lap-sort">
      <span className="muted small">{label}</span>
      <select value={value} onChange={e => { const o = options.find(x => x.value === e.target.value); if (o) router.push(o.href, { scroll: false }); }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
