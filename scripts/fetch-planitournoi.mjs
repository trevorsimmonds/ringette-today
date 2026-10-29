// Downloads Quebec (and other) ringette tournament schedules from Planitournoi
// and saves them as planitournoi.json for the app.
//
// 1. The ringette list (planitournoi.com/sport/ringuette/, 100 per page) gives
//    every current and upcoming tournament with its ID and dates.
// 2. For tournaments from a week ago up to a month ahead, the public schedule
//    page is read (it lists every game of the tournament).
// 3. Only tournaments with at least one Ottawa-area team are kept.
//
// Planitournoi has no data feed and doesn't let browser apps on other sites
// read it, so a scheduled GitHub job runs this (like fetch-lerq.mjs).
//
//   node scripts/fetch-planitournoi.mjs                       # download, write planitournoi.json
//   node scripts/fetch-planitournoi.mjs --out /tmp/pt.json    # download, write somewhere else
//   node scripts/fetch-planitournoi.mjs --from test --out x   # read test/pt-list.html, test/pt-<id>.html
// Exit code 2 = finished, but something looks like a page-layout change (see PROBLEM lines).
// A page that doesn't come back right is retried twice; if Planitournoi still
// doesn't send it (error or "too many requests" page), the run keeps the old
// data, leaves a warning on the run's summary page, and exits 0 (no email).
//
// Needs Node 18+ (built-in fetch). No packages.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BASE = 'https://www.planitournoi.com';
const LIST_URL = `${BASE}/search.php?byPage=100&lang=fr&sport_link=ringuette`;
const scheduleUrl = (id) =>
  `${BASE}/tournament_public.php?tournament_id=${id}&filter_division=0&team_id=0&field_id=0&date=0&dropdown=1&lang=fr`;
const HEADERS = { 'User-Agent': 'RingetteToday schedule reader (github.com/trevorsimmonds/ringette-today)' };
const LOOKAHEAD_DAYS = 31;
const LOOKBACK_DAYS = 7;
const MAX_TOURNAMENTS = 15;   // per run, to stay gentle with their site
const PAUSE_MS = 400;
const DEFAULT_OUT = new URL('../planitournoi.json', import.meta.url);

// Team names that count as "ours". Tournaments with none of these are skipped.
export const LOCAL_TEAMS = /ottawa|nepean|gcra|gloucester|cumberland|eastern ontario|eastern (rush|surge)|outaouais|gatineau|kanata|stittsville|orl[ée]ans|cyclones? d['e]? ?ottawa/i;

// ---------- small HTML helpers (no packages) ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', Eacute: 'É', laquo: '«', raquo: '»', rsquo: '’', ndash: '–', mdash: '—' };
export const text = (html) => String(html)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

function decode(buf, contentType = '') {
  const bytes = new Uint8Array(buf);
  let cs = /charset=([\w-]+)/i.exec(contentType)?.[1];
  if (!cs) {
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
    cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_WAITS = [15000, 45000];  // between attempts when a page doesn't come back right

// Messages that also show on the GitHub run's summary page (readable on a phone).
const onGitHub = !!process.env.GITHUB_ACTIONS;
const oneLine = (m) => String(m).replace(/\s+/g, ' ');
export const note = (m) => console.log(onGitHub ? `::notice::${oneLine(m)}` : m);
export const warn = (m) => console.log(onGitHub ? `::warning::${oneLine(m)}` : `WARNING: ${m}`);
export const fail = (m) => console.log(onGitHub ? `::error::${oneLine(m)}` : `PROBLEM: ${m}`);

// What a page says, briefly — to tell a "too many requests" or error page apart.
export function describePage(html) {
  const title = text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '') || 'no title';
  const body = text(String(html).replace(/<head[\s\S]*?<\/head>/i, '')).slice(0, 160);
  return `"${title}" — ${body || '(empty page)'}`;
}

// Fetch a page, retrying a couple of times if it fails or doesn't look right
// (expect: a regex the real page always contains).
async function get(url, expect = null) {
  let last = '';
  for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
    if (attempt) { console.log(`  retrying in ${RETRY_WAITS[attempt - 1] / 1000}s (${last})`); await sleep(RETRY_WAITS[attempt - 1]); }
    try {
      const res = await fetch(url, { headers: HEADERS });
      const html = decode(await res.arrayBuffer(), res.headers.get('content-type') || '');
      if (!res.ok) { last = `HTTP ${res.status}: ${describePage(html)}`; continue; }
      if (expect && !expect.test(html)) { last = `unexpected page ${describePage(html)}`; continue; }
      return html;
    } catch (err) { last = err.message; }
  }
  const e = new Error(last);
  e.unavailable = true;  // the site didn't give us the page — not a layout change
  throw e;
}

// ---------- tournament list ----------
// The list (100 per page, so one request covers the season) has one box per
// tournament: <div id="tourn_league"> with onclick="window.location='…/tournois/
// ringuette/canada/<province>/<slug>-<id>.html'", the name in
// <span class="title-text">, then "2026-10-15 - 2026-10-18".
export function parseList(html) {
  const tournaments = [];
  for (const block of html.split(/<div id="tourn_league"/).slice(1)) {
    const link = /\/tournois\/ringuette\/[a-z-]+\/([a-z-]+)\/([^'"]*?)-(\d+)\.html/i.exec(block);
    if (!link) continue;
    const name = /<span class="title-text[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(block);
    const dates = block.match(/\d{4}-\d{2}-\d{2}/g) || [];
    const id = +link[3];
    if (tournaments.some((t) => t.id === id)) continue;
    tournaments.push({
      id,
      slug: link[2],
      name: name ? text(name[1]).replace(/’/g, "'") : link[2].replace(/-/g, ' '),
      province: link[1],
      city: text(/class="tournament-location"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] || '').split(',')[0],
      start: dates[0] || null,
      end: dates[1] || dates[0] || null,
    });
  }
  return { tournaments };
}

// ---------- schedule page ----------
// Each game is a block <div class="row info_sc hidden-xs"> holding labelled
// parts: division, match-no (links to the game sheet), day, date-tournament,
// hour, away, result, home, field. A phone-layout copy follows each block
// (info_sc_xs) and is ignored.
// Teams link to ".../equipe/<slug>-<teamId>/..."; playoff slots have no link
// and read e.g. "Demi-finale Meilleure 3ème Pos." or "Finale Gagnant match 1934".
// Results look like "2 - <b>3</b>" (visitor - home, winner in bold).
const PARTS = ['division', 'match-no', 'day', 'date-tournament', 'hour', 'away', 'result', 'home', 'field'];

function partsOf(block) {
  const out = {};
  const re = /<div class="([a-z-]+)[ "]/g;
  const marks = [...block.matchAll(re)].filter((m) => PARTS.includes(m[1]));
  marks.forEach((m, i) => {
    if (out[m[1]] != null) return;
    out[m[1]] = block.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : block.length);
  });
  return out;
}

