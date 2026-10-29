// Downloads RAMP schedules (NCRRL, GAARA, Ringette Ontario tournaments and
// other RAMP tournaments in tournaments.json) and saves them as ramp.json.
//
// Why: in Oct 2026 RAMP rebuilt its websites and its JSON feed
// (/api/leaguegame/get/…) stopped working. What's left, and what this reads:
//   • Calendar files (.ics) for each league / tournament — every game with
//     its game number, times, rink, division, home and away team, final score
//     and notes. They have no team, division or rink IDs.
//   • The sites' menus (plain HTML), which list every division and team with
//     their IDs. Team IDs are the same as before, so followed teams keep working.
// The calendar files don't let browser apps on other sites read them, so this
// runs as a GitHub job and the app reads ramp.json from its own site.
//
//   node scripts/fetch-ramp.mjs                          # download, write ramp.json
//   node scripts/fetch-ramp.mjs --out /tmp/ramp.json     # write somewhere else
//   node scripts/fetch-ramp.mjs --from test/ramp --out x --today 2026-10-24
//                                                        # read saved samples instead
// Exit code 2 = finished, but something looks like RAMP changed its pages (see PROBLEM lines).
//
// Needs Node 18+ (built-in fetch). No packages.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HEADERS = { 'User-Agent': 'RingetteToday schedule reader (github.com/trevorsimmonds/ringette-today)' };
const LOOKAHEAD_DAYS = 31;   // tournaments starting within this many days…
const LOOKBACK_DAYS = 7;     // …or that ended within this many days
const PAUSE_MS = 400;
const RETRY_WAITS = [10000, 30000];
const DEFAULT_OUT = new URL('../ramp.json', import.meta.url);
const TOURNAMENTS = new URL('../tournaments.json', import.meta.url);

// Leagues read every run. menu = a page on the league's own site whose menu
// lists its divisions and teams.
export const LEAGUES = [
  { key: 'ncrrl', aid: 1648, site: 'https://www.ncrrl.com' },
  { key: 'gaara', aid: 2786, site: 'https://www.gaara.ca' },
];
const ONTARIO = 'https://www.ringetteontario.com';  // its menu lists every Ontario league and tournament

// ---------- small helpers ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', rsquo: '’' };
export const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);?/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e] ?? m));
// For matching names between the calendar and the menus.
const key = (s) => decodeEntities(s).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

