# Ringette Today

A phone app (PWA) that shows NCRRL game schedules for the teams you follow, and for each game, which league game is on the same ice right before and right after.

## How it gets the schedule

The NCRRL website (run on RAMP InterActive) loads its schedules from a public JSON feed. One request returns every league game for the season:

```
https://www.ncrrl.com/api/leaguegame/get/1648/14554/0/0/0/0/
```

- `1648` — NCRRL's association ID
- `14554` — the 2026-27 season (change it under **Teams → Settings** when a new season starts)

The feed allows requests from any website, so the app reads it straight from your phone. There's no scraper or server to run. The app refreshes when you open it (or every 10 minutes while open), and keeps the last copy so it still works without a signal at the rink.

Each game includes a rink ID (`RARID`), which identifies the exact pad (e.g. "Walter Baker – Pad B" and "Pad A" are different). "Before" and "After" are the neighbouring league games at that same rink ID on the same day.

**Limitation:** only NCRRL league games are in the feed. Hockey, practices, tournaments, or other leagues on the same ice won't show up.

## Putting it online (pick one)

A PWA has to be served over HTTPS to install on a phone.

**Netlify Drop (easiest, ~1 minute):** go to https://app.netlify.com/drop and drag the `ringette-today` folder onto the page. You get a URL you can open on your phone. Create a free account to keep it permanently.

**GitHub Pages:** create a repository, upload these files to it, then Settings → Pages → deploy from the `main` branch. Your app will be at `https://<username>.github.io/<repo>/`.

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

If you change `app.js` or `styles.css` later, bump `CACHE` in `sw.js` (e.g. `ringette-today-v2`) so installed copies pick up the update.
