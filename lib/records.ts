import type { Race } from './usabmx';

export type TrackRecord = { track: string; state: string; wins: number; races: number };

// Wins at each track raced, most wins first (ties: better win rate, then more races).
export function winsByTrack(races: Race[]): TrackRecord[] {
  const byTrack = new Map<string, TrackRecord>();
  for (const r of races) {
    const t = byTrack.get(r.track) ?? { track: r.track, state: r.state, wins: 0, races: 0 };
    t.races++;
    if (r.finish === 1) t.wins++;
    byTrack.set(r.track, t);
  }
  return [...byTrack.values()].sort((a, b) => b.wins - a.wins || b.wins / b.races - a.wins / a.races || b.races - a.races);
}

// Fewest wins; among ties, the one raced most often (the lowest win rate).
export function worstTrack(records: TrackRecord[]): TrackRecord | undefined {
  return [...records].sort((a, b) => a.wins - b.wins || a.wins / a.races - b.wins / b.races || b.races - a.races)[0];
}
