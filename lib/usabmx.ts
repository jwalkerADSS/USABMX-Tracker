// Read-only client for the public USA BMX site. No login: every call here answers anonymously.
// Endpoints and quirks are documented in spike/README.md.
import 'server-only';

const BASE = 'https://www.usabmx.com';
const REVALIDATE_SECONDS = 6 * 60 * 60; // results post 2-3 days after a race, so a few hours stale is fine
const PER_PAGE = 100;

async function get(path: string): Promise<Response> {
  const res = await fetch(BASE + path, {
    headers: { 'user-agent': 'family-bmx-tracker/0.1 (private use)' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) throw new Error(`USA BMX returned ${res.status} for ${path}`);
  return res;
}

async function api<T>(path: string): Promise<T> {
  return (await get('/api/backend/' + path)).json() as Promise<T>;
}

// Next.js pages on usabmx.com embed their server-rendered state in <script id="__NEXT_DATA__">.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageProps(path: string): Promise<any> {
  const html = await (await get(path)).text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) throw new Error(`No page data on ${path}`);
  return JSON.parse(m[1]).props.pageProps;
}

// ---- Rider profile and points -------------------------------------------------

export type Profile = {
  profileId: number;
  memberId: number;
  firstName: string;
  lastName: string;
  level: string | null;
  city: string | null;
  state: string | null;
  homeTrack: string | null;
  memberSince: string | null;
  birthdate: string | null;
};

export async function getProfile(profileId: number): Promise<Profile | null> {
  type Res = {
    memberData?: {
      first_name: string; last_name: string; bmx_member_id: number; born_on: string | null;
      memberData?: { proficiency_class: string; state: string; city: string; member_since: string; track_name: string };
    };
  };
  const res = await api<Res>(`dashboard/rider-profile?profile_id=${profileId}`);
  const m = res.memberData;
  if (!m) return null;
  return {
    profileId,
    memberId: m.bmx_member_id,
    firstName: m.first_name,
    lastName: m.last_name,
    level: m.memberData?.proficiency_class ?? null,
    city: m.memberData?.city ?? null,
    state: m.memberData?.state ?? null,
    homeTrack: m.memberData?.track_name ?? null,
    memberSince: m.memberData?.member_since ?? null,
    birthdate: m.born_on,
  };
}

export type PointsEntry = { type: string; skill: string; points: number; rank: number };
export type Plate = { plateType: string; season: string; value: string; regionName: string | null };
export type Points = { class: PointsEntry[]; cruiser: PointsEntry[]; plates: Plate[] };

export async function getPoints(profileId: number): Promise<Points> {
  type Res = { data: { name: string; results: { type: string; details: { skill: string; points: number; rank: number } }[]; plates: Plate[] }[] | null };
  const res = await api<Res>(`dashboard/my-points/${profileId}`);
  const pick = (name: string) =>
    (res.data ?? []).find(x => x.name === name)?.results.map(r => ({ type: r.type, ...r.details })) ?? [];
  return { class: pick('class'), cruiser: pick('cruiser'), plates: (res.data ?? []).flatMap(x => x.plates ?? []) };
}

// ---- Race history -------------------------------------------------------------

export type Race = {
  date: string;
  raceId: number;
  raceType: string;
  track: string;
  state: string;
  level: string;
  ageGroup: string;
  finish: number;
  riders: number;
  bike: 'class' | 'cruiser';
};

