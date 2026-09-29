// Builds data/rider-index.json, the list the app's name search runs against.
// USA BMX has no name search, so we collect riders from public standings tables:
// every national table (anyone with national points) plus the district tables for the states in
// data/index-config.json (anyone with points there). Runs nightly from GitHub Actions.
// Usage: node scripts/build-index.mjs [year]
import fs from 'node:fs';

const BASE = 'https://www.usabmx.com';
const YEAR = Number(process.argv[2]) || new Date().getFullYear();
const DELAY_MS = 400; // one request at a time with a short pause
const config = JSON.parse(fs.readFileSync(new URL('../data/index-config.json', import.meta.url)));

const sleep = ms => new Promise(r => setTimeout(r, ms));
let requests = 0;
async function get(path) {
  await sleep(DELAY_MS);
  requests++;
  const res = await fetch(BASE + path, { headers: { 'user-agent': 'family-bmx-tracker/0.1 (private use)' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res;
}

async function pageProps(path) {
  const html = await (await get(path)).text();
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  if (!m) throw new Error(`no page data on ${path}`);
  return JSON.parse(m[1]).props.pageProps;
}

async function standingsPage(url, page) {
  // page=1 must be left off: the site returns an empty table when it is present.
  const pp = await pageProps(page > 1 ? `${url}&page=${page}` : url);
  for (const [key, slice] of Object.entries(pp.initialState?.hydratable ?? {})) {
    if (!/Points$/.test(key) || !slice) continue;
    const coll = Object.values(slice).find(v => v && Array.isArray(v.data));
    if (coll?.data?.length) return { rows: coll.data, lastPage: coll.meta?.last_page ?? 1 };
  }
  return { rows: [], lastPage: 0 };
}

async function allRows(url) {
  const first = await standingsPage(url, 1);
  const rows = [...first.rows];
  for (let p = 2; p <= first.lastPage; p++) rows.push(...(await standingsPage(url, p)).rows);
  return rows;
}

async function selections(params, groupBy) {
  const q = new URLSearchParams({ 'filter[season][_eq]': YEAR, limit: 500, sort: 'position', ...params });
  for (const g of groupBy) q.append('groupBy[]', g);
  const res = await get('/api/directus/items/bmx_pointsref_selections?' + q);
  return (await res.json()).data ?? [];
}

const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
const riders = new Map();
function add(row, source) {
  const id = row.rider?.profile_id;
  if (!id) return; // riders without a public web profile can't be opened in the app
  const existing = riders.get(id) ?? {
    profileId: id, memberId: row.bmxMemberId ?? null,
    name: titleCase(`${row.rider.first_name} ${row.rider.last_name}`),
    ageGroup: row.age_group ?? null, district: null, sources: [],
  };
  existing.memberId ??= row.bmxMemberId ?? null;
  existing.ageGroup ??= row.age_group ?? null;
  if (source.district) existing.district ??= source.district;
  existing.sources.push({ ...source, place: row.place, points: row.points });
  riders.set(id, existing);
}

const nationalClasses = await selections({ 'filter[parent_xref][_eq]': '500', 'filter[filter_column_xref][_eq]': 'Class' }, ['name', 'position', 'column_value']);
const classes = nationalClasses.length ? nationalClasses.map(c => c.column_value) : ['Boys', 'Girls', 'Cruiser', 'Girls Cruiser'];
for (const c of classes) {
  for (const row of await allRows(`/view-points/national?year=${YEAR}&point-class=${encodeURIComponent(c)}`)) add(row, { table: 'national', class: c });
  console.log(`national ${c}: ${riders.size} riders so far`);
}

const districts = (await selections({ 'filter[level][_eq]': 'REGIONS', 'filter[parent_xref][_eq]': '100' }, ['name', 'position']))
  .map(d => d.name).filter(d => config.districtStates.some(s => d.startsWith(s)));
const districtClasses = (await selections({ 'filter[parent_xref][_eq]': '100', 'filter[filter_column_xref][_eq]': 'Class' }, ['name', 'position', 'column_value']))
  .map(c => c.column_value).filter(c => config.districtClasses.includes(c));
for (const d of districts) for (const c of districtClasses) {
  for (const row of await allRows(`/view-points/district?year=${YEAR}&sanction=USA&district=${d}&class=${encodeURIComponent(c)}`)) add(row, { table: 'district', district: d, class: c });
  console.log(`district ${d} ${c}: ${riders.size} riders so far`);
}

const list = [...riders.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(new URL('../data/rider-index.json', import.meta.url),
  JSON.stringify({ season: YEAR, builtAt: new Date().toISOString(), riders: list }) + '\n');
console.log(`Wrote ${list.length} riders from ${requests} requests.`);
