// Runs scripts/fetch-lerq.mjs against saved pages instead of the real site:
//   node --import ./test/lerq-scores.mjs scripts/fetch-lerq.mjs
// Real scores from Oct 3 2026: 1001 Ottawa 4 @ Outaouais 0, 1002 Nepean 6 @ Ottawa 6,
// 1003 GCRA 5 @ Ottawa 4, 1004 GCRA 6 @ Nepean 9; 2001/2002 not entered yet.
import { readFileSync } from 'node:fs';
const dir = new URL('.', import.meta.url);
const SCORES = { 23373: [4, 0], 23374: [6, 6], 23375: [5, 4], 23376: [6, 9] };
const scored = readFileSync(new URL('lerq-result-scored.html', dir), 'latin1');
const unscored = readFileSync(new URL('lerq-result-unscored.html', dir));
globalThis.__lookups = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('cedules_liste_web.asp')) {
    const id = /ligues_id=(\d+)/.exec(opts.body)[1];
    return new Response(readFileSync(new URL(`lerq-${id}.html`, dir)));
  }
  const id = +/cedules_id=(\d+)/.exec(u)[1];
  globalThis.__lookups.push(id);
  if (SCORES[id]) {
    const [v, l] = SCORES[id];
    return new Response(Buffer.from(scored.replace(/value="4"/, `value="${v}"`).replace(/<strong>4</, `<strong>${v}<`).replace(/value="0"/, `value="${l}"`), 'latin1'));
  }
  return new Response(unscored);
};
process.on('exit', () => console.log('pages looked up:', globalThis.__lookups.join(', ')));