const onGitHub = !!process.env.GITHUB_ACTIONS;
const oneLine = (m) => String(m).replace(/\s+/g, ' ');
const warn = (m) => console.log(onGitHub ? `::warning::${oneLine(m)}` : `WARNING: ${m}`);
const fail = (m) => console.log(onGitHub ? `::error::${oneLine(m)}` : `PROBLEM: ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, expect) {
  let last = '';
  for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
    if (attempt) { console.log(`  retrying in ${RETRY_WAITS[attempt - 1] / 1000}s (${last})`); await sleep(RETRY_WAITS[attempt - 1]); }
    try {
      const res = await fetch(url, { headers: HEADERS });
      const body = await res.text();
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      if (expect && !expect.test(body)) { last = 'unexpected page'; continue; }
      return body;
    } catch (err) { last = err.message; }
  }
  const e = new Error(`${url}: ${last}`);
  e.unavailable = true;
  throw e;
}

// ---------- calendar (.ics) ----------
// Returns the games: { kind, gid, date, time, endDate, endTime, arena, division,
// home, away, score:{home,away}|null, notes, cancelled, tournament }.
// SUMMARY is "Division: Home vs Away" (tournaments: "Tournament: Division: Home vs Away");
// DESCRIPTION is "Game #260040\nFinal: 6 - 6\n<notes>" — score is home - away.
// Times are the rink's local clock time whatever the TZID says.
export function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const games = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') { if (ev) { const g = toGame(ev); if (g) games.push(g); } ev = null; continue; }
    if (!ev) continue;
    const m = /^([A-Z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
    if (m && !(m[1] in ev)) ev[m[1]] = m[2];
  }
  return games;
}
const unescapeIcs = (s) => decodeEntities(String(s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'));
const wall = (v) => { const m = /(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d))?/.exec(v || ''); return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : null } : null; };
function toGame(ev) {
  const uid = /^(leaguegame|tournamentgame)-(\d+)/.exec(ev.UID || '');
  if (!uid) return null;  // holidays and other calendar entries
  const start = wall(ev.DTSTART), end = wall(ev.DTEND);
  if (!start || !start.time) return null;
  const summary = unescapeIcs(ev.SUMMARY);
  const parts = summary.split(': ');
  let tournament = null;
  if (uid[1] === 'tournamentgame' && parts.length >= 3) tournament = parts.shift();
  const division = parts.shift() || '';
  const matchup = parts.join(': ');
  const vs = matchup.indexOf(' vs ');
  if (vs < 0) return null;
  const desc = unescapeIcs(ev.DESCRIPTION).split('\n').map((s) => s.trim()).filter(Boolean);
  let score = null;
  const notes = [];
  for (const d of desc) {
    const f = /^Final:\s*(\d+)\s*-\s*(\d+)/i.exec(d);
    if (f) score = { home: +f[1], away: +f[2] };
    else if (!/^Game #\S+$/i.test(d)) notes.push(d);
  }
  const arena = unescapeIcs(ev.LOCATION).split(',')[0].trim() || 'TBD';
  return {
    kind: uid[1], gid: +uid[2],
    date: start.date, time: start.time,
    endDate: end && end.time ? end.date : null, endTime: end && end.time ? end.time : null,
    arena, division,
    home: matchup.slice(0, vs).trim(), away: matchup.slice(vs + 4).trim(),
    score, notes: notes.join(' · '),
    cancelled: /cancel/i.test(`${summary} ${notes.join(' ')}`),
    tournament,
  };
}

// ---------- menus (plain HTML) ----------
// League sites:   <button id="accordion-menu-title-{DID}"…><span>U14C</span>
//                 <a href="/team/{SID}/0/{DID}/{TID}/masterschedule"…><p>Name</p>
// Ringette Ontario: <button id="accordion-menu-title-{AID}"…><span>Tournament</span>
//                 <button id="accordion-submenu-title-{DID}"…><span>U12A</span>
//                 <a href="/portal/team/{AID}/{SID}/0/{DID}/{TID}/"…><p>Name</p>
export function parseMenu(html, defaultAid = null) {
  const titles = new Map();
  for (const m of html.matchAll(/id="accordion-(?:sub)?menu-title-(\d+)"[^>]*>\s*<span>([^<]*)<\/span>/g)) {
    if (!titles.has(+m[1])) titles.set(+m[1], decodeEntities(m[2]).trim());
  }
  const teams = [];
  const seen = new Set();
  // (a team logo <img> may sit between the link and the name)
  const re = /href="(?:\/portal)?\/team\/(?:(\d+)\/)?(\d+)\/0\/(\d+)\/(\d+)\/[^"]*"[^>]*>(?:(?!<\/a>)[\s\S]){0,600}?<p>([^<]*)<\/p>/g;
  for (const m of html.matchAll(re)) {
    // League sites: /team/{SID}/0/{DID}/{TID}/…  Portal: /portal/team/{AID}/{SID}/0/{DID}/{TID}/
    const aid = m[1] ? +m[1] : defaultAid;
    const t = { aid, sid: +m[2], did: +m[3], tid: +m[4], name: decodeEntities(m[5]).trim() };
    const k = `${t.aid}|${t.sid}|${t.did}|${t.tid}`;
    if (seen.has(k)) continue;
    seen.add(k);
    teams.push(t);
  }
  return { titles, teams };
}

// The season the menu lists for an association (most common SID in its team links).
export function seasonOf(menu, aid) {
  const counts = new Map();
  for (const t of menu.teams) if (t.aid === aid) counts.set(t.sid, (counts.get(t.sid) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// Turn calendar games into the app's game shape, filling team and division
// IDs from the menu. Returns { games, unmatched } (team names not found).
// Playoff slots ("1ST", "2ND BLUE", "Winner Game 12") have no team.
export const isSlot = (name) => /^(\d+\s*(st|nd|rd|th)\b|winner|loser|tbd|tba|to be determined|semi|final|pool|group)/i.test(name.trim());

export function withIds(icsGames, menu, aid, sid) {
  // This season's teams first, then older seasons' (a tournament's menu can
  // still show last year's teams before this year's are entered).
  const teams = menu.teams.filter((t) => t.aid === aid).sort((a, b) => (b.sid === sid) - (a.sid === sid) || b.sid - a.sid);
  const divByName = new Map();
  for (const t of teams) { const n = menu.titles.get(t.did); if (n && !divByName.has(key(n))) divByName.set(key(n), t.did); }
  const byDivName = new Map();
  for (const t of teams) { const k = `${t.did}|${key(t.name)}`; if (!byDivName.has(k)) byDivName.set(k, t); }
  // By name alone (division unknown): only if the name means one team.
  const byName = new Map();
  for (const t of teams) {
    const k = key(t.name), had = byName.get(k);
    if (!had) byName.set(k, t);
    else if (had !== 'dup' && had.tid !== t.tid && had.sid === t.sid) byName.set(k, 'dup');
  }
  const unmatched = new Set();
  const find = (name, did) => {
    const t = (did && byDivName.get(`${did}|${key(name)}`)) || byName.get(key(name));
    if (!t || t === 'dup') { if (!isSlot(name)) unmatched.add(name); return null; }
    return t;
  };
  const games = icsGames.map((g) => {
    const did = divByName.get(key(g.division)) || null;
    const h = find(g.home, did), a = find(g.away, did);
    return {
      GID: g.gid,
      sDate: `${g.date}T${g.time}:00`,
      eDate: g.endTime ? `${g.endDate}T${g.endTime}:00` : null,
      ArenaName: g.arena,
      RARID: null,
      HomeTeamName: g.home, homeTID: h ? h.tid : null, homeScore: g.score ? g.score.home : null,
      AwayTeamName: g.away, awayTID: a ? a.tid : null, awayScore: g.score ? g.score.away : null,
      HomeDivision: g.division, AwayDivision: null,
      homeDID: (h && h.did) || did, awayDID: (a && a.did) || did,
      GameTypeName: '',
      notes: g.notes,
      completed: !!g.score,
      cancelledHome: g.cancelled,
    };
  });
  return { games, unmatched: [...unmatched] };
}

// ---------- run ----------
function ottawaDay(offsetDays, todayMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(todayMs + offsetDays * 86400000));
}
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const fromDir = arg('--from');
  const OUT = arg('--out') || DEFAULT_OUT;
  const todayMs = arg('--today') ? Date.parse(`${arg('--today')}T12:00:00-04:00`) : Date.now();
  // In --from mode, a URL maps to a saved file named after its host + path.
  const sample = (url) => `${fromDir}/${url.replace(/^https:\/\/(www\.)?/, '').replace(/\?.*$/, '').replace(/[^a-z0-9.]+/gi, '_')}`;
  const load = async (url, expect) => {
    if (!fromDir) { await sleep(PAUSE_MS); return get(url, expect); }
    try { return await readFile(sample(url), 'utf8'); }
    catch { const e = new Error(`no sample ${sample(url)}`); e.unavailable = true; throw e; }
  };

  let old = null;
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
  const out = { source: 'RAMP calendar files (.ics) + site menus', updatedAt: null, leagues: {}, tournaments: {} };
  const problems = [];

  // 1. Leagues.
  for (const lg of LEAGUES) {
    const prev = old?.leagues?.[lg.key];
    try {
      const menu = parseMenu(await load(`${lg.site}/`, /accordion-menu-title-/), lg.aid);
      const sid = seasonOf(menu, lg.aid);
      if (!sid) { problems.push(`${lg.key}: no teams found in the site's menu — RAMP may have changed its pages.`); if (prev) out.leagues[lg.key] = prev; continue; }
      const ics = parseIcs(await load(`${lg.site}/calendar/master-schedule/${lg.aid}.ics?SID=${sid}&DID=0&TZ=America%2FToronto`, /BEGIN:VCALENDAR/));
      if (!ics.length) {
        // An empty calendar while the menu has teams: keep what we had.
        warn(`${lg.key}: the calendar has no games (season ${sid}) — kept the last good copy.`);
        if (prev) out.leagues[lg.key] = prev;
        continue;
      }
      const { games, unmatched } = withIds(ics, menu, lg.aid, sid);
      if (unmatched.length) warn(`${lg.key}: ${unmatched.length} team name(s) not in the menu, e.g. ${unmatched.slice(0, 3).join('; ')}`);
      if (unmatched.length > games.length) problems.push(`${lg.key}: most team names couldn't be matched to the menu — RAMP may have changed its pages.`);
      console.log(`${lg.key}: ${games.length} games (season ${sid}), ${games.filter((g) => g.completed).length} with scores`);
      out.leagues[lg.key] = { aid: lg.aid, sid, site: lg.site, games };
    } catch (err) {
      if (!err.unavailable) throw err;
      warn(`${lg.key}: couldn't download (${err.message}) — kept the last good copy.`);
      if (prev) out.leagues[lg.key] = prev;
    }
  }

  // 2. Tournaments from tournaments.json, from a week ago to a month ahead.
  const list = JSON.parse(await readFile(fromDir && arg('--tournaments') ? arg('--tournaments') : TOURNAMENTS, 'utf8')).tournaments || [];
  const from = ottawaDay(-LOOKBACK_DAYS, todayMs), to = ottawaDay(LOOKAHEAD_DAYS, todayMs);
  const active = list.filter((t) => t.end >= from && t.start <= to);
  let ontarioMenu = null;
  for (const t of active) {
    const prev = old?.tournaments?.[t.aid];
    try {
      const own = !!t.site;  // tournaments with their own RAMP site (e.g. Fredericton)
      if (!own && !ontarioMenu) ontarioMenu = parseMenu(await load(`${ONTARIO}/`, /accordion-submenu-title-/));
      const menu = own ? parseMenu(await load(`${t.site}/`, /accordion-menu-title-/), t.aid) : ontarioMenu;
      const sid = seasonOf(menu, t.aid);
      if (!sid) {
        // Not listed yet (teams not entered) — nothing to show, not a problem.
        console.log(`${t.name} (${t.aid}): not in the menu yet`);
        if (prev) out.tournaments[t.aid] = prev;
        continue;
      }
      const url = own
        ? `${t.site}/calendar/master-schedule/${t.aid}.ics?SID=${sid}&DID=0&TZ=America%2FToronto`
        : `${ONTARIO}/calendar/master-schedule/${t.aid}.ics?SID=${sid}&TournamentAID=${t.aid}&TZ=America%2FToronto`;
      // Tournament calendars hold every year; keep this year's dates (± a few days).
      const lo = addDays(t.start, -4), hi = addDays(t.end, 4);
      const ics = parseIcs(await load(url, /BEGIN:VCALENDAR/)).filter((g) => g.date >= lo && g.date <= hi);
      const { games, unmatched } = withIds(ics, menu, t.aid, sid);
      if (unmatched.length) warn(`${t.name}: ${unmatched.length} team name(s) not in the menu, e.g. ${unmatched.slice(0, 3).join('; ')}`);
      console.log(`${t.name} (${t.aid}): ${games.length} games (season ${sid}), ${games.filter((g) => g.completed).length} with scores`);
      if (games.length) out.tournaments[t.aid] = { aid: t.aid, sid, games };
      else if (prev) out.tournaments[t.aid] = prev;
    } catch (err) {
      if (!err.unavailable) throw err;
      warn(`${t.name} (${t.aid}): couldn't download (${err.message})${prev ? ' — kept the last good copy' : ''}.`);
      if (prev) out.tournaments[t.aid] = prev;
    }
  }

  const same = old && JSON.stringify(old.leagues) === JSON.stringify(out.leagues) && JSON.stringify(old.tournaments) === JSON.stringify(out.tournaments);
  if (!Object.keys(out.leagues).length) problems.push('No league schedules at all — ramp.json left as it was.');
  else if (same) console.log('No changes.');
  else {
    out.updatedAt = new Date().toISOString();
    await writeFile(OUT, JSON.stringify(out) + '\n');
    console.log(`Wrote ramp.json (${Object.values(out.leagues).reduce((n, l) => n + l.games.length, 0)} league games, ${Object.keys(out.tournaments).length} tournaments).`);
  }
  if (problems.length) { for (const p of problems) fail(p); process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { fail(`The RAMP job stopped: ${err.message}`); process.exit(1); });
}
