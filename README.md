# Ringette Today

A phone app (PWA) that shows NCRRL, LERQ and GAARA league games and Ringette Ontario tournament games for the teams you follow, and for each game, which game is on the same ice right before and right after.

## How it gets the schedule

The NCRRL and GAARA websites and the Ringette Ontario tournament sites all run on RAMP InterActive. Until October 2026 RAMP had public JSON feeds the app read straight from your phone. RAMP then rebuilt its sites, the feeds stopped working, and the new pages don't let browser apps on other websites read them. So a scheduled GitHub job now copies the schedules into `ramp.json`, and the app reads that file from its own site.

- `.github/workflows/ramp.yml` runs `scripts/fetch-ramp.mjs`. It reads each league's menu page (division and team names and IDs) and its calendar file (`https://www.ncrrl.com/calendar/master-schedule/1648.ics?SID={season}&DID=0`), and writes `ramp.json`. When anything changed, the job commits the file and republishes the site.
- **How often** (Ottawa time): every 15 minutes on Saturdays and Sundays from 7 am to 11 pm and on Friday evenings; every 30 minutes Monday to Thursday from 5 to 11 pm; hourly the rest of the time. GitHub sometimes runs scheduled jobs a few minutes late.
- To run it right away: repository → **Actions** → **Update RAMP schedules** → **Run workflow**.
- **Leagues:** NCRRL is 1648 and GAARA (the Gloucester & Area Adult Ringette Association, https://www.gaara.ca/) is 2786. They're set in `LEAGUES` at the top of both `scripts/fetch-ramp.mjs` and `app.js`. The season is whatever the league's menu lists, so a new season needs no change.
- **Tournaments:** from Ringette Ontario's calendar files (or the tournament's own RAMP site, like Fredericton), for tournaments in `tournaments.json` that start within the next 31 days or ended in the last 7.
- **If RAMP is down** or a calendar comes back empty, the last good copy is kept and the job doesn't fail. If a page looks like RAMP changed its layout (no teams found), the job still keeps the last good copy, but fails so GitHub emails you.
- `test/ramp-check.mjs` checks the reader against trimmed copies of real RAMP pages in `test/ramp/`; the job runs it first. To try the whole thing on your Mac: `node test/ramp-check.mjs && node scripts/fetch-ramp.mjs`.

A team has the same ID in the league and in tournaments, so the teams you follow pick up their tournament games automatically.

"Before" and "After" are the neighbouring games (league or tournament) on the same pad on the same day, matched by rink name. Some tournaments don't publish end times; the app estimates them from the next game on that ice and marks them with "~".

**Also here:** for buildings with several pads (Ray Friel, Jim Durrell, Slush Puppie, Nepean Sportsplex, CARDELREC, Walter Baker and others), each upcoming game also lists games on the other pads that overlap it in time. The schedules don't say which pads share a building, so `BUILDINGS` near the top of `app.js` lists them; any rink not in that list is treated as its own building. To add a building, copy one of the lines and adjust the name and patterns.

**Limitation:** only NCRRL, LERQ and GAARA league games and the listed tournaments are included. Hockey, practices, or other leagues on the same ice won't show up.

## LERQ (Quebec AA league)

The LERQ U16 AA and U19 AA schedules come from Ringuette Québec's public schedule page (https://membres.ringuette-quebec.qc.ca/cedules_liste_web.asp). That site doesn't let browser apps on other websites read it, so a scheduled GitHub job does it instead:

- `.github/workflows/lerq.yml` runs every 3 hours. It runs `scripts/fetch-lerq.mjs`, which reads the page and writes `quebec.json`. When the schedule has changed, the job commits the file and republishes the site.
- The app reads `quebec.json` from its own site. Until the job has run once, the app simply has no LERQ games.
- To run it right away: repository → **Actions** → **Update LERQ schedule** → **Run workflow**.
- If the page ever changes and no games can be read, the job fails (GitHub emails you) and the old `quebec.json` is kept.
- Only the Ottawa-area LERQ teams appear in the team picker (`pickerTeams` in `app.js`), but every LERQ game counts for opponents and for before/after on the ice.
- Ringuette Québec names rinks differently from RAMP; `RINK_ALIASES` in `app.js` matches the Ottawa-area ones so LERQ games line up with NCRRL and GAARA games on the same ice.
- Scores aren't in Ringuette Québec's schedule list, only on each game's own page. The job reads those pages for games that have started and don't have a score yet (and re-checks the last 3 days in case of corrections), so a score shows up within about 3 hours of being entered.
- LERQ doesn't publish end times; they're estimated and shown with "~".

## Tournaments

