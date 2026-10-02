import type { Promotion } from '@/lib/promotion';
import { formatDate } from '@/lib/format';

// "Wins to Expert: 12 of 20 (8 to go) · last win Sep 26" for Novice and Inter riders, from USA BMX's
// win count in the district standings.
export function PromotionLine({ promotion: p }: { promotion: Promotion | null }) {
  if (!p) return null;
  const left = p.need - p.wins;
  return (
    <p className="small promotion">
      Wins to {p.to}: <strong>{p.wins}</strong> of {p.need}
      {left > 0 ? ` (${left} to go)` : ', enough to move up'}
      {p.lastWin ? <span className="muted"> · last win {formatDate(p.lastWin)}</span> : null}
    </p>
  );
}
