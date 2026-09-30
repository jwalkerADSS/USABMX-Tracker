import 'server-only';
import { api } from './usabmx';

// Event search: "California:Nationals", "Nevada:Gold Cup", "January:Nationals", "NV:State:September".
// Each part is a state or province, a month, or an event type; any order, any combination.

type EventType = { label: string; types: string[]; only?: RegExp };
const TYPES: [RegExp, EventType][] = [
  [/^nationals?$/, { label: 'Nationals', types: ['NATIONAL'] }],
  [/^gold ?cups?$/, { label: 'Gold Cup', types: ['Gold Cup'] }],
  [/^(gold ?cup )?qualifiers?$/, { label: 'Gold Cup qualifiers', types: ['Gold Cup'], only: /qualifier/i }],
  [/^(gold ?cup )?finals?$/, { label: 'Finals', types: ['Gold Cup', 'State Championship', 'Provincial Championship'], only: /final/i }],
  [/^state( championships?| races?)?$/, { label: 'State races', types: ['State Championship'] }],
  [/^state finals?$/, { label: 'State finals', types: ['State Championship'], only: /final/i }],
  [/^provincial( championships?)?$/, { label: 'Provincial races', types: ['Provincial Championship'] }],
  [/^locals?( races?)?$/, { label: 'Local races', types: ['Local Race'] }],
  [/^earned doubles?$/, { label: 'Earned doubles', types: ['Earned Double'] }],
  [/^warnicke( doubles?)?$/, { label: 'Warnicke', types: ['Warnicke', 'Warnicke Double'] }],
  [/^race for life( doubles?)?$/, { label: 'Race for Life', types: ['Race For Life', 'Race For Life Double'] }],
  [/^olympic day$/, { label: 'Olympic Day', types: ['Olympic Day'] }],
];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export type EventQuery = { state?: { code: string; name: string }; month?: number; type?: EventType; unknown: string[] };

async function states(): Promise<{ code: string; name: string }[]> {
  return (await api<{ data?: { code: string; name: string }[] }>('v2/events/states').catch(() => ({ data: [] }))).data ?? [];
}

// Null when the text isn't an event search (no colon and not just an event type).
export async function parseEventQuery(q: string): Promise<EventQuery | null> {
  const parts = q.toLowerCase().split(':').map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const typeOf = (p: string) => TYPES.find(([re]) => re.test(p))?.[1];
  if (!q.includes(':') && !(parts.length === 1 && typeOf(parts[0]))) return null;
  const all = await states();
  const query: EventQuery = { unknown: [] };
  for (const p of parts) {
    const type = typeOf(p);
    const month = MONTHS.findIndex(m => m === p || (p.length >= 3 && m.startsWith(p.replace(/\.$/, ''))));
    const state = all.find(s => s.name.toLowerCase() === p || s.code.toLowerCase() === p);
    if (type && !query.type) query.type = type;
    else if (type && query.type && (type.only || query.type.only) && !(type.only && query.type.only)) query.type = combine(query.type, type);
    else if (state && !query.state) query.state = state;
    else if (month >= 0 && query.month == null) query.month = month;
    else query.unknown.push(p);
  }
  return query;
}

// "Gold Cup:Qualifiers", "State:Finals": a race type narrowed to its qualifiers or finals.
function combine(a: EventType, b: EventType): EventType {
  const [base, narrow] = a.only ? [b, a] : [a, b];
  const types = base.types.filter(t => narrow.types.includes(t));
  const word = narrow.only!.test('qualifier') ? 'qualifiers' : 'finals';
  return { label: `${base.label.replace(/ races$/, '')} ${word}`, types: types.length ? types : base.types, only: narrow.only };
}

export type EventResult = {
  raceId: number; name: string; begins: string; ends: string; kind: string | null;
  venue: string | null; city: string | null; state: string | null; region: string | null;
  trackId: number | null; hasResults: boolean;
};