`tournaments.json` lists the Ringette Ontario 2026-27 sanctioned tournaments that publish schedules on RAMP: each one's RAMP ID, name and dates (from https://www.ringetteontario.com/content/sanctioned-events).

- Only tournaments that start within the next 31 days or ended in the last 7 are copied.
- They're copied by the RAMP job above, on the same schedule.
- Teams → Settings shows which tournaments the app is checking right now.

**Each summer:** update the `start`/`end` dates in `tournaments.json` for the new season and add any new tournaments. A tournament keeps its RAMP ID every year.

Not on the list (no RAMP schedule found): the one-day 3v3 events in West Ferris, Chatham and St. Thomas, the Walden Winter Carnival, and the Stouffville adult pre-season.

## Putting it online (pick one)

A PWA has to be served over HTTPS to install on a phone.

**Netlify Drop (easiest, ~1 minute):** go to https://app.netlify.com/drop and drag the `ringette-today` folder onto the page. You get a URL you can open on your phone. Create a free account to keep it permanently.

**GitHub Pages:** the code lives at https://github.com/trevorsimmonds/ringette-today. To publish it, open https://github.com/trevorsimmonds/ringette-today/settings/pages, set Source to *Deploy from a branch*, choose `main` and `/ (root)`, then Save. The app will be live at https://trevorsimmonds.github.io/ringette-today/

## Installing on a phone

- **iPhone (Safari):** open the URL → Share → *Add to Home Screen*.
- **Android (Chrome):** open the URL → ⋮ menu → *Install app* / *Add to Home screen*.

## Using it

1. **Teams** tab → search (e.g. "Ottawa Ice U14") → tick the teams you follow.
2. **Upcoming** shows their games with who's on the ice before and after. Tap the arena name to see that rink's whole day.
3. **Results** shows past scores.
4. **Share my teams** sends a link that sets up the same teams on someone else's phone.

## Quebec tournaments (Planitournoi)

Quebec ringette tournaments post their schedules on [Planitournoi](https://www.planitournoi.com/sport/ringuette/). It has no data feed and browser apps can't read it, so a GitHub job copies it, the same way as the LERQ schedule:

- `.github/workflows/planitournoi.yml` runs every hour (at :41) and runs `scripts/fetch-planitournoi.mjs`.
- The script reads Planitournoi's ringette list, takes tournaments from a week ago to a month ahead, reads each one's schedule (and each rink's page), keeps only tournaments with Ottawa-area teams, and writes `planitournoi.json`.
- The app loads `planitournoi.json` every 10 minutes and matches tournament teams ("Nepean 16AA", "GCRA U16AA - DEARING") to the league teams you follow by club, age and level. Club names written differently are listed in `CLUB_ALIASES` in `app.js`; rink names in `PT_RINK_ALIASES`.
- Finished games link to Planitournoi's game sheet (PDF) as the box score.

Run it by hand from the Actions tab: **Update Quebec tournaments → Run workflow**.

Safety nets:
- Each run first does `node test/pt-check.mjs`: it checks the reader against trimmed copies of real Planitournoi pages (`test/pt-list.html`, `test/pt-23644.html`) and fails if a code change broke it.
- If a schedule page can't be read, the last good copy of that tournament is kept. If a page lists games but none can be read (Planitournoi changed its layout), the run still saves what it could but is marked failed, so GitHub emails you.
- The file is only rewritten when something changed, and never with an empty tournament list.

Testing on your Mac (your own Terminal can reach Planitournoi): `node test/pt-check.mjs`, then `node scripts/fetch-planitournoi.mjs` to download the real schedules into `planitournoi.json`, then `python3 -m http.server 8001` and open http://localhost:8001. Add `--out /tmp/pt.json` to download somewhere else instead.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell |
| `app.js` | Fetching, caching, and all the screens |
| `styles.css` | Styling (light and dark mode) |
| `manifest.webmanifest`, `icons/` | Makes it installable |
| `sw.js` | Lets the app open offline |
| `tournaments.json` | Tournament IDs and dates |
| `quebec.json` | LERQ schedule, written by the GitHub job (don't edit by hand) |
| `scripts/fetch-lerq.mjs`, `.github/workflows/lerq.yml` | The job that copies the LERQ schedule |
| `planitournoi.json` | Quebec tournament schedules, written by the GitHub job (don't edit by hand) |
| `scripts/fetch-planitournoi.mjs`, `.github/workflows/planitournoi.yml` | The job that copies Quebec tournaments from Planitournoi |
| `test/` | Sample data and scripts for checking the app locally (not needed to run it) |

If you change `app.js` or `styles.css` later, bump `CACHE` in `sw.js` (e.g. `ringette-today-v2`) so installed copies pick up the update.
