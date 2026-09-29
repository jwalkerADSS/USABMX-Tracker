// Pull everything the tracker needs for the riders in riders.json, using plain HTTP.
// No login needed: every endpoint used here answers anonymously.
// Usage: node fetch-rider.mjs [year]      (writes out/<memberId>.json and prints a summary)
import fs from 'node:fs';

const BASE = 'https://www.usabmx.com';
const YEAR = Number(process.argv[2]) || new Date().getFullYear();
const DELAY_MS = 400; // stay polite: one request at a time with a short pause

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path) {
  await sleep(DELAY_MS);
  const res = await fetch(BASE + path, { headers: { 'user-agent': 'family-bmx-tracker/0.1 (private use)' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res;
}
const api = async path => (await get('/api/backend/' + path)).json();

// Next.js pages embed their server-rendered state in <script id="__NEXT_DATA__">.
async function nextData(path) {
  const html = await (await get(path)).text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) throw new Error(`no __NEXT_DATA__ on ${path}`);
  return JSON.parse(m[1]).props.pageProps;
}

// ---- Standings (public /view-points pages) ----------------------------------
const STANDINGS = {
  district: r => `/view-points/district?year=${YEAR}&sanction=USA&district=${r.district}&class=${r.districtClass}`,
  state: r => `/view-points/state-provincial?year=${YEAR}&sanction=USA&state=${r.state}&age-group=${encodeURIComponent(r.stateAgeGroup)}`,
  goldCup: r => `/view-points/gold-cup?year=${YEAR}&region=${encodeURIComponent(r.goldCupRegion)}&age-group=${encodeURIComponent(r.goldCupAgeGroup)}`,
  nag: r => `/view-points/nag?year=${YEAR}&age-group=${encodeURIComponent(r.nagAgeGroup)}`,
  national: r => `/view-points/national?year=${YEAR}&point-class=${r.nationalClass}`,
};
const PER_PAGE = 100;

async function standingsPage(url, page) {
  // page=1 must be omitted; the site returns an empty table if it is present.
  const pp = await nextData(page > 1 ? `${url}&page=${page}` : url);
  const h = pp.initialState?.hydratable ?? {};
  for (const [key, slice] of Object.entries(h)) {
    if (!/Points$/.test(key) || !slice) continue;
    const coll = Object.values(slice).find(v => v && Array.isArray(v.data));
    if (coll?.data?.length) return coll;
  }
  return { data: [], meta: { last_page: 0 } };
}

const isRider = (row, r) =>
  row.rider?.profile_id === r.profileId || (r.altProfileIds ?? []).includes(row.rider?.profile_id) || row.bmxMemberId === r.memberId ||
  `${row.rider?.first_name} ${row.rider?.last_name}`.toUpperCase() === r.name.toUpperCase();

// my-points gives the rider's rank, so we only fetch page 1 (leaders) and the rider's own page.
async function standing(level, r, rankHint) {
  const url = STANDINGS[level](r);
  const first = await standingsPage(url, 1);
  const rows = [...first.data];
  const riderPage = rankHint ? Math.ceil(rankHint / PER_PAGE) : null;
  if (riderPage && riderPage > 1) rows.push(...(await standingsPage(url, riderPage)).data);
  const me = rows.find(x => isRider(x, r));
  if (!me) return { level, url: BASE + url, found: false, totalPages: first.meta?.last_page ?? 0 };
  const at = place => rows.find(x => x.place === place);
  const gap = place => { const t = at(place); return t && place < me.place ? { place, name: `${t.rider.first_name} ${t.rider.last_name}`, points: t.points, pointsBehind: t.points - me.points } : null; };
  return {
    level, url: BASE + url, found: true, place: me.place, points: me.points,
    wins: me.wins, lastWin: me.last_win, races: me.races ?? me.local_races, stateRaces: me.state_races,
    gapToNextPlace: gap(me.place - 1), gapToTop10: gap(10), gapToFirst: gap(1),
  };
}

// ---- Race history + per-race opponents ---------------------------------------
async function raceHistory(memberId, bikeType) {
  const out = []; let page = 1, total = Infinity;
  while (out.length < total) {
    const res = await api(`dashboard/race-history?memberId=${memberId}&year=${YEAR}&bikeType=${bikeType}&page=${page}&limit=100`);
    total = res.total_records ?? 0; out.push(...(res.data ?? []));
    if (!res.data?.length) break; page++;
  }
  return out.map(x => ({ ...x, bikeType }));
}

async function raceOpponents(race, memberId) {
  // /events/{race_id}/results lists the race days; results are keyed by race_day_id.
  const pp = await nextData(`/events/${race.bmx_race_id}/results`);
  const days = pp.raceName ?? [];
  const day = days.find(d => d.occurs_on?.slice(0, 10) === race.race_date?.slice(0, 10)) ?? days[0];
  if (!day) return { event: pp.eventDetails?.name, opponents: null };
  const res = await api(`v2/events/results/${day.race_day_id}`);
  const group = res.data?.rider_result?.race_groups?.find(g => g.details.some(d => d.bmx_member_id === memberId));
  return {
    event: pp.eventDetails?.name, raceDayId: day.race_day_id, city: pp.eventDetails?.city,
    moto: group?.name ?? null,
    field: group?.details.map(d => ({ place: d.rank, name: d.rider, memberId: d.bmx_member_id, profileId: d.bmx_profile_id, self: d.bmx_member_id === memberId })) ?? null,
  };
}

// ---- Main ---------------------------------------------------------------------
const riders = JSON.parse(fs.readFileSync(new URL('./riders.json', import.meta.url)));
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });

