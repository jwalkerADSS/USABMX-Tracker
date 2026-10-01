// Builds data/sqorz-index.json: which riders were timed at which USA BMX nationals on Sqorz.
// Sqorz times every moto at nationals (Expert, Open, Cruiser and Pro classes; Novice and Intermediate
// aren't timed), but has no rider search and no link to USA BMX member ids. So we read each national
// race day once and keep, per rider name, the days they raced with their age, home state and
// transponder. The app then loads only those days for a rider's lap times. Runs nightly from GitHub
// Actions; days already in the file are not fetched again.
// Usage: node scripts/build-sqorz-index.mjs [year]
import fs from 'node:fs';

const BASE = 'https://our.sqorz.com';
const YEAR = Number(process.argv[2]) || new Date().getFullYear();
const KEEP_SEASONS = 2; // this season and last
const DELAY_MS = 400;
const FILE = new URL('../data/sqorz-index.json', import.meta.url);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;
async function getJson(path) {
  await sleep(DELAY_MS);
  requests++;
  const res = await fetch(BASE + path, { headers: { 'user-agent': 'family-bmx-tracker/0.1 (private use)' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

// Must match nameKey in lib/sqorz.ts.
const nameKey = (first, last) => `${first} ${last}`.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
// Club short names end in a state code: "EdFo.NV", "Hes.CAS" (California South). Must match homeState in lib/sqorz.ts.
const homeState = g => {
  const s = (g ?? '').split('.').pop() ?? '';
  return /^CA[SN]$/.test(s) ? 'CA' : /^[A-Z]{2}$/.test(s) ? s : null;
};

const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { seasons: {} };
const season = old.seasons[YEAR] ?? { events: [], riders: {} };
const known = new Set(season.events.map(e => e.id));

// USA BMX runs every national from its own Sqorz account, one event per race day.
const today = new Date().toISOString().slice(0, 10);
const days = [];
for (let m = 1; m <= 12; m++) {
  const start = `${YEAR}-${String(m).padStart(2, '0')}-01`;
  if (start > today) break;
  const end = new Date(Date.UTC(YEAR, m, 0)).toISOString().slice(0, 10);
  const list = await getJson(`/json/events/?startDate=${start}&endDate=${end}&regionCode=US`);
  for (const e of list) {
    const s = e.eventSummary;
    // Only finished days: a day already in the file is never read again.
    if (e.accountCode !== 'usabmx' || s.eventType !== 'race' || !s.races || s.completeRaces < s.races || /demo|test/i.test(s.eventName)) continue;
    days.push({ id: s.eventId, name: s.eventName.trim(), date: s.eventDate });
  }
}

for (const day of days.sort((a, b) => a.date.localeCompare(b.date))) {
  if (known.has(day.id)) continue;
  const ev = await getJson(`/json/event/${day.id}`);
  const idx = season.events.length;
  season.events.push(day);
  let timed = 0;
  for (const c of ev.classRanks ?? []) {
    for (const r of c.competitorRankSummaries ?? []) {
      if (!r.competitorRankDetails?.some(d => d.time)) continue;
      const key = nameKey(r.firstName, r.lastName);
      if (!key) continue;
      const rows = (season.riders[key] ??= []);
      // [day index, age, home state, transponder]; a rider in two classes (20" and cruiser) is listed once per day.
      if (!rows.some(x => x[0] === idx)) rows.push([idx, r.age ?? null, homeState(r.groupName), r.transponder ?? null]);
      timed++;
    }
  }
  console.log(`${day.date} ${day.name}: ${timed} timed riders`);
}

const seasons = Object.fromEntries(Object.entries({ ...old.seasons, [YEAR]: season })
  .sort(([a], [b]) => Number(b) - Number(a)).slice(0, KEEP_SEASONS));
fs.writeFileSync(FILE, JSON.stringify({ builtAt: new Date().toISOString(), seasons }));
console.log(`${season.events.length} national days, ${Object.keys(season.riders).length} riders, ${requests} requests`);
