import type { Standing, Tables } from './usabmx';

// Proficiency advancement (USA BMX rule book): a Novice moves up to Inter after 10 class wins; a boy Inter
// moves up to Expert after 20, a girl Inter to Girl Expert after 10. USA BMX's own count of each rider's
// wins toward moving up is in the district standings (the Wins column), along with their level.
export type Promotion = { to: string; wins: number; need: number; lastWin: string | null };

export function getPromotion(district: Standing | null | undefined, tables: Tables | undefined): Promotion | null {
  if (!district?.found || district.wins == null) return null;
  const female = /girl/i.test(tables?.district?.class ?? '');
  const lastWin = district.lastWin ?? null;
  switch (district.skill) {
    case 'Novice': return { to: 'Inter', wins: district.wins, need: 10, lastWin };
    case 'Inter': return { to: female ? 'Girl Expert' : 'Expert', wins: district.wins, need: female ? 10 : 20, lastWin };
    default: return null;
  }
}
