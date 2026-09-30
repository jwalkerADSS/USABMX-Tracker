import Link from 'next/link';
import { ordinal } from '@/lib/format';
import type { ResultGroup, ResultRider } from '@/lib/usabmx';
import { MotoFilter } from './moto-filter';

// Local results carry member ids; national results only have names, so fall back to matching the name.
export type IsOurs = (r: ResultRider) => boolean;

export function oursMatcher(riders: { memberId: number; name: string }[]): IsOurs {
  const ids = new Set(riders.map(r => r.memberId));
  const names = new Set(riders.map(r => r.name.toUpperCase()));
  return r => (r.memberId != null ? ids.has(r.memberId) : names.has(r.name.toUpperCase()));
}

// Every moto of one race day: our riders' finishes first, then each moto's finishing order.
export function DayResults({ groups, isOurs, title }: { groups: ResultGroup[]; isOurs: IsOurs; title: string }) {
  const ours = groups.flatMap(g => g.riders.filter(isOurs).map(r => ({ ...r, group: g })));
  const riders = groups.reduce((n, g) => n + (g.totalRiders ?? g.riders.length), 0);
  const mainsOnly = groups.some(g => g.totalRiders != null && g.totalRiders > g.riders.length);
  return (
    <>
      <section className="card">
        <h2>{title}</h2>
        <p className="muted small">
          {groups.length} motos · {riders.toLocaleString('en-US')} riders
          {mainsOnly ? '. USA BMX posts only the main event finishers for each class at nationals.' : ''}
        </p>
        {ours.length ? (
          <ul className="our-results">
            {ours.map(r => (
              <li key={`${r.name}-${r.group.name}`}>
                <span className={`finish ${r.place === 1 ? 'win' : ''}`}>{r.place ? ordinal(r.place) : '–'}</span>
                <span>
                  {r.profileId ? <Link href={`/riders/${r.profileId}`}>{r.name}</Link> : r.name}
                  <span className="muted small"> · {r.group.className}, {r.group.totalRiders ?? r.group.riders.length} riders</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {groups.length ? (
        <MotoFilter count={groups.length}>
          {groups.map(g => <GroupCard key={g.name} group={g} isOurs={isOurs} />)}
        </MotoFilter>
      ) : (
        <p className="card muted">No results were posted for this day.</p>
      )}
    </>
  );
}

function GroupCard({ group, isOurs }: { group: ResultGroup; isOurs: IsOurs }) {
  const total = group.totalRiders ?? group.riders.length;
  const sub = group.totalRiders != null && group.totalRiders > group.riders.length ? `main · ${total} riders` : `${total} riders`;
  const search = [group.className, ...group.riders.map(r => r.name)].join(' ').toLowerCase();
  return (
    <section className="card group" data-search={search}>
      <div className="group-head">
        <strong>{group.className}</strong>
        <span className="muted small">{[group.pointsType, sub].filter(Boolean).join(' · ')}</span>
      </div>
      <ol className="group-riders">
        {group.riders.map((r, i) => (
          <li key={`${r.memberId ?? r.name}-${i}`} className={isOurs(r) ? 'ours' : ''}>
            <span className="place">{r.place ? ordinal(r.place) : '–'}</span>
            <span className="rider-cell">
              {r.profileId ? <Link href={`/riders/${r.profileId}`}>{r.name}</Link> : <span>{r.name}</span>}
              {r.detail ? <span className="muted small rider-detail">{r.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
