import Link from 'next/link';
import { REGION_SHORT, levelOfPointsType, type Level, type Points, type PointsEntry, type Standing, type Tables } from '@/lib/usabmx';
import { num, pts } from '@/lib/format';

// "State (NV)" -> "NV", "Gold Cup (SW)" -> "SW"
const inBrackets = (type: string) => type.match(/\(([^)]+)\)/)?.[1] ?? null;

type Tile = { key: string; label: string; place: string; sub: string; href: string | null };

// Every points series, in order: District, State (one tile per state the rider has points in, since riders can race
// State in neighbouring states), Gold Cup with its region, NAG and National. Ranks come from the rider's USA BMX
// points; a series they have no points in shows a dash and "Not ranked". When the rider's tables are known, a tile
// with a table opens the full standings with the rider highlighted.
export function RankRow({ points, profileId, tables, goldCup }: { points: Points; profileId?: number; tables?: Tables; goldCup?: Standing | null }) {
  const link = (level: Level) => (profileId && tables && level in tables ? `/standings/${level}?rider=${profileId}#me` : null);
  const of = (level: Level) => points.class.filter(p => levelOfPointsType(p.type) === level);
  const ranked = (key: string, label: string, p: PointsEntry, href: string | null): Tile =>
    ({ key, label, place: p.rank ? `#${num(p.rank)}` : '–', sub: pts(p.points), href });
  const unranked = (key: string, label: string): Tile => ({ key, label, place: '–', sub: 'Not ranked', href: null });

  const tiles: Tile[] = [];
  const district = of('district')[0];
  tiles.push(district ? ranked('district', 'District', district, link('district')) : unranked('district', 'District'));

  const states = of('state');
  for (const p of states) {
    const st = inBrackets(p.type);
    // Only the state the rider's standings table is for can open it.
    tiles.push(ranked(p.type, st ? `State (${st})` : 'State', p, !st || st === tables?.state?.state ? link('state') : null));
  }
  if (!states.length) tiles.push(unranked('state', tables?.state ? `State (${tables.state.state})` : 'State'));

  // Gold Cup is in the rider's points once they have some; otherwise check the Gold Cup table itself.
  const gc = of('goldCup')[0];
  const region = (gc && inBrackets(gc.type)) ?? (tables?.goldCup ? REGION_SHORT[tables.goldCup.region] ?? tables.goldCup.region : null);
  const gcLabel = region ? `Gold Cup (${region})` : 'Gold Cup';
  if (gc) tiles.push(ranked('goldCup', gcLabel, gc, link('goldCup')));
  else if (goldCup?.found) tiles.push({ key: 'goldCup', label: gcLabel, place: goldCup.place ? `#${num(goldCup.place)}` : '–', sub: pts(goldCup.points!), href: link('goldCup') });
  else tiles.push(unranked('goldCup', gcLabel));

  const nag = of('nag')[0];
  tiles.push(nag ? ranked('nag', 'NAG', nag, link('nag')) : unranked('nag', 'NAG'));
  const national = of('national')[0];
  tiles.push(national ? ranked('national', 'National', national, link('national')) : unranked('national', 'National'));

  return (
    <div className="ranks">
      {tiles.map(t => {
        const body = (
          <>
            <span className="rank-label">{t.label}</span>
            <span className="rank-place">{t.place}</span>
            <span className="rank-points">{t.sub}</span>
          </>
        );
        return t.href ? <Link key={t.key} href={t.href} className="rank rank-link">{body}</Link> : <div key={t.key} className="rank">{body}</div>;
      })}
    </div>
  );
}
