// Self-check for the RAMP reader (scripts/fetch-ramp.mjs), against trimmed
// copies of the real RAMP pages and calendar files in test/ramp/.
// Exits 1 if anything is off. Run: node test/ramp-check.mjs
// (also run by the GitHub job before each download; nothing is downloaded).
import { readFile, writeFile, mkdtemp, mkdir, copyFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseIcs, parseMenu, seasonOf, withIds, isSlot } from '../scripts/fetch-ramp.mjs';

const dir = new URL('./ramp/', import.meta.url).pathname;
const script = new URL('../scripts/fetch-ramp.mjs', import.meta.url).pathname;
const env = { ...process.env }; delete env.GITHUB_ACTIONS;  // keep messages plain
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const read = (f) => readFile(join(dir, f), 'utf8');

// Calendar
const ics = parseIcs(await read('ncrrl.com_calendar_master_schedule_1648.ics'));
check(ics.length === 6, `NCRRL calendar: 6 games, holidays skipped (got ${ics.length})`);
const g523 = ics.find((g) => g.gid === 2040523);
check(g523 && g523.home === 'Nepean Ravens U14AA - Price' && g523.away === 'West Ottawa Wild U14AA - Gorham', 'calendar: home team first; folded lines joined');
check(g523 && g523.date === '2026-09-26' && g523.time === '17:15' && g523.endTime === '18:15' && g523.division === 'U14AA', 'calendar: date, times, division');
check(g523 && g523.arena === 'Walter Baker Sports Centre - Pad B', 'calendar: rink name without the address');
const g557 = ics.find((g) => g.gid === 2040557);
check(g557 && g557.score && g557.score.home === 1 && g557.score.away === 7, 'calendar: score is home - away (McWaters 1, Gorham 7)');
const resched = ics.find((g) => g.gid === 2072875);
check(resched && !resched.score && resched.notes === 'Rescheduled from 29-Nov-2026', 'calendar: unplayed game has no score; notes kept');

// Menus
const menu = parseMenu(await read('ncrrl.com_'), 1648);
check(menu.teams.length === 15 && menu.titles.get(20295) === 'U14AA', `NCRRL menu: 15 teams, division names (got ${menu.teams.length})`);
check(menu.teams.some((t) => t.tid === 398267 && t.name === 'Ottawa Ice U14AA - McWaters'), 'menu: team with a logo image is read');
check(seasonOf(menu, 1648) === 14554, 'menu: season 14554');
const { games, unmatched } = withIds(ics, menu, 1648, 14554);
const w523 = games.find((g) => g.GID === 2040523);
check(w523 && w523.homeTID === 398266 && w523.awayTID === 401648 && w523.homeDID === 20295 && w523.homeScore === 6, 'IDs: teams and division filled in');
check(!unmatched.length, `IDs: every NCRRL team matched (${unmatched.join('; ')})`);
const on = parseMenu(await read('ringetteontario.com_'));
check(seasonOf(on, 3043) === 14561 && on.titles.get(19962) === 'U14AA', 'Ringette Ontario menu: tournament season and divisions');
check(on.teams.filter((t) => t.aid === 1648).length === 4 && on.teams.filter((t) => t.aid === 3043).length === 15, 'Ringette Ontario menu: teams kept per tournament');
check(isSlot('1st') && isSlot('2ND BLUE') && !isSlot('Ottawa Ice U14AA - McWaters'), 'playoff slots recognised');

// Whole run on the samples
const tmp = await mkdtemp(join(tmpdir(), 'ramp-'));
const run = (from, out, today = '2026-10-28') => {
  try {
    const stdout = execFileSync(process.execPath, [script, '--from', from, '--tournaments', join(dir, 'tournaments.json'), '--out', out, '--today', today], { stdio: 'pipe', env }).toString();
    return { code: 0, stdout };
  } catch (e) { return { code: e.status, stdout: String(e.stdout) }; }
};
const out = join(tmp, 'ramp.json');
const r1 = run(dir, out);
const data = JSON.parse(await readFile(out, 'utf8'));
check(r1.code === 0, `full run exits cleanly (exit ${r1.code})`);
check(data.leagues.ncrrl.games.length === 6 && data.leagues.gaara.games.length === 4, 'full run: NCRRL and GAARA saved');
const osh = data.tournaments[3043];
check(osh && osh.games.length === 4 && !osh.games.some((g) => g.sDate.startsWith('2022')), 'full run: Oshawa 2026 games only (2022 dropped)');
check(osh && osh.games.find((g) => g.GID === 2075036).awayTID === 398267, 'full run: tournament teams get their league IDs (McWaters 398267)');
check(osh && osh.games.find((g) => g.GID === 2075019).homeTID === null, 'full run: playoff slot has no team');
const fr = data.tournaments[1941];
check(fr && fr.games.length === 2 && fr.games.every((g) => g.sDate.startsWith('2026-11-27')) && fr.games[0].homeTID === 411786, 'full run: Fredericton from its own site, this year only');
check(!data.tournaments[3106] && /Nepean Ringette Tournament \(3106\): not in the menu yet/.test(r1.stdout), 'full run: tournament not listed yet is skipped quietly');
const r2 = run(dir, out);
check(r2.code === 0 && /No changes/.test(r2.stdout), 'second run: no changes, file not rewritten');

// RAMP down: menus/calendars missing → keep the last good copy, warn, don't fail.
const down = join(tmp, 'down'); await mkdir(down);
await copyFile(join(dir, 'tournaments.json'), join(down, 'tournaments.json'));
const r3 = run(down, out);
const kept = JSON.parse(await readFile(out, 'utf8'));
check(r3.code === 0 && kept.leagues.ncrrl.games.length === 6 && kept.tournaments[3043] && /WARNING: ncrrl: couldn't download/.test(r3.stdout), 'RAMP unreachable: last good copy kept, warning only (no failure email)');

// RAMP redesign: menu without team links → reported as a problem, data kept.
const redesign = join(tmp, 'redesign'); await mkdir(redesign);
for (const f of await readdir(dir)) await copyFile(join(dir, f), join(redesign, f));
await writeFile(join(redesign, 'ncrrl.com_'), '<html><body><div class="new-menu">U14AA</div></body></html>');
const r4 = run(redesign, out);
const kept2 = JSON.parse(await readFile(out, 'utf8'));
check(r4.code === 2 && /PROBLEM: ncrrl: no teams found/.test(r4.stdout) && kept2.leagues.ncrrl.games.length === 6, 'menu redesign: reported as a problem, last good NCRRL copy kept');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
