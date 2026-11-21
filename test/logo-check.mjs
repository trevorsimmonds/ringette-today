// Checks that every club logo in logos/logos.json still loads: each address
// must answer 200 with an image. Logos are linked live from the clubs' and
// leagues' sites, so they break when a site moves its images (RAMP did in
// Oct 2026). Exits 1 if any is broken. Needs the internet.
// Run: node test/logo-check.mjs
import { readFile } from 'node:fs/promises';

const file = new URL('../logos/logos.json', import.meta.url);
const { clubs } = JSON.parse(await readFile(file, 'utf8'));
const broken = [];

async function check(c) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (ringette-today logo check)' } });
      const type = r.headers.get('content-type') || '';
      await r.arrayBuffer();
      if (r.ok && type.startsWith('image/')) return null;
      if (attempt === 2) return `${r.status} ${type || 'no type'}`;
    } catch (err) {
      if (attempt === 2) return err.name === 'TimeoutError' ? 'no answer in 15s' : err.message;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

// A few at a time, to be polite to the sites.
for (let i = 0; i < clubs.length; i += 6) {
  const batch = clubs.slice(i, i + 6);
  const results = await Promise.all(batch.map(check));
  batch.forEach((c, j) => {
    console.log(`${results[j] ? 'FAIL' : 'ok  '} ${c.club}${results[j] ? ` — ${results[j]} — ${c.url}` : ''}`);
    if (results[j]) broken.push(c.club);
  });
}

// Old NCRRL address pattern that stopped working in the RAMP rebuild.
const old = clubs.filter((c) => /\/\/www\.ncrrl\.com\/cloud\//.test(c.url));
if (old.length) { console.log(`FAIL old ncrrl.com/cloud address: ${old.map((c) => c.club).join(', ')}`); broken.push(...old.map((c) => c.club)); }

console.log(broken.length ? `\n${broken.length} logo(s) broken` : `\nAll ${clubs.length} logos load`);
process.exit(broken.length ? 1 : 0);
