import type { Race } from './usabmx';

export type TrackRecord = { track: string; state: string; wins: number; races: number };

// Wins at each track raced, best win rate first. Ties: more wins first; among 0% tracks, fewest races first.
export function winsByTrack(races: Race[]): TrackRecord[] {
  const byTrack = new Map<string, TrackRecord>();
  for (const r of races) {
    const t = byTrack.get(r.track) ?? { track: r.track, state: r.state, wins: 0, races: 0 };
    t.races++;
    if (r.finish === 1) t.wins++;
    byTrack.set(r.track, t);
  }
  return [...byTrack.values()].sort((a, b) => b.wins / b.races - a.wins / a.races || b.wins - a.wins || a.races - b.races);
}
