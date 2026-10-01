'use client';

import { useMemo, useRef, useState } from 'react';
import { ordinal } from '@/lib/format';
import type { CompareEntry, LapTimes } from '@/lib/sqorz';

type Lap = LapTimes['laps'][number];

type Sort = 'newest' | 'oldest' | 'shortest' | 'longest';
const SORTS: [Sort, string][] = [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['shortest', 'Shortest first'], ['longest', 'Longest first']];
const BEST = 10;

export function time(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}
const gap = (ms: number) => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(3)}`;
const day = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function sorted(laps: Lap[], sort: Sort): Lap[] {
  const by = {
    newest: (a: Lap, b: Lap) => b.date.localeCompare(a.date) || a.ms - b.ms,
    oldest: (a: Lap, b: Lap) => a.date.localeCompare(b.date) || a.ms - b.ms,
    shortest: (a: Lap, b: Lap) => a.ms - b.ms,
    longest: (a: Lap, b: Lap) => b.ms - a.ms,
  }[sort];
  return [...laps].sort(by);
}

export function LapTimesView({ data, name }: { data: LapTimes; name: string }) {
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<Sort>('shortest');
  const [open, setOpen] = useState<Lap | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // Times only compare on the same track and bike, so each location's fastest gets the "Best" tag.
  const best = useMemo(() => {
    const m = new Map<string, Lap>();
    for (const l of data.laps) {
      const k = `${l.location}/${l.bike}`;
      if (!m.has(k) || m.get(k)!.ms > l.ms) m.set(k, l);
    }
    return new Set([...m.values()].map(l => l.id));
  }, [data.laps]);

  const shown = all ? sorted(data.laps, sort) : sorted(sorted(data.laps, 'shortest').slice(0, BEST), sort);
  const show = (l: Lap) => {
    setOpen(l);
    dialog.current?.showModal();
  };

  return (
    <>
      <div className="lap-controls">
        <label className="lap-sort">
          <span className="muted small">Sort by</span>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
            {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
      </div>
      <ul className="laps">
        {shown.map(l => (
          <li key={l.id}>
            <button type="button" className="lap" onClick={() => show(l)}>
              <span className="lap-time">
                {time(l.ms)}
                {best.has(l.id) ? <span className="lap-best">Best</span> : null}
              </span>
              <span className="lap-body">
                <strong>{l.location}{l.bike === 'cruiser' ? ' (cruiser)' : ''}</strong>
                <span className="muted small">{day(l.date)} · {l.event}</span>
                {l.details.length ? <span className="muted small">{l.details.join(' · ')}</span> : null}
                {l.splits.length ? <span className="lap-splits small">{l.splits.map(s => `${s.name} ${time(s.ms)}`).join(' · ')}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {data.laps.length > BEST ? (
        <button
          type="button"
          className="secondary lap-more"
          onClick={() => {
            setSort(all ? 'shortest' : 'newest');
            setAll(!all);
          }}
        >
          {all ? `Show the ${BEST} best` : `Show all ${data.laps.length} times`}
        </button>
      ) : null}

      <dialog ref={dialog} className="lap-dialog" onClose={() => setOpen(null)} onClick={e => e.target === dialog.current && dialog.current?.close()}>
        {open ? <Compare lap={open} name={name} /> : null}
        <form method="dialog">
          <button className="secondary lap-close">Close</button>
        </form>
      </dialog>
    </>
  );
}

// The fastest time at the location, then the 2 riders just faster and the 2 just slower than this time.
function Compare({ lap, name }: { lap: Lap; name: string }) {
  const c = lap.compare;
  const row = (e: CompareEntry, key: string) => (
    <li key={key}>
      <span className="cmp-name">
        {e.name}
        <span className="muted small">{[e.info, day(e.date)].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="cmp-time">{time(e.ms)}<span className="muted small">{gap(e.ms - lap.ms)}</span></span>
    </li>
  );
  return (
    <div className="stack-sm">
      <h2>{time(lap.ms)} at {lap.location}</h2>
      <p className="muted small">{name} · {day(lap.date)} · {lap.event}</p>
      {!c || c.total < 2 ? (
        <p className="muted">No other riders&apos; times are posted for this track yet.</p>
      ) : (
        <>
          <p className="small">
            {c.rank === 1 ? 'Fastest' : `${ordinal(c.rank)}`} of {c.total} riders timed at {c.label}, against each rider&apos;s best time.
          </p>
          {c.fastest ? (
            <>
              <h3 className="cmp-head">Fastest</h3>
              <ul className="cmp">{row(c.fastest, 'fastest')}</ul>
            </>
          ) : null}
          <h3 className="cmp-head">Closest times</h3>
          <ul className="cmp">
            {c.faster.map((e, i) => row(e, `f${i}`))}
            <li className="ours">
              <span className="cmp-name">{name}<span className="small">This time</span></span>
              <span className="cmp-time">{time(lap.ms)}</span>
            </li>
            {c.slower.map((e, i) => row(e, `s${i}`))}
          </ul>
        </>
      )}
    </div>
  );
}
