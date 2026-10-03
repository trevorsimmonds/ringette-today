// Downloads the LERQ (Ligue d'excellence de ringuette du Québec) schedules from
// Ringuette Québec's public "Horaires" page and saves them as quebec.json.
// Scores aren't in the schedule list — only on each game's own page
// (resultats_web.asp), so those pages are read for games that have started
// and don't have a score yet.
// The site doesn't let browser apps on other websites read it, so a scheduled
// GitHub job runs this and the app reads quebec.json from its own site.
//
//   node scripts/fetch-lerq.mjs                 # download and write quebec.json
//   node scripts/fetch-lerq.mjs --from test    # parse saved pages test/lerq-104.html etc.
//
// Needs Node 18+ (built-in fetch). No packages.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const URL_ = 'https://membres.ringuette-quebec.qc.ca/cedules_liste_web.asp';
const RESULT_URL = 'https://membres.ringuette-quebec.qc.ca/resultats_web.asp?cedules_id=';
const HEADERS = { 'User-Agent': 'RingetteToday schedule reader (github.com/trevorsimmonds/ringette-today)' };
const RECHECK_DAYS = 3;          // re-read recent scores in case they're corrected
const MAX_SCORE_LOOKUPS = 80;    // per run, to stay gentle with their site
const OUT = new URL('../quebec.json', import.meta.url);
// League IDs come from the page's "Ligue" drop-down.
const LEAGUES = [
  { id: 104, name: 'LERQ U16 AA', source: 'LERQ-Junior AA' },
  { id: 105, name: 'LERQ U19 AA', source: 'LERQ-Cadette AA' },
];

const decode = (buf) => new TextDecoder('windows-1252').decode(buf);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', Eacute: 'É' };
const text = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

export function parse(html, league) {
  const games = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 6) continue;
    const [num, date, time, arena, home, away] = cells.slice(0, 6).map(text);
    const d = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(date);
    const t = /^(\d{1,2}):(\d{2})/.exec(time);
    if (!/^\d+$/.test(num) || !d || !t) continue;
    const detail = /cedules_id=(\d+)/.exec(cells[6] || '');
    games.push({
      num: +num,
      league: league.id,
      date: `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`,
      time: `${t[1].padStart(2, '0')}:${t[2]}`,
      arena, home, away,
      detailId: detail ? +detail[1] : null,
    });
  }
  return games;
}

// A game's own page holds the score in hidden fields buts_visiteur / buts_local
// (empty until the score is entered).
export function parseScore(html) {
  const v = /name="buts_visiteur"[^>]*value="(\d+)"/i.exec(html);
  const l = /name="buts_local"[^>]*value="(\d+)"/i.exec(html);
  return v && l ? { away: +v[1], home: +l[1] } : null;
}

async function fetchScore(detailId) {
  const res = await fetch(RESULT_URL + detailId, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseScore(decode(await res.arrayBuffer()));
}

// "Now" in Ottawa as "YYYY-MM-DDTHH:MM", to compare with game times.
function nowInOttawa(offsetDays = 0) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(league) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...HEADERS },
    body: `NbrAfficher=1000&numero=&ligues_id=${league.id}&submit=Rechercher`,
  });
  if (!res.ok) throw new Error(`${league.source}: HTTP ${res.status}`);
  return decode(await res.arrayBuffer());
}

async function main() {
  // --from <dir> reads <dir>/lerq-<leagueId>.html instead of downloading.
  const fromIdx = process.argv.indexOf('--from');
  const fromDir = fromIdx > 0 ? process.argv[fromIdx + 1] : null;
  const games = [];
  for (const league of LEAGUES) {
    const html = fromDir ? decode(await readFile(`${fromDir}/lerq-${league.id}.html`)) : await download(league);
    const g = parse(html, league);
    // Never replace good data with an empty schedule (site down, page changed…).
    if (!g.length) throw new Error(`${league.source}: no games found — page may have changed. quebec.json left as it was.`);
    console.log(`${league.source}: ${g.length} games`);
    games.push(...g);
  }
  games.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.num - b.num);

  let old = null;
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch {}

  // Scores: keep the ones already found; look up games that have started and
  // have no score yet, plus the last few days' scores in case of corrections.
  const oldScores = new Map((old?.games || []).filter((g) => g.score).map((g) => [`${g.num}|${g.detailId}`, g.score]));
  const now = nowInOttawa();
  const recheckFrom = nowInOttawa(-RECHECK_DAYS);
  let lookups = 0, found = 0;
  for (const g of games) {
    const prev = oldScores.get(`${g.num}|${g.detailId}`);
    if (prev) g.score = prev;
    const start = `${g.date}T${g.time}`;
    const started = start <= now;
    const recent = start >= recheckFrom;
    if (fromDir || !g.detailId || !started || (prev && !recent)) continue;
    if (lookups >= MAX_SCORE_LOOKUPS) break;
    lookups++;
    try {
      const score = await fetchScore(g.detailId);
      if (score) { g.score = score; found++; }
    } catch (err) {
      console.warn(`Score for game ${g.num}: ${err.message} (kept what we had)`);
    }
    await sleep(300);
  }
  if (!fromDir) console.log(`Checked ${lookups} game pages for scores; ${found} scored.`);

  // Only rewrite the file when something changed, so the job doesn't commit for nothing.
  if (old && JSON.stringify(old.games) === JSON.stringify(games)) { console.log('No changes.'); return; }

  const out = {
    source: URL_,
    updatedAt: new Date().toISOString(),
    leagues: LEAGUES.map(({ id, name, source }) => ({ id, name, source })),
    games,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`Wrote quebec.json (${games.length} games).`);
}

// Run only when started directly (tests import parse/parseScore).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