export async function getRaceHistory(memberId: number, year: number): Promise<Race[]> {
  type Row = {
    finish: number; race_date: string; age_group: string; points_class: string; bmx_race_id: number;
    track_name: string; state_abbreviation: string; race_name: string; riders: string;
  };
  type Res = { total_records?: number; data?: Row[] };
  const races: Race[] = [];
  for (const bike of ['class', 'cruiser'] as const) {
    for (let page = 1; ; page++) {
      const res = await api<Res>(`dashboard/race-history?memberId=${memberId}&year=${year}&bikeType=${bike}&page=${page}&limit=100`);
      const rows = res.data ?? [];
      races.push(...rows.map(r => ({
        date: r.race_date.slice(0, 10), raceId: r.bmx_race_id, raceType: r.race_name.trim(), track: r.track_name,
        state: r.state_abbreviation, level: r.points_class, ageGroup: r.age_group, finish: r.finish,
        riders: Number(r.riders), bike,
      })));
      if (!rows.length || page * 100 >= (res.total_records ?? 0)) break;
    }
  }
  return races.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- Events, race days and results ------------------------------------------

export type RaceDay = { raceDayId: number; date: string; name: string };
export type EventInfo = {
  raceId: number; trackId: number | null; trackName: string | null; raceType: string | null; days: RaceDay[];
  // Nationals are often at a temporary venue (an arena or fairground) with no track id.
  venue: string | null; city: string | null; state: string | null; hasResults: boolean;
};

// /events/{raceId}/results lists the event's race days (multi-day events have several) and its track.
export async function getEvent(raceId: number): Promise<EventInfo> {
  const pp = await pageProps(`/events/${raceId}/results`);
  const ev = pp.eventDetails ?? {};
  const days: { race_day_id: number; name: string | null; occurs_on: string }[] = pp.raceName ?? [];
  return {
    raceId,
    trackId: ev.bmx_track_id ?? null,
    trackName: ev.track_name ?? null,
    raceType: ev.name?.trim() ?? null,
    venue: ev.track_name ?? (ev.is_temporary_track ? ev.temporary_track_name : null) ?? null,
    city: ev.city ?? ev.temporary_track_city ?? null,
    state: ev.state_abbreviation ?? ev.temporary_track_state ?? null,
    hasResults: ev.has_results !== false,
    days: days
      .map(d => ({ raceDayId: d.race_day_id, date: d.occurs_on.slice(0, 10), name: (d.name ?? '').trim() }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// National results have no member ids, and add the rider's team and hometown (detail).
export type ResultRider = { place: number; name: string; memberId: number | null; profileId: number | null; detail: string | null };
// Local group names look like "10 Intermediate / District / Inter": class, points type, skill.
// National ones look like "7-8 Mixed Open    Total Riders = 16    Groups = 3" and list only the main's finishers.
export type ResultGroup = { name: string; className: string; pointsType: string | null; totalRiders: number | null; riders: ResultRider[] };

// National rider strings: "RYLAN (ROCKET RYLAN) SCHROEDER, FACTORY SYNDYT/LSG, TUCSON, AZ". Local ones are just the name.
function parseResultRider(s: string): { name: string; detail: string | null } {
  const [name, ...rest] = s.split(',').map(x => x.trim());
  const clean = titleCase(name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim());
  if (!rest.length) return { name: clean, detail: null };
  const state = rest.length >= 2 && /^[A-Z]{2}$/.test(rest.at(-1)!) ? rest.pop()! : null;
  const city = state ? rest.pop() : null;
  const home = city ? `${titleCase(city)}, ${state}` : null;
  return { name: clean, detail: [...rest.filter(Boolean).map(titleCase), home].filter(Boolean).join(' · ') || null };
}

export async function getRaceDayResults(raceDayId: number): Promise<ResultGroup[]> {
  type Res = { data?: { rider_result?: { race_groups: { name: string; details: { rider: string; rank: number; bmx_member_id: number | null; bmx_profile_id: number | null }[] }[] } } };
  const res = await api<Res>(`v2/events/results/${raceDayId}`);
  return (res.data?.rider_result?.race_groups ?? []).map(g => {
    const [head, total] = g.name.split(/\s+Total Riders\s*=\s*/);
    const [className, pointsType] = head.split(' / ').map(x => x.trim());
    return {
      name: g.name,
      className: className || g.name,
      pointsType: pointsType || null,
      totalRiders: Number(total?.match(/^\d+/)?.[0]) || null,
      riders: g.details
        .map(d => ({ place: d.rank, ...parseResultRider(d.rider), memberId: d.bmx_member_id ?? null, profileId: d.bmx_profile_id ?? null }))
        // Place 0 means no finish recorded (e.g. balance bike classes); list those last.
        .sort((a, b) => (a.place || Infinity) - (b.place || Infinity)),
    };
  });
}

// ---- Who they raced against ----------------------------------------------------

export type FieldEntry = ResultRider & { self: boolean };
export type RaceField = { trackId: number | null; moto: string | null; field: FieldEntry[] | null };

export async function getRaceField(race: Race, memberId: number): Promise<RaceField> {
  const event = await getEvent(race.raceId);
  const day = event.days.find(d => d.date === race.date) ?? event.days[0];
  if (!day) return { trackId: event.trackId, moto: null, field: null };
  const group = (await getRaceDayResults(day.raceDayId)).find(g => g.riders.some(r => r.memberId === memberId));
  if (!group) return { trackId: event.trackId, moto: null, field: null };
  return {
    trackId: event.trackId,
    moto: group.className,
    field: group.riders.map(r => ({ ...r, self: r.memberId === memberId })),
  };
}

// ---- Tracks ---------------------------------------------------------------------

export type Track = { trackId: number; name: string; city: string | null; state: string | null };

export async function getTrack(trackId: number): Promise<Track | null> {
  const pp = await pageProps(`/tracks/find-tracks/${trackId}`).catch(() => null);
  const t = pp?.track;
  if (!t) return null;
  return { trackId, name: t.name, city: t.city ?? null, state: t.state_abbreviation ?? null };
}

export type TrackRace = { raceId: number; date: string; raceType: string; hasResults: boolean };

// Newest first. Races whose results haven't been imported yet say "Result Pending".
export async function getTrackRaces(trackId: number, limit = 60): Promise<TrackRace[]> {
  type Res = { data?: { race_begins_on: string; race_id: number; race_name: string; status: string }[] };
  const res = await api<Res>(`microsites/results?bmx_track_id=${trackId}&page=1&limit=${limit}`);
  return (res.data ?? []).map(r => ({
    raceId: r.race_id, date: r.race_begins_on.slice(0, 10), raceType: r.race_name.trim(), hasResults: r.status === 'RESULT',
  }));
}

// ---- Nationals -------------------------------------------------------------------

export type National = {
  raceId: number; name: string; begins: string; ends: string;
  venue: string | null; city: string | null; state: string | null; region: string | null; hasResults: boolean;
};

// Every national (including the Grands and Canadian nationals) in a season, soonest first.
// The event list returns at most 5 per page, so a season takes about 8 requests.
export async function getNationals(year: number): Promise<National[]> {
  type Row = {
    id: number; name: string; begins_on: string; ends_on: string; region: string | null; has_results: boolean;
    track_name: string | null; track_city: string | null; track_state_abbreviation: string | null;
    temporary_track_name: string | null; temporary_track_city: string | null; temporary_track_state: string | null;
  };
  type Res = { total_records?: number; data?: Row[] };
  const rows: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    // With a start date, "past" returns everything from that date on, upcoming races included.
    const res = await api<Res>(`events/event-list?filter_list=past&event_type=NATIONAL&event_date_from=${year}-01-01&page_number=${page}&page_limit=5`);
    rows.push(...(res.data ?? []));
    if (!res.data?.length || page * 5 >= (res.total_records ?? 0)) break;
  }
  return rows
    .filter(r => r.begins_on.startsWith(String(year)))
    .map(r => ({
      raceId: r.id, name: r.name.trim(), begins: r.begins_on.slice(0, 10), ends: r.ends_on.slice(0, 10),
      venue: r.track_name ?? r.temporary_track_name, city: r.track_city ?? r.temporary_track_city,
      state: r.track_state_abbreviation ?? r.temporary_track_state, region: r.region, hasResults: r.has_results,
    }))
    .sort((a, b) => a.begins.localeCompare(b.begins));
}

export type NationalFinish = { raceDayId: number; date: string; className: string; place: number; totalRiders: number | null };
export type RiderNational = National & { finishes: NationalFinish[] };

// Nationals don't appear in a rider's race history, and their results only list each class's main
// event finishers, by name and hometown. So a rider's nationals are found by searching every
// posted national for their name (and home state, to tell apart riders with the same name).
// Nationals where they didn't make a main can't be found.
export async function getRiderNationals(year: number, rider: { name: string; state: string | null }): Promise<RiderNational[]> {
  const name = rider.name.toUpperCase();
  const state = rider.state?.toUpperCase();
  const isRider = (r: ResultRider) =>
    r.name.toUpperCase() === name && (!state || !r.detail || r.detail.toUpperCase().endsWith(`, ${state}`));
  const posted = (await getNationals(year)).filter(n => n.hasResults);
  const found = await mapLimit(posted, 6, async n => {
    const event = await getEvent(n.raceId).catch(() => null);
    const finishes: NationalFinish[] = [];
    for (const day of event?.days ?? []) {
      for (const g of await getRaceDayResults(day.raceDayId).catch(() => [])) {
        const r = g.riders.find(isRider);
        if (r) finishes.push({ raceDayId: day.raceDayId, date: day.date, className: g.className, place: r.place, totalRiders: g.totalRiders });
      }
    }
    return { ...n, finishes };
  });
  return found.filter(n => n.finishes.length);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// ---- Standings (public /view-points pages) ------------------------------------

export type Tables = {
  district?: { district: string; class: string };
  state?: { state: string; ageGroup: string };
  goldCup?: { region: string; ageGroup: string };
  nag?: { ageGroup: string };
  national?: { pointClass: string };
};
export type Level = keyof Tables;

export const LEVEL_LABELS: Record<Level, string> = {
  district: 'District', state: 'State', goldCup: 'Gold Cup', nag: 'NAG', national: 'National',
};
// How each level is labelled in my-points, used to find the rider's rank (and so their page) quickly.
const MY_POINTS_TYPE: Record<Level, string | null> = {
  district: 'District', state: 'State', goldCup: null, nag: 'U.S. N.A.G.', national: 'U.S. National',
};

function tableUrl(level: Level, t: Tables, year: number): string | null {
  const e = encodeURIComponent;
  switch (level) {
    case 'district': return t.district ? `/view-points/district?year=${year}&sanction=USA&district=${e(t.district.district)}&class=${e(t.district.class)}` : null;
    case 'state': return t.state ? `/view-points/state-provincial?year=${year}&sanction=USA&state=${e(t.state.state)}&age-group=${e(t.state.ageGroup)}` : null;
    case 'goldCup': return t.goldCup ? `/view-points/gold-cup?year=${year}&region=${e(t.goldCup.region)}&age-group=${e(t.goldCup.ageGroup)}` : null;
    case 'nag': return t.nag ? `/view-points/nag?year=${year}&age-group=${e(t.nag.ageGroup)}` : null;
    case 'national': return t.national ? `/view-points/national?year=${year}&point-class=${e(t.national.pointClass)}` : null;
  }
}

type StandingRow = {
  place: number; points: number; bmxMemberId?: number;
  rider: { profile_id: number | null; first_name: string; last_name: string };
  age_group?: string;
};

async function standingsPage(url: string, page: number): Promise<{ rows: StandingRow[]; lastPage: number }> {
  // page=1 must be left off: the site returns an empty table when it is present.
  const pp = await pageProps(page > 1 ? `${url}&page=${page}` : url);
  const hydratable: Record<string, Record<string, unknown> | null> = pp.initialState?.hydratable ?? {};
  for (const [key, slice] of Object.entries(hydratable)) {
    if (!/Points$/.test(key) || !slice) continue;
    const coll = Object.values(slice).find(
      (v): v is { data: StandingRow[]; meta?: { last_page?: number } } => !!v && Array.isArray((v as { data?: unknown }).data),
    );
    if (coll?.data.length) return { rows: coll.data, lastPage: coll.meta?.last_page ?? 1 };
  }
  return { rows: [], lastPage: 0 };
}

export type Gap = { place: number; name: string; points: number; pointsBehind: number };
export type Standing = {
  level: Level;
  label: string;
  url: string | null;
  found: boolean;
  place?: number;
  points?: number;
  gaps: Gap[]; // next place up, #10 and #1, whichever are ahead of the rider
};

export type RiderKey = { memberId: number; profileIds: number[]; name: string };

export async function getStanding(level: Level, tables: Tables, year: number, rider: RiderKey, points: Points): Promise<Standing> {
  const path = tableUrl(level, tables, year);
  const base = { level, label: LEVEL_LABELS[level], url: path ? BASE + path : null, gaps: [] as Gap[] };
  if (!path) return { ...base, found: false };

  const myType = MY_POINTS_TYPE[level];
  const rankHint = myType ? points.class.find(p => p.type.startsWith(myType))?.rank : undefined;
  const first = await standingsPage(path, 1);
  const rows = [...first.rows];
  const riderPage = rankHint ? Math.ceil(rankHint / PER_PAGE) : 1;
  if (riderPage > 1 && riderPage <= first.lastPage) rows.push(...(await standingsPage(path, riderPage)).rows);

  const fullName = rider.name.toUpperCase();
  const me = rows.find(r =>
    r.bmxMemberId === rider.memberId ||
    (r.rider.profile_id != null && rider.profileIds.includes(r.rider.profile_id)) ||
    `${r.rider.first_name} ${r.rider.last_name}`.toUpperCase() === fullName,
  );
  if (!me) return { ...base, found: false };

  const gaps: Gap[] = [];
  for (const target of [me.place - 1, 10, 1]) {
    if (target < 1 || target >= me.place || gaps.some(g => g.place === target)) continue;
    const row = rows.find(r => r.place === target);
    if (row) gaps.push({ place: target, name: titleCase(`${row.rider.first_name} ${row.rider.last_name}`), points: row.points, pointsBehind: row.points - me.points });
  }
  return { ...base, found: true, place: me.place, points: me.points, gaps };
}

// ---- Full standings tables ------------------------------------------------------

export type TableRow = { place: number; name: string; profileId: number | null; memberId: number | null; ageGroup: string | null; points: number };
export type StandingsTable = { level: Level; title: string; url: string; page: number; lastPage: number; rows: TableRow[] };

export function tableTitle(level: Level, t: Tables): string | null {
  switch (level) {
    case 'district': return t.district ? `${t.district.district} ${t.district.class} district` : null;
    case 'state': return t.state ? `${t.state.state} state · ${t.state.ageGroup}` : null;
    case 'goldCup': return t.goldCup ? `${t.goldCup.region} Gold Cup · ${t.goldCup.ageGroup}` : null;
    case 'nag': return t.nag ? `NAG · ${t.nag.ageGroup}` : null;
    case 'national': return t.national ? `National · ${t.national.pointClass}` : null;
  }
}

export async function getStandingsTable(level: Level, tables: Tables, year: number, page: number): Promise<StandingsTable | null> {
  const path = tableUrl(level, tables, year);
  const title = tableTitle(level, tables);
  if (!path || !title) return null;
  const { rows, lastPage } = await standingsPage(path, page);
  return {
    level, title, url: BASE + path + (page > 1 ? `&page=${page}` : ''), page, lastPage: Math.max(lastPage, 1),
    rows: rows.map(r => ({
      place: r.place, name: titleCase(`${r.rider.first_name} ${r.rider.last_name}`), profileId: r.rider.profile_id,
      memberId: r.bmxMemberId ?? null, ageGroup: r.age_group ?? null, points: r.points,
    })),
  };
}

// The page a rider is most likely on, from the rank USA BMX reports for them.
export function rankPage(rank: number | undefined): number {
  return rank ? Math.max(1, Math.ceil(rank / PER_PAGE)) : 1;
}

// Which my-points row belongs to which table.
export function levelOfPointsType(type: string): Level | null {
  for (const [level, prefix] of Object.entries(MY_POINTS_TYPE) as [Level, string | null][]) {
    if (prefix && type.startsWith(prefix)) return level;
  }
  return null;
}

// ---- District plates ---------------------------------------------------------

export const DISTRICT_CLASSES = ['Boys', 'Girls', 'Cruiser', 'Girl Cruiser'] as const;
export type PlateHolder = { className: string; name: string; profileId: number | null; memberId: number | null; ageGroup: string | null; points: number };

// Who sits at `place` in a district table. Riders the site hasn't ranked show place 0 and are mixed in
// by points, so the place can spill onto the page after the one it would normally be on.
export async function getDistrictPlace(district: string, className: string, year: number, place: number): Promise<PlateHolder | null> {
  const e = encodeURIComponent;
  const url = `/view-points/district?year=${year}&sanction=USA&district=${e(district)}&class=${e(className)}`;
  for (let page = Math.ceil(place / PER_PAGE); ; page++) {
    const { rows, lastPage } = await standingsPage(url, page);
    const row = rows.find(r => r.place === place);
    if (row) {
      return {
        className, name: titleCase(`${row.rider.first_name} ${row.rider.last_name}`), profileId: row.rider.profile_id,
        memberId: row.bmxMemberId ?? null, ageGroup: row.age_group ?? null, points: row.points,
      };
    }
    if (!rows.length || page >= lastPage || Math.max(...rows.map(r => r.place)) > place) return null;
  }
}

// ---- National standings, used to build the name search index --------------------

export type IndexRow = { name: string; profileId: number; ageGroup: string; pointClass: string; place: number; points: number };

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}
