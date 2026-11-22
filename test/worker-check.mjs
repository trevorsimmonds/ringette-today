// Self-check for the Cloudflare live-score helper (worker/src/index.js), using
// saved copies of real RAMP game pages in test/ramp/. Nothing is downloaded.
// Run: node test/worker-check.mjs
import { readFile } from 'node:fs/promises';
import { handle, readGamePage } from '../worker/src/index.js';

const dir = new URL('./ramp/', import.meta.url);
const read = (f) => readFile(new URL(f, dir), 'utf8');
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const livePage = await read('ncrrl.com_division_0_0_game_view_2072660');      // score table, game on
const teamsPage = await read('ringetteontario.com_division_0_0_game_view_2120590');  // teams, not started
const both = teamsPage.replace('</body>', livePage.replace(/[\s\S]*<body>/, '').replace('</body></html>', '') + '</body>')
  .replace(/West Ottawa Wild U12A - Pattyson/g, 'Eastern Ontario U19AA Surge').replace(/Ottawa Ice U12A - Doherty/g, 'Eastern Ontario U19AA Rush');

// Reading pages
const a = readGamePage(livePage);
check(a.score && a.score.home === 0 && a.score.away === 3 && a.teams === null, 'page with a score: Pattyson 0, Doherty 3');
const b = readGamePage(teamsPage);
check(b.teams && b.teams.home === 'Eastern Ontario U19AA Surge' && b.teams.away === 'Eastern Ontario U19AA Rush' && b.score === null, 'page with teams, no score yet');
const c = readGamePage(both);
check(c.teams.home === 'Eastern Ontario U19AA Surge' && c.score.home === 0 && c.score.away === 3, 'teams and score together');
const swapped = both.replace('<div>Eastern Ontario U19AA Surge</div>', '<div>X</div>').replace('<div>Eastern Ontario U19AA Rush</div>', '<div>Eastern Ontario U19AA Surge</div>').replace('<div>X</div>', '<div>Eastern Ontario U19AA Rush</div>');
const d = readGamePage(swapped);
check(d.teams.home === 'Eastern Ontario U19AA Rush' && d.score.home === 3 && d.score.away === 0, 'score rows matched to home/away by name');

// Requests
const asked = [];
const fakeFetch = (html, status = 200) => async (url) => { asked.push(url); return new Response(html, { status }); };
const req = (path, origin) => new Request(`https://ringette-live.example.workers.dev${path}`, { headers: origin ? { Origin: origin } : {} });
const t0 = Date.parse('2026-11-22T14:00:00Z');

