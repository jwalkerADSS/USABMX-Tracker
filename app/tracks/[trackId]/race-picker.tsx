'use client';

import { useRouter } from 'next/navigation';
import type { TrackRace } from '@/lib/usabmx';
import { raceLabel } from '@/lib/points';

// Race-date dropdown that opens the chosen race straight away.
export function RacePicker({ trackId, races, selected }: { trackId: number; races: TrackRace[]; selected: number }) {
  const router = useRouter();
  return (
    <label className="picker">
      Race date
      <select value={selected} onChange={e => router.push(`/tracks/${trackId}?race=${e.target.value}`)}>
        {races.map(r => (
          <option key={r.raceId} value={r.raceId} disabled={!r.hasResults}>
            {new Date(r.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
            {' · '}
            {raceLabel(r.raceType, true)}
            {r.hasResults ? '' : ' (results pending)'}
          </option>
        ))}
      </select>
    </label>
  );
}
