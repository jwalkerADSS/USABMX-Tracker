import Link from 'next/link';
import { levelOfPointsType, type Points, type Standing, type Tables } from '@/lib/usabmx';
import { num, pts } from '@/lib/format';

const SHORT: Record<string, string> = { District: 'District', 'U.S. N.A.G.': 'NAG', 'U.S. National': 'National' };
const short = (type: string) => SHORT[type] ?? (type.startsWith('State') ? 'State' : type);

// Rank and points at each level, as USA BMX reports them on the rider's profile. When the rider's tables
// are known, each tile with a table opens the full standings with the rider highlighted.
export function RankRow({ points, profileId, tables, goldCup }: { points: Points; profileId?: number; tables?: Tables; goldCup?: Standing | null }) {
  if (!points.class.length && !goldCup) return <p className="muted small">No points yet this season.</p>;
  const link = (level: string | null) => (profileId && tables && level && level in tables ? `/standings/${level}?rider=${profileId}#me` : null);
  const tiles = points.class.map(p => ({ key: p.type, label: short(p.type), place: p.rank ? `#${num(p.rank)}` : '–', sub: pts(p.points), href: link(levelOfPointsType(p.type)) }));
  // USA BMX doesn't include Gold Cup in a rider's points, so it comes from the Gold Cup table itself.
  if (goldCup) {
    const gc = { key: 'goldCup', label: 'Gold Cup', place: goldCup.found && goldCup.place ? `#${num(goldCup.place)}` : '–', sub: goldCup.found ? pts(goldCup.points!) : 'Not ranked', href: link('goldCup') };
    tiles.splice(Math.min(2, tiles.length), 0, gc);
  }
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