function teamFrom(html) {
  const name = text(html || '').replace(/^\*\s*/, '').trim();
  const link = /\/equipe\/[a-z0-9-]*?-(\d+)\//i.exec(html || '');
  return { name, id: link && +link[1] > 0 ? +link[1] : null };
}

export function parseSchedule(html) {
  const games = [];
  const seen = new Set();
  for (const raw of html.split(/<div class="row info_sc hidden-xs[^"]*"[^>]*>/).slice(1)) {
    const block = raw.split(/<div class="row info_sc_xs/)[0];
    const p = partsOf(block);
    const date = /(\d{4}-\d{2}-\d{2})/.exec(text(p['date-tournament'] || ''))?.[1];
    const t = /(\d{1,2})[:h](\d{2})/.exec(text(p.hour || ''));
    if (!date || !t) continue;
    const away = teamFrom(p.away), home = teamFrom(p.home);
    const arena = text(p.field || '');
    if (!away.name || !home.name) continue;
    const num = /^\d+$/.test(text(p['match-no'] || '')) ? +text(p['match-no']) : null;
    const gameId = /game_id=(\d+)/.exec(p['match-no'] || '')?.[1];
    const score = /(\d+)\s*[-–]\s*(\d+)/.exec(text(p.result || ''));
    // The division links to its schedule; the same path under "classements" is its standings.
    const divHref = /href="([^"]*\/horaire\/division\/[^"]+\.html)"/.exec(p.division || '')?.[1];
    const k = num ?? `${date}|${t[0]}|${arena}|${away.name}|${home.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    games.push({
      num,
      gameId: gameId ? +gameId : null,
      division: text(p.division || ''),
      date, time: `${t[1].padStart(2, '0')}:${t[2]}`, arena: arena || 'TBD',
      away, home,
      score: score ? { away: +score[1], home: +score[2] } : null,
      standingsUrl: divHref ? new URL(divHref.replace('/horaire/division/', '/classements/division/'), BASE).href : null,
    });
  }
  return games;
}

// Ottawa date as YYYY-MM-DD, offset by some days. --today YYYY-MM-DD (tests) pins "today".
let TODAY_MS = Date.now();
function ottawaDay(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(TODAY_MS + offsetDays * 86400000));
}

async function main() {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const fromDir = arg('--from');
  const OUT = arg('--out') || DEFAULT_OUT;
  if (arg('--today')) TODAY_MS = Date.parse(`${arg('--today')}T12:00:00-04:00`);
  const load = async (name, url, expect) => fromDir ? decode(await readFile(`${fromDir}/${name}`)) : get(url, expect);

  let old = null;
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}

  // 1. The list of current and upcoming tournaments. The real list always has
  // "tourn_league" boxes; anything else (an error or "too many requests" page)
  // is a hiccup: keep planitournoi.json and try again next hour, quietly.
  let listHtml;
  try { listHtml = await load('pt-list.html', LIST_URL, /id="tourn_league"|Ringuette/); }
  catch (err) {
    if (!err.unavailable) throw err;
    warn(`Planitournoi didn't send its tournament list this time (${err.message}). planitournoi.json kept as it was; the next run will try again.`);
    return;
  }
  const tournaments = parseList(listHtml).tournaments;
  if (!tournaments.length) {
    if (/id="tourn_league"/.test(listHtml)) {
      // The boxes are there but nothing could be read: Planitournoi changed its layout.
      fail(`The ringette list has tournaments but none could be read — Planitournoi may have changed its page layout. planitournoi.json kept as it was.`);
      process.exitCode = 2;
    } else {
      // A ringette page with no current tournaments (e.g. end of season) or a different page.
      warn(`No current tournaments on the ringette list (page: ${describePage(listHtml)}). planitournoi.json kept as it was.`);
    }
    return;
  }
  console.log(`Ringette list: ${tournaments.length} tournaments`);

  const today = ottawaDay(), from = ottawaDay(-LOOKBACK_DAYS), to = ottawaDay(LOOKAHEAD_DAYS);
  // Finished tournaments keep their last download (scores are final).
  const kept = (old?.tournaments || []).filter((t) => t.end >= from && t.end < ottawaDay(-1));
  const toFetch = tournaments
    .filter((t) => !kept.some((k) => k.id === t.id))
    .filter((t) => !t.start || (t.end >= from && t.start <= to))
    .slice(0, MAX_TOURNAMENTS);

  const out = [...kept];
  const problems = [];  // signs the page layout changed (the job reports these as a failure)
  const previous = (id) => (old?.tournaments || []).find((x) => x.id === id);
  for (const t of toFetch) {
    try {
      if (!fromDir) await sleep(PAUSE_MS);
      const html = await load(`pt-${t.id}.html`, scheduleUrl(t.id), /PlaniTournoi|planitournoi/i);
      const games = parseSchedule(html);
      if (!games.length) {
        // Game-sheet links on the page but nothing read means the layout changed;
        // keep the last good copy rather than dropping the tournament.
        if (/game_id=\d+/.test(html)) problems.push(`${t.name} (${t.id}): the page lists games but none could be read — layout may have changed.`);
        const prev = previous(t.id);
        console.log(`${t.name} (${t.id}): no games read${prev ? ' — kept the last good copy' : ' (schedule not posted yet?)'}`);
        if (prev) out.push(prev);
        continue;
      }
      const local = games.some((g) => LOCAL_TEAMS.test(g.home.name) || LOCAL_TEAMS.test(g.away.name));
      console.log(`${t.name} (${t.id}): ${games.length} games, ${games.filter((g) => g.score).length} with scores${local ? '' : ' — no Ottawa-area teams, skipped'}`);
      if (!local) continue;
      if (games.some((g) => !g.arena || g.arena === 'TBD') && games.every((g) => !g.arena || g.arena === 'TBD')) problems.push(`${t.name} (${t.id}): no rink names read — layout may have changed.`);
      games.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || (a.num ?? 0) - (b.num ?? 0));
      // The games' own dates are more reliable than the list's.
      const start = games[0].date, end = games[games.length - 1].date;
      // One standings link per division, kept on the tournament rather than on every game.
      const standings = {};
      for (const g of games) { if (g.standingsUrl && g.division) standings[g.division] = g.standingsUrl; delete g.standingsUrl; }
      out.push({ id: t.id, name: t.name, slug: t.slug, city: t.city, province: t.province, start, end, url: scheduleUrl(t.id), standings, games });
    } catch (err) {
      // Keep what we had rather than dropping the tournament on a bad download.
      const prev = previous(t.id);
      warn(`${t.name} (${t.id}): couldn't download the schedule (${err.message})${prev ? ' — kept the last good copy' : ''}.`);
      if (prev) out.push(prev);
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id);

  if (old && JSON.stringify(old.tournaments) === JSON.stringify(out)) console.log('No changes.');
  else {
    await writeFile(OUT, JSON.stringify({ source: LIST_URL, updatedAt: new Date().toISOString(), today, tournaments: out }, null, 1) + '\n');
    console.log(`Wrote planitournoi.json (${out.length} tournaments, ${out.reduce((n, t) => n + t.games.length, 0)} games).`);
  }
  if (problems.length) {
    for (const p of problems) fail(p);
    process.exitCode = 2;  // the GitHub job shows this run as failed (and emails you)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { fail(`The Planitournoi job stopped: ${err.message}`); process.exit(1); });
}
