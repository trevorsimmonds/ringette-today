// Self-check for the Planitournoi reader, against trimmed copies of the real
// pages (test/pt-list.html, test/pt-23644.html). Exits 1 if anything is off.
// Run: node test/pt-check.mjs   (also run by the GitHub job before each download)
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseList, parseSchedule } from '../scripts/fetch-planitournoi.mjs';

const dir = new URL('.', import.meta.url).pathname;
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const list = parseList(await readFile(join(dir, 'pt-list.html'), 'utf8')).tournaments;
check(list.length === 4, `list: 4 tournaments (got ${list.length})`);
const coupe = list.find((t) => t.id === 23644);
check(coupe && coupe.name === "La Coupe Extrême de l'Outaouais" && coupe.start === '2026-10-15' && coupe.end === '2026-10-18' && coupe.city === 'Gatineau',
  'list: Coupe Extrême name, dates and city');
check(list.some((t) => t.id === 23681 && t.province === 'ontario'), 'list: London (Ontario) included');

const games = parseSchedule(await readFile(join(dir, 'pt-23644.html'), 'utf8'));
check(games.length === 11, `schedule: 11 games (got ${games.length})`);
const g = games.find((x) => x.num === 1602);
check(g && g.gameId === 421881 && g.division === 'Fém M16 AA' && g.date === '2026-10-15' && g.time === '16:20', 'schedule: game 1602 number, sheet, division, date, time');
check(g && g.away.name === 'GCRA U16AA - DEARING' && g.away.id === 101297 && g.home.name === 'West Ottawa' && g.home.id === 101197, 'schedule: teams and IDs (winner "*" removed)');
check(g && g.score && g.score.away === 2 && g.score.home === 4, 'schedule: score 2-4 (visitor-home)');
check(g && g.arena === 'Centre Slush Puppie - Glace C', 'schedule: rink');
const unplayed = games.find((x) => x.num === 1613);
check(unplayed && unplayed.score === null, 'schedule: unplayed game has no score');
const slot = games.find((x) => x.num === 1935);
check(slot && slot.away.id === null && /Gagnant match 1934/.test(slot.away.name), 'schedule: playoff slot kept as placeholder');

// Whole run on the samples, written to a temp file (never the real one).
const tmp = await mkdtemp(join(tmpdir(), 'pt-'));
const out = join(tmp, 'pt.json');
const run = () => { try { execFileSync(process.execPath, [join(dir, '../scripts/fetch-planitournoi.mjs'), '--from', dir, '--out', out, '--today', '2026-10-16'], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
const code = run();
const data = JSON.parse(await readFile(out, 'utf8').catch(() => '{"tournaments":[]}'));
check(code === 0, `full run exits cleanly (exit ${code})`);
check(data.tournaments.length === 1 && data.tournaments[0].id === 23644 && data.tournaments[0].games.length === 11, 'full run: Coupe Extrême saved with 11 games');
check(!data.tournaments.some((t) => t.id === 23663), 'full run: tournament without Ottawa-area teams skipped');

// Keep the last good copy when a schedule page comes back unreadable.
const broken = join(tmp, 'broken');
execFileSync('mkdir', ['-p', broken]);
await writeFile(join(broken, 'pt-list.html'), await readFile(join(dir, 'pt-list.html'), 'utf8'));
await writeFile(join(broken, 'pt-23644.html'), '<html><a href="game_result.php?game_id=1">x</a> new layout</html>');
await writeFile(join(broken, 'pt-23663.html'), '<html></html>');
await writeFile(join(broken, 'pt-23681.html'), '<html></html>');
await writeFile(out, JSON.stringify({ tournaments: [{ id: 23644, name: 'La Coupe', start: '2099-01-01', end: '2099-01-03', games: [{ num: 1 }] }] }));
let code2;
try { execFileSync(process.execPath, [join(dir, '../scripts/fetch-planitournoi.mjs'), '--from', broken, '--out', out, '--today', '2026-10-16'], { stdio: 'pipe' }); code2 = 0; } catch (e) { code2 = e.status; }
const after = JSON.parse(await readFile(out, 'utf8'));
check(code2 === 2, `unreadable page reported as a problem (exit ${code2})`);
check(after.tournaments.some((t) => t.id === 23644 && t.games.length === 1), 'unreadable page: last good copy kept');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
