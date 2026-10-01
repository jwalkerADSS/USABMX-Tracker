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
