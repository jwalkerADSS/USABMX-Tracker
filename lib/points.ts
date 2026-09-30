// Points earned at a single race, worked out from the USA BMX rulebook (2025, section VII "Amateur Points").
// USA BMX doesn't publish points per race, only season totals. Checked against those totals for NV01 riders
// in September 2026: the district formula below matched exactly for 92 of 114 riders; the rest had extra
// points from outside race history (national bonus points, point transfers).
import type { Race } from './usabmx';

type Skill = 'Novice' | 'Inter' | 'Expert';

// Main-event finish points, 1st to 8th. Riders outside the top 8 get none.
const DISTRICT: Record<Skill, number[]> = {
  Novice: [25, 20, 15, 12, 10, 7, 5, 3],
  Inter: [50, 40, 30, 25, 20, 15, 10, 5],
  Expert: [100, 80, 60, 50, 40, 30, 20, 10], // also Girl Expert, Cruiser and Girl Cruiser
};
// Gold Cup and state/provincial points: finish only, no rider points. Riders who miss the main get 10.
const SERIES: Record<Skill, number[]> = {
  Novice: [18, 17, 16, 15, 14, 13, 12, 11],
  Inter: [19, 18, 17, 16, 15, 14, 13, 12],
  Expert: [20, 19, 18, 17, 16, 15, 14, 13],
};
const SERIES_DNQ = 10;

// race-history's points_class: Novice, Inter, Expert, Girl Expert, Cruiser, Girl Cruiser, Bal. Bike, *Open.
function skill(pointsClass: string): Skill | null {
  if (/open|bal/i.test(pointsClass)) return null; // open and balance bike classes earn no points
  if (/novice/i.test(pointsClass)) return 'Novice';
  if (/inter/i.test(pointsClass)) return 'Inter';
  if (/expert|cruiser/i.test(pointsClass)) return 'Expert';
  return null;
}

// The race name a track gives an event carries its point multiplier, usually as the last word
// ("Local Race SINGLE", "State Race DOUBLE", "Final, SW QUADRUPLE"), sometimes mid-name
// ("Bob Warnicke SINGLE POINTS", "Race For Life Double DOUBLE") or not at all ("Local Race", "Warnicke").
// Names without one fall back to the rulebook's event types (section VII and the event list).
const WORDS: [RegExp, number][] = [[/\bquad(ruple)?\b/i, 4], [/\btriple\b/i, 3], [/\bdouble\b/i, 2], [/\bsingle\b/i, 1]];
const EVENT_TYPES: [RegExp, number][] = [
  [/grand national/i, 4],
  [/gold cup final|^final,/i, 4],
  [/national/i, 3], // regular nationals are triple district points
  [/(state|provincial) (championship )?final|\bscf\b|\bpcf\b|gold cup|qualifier/i, 3],
  [/pre[- ]?race|state|provincial|earned/i, 2],
];

export function multiplier(raceName: string): number {
  const words = WORDS.filter(([re]) => re.test(raceName)).map(([, m]) => m);
  if (words.length) return Math.max(...words);
  return EVENT_TYPES.find(([re]) => re.test(raceName))?.[1] ?? 1;
}

export const MULTIPLIER_LABELS: Record<number, string> = { 1: 'Single', 2: 'Double', 3: 'Triple', 4: 'Quadruple' };

// "Local Race SINGLE" -> "Local Race · Single points"
// Short form for tight spaces: "State Race DOUBLE" -> "State Race · 2x"
export function raceLabel(raceName: string, short = false): string {
  const name = raceName.replace(/\s+(single|double|triple|quad(ruple)?)(\s+points?)?\s*$/i, '').trim() || raceName.trim();
  const m = multiplier(raceName);
  return `${name} · ${short ? `${m}x` : `${MULTIPLIER_LABELS[m]} points`}`;
}

export type RacePoints = { district: number; state?: number; goldCup?: number; level: Skill };

const RANK: Record<Skill, number> = { Novice: 0, Inter: 1, Expert: 2 };

export function higherLevel(a: string | null | undefined, b: string | null | undefined): boolean {
  const sa = a ? skill(a) : null, sb = b ? skill(b) : null;
  return !!sa && (!sb || RANK[sa] > RANK[sb]);
}

// A race history row can't show a rider's own level, only the moto's label, and riders always score at least
// their own level: an Expert combined into an Inter moto still gets Expert points (rulebook VII.9). History doesn't
// record a rider's level at the time, so a lower-labelled race counts at the rider's current level only when it's
// a one-off inside their final run at that level: the race before it and every race after it are at that level
// or above. Checked on NV01 in September 2026, this fixed one rider's total and changed no other.
export function raisedRaces(races: Race[], currentLevel: string | null): Set<Race> {
  const cur = currentLevel ? skill(currentLevel) : null;
  const raised = new Set<Race>();
  if (!cur) return raised;
  const atLevel = (r: Race) => RANK[skill(r.level) ?? 'Novice'] >= RANK[cur];
  const rs = races.filter(r => skill(r.level) && r.bike === 'class').sort((a, b) => a.date.localeCompare(b.date));
  let inRun = false;
  rs.forEach((r, i) => {
    if (atLevel(r)) return void (inRun = true);
    const later = rs.slice(i + 1);
    if (inRun && i > 0 && atLevel(rs[i - 1]) && later.length && later.every(atLevel)) raised.add(r);
    else inRun = false;
  });
  return raised;
}

// A moto pays everyone in it at the level of its highest rider, whatever its label says: a Novice moto with an
// Inter in it pays Inter points, and an Inter moto with an Expert or Girl Expert in it pays Expert points. The
// label usually already names the highest level, but not always, so atLeast takes the levels of the riders in
// the moto (and the rider's own level) and the race scores at the highest of those and the label.
// Checked in September 2026 against official totals of NV riders with no national points: Owen Gamboa and
// Lucas Mendoza matched exactly once Experts and Girl Experts lifted their Inter motos.
export function racePoints(race: Race, atLeast: (string | null | undefined)[] = []): RacePoints | null {
  let s = skill(race.level);
  if (!s) return null;
  for (const l of atLeast) {
    const k = l ? skill(l) : null;
    if (k && RANK[k] > RANK[s]) s = k;
  }
  const inMain = race.finish >= 1 && race.finish <= 8;
  const m = multiplier(race.raceType);
  // Finish points plus one point for every rider in the class, all times the race's multiplier.
  const points: RacePoints = { district: ((inMain ? DISTRICT[s][race.finish - 1] : 0) + race.riders) * m, level: s };
  const series = inMain ? SERIES[s][race.finish - 1] : SERIES_DNQ;
  // State championship races are worth double (or triple at the final) state points, like their district points.
  if (/\b(state|provincial)\b/i.test(race.raceType) && !/pre[- ]?race/i.test(race.raceType)) points.state = series * m;
  if (/gold cup|qualifier/i.test(race.raceType)) points.goldCup = series;
  return points;
}
