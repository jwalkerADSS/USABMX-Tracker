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

// ---- Who they raced against ----------------------------------------------------

export type FieldEntry = { place: number; name: string; memberId: number; profileId: number | null; self: boolean };
export type RaceField = { moto: string | null; field: FieldEntry[] | null };

export async function getRaceField(race: Race, memberId: number): Promise<RaceField> {
  // /events/{raceId}/results lists the event's race days; results are keyed by race_day_id.
  const pp = await pageProps(`/events/${race.raceId}/results`);
  const days: { race_day_id: number; occurs_on: string }[] = pp.raceName ?? [];
  const day = days.find(d => d.occurs_on?.slice(0, 10) === race.date) ?? days[0];
  if (!day) return { moto: null, field: null };
  type Res = { data?: { rider_result?: { race_groups: { name: string; details: { rider: string; rank: number; bmx_member_id: number; bmx_profile_id: number | null }[] }[] } } };
  const res = await api<Res>(`v2/events/results/${day.race_day_id}`);
  const group = res.data?.rider_result?.race_groups.find(g => g.details.some(d => d.bmx_member_id === memberId));
  if (!group) return { moto: null, field: null };
  return {
    moto: group.name,
    field: group.details.map(d => ({
      place: d.rank, name: titleCase(d.rider), memberId: d.bmx_member_id, profileId: d.bmx_profile_id, self: d.bmx_member_id === memberId,
    })),
  };
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

// ---- National standings, used to build the name search index --------------------

export type IndexRow = { name: string; profileId: number; ageGroup: string; pointClass: string; place: number; points: number };

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
}
