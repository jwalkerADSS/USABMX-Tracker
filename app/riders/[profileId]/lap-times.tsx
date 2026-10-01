'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ordinal } from '@/lib/format';
import type { CompareEntry, LapTimes } from '@/lib/sqorz';

type Lap = LapTimes['laps'][number];

type Sort = 'newest' | 'oldest' | 'location';
const SORTS: [Sort, string][] = [['newest', 'Newest'], ['oldest', 'Oldest'], ['location', 'Location / event']];
const BEST = 10;

export function time(ms: number): string {
  const s = ms / 1000;
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}
const gap = (ms: number) => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(3)}`;
const day = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const newest = (a: Lap, b: Lap) => b.date.localeCompare(a.date) || a.ms - b.ms;
const oldest = (a: Lap, b: Lap) => a.date.localeCompare(b.date) || a.ms - b.ms;
const fastest = (a: Lap, b: Lap) => a.ms - b.ms;

// One group per track, or per national (all its days), most recently raced first.
function byLocation(laps: Lap[]): { location: string; laps: Lap[] }[] {
  const groups = new Map<string, Lap[]>();
  for (const l of [...laps].sort(newest)) {
    if (!groups.has(l.location)) groups.set(l.location, []);
    groups.get(l.location)!.push(l);
  }
  return [...groups].map(([location, list]) => ({ location, laps: list }));
}

export function LapTimesView({ data, name }: { data: LapTimes; name: string }) {
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<Sort>('newest');
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

  // Newest and Oldest show the 10 best times until "Show all"; Location / event groups every time.
  const order = sort === 'oldest' ? oldest : newest;
  const shown = all ? [...data.laps].sort(order) : [...data.laps].sort(fastest).slice(0, BEST).sort(order);
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
      {sort === 'location' ? (
        <div className="lap-groups">
          {byLocation(data.laps).map(g => {
            const top = g.laps.reduce((a, b) => (b.ms < a.ms ? b : a));
            return (
              <details key={g.location} className="lap-group">
                <summary>
                  <span className="lap-group-head">
                    <strong>{g.location}</strong>
                    <span className="muted small">
                      {g.laps.length} {g.laps.length === 1 ? 'time' : 'times'} · best {time(top.ms)} · last {day(g.laps[0].date)}
                    </span>
                  </span>
                </summary>
                <LapList laps={g.laps} best={best} onPick={show} grouped />
              </details>
            );
          })}
        </div>
      ) : (
        <>
          <LapList laps={shown} best={best} onPick={show} />
          {data.laps.length > BEST ? (
            <button type="button" className="secondary lap-more" onClick={() => setAll(!all)}>
              {all ? `Show the ${BEST} best` : `Show all ${data.laps.length} times`}
            </button>
          ) : null}
        </>
      )}

      <dialog ref={dialog} className="lap-dialog" onClose={() => setOpen(null)} onClick={e => e.target === dialog.current && dialog.current?.close()}>
        {open ? <Compare lap={open} name={name} /> : null}
        <form method="dialog">
          <button className="secondary lap-close">Close</button>
        </form>
      </dialog>
    </>
  );
}

// Inside a location group the track is already named, so each time is titled by its event.
function LapList({ laps, best, onPick, grouped = false }: { laps: Lap[]; best: Set<string>; onPick: (l: Lap) => void; grouped?: boolean }) {
  return (
    <ul className="laps">
      {laps.map(l => (
        <li key={l.id}>
          <button type="button" className="lap" onClick={() => onPick(l)}>
            <span className="lap-time">
              {time(l.ms)}
              {best.has(l.id) ? <span className="lap-best">Best</span> : null}
            </span>
            <span className="lap-body">
              <strong>{grouped ? l.event : l.location}{l.bike === 'cruiser' ? ' (cruiser)' : ''}</strong>
              <span className="muted small">{grouped ? day(l.date) : `${day(l.date)} · ${l.event}`}</span>
              {l.details.length ? <span className="muted small">{l.details.join(' · ')}</span> : null}
              {l.splits.length ? <span className="lap-splits small">{l.splits.map(s => `${s.name} ${time(s.ms)}`).join(' · ')}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// The fastest time at the location, then the 2 riders just faster and the 2 just slower than this time.
function Compare({ lap, name }: { lap: Lap; name: string }) {
  const c = lap.compare;
  const row = (e: CompareEntry, key: string) => (
    <li key={key}>
      <span className="cmp-name">
        {e.profileId ? <Link href={`/riders/${e.profileId}`}>{e.name}</Link> : e.name}
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
