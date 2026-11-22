// Self-check for the helper dashboard (scripts/helper-stats.mjs) with made-up
// Cloudflare answers. Nothing is downloaded. Run: node test/helper-stats-check.mjs
import { fetchHours, render } from '../scripts/helper-stats.mjs';
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const now = new Date('2026-11-22T23:30:00Z');  // 6:30 PM Sunday in Ottawa
const rows = [
  { dimensions: { datetimeHour: '2026-11-21T15:00:00Z' }, sum: { requests: 300, errors: 0 } },  // Sat 10 AM
  { dimensions: { datetimeHour: '2026-11-22T15:00:00Z' }, sum: { requests: 400, errors: 2 } },  // Sun 10 AM
  { dimensions: { datetimeHour: '2026-11-22T15:00:00Z' }, sum: { requests: 200, errors: 0 } },  // same hour, split row
  { dimensions: { datetimeHour: '2026-11-22T17:00:00Z' }, sum: { requests: 90, errors: 0 } },   // Sun 12 PM
];
let sent;
const fake = (body, status = 200) => async (url, opts) => { sent = { url, opts }; return new Response(JSON.stringify(body), { status }); };
const hours = await fetchHours({ account: 'acc123', token: 'tok', days: 7, now, fetchFn: fake({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: rows }] } } }) });
check(hours.length === 3 && hours[1].requests === 600 && hours[1].errors === 2, 'rows for the same hour are added up');
const vars = JSON.parse(sent.opts.body).variables;
check(sent.url === 'https://api.cloudflare.com/client/v4/graphql' && sent.opts.headers.Authorization === 'Bearer tok' && vars.script === 'ringette-live' && vars.account === 'acc123', 'asks Cloudflare for the ringette-live helper, with the token');
check(vars.start === '2026-11-15T23:30:00.000Z' && vars.end === now.toISOString(), 'asks for the last 7 days');
const out = render(hours, { days: 7, now });
console.log('\n' + out + '\n');
check(/Sun, Nov 22 \(today\)\s+690/.test(out) && /Sat, Nov 21\s+300/.test(out), 'per-day totals in Ottawa time');
check((out.match(/^  (Sun|Mon|Tue|Wed|Thu|Fri|Sat), /gm) || []).length === 7, 'all 7 days listed, quiet days too');
check(/10 AM\s+600/.test(out) && /12 PM\s+90/.test(out), 'today by hour');
check(/Total: 990 requests, 2 errors/.test(out) && /Busiest hour: Sun, Nov 22, 10 AM · 600 requests ≈ 10 phones/.test(out), 'total and busiest hour');
let err = '';
try { await fetchHours({ account: 'a', token: 'bad', days: 1, now, fetchFn: fake({ errors: [{ message: 'not authorized' }] }, 200) }); } catch (e) { err = e.message; }
check(/not authorized/.test(err), 'Cloudflare refusing the token is reported plainly');
check(/No requests yet today/.test(render([], { days: 1, now })), 'quiet day');
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