let r = await handle(req('/game/ontario/2120590', 'https://trevorsimmonds.github.io'), { fetchPage: fakeFetch(both), nowMs: t0 });
let j = await r.json();
check(r.status === 200 && j.score.away === 3 && j.teams.away === 'Eastern Ontario U19AA Rush' && j.cached === false, 'answers with teams and score');
check(asked[0] === 'https://www.ringetteontario.com/division/0/0/game/view/2120590', 'reads the right RAMP page');
check(r.headers.get('Access-Control-Allow-Origin') === 'https://trevorsimmonds.github.io', 'the app\'s site is allowed to read the answer');
r = await handle(req('/game/ontario/2120590', 'https://trevorsimmonds.github.io'), { fetchPage: fakeFetch('should not be read'), nowMs: t0 + 30_000 });
j = await r.json();
check(asked.length === 1 && j.cached === true && j.score.away === 3, 'second ask within a minute: answered from memory, RAMP not read again');
r = await handle(req('/game/ontario/2120590'), { fetchPage: fakeFetch(teamsPage), nowMs: t0 + 61_000 });
j = await r.json();
check(asked.length === 2 && j.cached === false, 'after a minute: RAMP read again');
r = await handle(req('/game/ncrrl/2072660', 'https://evil.example.com'), { fetchPage: fakeFetch(livePage), nowMs: t0 });
check(!r.headers.get('Access-Control-Allow-Origin'), 'other websites are not allowed to read the answer');
r = await handle(req('/game/ncrrl/2072660', 'http://localhost:8001'), { fetchPage: fakeFetch(livePage), nowMs: t0 + 999_000 });
check(r.headers.get('Access-Control-Allow-Origin') === 'http://localhost:8001', 'local testing on the Mac is allowed');
const before = asked.length;
for (const path of ['/game/google/2072660', '/game/ncrrl/abc', '/game/ncrrl/12', '/game/ncrrl/2072660/../../x', '/https://example.com']) {
  r = await handle(req(path), { fetchPage: fakeFetch(livePage), nowMs: t0 });
  check(r.status === 404, `refused: ${path}`);
}
check(asked.length === before, 'refused requests read nothing');
r = await handle(req('/game/gaara/2100000'), { fetchPage: fakeFetch('oops', 500), nowMs: t0 });
check(r.status === 502 && /500/.test((await r.json()).error), 'RAMP error: reported, not passed on as a score');
r = await handle(req('/game/gaara/2100001'), { fetchPage: async () => { throw new Error('timeout'); }, nowMs: t0 });
check(r.status === 502, 'RAMP unreachable: reported');
r = await handle(new Request('https://x.workers.dev/game/ncrrl/2072660', { method: 'OPTIONS', headers: { Origin: 'https://trevorsimmonds.github.io' } }));
check(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://trevorsimmonds.github.io', 'browser pre-check (OPTIONS) answered');
r = await handle(req('/'));
check(r.status === 200 && (await r.json()).ok === true, 'health check at /');

// Several games in one request
asked.length = 0;
const finalPage = await read('ringetteontario.com_division_0_0_game_view_2120598');  // U19B final: Lees vs "Winner Semi 2"
const pages = { '2072660': livePage, '2120590': both, '2120598': finalPage };
const byGame = async (url, opts) => {
  asked.push(url);
  const id = url.split('/').pop();
  if (id === '2120999') return new Response('oops', { status: 500 });
  if (id === '2120888') return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('slow'), { name: 'TimeoutError' }))));
  return new Response(pages[id] || '<html></html>');
};
const t1 = t0 + 60 * 60_000;  // well after the checks above, so nothing is in memory
const keepAlive = setInterval(() => {}, 1000);  // Node lets timeout timers lapse otherwise
r = await handle(req('/games?g=ncrrl:2072660,ontario:2120590', 'https://trevorsimmonds.github.io'), { fetchPage: byGame, nowMs: t1 });
j = await r.json();
check(r.status === 200 && j.games['ncrrl:2072660'].score.away === 3 && j.games['ontario:2120590'].teams.home === 'Eastern Ontario U19AA Surge', 'many games: both answered in one request');
check(asked.length === 2 && r.headers.get('Access-Control-Allow-Origin') === 'https://trevorsimmonds.github.io', 'many games: each page read once, app allowed to read the answer');
r = await handle(req('/game/ontario/2120590'), { fetchPage: byGame, nowMs: t1 + 20_000 });
j = await r.json();
check(j.cached === true && asked.length === 2, 'one-game ask after a many-games ask: same memory, RAMP not read again');
r = await handle(req('/games?g=ontario:2120590,ontario:2120598,ontario:2120590'), { fetchPage: byGame, nowMs: t1 + 30_000 });
j = await r.json();
check(Object.keys(j.games).length === 2 && j.games['ontario:2120590'].cached === true && j.games['ontario:2120598'].cached === false && asked.length === 3, 'many games: repeats ignored, only the new game read');
const started = Date.now();
r = await handle(req('/games?g=gaara:2120999,ncrrl:2120888,ontario:2120598'), { fetchPage: byGame, nowMs: t1 + 40_000, timeoutMs: 200 });
j = await r.json();
check(r.status === 200 && /500/.test(j.games['gaara:2120999'].error) && /no answer/.test(j.games['ncrrl:2120888'].error) && j.games['ontario:2120598'].teams.home === 'Upper Ottawa Valley U19B - Lees' && j.games['ontario:2120598'].teams.away === 'Winner Semi 2 U19B', 'many games: a failing and a slow page come back as errors, the rest still answered');
check(Date.now() - started < 2000, 'many games: a slow page is given up on, not waited for');
const eleven = Array.from({ length: 11 }, (_, i) => `ncrrl:20726${String(i).padStart(2, '0')}`).join(',');
const n0 = asked.length;
for (const q of [eleven, '', 'ncrrl:2072660,google:2072660', 'ncrrl:abc', 'ncrrl']) {
  r = await handle(req(`/games?g=${q}`), { fetchPage: byGame, nowMs: t1 });
  check(r.status === 400, `many games refused: ${q.length > 40 ? '11 games' : q || '(none)'}`);
}
check(asked.length === n0, 'refused many-games requests read nothing');

clearInterval(keepAlive);
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
