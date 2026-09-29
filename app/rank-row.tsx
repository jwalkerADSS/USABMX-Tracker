import type { Points } from '@/lib/usabmx';
import { num, pts } from '@/lib/format';

const SHORT: Record<string, string> = { District: 'District', 'U.S. N.A.G.': 'NAG', 'U.S. National': 'National' };
const short = (type: string) => SHORT[type] ?? (type.startsWith('State') ? 'State' : type);

// Rank and points at each level, as USA BMX reports them on the rider's profile.
export function RankRow({ points }: { points: Points }) {
  if (!points.class.length) return <p className="muted small">No points yet this season.</p>;
  return (
    <div className="ranks">
      {points.class.map(p => (
        <div key={p.type} className="rank">
          <span className="rank-label">{short(p.type)}</span>
          <span className="rank-place">#{num(p.rank)}</span>
          <span className="rank-points">{pts(p.points)}</span>
        </div>
      ))}
    </div>
  );
}
