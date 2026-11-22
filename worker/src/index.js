// Ringette Today live-score helper (Cloudflare Worker).
//
// The app can't read RAMP's pages itself (RAMP doesn't allow other websites
// to), so it asks this helper. For one game it reads RAMP's game page and
// answers with the teams and the score as RAMP shows them right now:
//
//   GET /game/{site}/{game}    e.g. /game/ncrrl/2072660, /game/ontario/2120590
//   → { site, game, page, asOf, teams: {home, away} | null, score: {home, away} | null, cached }
//
//   GET /games?g=ncrrl:2072660,ontario:2120590   (up to 10 games in one request)
//   → { asOf, games: { "ncrrl:2072660": {…as above…}, "ontario:2120590": { error } } }
//   The pages are read at the same time; one that takes more than 4 seconds
//   (or fails) comes back as { error } and the others are still answered.
//
// site is one of SITES below; game is RAMP's game number. Nothing else is
// fetched, so the helper can't be used to read other websites. Each game page
// is kept for 60 seconds, so however many phones ask, RAMP sees about one
// read per game per minute from each Cloudflare location.
import { parseLiveScore, parseGameTeams } from '../../scripts/ramp-pages.mjs';

export const SITES = {
  ncrrl: 'https://www.ncrrl.com',
  gaara: 'https://www.gaara.ca',
  ontario: 'https://www.ringetteontario.com',          // Ontario tournaments
  fredericton: 'https://www.frederictonearlybird.ca',  // Fredericton Early Bird tournament
};
const ALLOWED_ORIGINS = [/^https:\/\/trevorsimmonds\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const KEEP_MS = 60_000;
const MAX_GAMES = 10;      // per /games request (the free plan allows 50 outside reads per request)
const PAGE_TIMEOUT_MS = 4_000;
const HEADERS = { 'User-Agent': 'RingetteToday live scores (github.com/trevorsimmonds/ringette-today)' };

// Game pages read in the last minute, in this copy of the helper's memory.
const recent = new Map();

function cors(request) {
  const origin = request.headers.get('Origin');
  return origin && ALLOWED_ORIGINS.some((re) => re.test(origin))
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : { Vary: 'Origin' };
}
const json = (request, status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(request), ...extra },
});

// Teams and score from a game page. Rows of the scoring table are matched to
// home/away by name when the page also lists the teams; otherwise home comes
// first, as RAMP shows it.
export function readGamePage(html) {
  const teams = parseGameTeams(html);
  const rows = parseLiveScore(html);
  let score = null;
  if (rows) {
    let [h, a] = rows;
    if (teams && (rows[1].name === teams.home || rows[0].name === teams.away)) [h, a] = [rows[1], rows[0]];
    score = { home: h.total, away: a.total };
  }
  return { teams: teams ? { home: teams.home || null, away: teams.away || null } : null, score };
}

// One game: from memory if read in the last minute, otherwise from RAMP.
// Returns { status, body }.
async function getGame(site, game, fetchPage, nowMs, timeoutMs) {
  const page = `${SITES[site]}/division/0/0/game/view/${game}`;
  const hit = recent.get(page);
  if (hit && nowMs - hit.at < KEEP_MS) return { status: 200, body: { ...hit.body, cached: true } };
  let res;
  try {
    res = await fetchPage(page, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const why = err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? `no answer from RAMP in ${timeoutMs / 1000}s` : `couldn't reach RAMP: ${err.message}`;
    return { status: 502, body: { error: why, site, game: +game, page } };
  }
  if (!res.ok) return { status: 502, body: { error: `RAMP answered ${res.status}`, site, game: +game, page } };
  const body = { site, game: +game, page, asOf: new Date(nowMs).toISOString(), ...readGamePage(await res.text()) };
  recent.set(page, { at: nowMs, body });
  if (recent.size > 500) for (const [k, v] of recent) if (nowMs - v.at >= KEEP_MS) recent.delete(k);
  return { status: 200, body: { ...body, cached: false } };
}

const GAME_ID = /^\d{5,9}$/;
const usage = () => `Ask /game/{site}/{game} or /games?g={site}:{game},… (up to ${MAX_GAMES}); site one of: ${Object.keys(SITES).join(', ')}`;

export async function handle(request, { fetchPage = fetch, nowMs = Date.now(), timeoutMs = PAGE_TIMEOUT_MS } = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors(request), 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
  }
  const url = new URL(request.url);
  if (request.method !== 'GET') return json(request, 405, { error: 'Only GET is supported.' });
  if (url.pathname === '/' || url.pathname === '/health') {
    return json(request, 200, { ok: true, about: 'Ringette Today live-score helper. ' + usage(), sites: Object.keys(SITES) });
  }
  const cache = { 'Cache-Control': 'public, max-age=30' };

  const one = /^\/game\/([a-z]+)\/(\d+)$/.exec(url.pathname);
  if (one) {
    const [, site, game] = one;
    if (!SITES[site] || !GAME_ID.test(game)) return json(request, 404, { error: usage() });
    const { status, body } = await getGame(site, game, fetchPage, nowMs, timeoutMs);
    return json(request, status, body, status === 200 ? cache : {});
  }

  if (url.pathname === '/games') {
    const wanted = [...new Set((url.searchParams.get('g') || '').split(',').map((x) => x.trim()).filter(Boolean))];
    if (!wanted.length || wanted.length > MAX_GAMES) return json(request, 400, { error: usage() });
    const parsed = wanted.map((k) => /^([a-z]+):(\d+)$/.exec(k));
    if (parsed.some((m) => !m || !SITES[m[1]] || !GAME_ID.test(m[2]))) return json(request, 400, { error: usage() });
    const results = await Promise.all(parsed.map(([, site, game]) => getGame(site, game, fetchPage, nowMs, timeoutMs)));
    const games = Object.fromEntries(wanted.map((k, i) => [k, results[i].body]));
    return json(request, 200, { asOf: new Date(nowMs).toISOString(), games }, cache);
  }

  return json(request, 404, { error: usage() });
}

export default {
  fetch: (request) => handle(request),
};
