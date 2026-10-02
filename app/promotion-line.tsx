import type { Promotion } from '@/lib/promotion';

// "Wins to Expert: 12 of 20 (8 to go)" for Novice and Inter riders, counted by the app from race history.
export function PromotionLine({ promotion: p }: { promotion: Promotion | null }) {
  if (!p) return null;
  const left = p.need - p.wins;
  return (
    <p className="small promotion">
      Wins to {p.to}: <strong>{p.wins}</strong> of {p.need}
      {left > 0 ? ` (${left} to go)` : ', enough to move up'}
      {p.titleWins ? `, title wins ${p.titleWins} of ${p.titleNeed}` : ''}
    </p>
  );
}
