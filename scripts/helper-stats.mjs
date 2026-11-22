// A small Terminal dashboard for the Cloudflare live-score helper: how many
// requests it answered, per day and per hour (Ottawa time), from Cloudflare's
// own analytics. Nothing is added to the helper or the app; these are the same
// numbers as the dashboard's Metrics page.
//
//   node scripts/helper-stats.mjs            last 7 days, plus today by hour
//   node scripts/helper-stats.mjs --days 3
//   node scripts/helper-stats.mjs --watch    refresh every minute (Ctrl+C to stop)
//
// Needs your Cloudflare account ID and a read-only API token, in
// worker/.stats.env (kept out of git):
//   CF_ACCOUNT_ID=…    from `npx wrangler whoami`
//   CF_API_TOKEN=…     dash.cloudflare.com → My Profile → API Tokens → Create
//                      Token → Custom: Account › Account Analytics › Read
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKER = 'ringette-live';
const TZ = 'America/Toronto';
const ENV_FILE = new URL('../worker/.stats.env', import.meta.url);
const QUERY = `query HelperRequests($account: string!, $start: Time!, $end: Time!, $script: string!) {
  viewer { accounts(filter: { accountTag: $account }) {
    workersInvocationsAdaptive(limit: 10000, filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }, orderBy: [datetimeHour_ASC]) {
      dimensions { datetimeHour }
      sum { requests errors }
    }
  } }
}`;

async function settings() {
  const out = { account: process.env.CF_ACCOUNT_ID, token: process.env.CF_API_TOKEN };
  try {
    for (const line of (await readFile(ENV_FILE, 'utf8')).split('\n')) {
      const m = /^\s*(CF_ACCOUNT_ID|CF_API_TOKEN)\s*=\s*"?([^"\s]+)"?\s*$/.exec(line);
      if (m) out[m[1] === 'CF_ACCOUNT_ID' ? 'account' : 'token'] ??= m[2];
    }
  } catch { /* no file: rely on the environment */ }
  return out;
}

// Hourly rows from Cloudflare: [{ hour: Date, requests, errors }]
export async function fetchHours({ account, token, days, now = new Date(), fetchFn = fetch }) {
  const start = new Date(now.getTime() - days * 86400000);
  const res = await fetchFn('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { account, script: WORKER, start: start.toISOString(), end: now.toISOString() } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.errors && j.errors.length)) {
    const msg = (j.errors && j.errors.map((e) => e.message).join('; ')) || `HTTP ${res.status}`;
    throw new Error(`Cloudflare said: ${msg}`);
  }
  const rows = j.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  const byHour = new Map();  // Cloudflare can split an hour into several rows
  for (const r of rows) {
    const k = r.dimensions.datetimeHour;
    const cur = byHour.get(k) || { hour: new Date(k), requests: 0, errors: 0 };
    cur.requests += r.sum.requests || 0;
    cur.errors += r.sum.errors || 0;
    byHour.set(k, cur);
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });  // 2026-11-22
const dayLabel = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const hourOf = (d) => +d.toLocaleString('en-CA', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`.padStart(5);
const num = (n) => n.toLocaleString('en-CA');
const bar = (n, max, width = 30) => (n ? '█'.repeat(Math.max(1, Math.round((n / max) * width))) : '');

export function render(hours, { days, now = new Date() }) {
  const lines = [];
  const todayKey = dayKey(now);
  // Per day, oldest first, including days with no requests.
  const perDay = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    perDay.set(dayKey(d), { label: dayLabel(d), requests: 0, errors: 0 });
  }
  for (const h of hours) {
    const d = perDay.get(dayKey(h.hour));
    if (d) { d.requests += h.requests; d.errors += h.errors; }
  }
  const total = [...perDay.values()].reduce((a, d) => ({ requests: a.requests + d.requests, errors: a.errors + d.errors }), { requests: 0, errors: 0 });
  const maxDay = Math.max(1, ...[...perDay.values()].map((d) => d.requests));
  lines.push(`Ringette Today live-score helper · last ${days} day${days === 1 ? '' : 's'} · Ottawa time`);
  lines.push('');
  for (const [k, d] of perDay) {
    const label = (k === todayKey ? `${d.label} (today)` : d.label).padEnd(19);
    lines.push(`  ${label} ${num(d.requests).padStart(7)}  ${bar(d.requests, maxDay)}${d.errors ? `  (${num(d.errors)} errors)` : ''}`);
  }
  // Today by hour, only hours that had requests.
  const today = hours.filter((h) => dayKey(h.hour) === todayKey && h.requests);
  lines.push('');
  if (today.length) {
    lines.push('  Today by hour');
    const maxHour = Math.max(...today.map((h) => h.requests));
    for (const h of today) lines.push(`    ${hourLabel(hourOf(h.hour))}  ${num(h.requests).padStart(6)}  ${bar(h.requests, maxHour, 24)}${h.errors ? `  (${num(h.errors)} errors)` : ''}`);
  } else {
    lines.push('  No requests yet today.');
  }
  // Busiest hour, and the rough "phones watching" rule: each phone asks about once a minute.
  const busiest = hours.reduce((a, h) => (h.requests > (a ? a.requests : 0) ? h : a), null);
  lines.push('');
  lines.push(`  Total: ${num(total.requests)} requests${total.errors ? `, ${num(total.errors)} errors` : ', no errors'}`);
  if (busiest) {
    lines.push(`  Busiest hour: ${dayLabel(busiest.hour)}, ${hourLabel(hourOf(busiest.hour)).trim()} · ${num(busiest.requests)} requests ≈ ${Math.max(1, Math.round(busiest.requests / 60))} phone${Math.round(busiest.requests / 60) > 1 ? 's' : ''} watching at a time`);
  }
  lines.push(`  Updated ${now.toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`)}`);
  return lines.join('\n');
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const days = Math.min(30, Math.max(1, parseInt(arg('--days') || '7', 10) || 7));
  const watch = process.argv.includes('--watch');
  const { account, token } = await settings();
  if (!account || !token) {
    console.log('Missing your Cloudflare account ID or API token.\n');
    console.log('Create worker/.stats.env with two lines:');
    console.log('  CF_ACCOUNT_ID=…   (from: cd worker && npx wrangler whoami)');
    console.log('  CF_API_TOKEN=…    (dash.cloudflare.com → My Profile → API Tokens → Create Token');
    console.log('                     → Custom token → Permissions: Account › Account Analytics › Read)');
    process.exitCode = 1;
    return;
  }
  const show = async () => {
    try {
      const hours = await fetchHours({ account, token, days });
      if (watch) process.stdout.write('\x1b[2J\x1b[H');
      console.log(render(hours, { days }));
      if (watch) console.log('  Refreshing every minute · Ctrl+C to stop');
    } catch (err) {
      console.log(`Couldn't get the numbers: ${err.message}`);
      if (!watch) process.exitCode = 1;
    }
  };
  await show();
  if (watch) setInterval(show, 60_000);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
