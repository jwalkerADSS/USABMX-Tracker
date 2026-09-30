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
const MULTIPLIERS: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUADRUPLE: 4 };

// race-history's points_class: Novice, Inter, Expert, Girl Expert, Cruiser, Girl Cruiser, Bal. Bike, *Open.
function skill(pointsClass: string): Skill | null {
  if (/open|bal/i.test(pointsClass)) return null; // open and balance bike classes earn no points
  if (/novice/i.test(pointsClass)) return 'Novice';
  if (/inter/i.test(pointsClass)) return 'Inter';
  if (/expert|cruiser/i.test(pointsClass)) return 'Expert';
  return null;
}

// Race types end in the multiplier: "Local Race SINGLE", "State Race DOUBLE", "Gold Cup Qualifier TRIPLE".
export function multiplier(raceType: string): number {
  return MULTIPLIERS[raceType.trim().split(/\s+/).pop()?.toUpperCase() ?? ''] ?? 1;
}

export type RacePoints = { district: number; state?: number; goldCup?: number };

export function racePoints(race: Race): RacePoints | null {
  const s = skill(race.level);
  if (!s) return null;
  const inMain = race.finish >= 1 && race.finish <= 8;
  const m = multiplier(race.raceType);
  // Finish points plus one point for every rider in the class, all times the race's multiplier.
  const points: RacePoints = { district: ((inMain ? DISTRICT[s][race.finish - 1] : 0) + race.riders) * m };
  const series = inMain ? SERIES[s][race.finish - 1] : SERIES_DNQ;
  // State championship races are worth double (or triple at the final) state points, like their district points.
  if (/^state/i.test(race.raceType)) points.state = series * m;
  if (/gold cup/i.test(race.raceType)) points.goldCup = series;
  return points;
}
