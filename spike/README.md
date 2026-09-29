# USA BMX data spike

Tested 2026-09-29 against the live site with the parent account and both riders.

**Headline:** everything except per-race points is available as JSON, and after a one-time login to find each rider's IDs, **no login is needed** for any of it. The nightly scraper can run with plain HTTP and no stored credentials.

## Files

| File | What it does |
|---|---|
| `discover-riders.mjs` | One-time. Logs in as the parent (env vars `USABMX_PARENT_EMAIL`, `USABMX_PARENT_PASSWORD`) and prints each linked minor profile's name, profile ID and member ID. The only step that uses Playwright or a login. |
| `riders.json` | The riders to track, with the filter values for each standings table. |
| `fetch-rider.mjs` | Plain HTTP, no login. Pulls points, standings, gaps, season record, last 5 races and opponents for each rider and writes `out/<memberId>.json`. About 20 requests per rider, one at a time with a 400 ms pause. |
| `out/*.json` | Sample output from the test run. |

Run: `npm install && node fetch-rider.mjs 2026`. Inside the Claude cloud sandbox also set `NODE_USE_ENV_PROXY=1`, and for the discovery script `CHROMIUM_PATH=/opt/pw-browsers/chromium` plus `CHROMIUM_EXTRA_ARGS=--ignore-certificate-errors-spki-list=<proxy CA SPKI hash>` so Chromium trusts the sandbox proxy's CA. Neither is needed on a normal machine or in GitHub Actions.

## Endpoints

All under `https://www.usabmx.com`. "Anon" means it answers without a login.

| Endpoint | Anon | Returns |
|---|---|---|
| `GET /api/backend/dashboard/underage-profile` | No | Parent's linked minor profiles: name, `bmx_profile_id`, `bmx_member_id`, birthdate |
| `GET /api/backend/dashboard/rider-profile?profile_id={profileId}` | Yes* | Name, level (`proficiency_class`), city/state, home track, member since |
| `GET /api/backend/dashboard/my-points/{profileId}` | Yes | Points + rank for District, State, U.S. NAG, U.S. National (class and cruiser), plus earned plates |
| `GET /api/backend/dashboard/race-history?memberId={memberId}&year={yyyy}&bikeType=class\|cruiser&page=1&limit=100` | Yes | Every race: date, track, state, race type (Local, State, Gold Cup Qualifier, National...), `points_class` (Novice/Inter/Expert), age group, finish, riders in the moto, `bmx_race_id`. Also lists years with data |
| `GET /api/backend/dashboard/race-highlight?profile_id={profileId}` | Yes | Wins only (the profile page's "racer highlights"), all seasons |
| `GET /events/{raceId}/results` (HTML, `__NEXT_DATA__` → `pageProps.raceName`) | Yes | Race days for an event, each with a `race_day_id` and date |
| `GET /api/backend/v2/events/results/{raceDayId}` | Yes | Every moto's full finishing order with rider name, `bmx_member_id`, `bmx_profile_id` |
| `GET /view-points/{district,state-provincial,gold-cup,nag,national}?...` (HTML, `__NEXT_DATA__` → `initialState.hydratable.*Points`) | Yes | Standings tables, 100 rows per page. Omit `page` for page 1 (sending `page=1` returns an empty table) |
| `GET /api/directus/items/bmx_pointsref_selections?...` | Yes | Valid filter values (districts, classes, age groups, Gold Cup regions) per season |

\* Jameson has two web profiles for the same member number. The older one (65441) only answers when logged in as the parent; the newer one (188256) is public, so `riders.json` uses 188256.

Standings filters: district uses `district` + `class` (Boys/Girls/Cruiser/Girls Cruiser; Intermediate girls who race mixed classes still sit in the Girls district table), state uses `state` + `age-group` (for example "7 Nov/Inter"), Gold Cup uses `region` + `age-group` ("7 Intermediate"), NAG uses `age-group` ("7 Girls"), national uses `point-class` (Boys/Girls).

The JSON API behind the standings (`/api/backend/v2/points/*`) exists but rejected every parameter spelling tried, so the spike reads the server-rendered page data instead. It is one request per page either way.

## Coverage of the project's fields

| Field | Covered | Source |
|---|---|---|
| Wins / losses | Yes (computed) | race-history: finish = 1 is a win. "Losses" = any other finish |
| District points + rank | Yes | my-points, confirmed by district standings |
| State points + rank | Yes | my-points, state standings |
| Gold Cup points + rank | Partly | Not in my-points; only in the Gold Cup standings. Neither rider shows in any 2026 Gold Cup table checked (4 regions). Nevada's region is assumed to be South West and needs confirming |
| NAG points + rank | Yes | my-points, NAG standings |
| National points + rank | Yes | my-points, national standings |
| Points gap to a position | Yes (computed) | Standings page 1 plus the rider's own page: gap to next place, #10 and #1 |
| Last 5 races | Yes | race-history, newest first |
| Level of each race (Novice/Inter/Expert) | Yes | race-history `points_class` |
| Track raced at | Yes | race-history `track_name`, state |
| Who they raced against | Yes | v2 event results: full moto field with member IDs |
| Points earned per race | **No** | Not published anywhere found. Options: compute from the USA BMX points table (race type multiplier × riders in moto), or snapshot standings daily and attribute the change to that day's races |
| Search any rider by name | **Partly** | No name search API (`bmx-membership/search-rider` needs a serial number). Every standings row and results row carries a name plus profile or member ID, so build our own name index from those. Once a member ID is known, all the endpoints above work for that rider without a login |

## Results from the test run (2026 season)

| | Jameson (10 Intermediate) | Jordyn (7 Intermediate) |
|---|---|---|
| Season record | 43 races, 13 wins | 90 races, 28 wins |
| District (NV01) | #82, 1,910 pts, 94 behind #81 | #13, 4,243 pts, 334 behind #12 |
| State (NV) | #14, 184 pts, 5 behind #13 | #1, 218 pts |
| Gold Cup | not ranked | not ranked |
| NAG | #190, 210 pts, 1 behind #189 | #30, 335 pts, 7 behind #29 |
| National | #2912, 210 pts, tied with #2911 | #594, 335 pts, 1 behind #593 |

Full output with last 5 races and opponents is in `out/`.

## Not yet checked

- A multi-day national in the last 5 races (race-day matching is by date, so it should work, but neither rider's last 5 included one).
- Cruiser class: code pulls it, but neither rider has cruiser races in 2026.
- How the site behaves under a nightly schedule. Keep volume low; the Terms of Use caveats in `../research/usabmx-data-findings.md` still apply.
