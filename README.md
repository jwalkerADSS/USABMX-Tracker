# BMX Tracker

A private web app for following our riders' USA BMX results: points and rank at every level, how far they are from the next place, their season record, and their last five races with everyone they raced against. It installs on a phone from the browser.

All data comes from the public USA BMX site, read on demand and cached for six hours. Nothing needs a USA BMX login. See [`spike/README.md`](spike/README.md) for the endpoints and what each one covers.

## What's in it

- **Riders** (`/`): a card per tracked rider with level, home track, rank at district, state, NAG and national, season wins and last race.
- **Rider page** (`/riders/{profileId}`): standings with the points gap to the next place, #10 and #1; season record (wins, podiums for 2nd and 3rd, other finishes) with the top and worst track by wins and a wins-by-track table; last five races with finish, points earned, race type, level and the riders they raced against. Opponents link to their own pages and track names link to the track page.
- **Track page** (`/tracks/{trackId}`): the track's latest race results for every moto, with a race-date picker for earlier races. Our riders are highlighted.
- **Standings** (`/standings/{level}?rider={profileId}`): the full District, State, Gold Cup, NAG or National table, opened on the rider's page with their row highlighted. The NAG and National pages also list the nationals the rider raced this season with their main event finishes. Nationals aren't in race history and their results list only main finishers by name and hometown, so they're found by searching each posted national for the rider's name and home state.
- **Race results** (`/events/{raceId}`): every moto and finish of one race, day by day, with a filter for class or rider name. Nationals open here, since they often run at venues with no track page. USA BMX posts only the main event finishers for nationals.
- **Search** (`/search`): find a rider by name. The list is built nightly from the national standings and the Nevada district standings (`scripts/build-index.mjs`, run by `.github/workflows/rider-index.yml`). Races this calendar year can be searched by state, month and type separated by colons, like `California:Nationals`, `Nevada:Gold Cup`, `January:Nationals` or `NV:State:Finals` (`lib/events.ts`). A USA BMX profile number also works, and a district plate like `NV01 #63` shows who is running that plate this season (last season's final place in each class) and who holds that place in the current standings.
- **Accounts**: sign in with a username and password, remembered for 90 days. New people sign up with a username, password, email (where a reset password is sent) and the invite code, then pick up to 5 riders for their landing page (`/my-riders`, changeable any time). Accounts live in a Neon Postgres database (`lib/store.ts`, `lib/accounts.ts`); passwords are stored as scrypt hashes, and ten wrong passwords lock a username for 15 minutes. The older family email sign-in and the Test user still work.

Tracked riders and the standings tables to check for each are in [`data/riders.json`](data/riders.json). USA BMX doesn't publish points per race, so [`lib/points.ts`](lib/points.ts) works them out from the rulebook points tables: finish points plus one point per rider in the moto, times the race's multiplier. Totals from national events and bonus points aren't in race history, so the sum can fall short of the official season total.

## Deploy (Vercel, free plan)

1. Sign in at [vercel.com](https://vercel.com) with GitHub and import this repository. The defaults for Next.js are correct.
2. Add these environment variables (see `.env.example`):
   - `SIGNUP_CODE`: the invite code people need to sign up for a full account. Leave it unset to allow only trial codes.
   - `DATABASE_URL`: set for you when you create a Neon Postgres database (Free plan) in the project's Storage tab and connect it. The app creates its one table on first use.
   - `ADMIN_USERNAMES`: your account's username (comma-separate several). Those accounts get an Admin page for password resets and trial codes. Each trial code signs up one account for 7 days from sign-up and can't be used again; when the trial ends, sign-in stops (with a button to email the admin) until an admin adds 7 more days on the Admin page.
   - `ADMIN_EMAIL`: where password reset requests go. "Forgot password" lists the request on the Admin page and opens an email to this address in the person's own mail app (the address is visible on that page). On the Admin page you set a temporary password and send it back with one tap; they choose a new password at their next sign-in.
   - `ALLOWED_EMAILS`: comma-separated emails that may sign in
   - `APP_PASSWORD`: the family password
   - `SESSION_SECRET`: a long random string, e.g. the output of `openssl rand -hex 32`
   - `TEST_USER_PASSWORD` (optional): turns on a guest user who signs in with the username `Test` and this password. On first sign-in they search for and choose the rider they want to follow, and the landing page shows that rider. The choice is saved on their device. Remove the variable to turn the Test user off.
3. Deploy, then open the site on your phone and add it to the home screen:
   - iPhone (Safari): Share, then Add to Home Screen
   - Android (Chrome): menu, then Install app

The nightly search-index job commits to `main`, which redeploys the site with the fresh list.

## Develop

```sh
npm install
cp .env.example .env.local   # fill in values
npm run dev
npm run build-index          # refresh data/rider-index.json by hand
```

## Adding a rider to track

Add an entry to `data/riders.json` with their profile ID and member ID (the discovery script in `spike/` lists linked minor profiles) and the tables to check. Valid table values are listed in the spike README.
