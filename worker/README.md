# Live-score helper (Cloudflare Worker)

The app can't read RAMP's pages itself: RAMP doesn't allow other websites to.
This small helper runs on your own free Cloudflare account, reads one RAMP game
page when asked, and answers with the teams and score as RAMP shows them right
now. The GitHub job still does the full schedule; this is only for being quick
during games.

    GET /game/{site}/{game}      site: ncrrl, gaara, ontario, fredericton
    e.g. https://ringette-live.<your-subdomain>.workers.dev/game/ontario/2120590

    {"site":"ontario","game":2120590,"page":"https://www.ringetteontario.com/division/0/0/game/view/2120590",
     "asOf":"2026-11-22T16:20:00.000Z","teams":{"home":"…","away":"…"},"score":{"home":0,"away":3},"cached":false}

Several games in one request (up to 10), e.g. everything live for one phone:

    GET /games?g=ncrrl:2072660,ontario:2120590
    {"asOf":"…","games":{"ncrrl:2072660":{…as above…},"ontario:2120590":{…}}}

The pages are read at the same time, so it takes about as long as the slowest
one. A page that fails or takes over 4 seconds comes back as {"error": "…"}
and the other games are still answered.

- `teams` is null until RAMP lists them on the game page; `score` is null until
  the game has a scoring table. A score here is whatever RAMP shows now: it may
  be a game in progress, not a final.
- Each game page is kept for 60 seconds, so RAMP sees about one read per game
  per minute however many people ask.
- Only those four RAMP sites and game numbers are accepted, so it can't be used
  to read other websites. Only the app's site (and localhost, for testing) may
  read the answers from a browser.

## Commands (run in this folder)

    npx wrangler login     # once: approve in the browser (sign up there if needed)
    npx wrangler dev       # run it on your Mac, then open
                           # http://localhost:8787/game/ncrrl/2072660
                           # http://localhost:8787/games?g=ontario:2120590,ontario:2120598
    npx wrangler deploy    # put it live; prints its address
    npx wrangler tail      # watch its log live (e.g. on a game day)
    npx wrangler rollback  # back to the previous version

Checks without Cloudflare or the internet: `node test/worker-check.mjs` (from
the project folder).

Free plan: 100,000 requests a day and 10 ms of work per request (reading a
game page takes well under 1 ms).