export const EVENT_LIMIT = 200;

// Everything matching in the given calendar year, soonest first. The event list returns 5 per page,
// so after the first page the rest are fetched a few at a time.
export async function searchEvents(query: EventQuery, year: number): Promise<{ events: EventResult[]; truncated: boolean | 'partial' }> {
  const from = query.month != null ? `${year}-${String(query.month + 1).padStart(2, '0')}-01` : `${year}-01-01`;
  const to = query.month != null ? new Date(Date.UTC(year, query.month + 1, 0)).toISOString().slice(0, 10) : `${year}-12-31`;
  type Row = {
    id: number; name: string; begins_on: string | null; ends_on: string | null; series_race_type: string | null; region: string | null;
    bmx_track_id: number | null; has_results: boolean; track_name: string | null; track_city: string | null;
    track_state_abbreviation: string | null; temporary_track_name: string | null; temporary_track_city: string | null;
    temporary_track_state: string | null;
  };
  type Res = { total_records?: number; data?: Row[] };
  const types = query.type?.types ?? [null];
  let truncated = false;
  const rows = (await Promise.all(types.map(async type => {
    const params = new URLSearchParams({ filter_list: 'past', event_date_from: from, event_date_to: to, page_limit: '5' });
    if (type) params.set('event_type', type);
    if (query.state) params.set('event_state_code', query.state.code);
    const page = (n: number) => api<Res>(`events/event-list?${params}&page_number=${n}`).catch((): Res => ({}));
    const first = await page(1);
    const total = first.total_records ?? 0;
    const pages = Math.min(Math.ceil(total / 5), EVENT_LIMIT / 5);
    if (total > EVENT_LIMIT) truncated = true;
    const rest: Row[] = [];
    for (let n = 2; n <= pages; n += 6) {
      const batch = await Promise.all(Array.from({ length: Math.min(6, pages - n + 1) }, (_, i) => page(n + i)));
      rest.push(...batch.flatMap(b => b.data ?? []));
    }
    return [...(first.data ?? []), ...rest];
  }))).flat();

  const seen = new Set<number>();
  return {
    // With a qualifier or final filter, what was cut off may have held more matches.
    truncated: truncated && !query.type?.only ? true : truncated ? 'partial' : false,
    events: rows
      .filter(r => r.begins_on && !seen.has(r.id) && seen.add(r.id))
      .filter(r => !query.type?.only || query.type.only.test(`${r.name} ${r.series_race_type ?? ''}`))
      .map(r => ({
        raceId: r.id, name: (r.name ?? '').trim(), begins: r.begins_on!.slice(0, 10), ends: (r.ends_on ?? r.begins_on!).slice(0, 10),
        kind: kindOf(r.name, r.series_race_type), region: r.region, trackId: r.bmx_track_id, hasResults: r.has_results,
        venue: r.track_name ?? r.temporary_track_name, city: r.track_city ?? r.temporary_track_city,
        state: r.track_state_abbreviation ?? r.temporary_track_state,
      }))
      .sort((a, b) => a.begins.localeCompare(b.begins) || a.name.localeCompare(b.name)),
  };
}

// A short tag for the list: Qualifier, Final, Pre-race and so on.
function kindOf(name: string, series: string | null): string | null {
  const s = `${name} ${series ?? ''}`;
  if (/pre[- ]?race/i.test(s)) return 'Pre-race';
  if (/qualifier/i.test(s)) return 'Qualifier';
  if (/final/i.test(s)) return 'Final';
  if (/grand national/i.test(s)) return 'Grands';
  return null;
}

export function describeQuery(q: EventQuery): string {
  const month = q.month != null ? MONTHS[q.month][0].toUpperCase() + MONTHS[q.month].slice(1) : null;
  return [q.type?.label ?? 'Events', q.state ? `in ${q.state.name}` : null, month ? `in ${month}` : null].filter(Boolean).join(' ');
}
