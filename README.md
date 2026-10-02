# Ringette Today

A phone app (PWA) that shows NCRRL, LERQ and GAARA league games and Ringette Ontario tournament games for the teams you follow, and for each game, which game is on the same ice right before and right after.

## How it gets the schedule

The NCRRL website and the Ringette Ontario tournament sites all run on RAMP InterActive, which loads schedules from public JSON feeds. The app reads them straight from your phone, so there's no scraper or server to run.

- **League games:** `https://www.ncrrl.com/api/leaguegame/get/{league ID}/{season}/0/0/0/0/`. NCRRL is 1648 and GAARA (the Gloucester & Area Adult Ringette Association, https://www.gaara.ca/) is 2786. Both are set in `LEAGUES` at the top of `app.js`; GAARA teams are listed after all the NCRRL divisions in the team picker.
- **Season:** picked automatically for each league from `https://www.ncrrl.com/api/association/getseasons/{league ID}/`, so a new season needs no change.
- **Tournament games:** `https://www.ncrrl.com/api/leaguetournamentgame/get/{tournament ID}/{season}/0/0/0/0/0`.

A team has the same ID in the league and in tournaments, so the teams you follow pick up their tournament games automatically.

Each game includes a rink ID, which identifies the exact pad. "Before" and "After" are the neighbouring games (league or tournament) at that rink ID on the same day. Some tournaments don't publish end times; the app estimates them from the next game on that ice and marks them with "~".

**Limitation:** only NCRRL, LERQ and GAARA league games and the listed tournaments are included. Hockey, practices, or other leagues on the same ice won't show up.

## LERQ (Quebec AA league)

The LERQ U16 AA and U19 AA schedules come from Ringuette Québec's public schedule page (https://membres.ringuette-quebec.qc.ca/cedules_liste_web.asp). That site doesn't let browser apps on other websites read it, so a scheduled GitHub job does it instead:

- `.github/workflows/lerq.yml` runs every 3 hours. It runs `scripts/fetch-lerq.mjs`, which reads the page and writes `quebec.json`. When the schedule has changed, the job commits the file and republishes the site.
- The app reads `quebec.json` from its own site. Until the job has run once, the app simply has no LERQ games.
- To run it right away: repository → **Actions** → **Update LERQ schedule** → **Run workflow**.
- If the page ever changes and no games can be read, the job fails (GitHub emails you) and the old `quebec.json` is kept.
- Only the Ottawa-area LERQ teams appear in the team picker (`pickerTeams` in `app.js`), but every LERQ game counts for opponents and for before/after on the ice.
- Ringuette Québec names rinks differently from RAMP; `RINK_ALIASES` in `app.js` matches the Ottawa-area ones so LERQ games line up with NCRRL and GAARA games on the same ice.
- LERQ doesn't publish end times (estimated, shown with "~") and the app doesn't show LERQ scores yet.

## Tournaments

`tournaments.json` lists the Ringette Ontario 2026-27 sanctioned tournaments that publish schedules on RAMP: each one's RAMP ID, name and dates (from https://www.ringetteontario.com/content/sanctioned-events).

- The app only downloads a tournament that starts within the next 31 days or ended in the last 7, so opening it stays quick.
- Tournament schedules refresh every 6 hours, or every 10 minutes while the tournament is on.
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
| `test/` | Sample data and scripts for checking the app locally (not needed to run it) |

If you change `app.js` or `styles.css` later, bump `CACHE` in `sw.js` (e.g. `ringette-today-v2`) so installed copies pick up the update.
