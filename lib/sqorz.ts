// Read-only client for Sqorz (our.sqorz.com and my.sqorz.com), the timing system many USA BMX tracks and
// every USA BMX national use. usabmx.com publishes places only, so this is where lap times come from.
// Everything here answers anonymously. Sqorz has no rider search and its member ids aren't USA BMX's,
// so riders are matched by name, with home state and age to tell apart riders who share a name.
// Three sources:
// - Track leaderboards: a track's yearly and monthly boards hold each timed rider's 3 best laps (with
//   hill and turn splits) for the period. Local tracks run "training" timing, so this covers race nights too.
// - Nationals: each race day lists every timed moto (Expert, Open, Cruiser and Pro; Novice and
//   Intermediate aren't timed). data/sqorz-index.json says which days a rider is on.
// - Transponder: my.sqorz.com keeps every lap a transponder has done, at any Sqorz track.
import 'server-only';
import sqorzIndex from '@/data/sqorz-index.json';
import riderIndex from '@/data/rider-index.json';
import { titleCase, type Race } from './usabmx';

const OUR = 'https://our.sqorz.com';
const MY = 'https://my.sqorz.com';
const REVALIDATE_SECONDS = 6 * 60 * 60;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'family-bmx-tracker/0.1 (private use)' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`Sqorz returned ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

// Must match nameKey and homeState in scripts/build-sqorz-index.mjs.
export const nameKey = (first: string, last: string) =>
  `${first} ${last}`.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
// Club short names end in a state code: "EdFo.NV", "Hes.CAS" (California South).
function homeState(group: string | null | undefined): string | null {
  const s = (group ?? '').split('.').pop() ?? '';
  return /^CA[SN]$/.test(s) ? 'CA' : /^[A-Z]{2}$/.test(s) ? s : null;
}

// ---- What the app shows ------------------------------------------------------------

export type Split = { name: string; ms: number };
export type Lap = {
  id: string;
  ms: number;
  date: string;
  location: string; // the track, or the national ("Great Salt Lake National")
  event: string; // the Sqorz event: "Whitney Mesa Race 9/26/26", "Great Salt Lake National Day 3"
  details: string[]; // class, moto, finish, gate: whatever the source knows
  splits: Split[]; // time from the gate to each timing loop
  bike: 'class' | 'cruiser';
  compare: string | null; // key into LapTimes.comparisons
};
// profileId: the rider's USA BMX profile, when exactly one rider in the search index fits.
export type CompareEntry = { name: string; ms: number; date: string; info: string | null; self: boolean; profileId: number | null };
// What Sqorz says about the rider, used to find their USA BMX profile.
type Entry = Omit<CompareEntry, 'profileId'> & { key: string; state: string | null; age: number | null };
// Everyone timed at a location, one best time each, fastest first.
type Comparison = { label: string; entries: Entry[] };
// For the dialog: where a lap would rank among the other riders' best times there, the fastest of them,
// and the 2 just faster and 2 just slower.
export type LapCompare = { label: string; rank: number; total: number; fastest: CompareEntry | null; faster: CompareEntry[]; slower: CompareEntry[] };
export type LapTimes = { laps: (Omit<Lap, 'compare'> & { compare: LapCompare | null })[]; sources: string[] };

export type RiderMatch = {
  firstName: string;
  lastName: string;
  state: string | null;
  birthYear: number | null;
  transponders?: string[];
};

// Sqorz ages look like USA BMX's racing age (the age a rider turns that year); allow a year either way.
function ageFits(rider: RiderMatch, age: number | null | undefined, year: number): boolean {
  return rider.birthYear == null || age == null || Math.abs(year - rider.birthYear - age) <= 1;
}

// Several riders can share a name: prefer the one from the rider's state, then the right age.
function pick<T>(rows: T[], rider: RiderMatch, year: number, state: (r: T) => string | null, age: (r: T) => number | null): T | undefined {
  const aged = rows.filter(r => ageFits(rider, age(r), year));
  return aged.find(r => rider.state != null && state(r) === rider.state) ?? aged.find(r => state(r) == null) ?? (aged.length === 1 ? aged[0] : undefined);
}

const seconds = (s: string | number | null | undefined) => (s == null || s === '' ? null : Math.round(Number(s) * 1000) || null);
const bikeOf = (classType: string | null | undefined): Lap['bike'] => (classType === '24' ? 'cruiser' : 'class');
const loopName = (n: string) => n.replace(/^C(\d)[EX]$/i, (_, d) => (d === '1' ? '1st turn' : d === '2' ? '2nd turn' : `Turn ${d}`));

// ---- Track leaderboards ------------------------------------------------------------

type Account = { accountCode: string; accountName: string };
type Board = { leaderboardName: string; leaderboardId: string; publish: boolean };
type TimeRow = { time: number; startTime: number; eventId: string };
type BoardLaps = {
  memberId: string; trackPesudoId: string; classType: string; eventType: string;
  hillTimes?: TimeRow[]; cornerTimes?: TimeRow[]; corner2Times?: TimeRow[]; finishTimes?: TimeRow[];
};
type Leaderboard = {
  leaderboardName: string;
  events: { eventId: string; eventName: string; eventDate: string; eventType: string }[];
  members: { memberId: string; firstName: string; lastName: string; age?: number; groupName?: string }[];
  memberClasses: { memberId: string; classType: string; classCode: string; classDate: string }[];
  classes: { classCode: string; className: string; classType: string }[];
  laps: BoardLaps[];
};

const usAccounts = () => getJson<{ accounts: Account[] }>(`${OUR}/json/region/US`).then(r => r.accounts);
const orgBoards = (code: string) => getJson<{ boards?: Board[] }>(`${OUR}/json/org/${code}`).then(r => r.boards ?? []);
const leaderboard = (id: string) => getJson<Leaderboard>(`${OUR}/json/leaderboard/${id}`);

// "Ed Fountain Park BMX Raceway" and "Ed Fountain Park BMX" are the same track; so are "Virgin BMX" and "VirginBMX".
const trackKey = (name: string) =>
  name.toLowerCase().replace(/bmx/g, ' ').replace(/\b(raceway|inc|track|association|club|supercross|sx|the|of)\b/g, ' ').replace(/[^a-z]/g, '');

// The Sqorz accounts of the tracks a rider raced at, by track name.
async function tracksOnSqorz(trackNames: string[]): Promise<Map<string, Account>> {
  const accounts = await usAccounts();
  const byKey = new Map(accounts.map(a => [trackKey(a.accountName), a]));
  const found = new Map<string, Account>();
  for (const name of new Set(trackNames)) {
    const a = byKey.get(trackKey(name));
    if (a && a.accountCode !== 'usabmx') found.set(name, a);
  }
  return found;
}

const SPLITS: [keyof BoardLaps, string][] = [['hillTimes', 'Hill'], ['cornerTimes', '1st turn'], ['corner2Times', '2nd turn']];

function boardMember(board: Leaderboard, rider: RiderMatch, year: number) {
  const key = nameKey(rider.firstName, rider.lastName);
  return pick(board.members.filter(m => nameKey(m.firstName, m.lastName) === key), rider, year, m => homeState(m.groupName), m => m.age ?? null);
}

function boardCompareKey(code: string, year: number, l: BoardLaps) {
  return `track:${code}:${year}:${l.trackPesudoId}:${l.classType}`;
}

// Each timed rider's best lap on the year's board, for the comparison dialog.
function boardComparisons(code: string, track: string, year: number, board: Leaderboard, selfId: string | null): Record<string, Comparison> {
  const members = new Map(board.members.map(m => [m.memberId, m]));
  const classNames = new Map(board.classes.map(c => [c.classCode, c.className]));
  const out: Record<string, Comparison> = {};
  for (const l of board.laps) {
    const best = l.finishTimes?.[0];
    const m = members.get(l.memberId);
    if (!best || !m) continue;
    const key = boardCompareKey(code, year, l);
    const cls = board.memberClasses.filter(c => c.memberId === l.memberId && c.classType === l.classType)
      .sort((a, b) => b.classDate.localeCompare(a.classDate))[0];
    const info = [m.age != null ? `Age ${m.age}` : null, cls ? classNames.get(cls.classCode) : null].filter(Boolean).join(' · ');
    (out[key] ??= { label: `${track}, ${year}${l.classType === '24' ? ' cruiser' : ''}`, entries: [] }).entries.push({
      name: titleCase(`${m.firstName} ${m.lastName}`), ms: best.time, date: eventDate(board, best), info: info || null, self: l.memberId === selfId,
      key: nameKey(m.firstName, m.lastName), state: homeState(m.groupName), age: m.age ?? null,
    });
  }
  for (const c of Object.values(out)) c.entries.sort((a, b) => a.ms - b.ms);
  return out;
}

function eventDate(board: Leaderboard, t: TimeRow): string {
  return board.events.find(e => e.eventId === t.eventId)?.eventDate ?? new Date(t.startTime).toISOString().slice(0, 10);
}

// A Sqorz event at a known track, so transponder laps there get the track's name and comparison.
type TrackEvent = { track: string; compare: Record<string, string> };
type TrackResult = { laps: Lap[]; comparisons: Record<string, Comparison>; events: Map<string, TrackEvent> };

// A rider's laps at one track for a season: the 3 best of the year plus the 3 best of each month.
async function trackLaps(track: string, account: Account, rider: RiderMatch, year: number): Promise<TrackResult | null> {
  const boards = (await orgBoards(account.accountCode)).filter(b => b.publish);
  const yearBoard = boards.find(b => b.leaderboardName === String(year));
  if (!yearBoard) return null;
  const board = await leaderboard(yearBoard.leaderboardId);
  const me = boardMember(board, rider, year);
  const comparisons = boardComparisons(account.accountCode, track, year, board, me?.memberId ?? null);
  // Each bike's busiest timing layout on the board is the one transponder laps at this track compare against.
  const counts = new Map<string, number>();
  for (const l of board.laps) { const k = boardCompareKey(account.accountCode, year, l); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const compare: Record<string, string> = {};
  for (const [k, n] of [...counts].sort((a, b) => a[1] - b[1])) compare[k.split(':').at(-1)!] = k;
  const events = new Map<string, TrackEvent>(board.events.map(e => [e.eventId, { track, compare }]));
  if (!me) return { laps: [], comparisons, events };

  const months = boards.filter(b => b.leaderboardName.startsWith(`${year} `));
  const monthBoards = await Promise.all(months.map(b => leaderboard(b.leaderboardId).catch(() => null)));
  const laps = new Map<number, Lap>();
  for (const b of [board, ...monthBoards]) {
    if (!b) continue;
    const m = b === board ? me : boardMember(b, rider, year);
    if (!m) continue;
    for (const l of b.laps.filter(x => x.memberId === m.memberId)) {
      const cls = b.memberClasses.filter(c => c.memberId === m.memberId && c.classType === l.classType)
        .sort((x, y) => y.classDate.localeCompare(x.classDate))[0];
      const className = b.classes.find(c => c.classCode === cls?.classCode)?.className;
      for (const f of l.finishTimes ?? []) {
        if (laps.has(f.startTime)) continue;
        const splits = SPLITS.flatMap(([k, name]) => {
          const s = (l[k] as TimeRow[] | undefined)?.find(x => x.startTime === f.startTime);
          return s ? [{ name, ms: s.time }] : [];
        });
        const ev = b.events.find(e => e.eventId === f.eventId);
        laps.set(f.startTime, {
          id: `t${f.startTime}`, ms: f.time, date: eventDate(b, f), location: track, event: ev?.eventName.trim() ?? track,
          details: [className, 'Track timing'].filter((x): x is string => !!x && x !== 'Standard'),
          splits, bike: bikeOf(l.classType), compare: boardCompareKey(account.accountCode, year, l),
        });
      }
    }
  }
  return { laps: [...laps.values()], comparisons, events };
}

// ---- Nationals -----------------------------------------------------------------------

type IndexSeason = { events: { id: string; name: string; date: string }[]; riders: Record<string, [number, number | null, string | null, string | null][]> };
const INDEX = sqorzIndex as unknown as { builtAt: string | null; seasons: Record<string, IndexSeason> };

type RankDetail = { phaseName: string; raceName?: string; racePosition?: number; result?: number; time?: string };
type Competitor = {
  memberId: string; firstName: string; lastName: string; age?: number; groupName?: string; transponder?: string;
  competitorRankDetails: RankDetail[]; rank?: number;
};
type EventRanks = { eventId: string; eventSummary: { eventName: string; eventDate: string }; classRanks: { className: string; classType: string; competitorRankSummaries: Competitor[] }[] };

// "Great Salt Lake National Day 3" -> "Great Salt Lake National"; "Las Vegas - Day 1" -> "Las Vegas National"
function nationalName(event: string): string {
  const n = event.replace(/\s*-?\s*day\s*\d+\s*$/i, '').replace(/^\d{4}\s+/, '').replace(/\bnationals\b/i, 'National').trim();
  return /national/i.test(n) ? n : `${n} National`;
}
const ordinalOf = (n: number) => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

async function nationalLaps(rider: RiderMatch, year: number) {
  const season = INDEX.seasons[year];
  const rows = season?.riders[nameKey(rider.firstName, rider.lastName)] ?? [];
  const mine = rows.filter(r => ageFits(rider, r[1], year) && (rider.state == null || r[2] == null || r[2] === rider.state));
  const laps: Lap[] = [];
  const comparisons: Record<string, Comparison> = {};
  const transponders = new Set<string>();
  await Promise.all(mine.map(async ([i]) => {
    const day = season.events[i];
    const ev = await getJson<EventRanks>(`${OUR}/json/event/${day.id}`).catch(() => null);
    if (!ev) return;
    const location = nationalName(day.name);
    const best = new Map<string, Entry & { bike: Lap['bike'] }>();
    for (const c of ev.classRanks ?? []) {
      for (const r of c.competitorRankSummaries ?? []) {
        const self = nameKey(r.firstName, r.lastName) === nameKey(rider.firstName, rider.lastName) && ageFits(rider, r.age, year);
        if (self && r.transponder) transponders.add(r.transponder);
        for (const d of r.competitorRankDetails ?? []) {
          const ms = seconds(d.time);
          if (!ms) continue;
          const bike = bikeOf(c.classType);
          const k = `${r.memberId}/${bike}`;
          if (!best.has(k) || best.get(k)!.ms > ms) {
            best.set(k, {
              name: titleCase(`${r.firstName} ${r.lastName}`), ms, date: day.date, info: c.className, self, bike,
              key: nameKey(r.firstName, r.lastName), state: homeState(r.groupName), age: r.age ?? null,
            });
          }
          if (!self) continue;
          laps.push({
            id: `n${day.id}/${c.className}/${d.phaseName}/${d.raceName ?? ''}`, ms, date: day.date, location, event: day.name,
            details: [
              c.className, d.phaseName, d.result ? `${ordinalOf(d.result)} in ${d.raceName ? `race ${d.raceName}` : 'the moto'}` : null,
              d.racePosition ? `Gate ${d.racePosition}` : null,
            ].filter((x): x is string => !!x),
            splits: [], bike, compare: `nat:${day.id}:${bike}`,
          });
        }
      }
    }
    for (const { bike, ...e } of best.values()) {
      const key = `nat:${day.id}:${bike}`;
      (comparisons[key] ??= { label: `${day.name}${bike === 'cruiser' ? ' cruiser' : ''}`, entries: [] }).entries.push(e);
    }
  }));
  for (const c of Object.values(comparisons)) c.entries.sort((a, b) => a.ms - b.ms);
  return { laps, comparisons, transponders: [...transponders] };
}

// ---- Transponders --------------------------------------------------------------------

type TrainingLap = { lapId: string; trackId: string; classCode: string; startTime: number; lapTimes: (number | null)[] };
type TrainingDetail = {
  eventId: string; eventName: string; eventDate: string;
  classes: { classCode: string; className: string; classType: string }[];
  tracks: { trackId: string; trackName: string; trackLoops: { loopName: string }[] }[];
  members: { transponder: string; trainingLaps: TrainingLap[] }[];
};

async function transponderLaps(code: string, year: number): Promise<(Lap & { eventId: string; classType: string })[]> {
  const res = await getJson<{ eventTrainingDetails?: { trainingDetail: TrainingDetail }[] }>(`${MY}/json/training/transponder/${encodeURIComponent(code)}`);
  const laps: (Lap & { eventId: string; classType: string })[] = [];
  for (const { trainingDetail: t } of res.eventTrainingDetails ?? []) {
    if (!t.eventDate.startsWith(String(year))) continue;
    for (const m of t.members) {
      for (const l of m.trainingLaps ?? []) {
        const finish = l.lapTimes.at(-1);
        if (!finish) continue; // didn't cross the finish loop
        const track = t.tracks.find(x => x.trackId === l.trackId);
        const cls = t.classes.find(c => c.classCode === l.classCode);
        const loops = track?.trackLoops ?? [];
        laps.push({
          id: `t${l.startTime}`, eventId: t.eventId, classType: cls?.classType ?? '20', ms: finish, date: t.eventDate,
          location: track?.trackName.replace(/\s+track$/i, '') ?? t.eventName, event: t.eventName.trim(),
          details: [cls?.className, 'Track timing'].filter((x): x is string => !!x && x !== 'Standard'),
          splits: l.lapTimes.slice(0, -1).flatMap((ms, i) => (ms && loops[i] ? [{ name: loopName(loops[i].loopName), ms }] : [])),
          bike: bikeOf(cls?.classType), compare: null,
        });
      }
    }
  }
  return laps;
}

// ---- Everything for one rider --------------------------------------------------------

export async function getLapTimes(rider: RiderMatch, year: number, races: Race[]): Promise<LapTimes> {
  const tracks = await tracksOnSqorz(races.map(r => r.track)).catch(() => new Map<string, Account>());
  const [local, nationals] = await Promise.all([
    Promise.all([...tracks].map(([name, a]) => trackLaps(name, a, rider, year).catch(() => null))),
    nationalLaps(rider, year).catch(() => ({ laps: [], comparisons: {}, transponders: [] as string[] })),
  ]);
  const comparisons: Record<string, Comparison> = { ...nationals.comparisons };
  const byId = new Map<string, Lap>();
  const events = new Map<string, TrackEvent>();
  for (const t of local) {
    if (!t) continue;
    Object.assign(comparisons, t.comparisons);
    for (const [e, v] of t.events) events.set(e, v);
    for (const l of t.laps) byId.set(l.id, l);
  }
  for (const l of nationals.laps) byId.set(l.id, l);

  // A transponder has every lap, not just the best few, so its laps replace the leaderboard copies.
  const codes = [...new Set([...(rider.transponders ?? []), ...nationals.transponders])];
  const fromTransponders = (await Promise.all(codes.map(c => transponderLaps(c, year).catch(() => [])))).flat();
  // At nationals the transponder also records each moto, under a separate training event: give the moto
  // its splits instead of listing it twice. Other laps on a national's dates are its practice sessions.
  const nationalDays = new Map((INDEX.seasons[year]?.events ?? []).map(e => [e.date, nationalName(e.name)]));
  for (const { eventId, classType, ...lap } of fromTransponders) {
    const moto = nationals.laps.find(n => n.date === lap.date && n.ms === lap.ms);
    if (moto) {
      moto.splits = lap.splits;
      continue;
    }
    const prev = byId.get(lap.id);
    const at = events.get(eventId);
    const location = prev?.location ?? at?.track ?? nationalDays.get(lap.date) ?? lap.location;
    byId.set(lap.id, {
      ...lap,
      location: location === location.toLowerCase() ? titleCase(location) : location,
      compare: prev?.compare ?? at?.compare[classType] ?? null,
    });
  }

  const laps = [...byId.values()];
  const sources = [
    ...[...tracks.keys()].filter(t => laps.some(l => l.location === t)),
    ...(nationals.laps.length ? ['USA BMX nationals'] : []),
    ...(codes.length ? [`transponder ${codes.join(', ')}`] : []),
  ];
  return { laps: laps.map(l => ({ ...l, compare: l.compare && comparisons[l.compare] ? compareLap(l.ms, comparisons[l.compare]) : null })), sources };
}

function compareLap(ms: number, c: Comparison): LapCompare {
  const others = c.entries.filter(e => !e.self);
  const at = others.findIndex(e => e.ms > ms);
  const split = at === -1 ? others.length : at;
  const faster = others.slice(Math.max(0, split - 2), split);
  return {
    label: c.label, rank: split + 1, total: others.length + 1,
    fastest: split > 0 && !faster.includes(others[0]) ? withProfile(others[0]) : null,
    faster: faster.map(withProfile), slower: others.slice(split, split + 2).map(withProfile),
  };
}

// ---- Linking compared riders to their USA BMX profiles ----------------------------------

type IndexRow = { profileId: number; name: string; ageGroup: string | null; district: string | null };
let byName: Map<string, IndexRow[]> | null = null;

// "16 Expert" -> [16, 16], "17-20 Expert" -> [17, 20]
function ageRange(group: string | null): [number, number] | null {
  const m = group?.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
}

// A name links only when one rider in the search index fits it: same name, and the age group and
// district state (when both sides know them) agree with what Sqorz has. Otherwise it stays plain text.
function withProfile({ key, state, age, ...e }: Entry): CompareEntry {
  byName ??= (riderIndex as { riders: IndexRow[] }).riders.reduce((m, r) => {
    const k = nameKey(r.name, '');
    m.set(k, [...(m.get(k) ?? []), r]);
    return m;
  }, new Map<string, IndexRow[]>());
  const fits = (byName.get(key) ?? []).filter(r => {
    const range = ageRange(r.ageGroup);
    const rState = r.district?.slice(0, 2) ?? null;
    return (age == null || !range || (age >= range[0] - 1 && age <= range[1] + 1)) && (state == null || rState == null || state === rState);
  });
  const sameState = fits.filter(r => state != null && r.district?.startsWith(state));
  const one = fits.length === 1 ? fits[0] : sameState.length === 1 ? sameState[0] : null;
  return { ...e, profileId: one?.profileId ?? null };
}

export const sqorzIndexBuiltAt = INDEX.builtAt;
