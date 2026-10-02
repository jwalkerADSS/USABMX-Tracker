import 'server-only';
import { getNationalRaces, getRaceHistory, type Profile, type Race, type Tables } from './usabmx';

// Proficiency advancement (USA BMX rule book): a Novice moves up to Inter after 10 class wins or 3 title
// wins; a boy Inter moves up to Expert after 20 class wins, a girl Inter to Girl Expert after 10, or either
// after 5 title wins. Wins of any race type count; open and cruiser wins don't. Title wins are wins at a
// National, the Grands, a Gold Cup Final (Saturday or Sunday) or the Race of Champions.
// USA BMX keeps each rider's official count but doesn't publish it, so the app counts class wins in race history.
export type Promotion = { to: string; wins: number; need: number; titleWins: number; titleNeed: number };

const RULES: Record<string, { to: (female: boolean) => string; need: (female: boolean) => number; titleNeed: number; below: string[] }> = {
  Novice: { to: () => 'Inter', need: () => 10, titleNeed: 3, below: [] },
  Inter: { to: female => (female ? 'Girl Expert' : 'Expert'), need: female => (female ? 10 : 20), titleNeed: 5, below: ['Novice'] },
};

const counts = (r: Race) => r.bike === 'class' && !/open|cruiser|bal/i.test(`${r.level} ${r.ageGroup}`);

// Events USA BMX runs itself list "USA BMX" as the track. A national's pre-race day and a Gold Cup Final's
// Friday aren't title races.
const isTitle = (r: Race) => r.track === 'USA BMX' && !/prerace|pre-race/i.test(r.raceType)
  && !(/gold cup/i.test(r.raceType) && new Date(`${r.date}T12:00:00Z`).getUTCDay() === 5);

export function isFemale(tables: Tables | undefined, races: Race[]): boolean {
  const labels = [tables?.national?.pointClass, tables?.district?.class, tables?.nag?.ageGroup].filter(Boolean) as string[];
  if (labels.length) return labels.some(l => /girl/i.test(l));
  return races.some(r => r.bike === 'class' && /girl/i.test(r.ageGroup));
}

const ruleFor = (level: string | null) => (level ? RULES[level === 'Intermediate' ? 'Inter' : level] : undefined);

export function promotionFrom(level: string | null, female: boolean, races: Race[]): Promotion | null {
  const rule = ruleFor(level);
  if (!rule) return null;
  // Every class win since reaching this level, which is after their last race at a lower level. Race history
  // gives each moto's points level, and a Novice combined into an Inter moto shows Inter, so a win only
  // counts once no later race shows the lower level.
  const since = races.filter(r => counts(r) && rule.below.includes(r.level)).map(r => r.date).sort().pop() ?? '';
  const won = races.filter(r => r.finish === 1 && counts(r) && r.date > since);
  return { to: rule.to(female), wins: won.length, need: rule.need(female), titleWins: won.filter(isTitle).length, titleNeed: rule.titleNeed };
}

// Races since the rider reached their current level: this season back, stopping at the first season whose
// class races are all at a lower level. Seasons with no races are skipped. Nationals USA BMX left out of
// race history (from late 2025) come from posted results.
export async function levelRaces(profile: Profile, current: number): Promise<Race[]> {
  const rule = ruleFor(profile.level);
  if (!rule) return [];
  const first = Math.max(2017, Number(profile.memberSince?.slice(0, 4)) || 2017);
  const rider = { name: `${profile.firstName} ${profile.lastName}`, state: profile.state };
  const all: Race[] = [];
  for (let year = current; year >= first; year--) {
    const history = await getRaceHistory(profile.memberId, year).catch(() => [] as Race[]);
    const races = [...history, ...await getNationalRaces(year, rider, history).catch(() => [] as Race[])];
    all.push(...races);
    const cls = races.filter(counts);
    if (cls.length && cls.every(r => rule.below.includes(r.level))) break;
  }
  return all;
}

export async function getPromotion(profile: Profile, tables: Tables | undefined, current: number): Promise<Promotion | null> {
  if (!ruleFor(profile.level)) return null;
  const races = await levelRaces(profile, current);
  return promotionFrom(profile.level, isFemale(tables, races), races);
}
