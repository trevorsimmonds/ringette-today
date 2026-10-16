import { readFile } from 'node:fs/promises';
import { parseList, parseSchedule } from '../scripts/fetch-planitournoi.mjs';
const list = parseList(await readFile('test/pt-list.html', 'utf8'));
for (const t of list.tournaments) console.log('T', t.id, t.start, t.end, t.province, t.city, '|', t.name);
for (const g of parseSchedule(await readFile('test/pt-23644.html', 'utf8')))
  console.log(g.num, g.gameId, g.division, g.date, g.time, '|', g.away.name, g.away.id, '@', g.home.name, g.home.id, '|', g.arena, g.score);