for (const r of riders) {
  const profile = await api(`dashboard/rider-profile?profile_id=${r.profileId}`);
  const myPoints = (await api(`dashboard/my-points/${r.profileId}`)).data ?? [];
  const cls = myPoints.find(x => x.name === 'class')?.results ?? [];
  const rank = type => cls.find(x => x.type.startsWith(type))?.details?.rank;

  const standings = {
    district: await standing('district', r, rank('District')),
    state: await standing('state', r, rank('State')),
    goldCup: await standing('goldCup', r, null),
    nag: await standing('nag', r, rank('U.S. N.A.G.')),
    national: await standing('national', r, rank('U.S. National')),
  };

  const history = [...await raceHistory(r.memberId, 'class'), ...await raceHistory(r.memberId, 'cruiser')]
    .sort((a, b) => b.race_date.localeCompare(a.race_date));
  const wins = history.filter(x => x.finish === 1).length;

  const last5 = [];
  for (const race of history.slice(0, 5)) {
    last5.push({
      date: race.race_date.slice(0, 10), track: race.track_name, state: race.state_abbreviation,
      raceType: race.race_name, level: race.points_class, ageGroup: race.age_group, bike: race.bikeType,
      finish: race.finish, riders: Number(race.riders), raceId: race.bmx_race_id,
      pointsEarned: null, // not published per race; see README
      ...(await raceOpponents(race, r.memberId)),
    });
  }

  const result = {
    fetchedAt: new Date().toISOString(), season: YEAR, rider: r,
    profile: profile.memberData?.memberData ?? null,
    points: myPoints, plates: myPoints.flatMap(x => x.plates ?? []),
    record: { races: history.length, wins, nonWins: history.length - wins },
    standings, last5,
  };
  fs.writeFileSync(new URL(`./out/${r.memberId}.json`, import.meta.url), JSON.stringify(result, null, 2));

  console.log(`\n=== ${r.name} (${result.profile?.proficiency_class}, ${result.profile?.track_name})`);
  console.log(`Season ${YEAR}: ${history.length} races, ${wins} wins, ${history.length - wins} non-wins`);
  for (const s of Object.values(standings)) {
    if (!s.found) { console.log(`  ${s.level.padEnd(9)} not ranked`); continue; }
    const g = !s.gapToNextPlace ? '' : s.gapToNextPlace.pointsBehind === 0 ? `, tied with #${s.gapToNextPlace.place}` : `, ${s.gapToNextPlace.pointsBehind} behind #${s.gapToNextPlace.place}`;
    const t = s.gapToTop10 ? `, ${s.gapToTop10.pointsBehind} behind #10` : '';
    console.log(`  ${s.level.padEnd(9)} #${s.place} with ${s.points} pts${g}${t}`);
  }
  for (const x of last5) {
    const opp = x.field ? x.field.filter(f => !f.self).map(f => f.name).join(', ') : 'n/a';
    console.log(`  ${x.date} ${x.track} | ${x.raceType} | ${x.level} (${x.ageGroup}) | ${x.finish} of ${x.riders} | vs ${opp}`);
  }
}
