// Reading RAMP's pages: shared by the GitHub job (scripts/fetch-ramp.mjs) and
// the Cloudflare live-score helper (worker/). Plain functions, no Node or
// Cloudflare specifics, so both can import this file.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', rsquo: '’' };
export const decodeEntities = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);?/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e] ?? m));

// Playoff placeholders: "1st Place U14AA", "Winner Semi 1 U19B", "BLUE SEMI WINNER",
// "Quarter Final U10 - Div. C 1st", "U12B Final", plain "Home"/"Away" (Sudbury), or no name at all.
export const isSlot = (name) => {
  const n = String(name ?? '').trim();
  return !n || /^(home|away)$/i.test(n)
    || /^(\d+\s*(st|nd|rd|th)\b|winner|loser|tbd|tba|to be determined|semi|final|pool|group|quarter)/i.test(n)
    || /\b(semi|winner|loser|quarter final|\d+(st|nd|rd|th) place)\b|\bfinal$/i.test(n);
};

// ---------- live scores (each game's own page) ----------
// The calendar only gets "Final: x - y" once the game is finalised, but the
// game page (/division/0/{DID}/game/view/{GID}) shows the score while it's
// being played: a "Scoring" table, one row per team, the last cell the total.
// Returns [{ name, total }] or null when the page has no scoring table yet.
export function parseLiveScore(html) {
  const i = html.search(/<h1[^>]*>\s*Scoring\s*<\/h1>/i);
  if (i < 0) return null;
  const end = html.indexOf('</table>', i);
  const body = html.slice(i, end < 0 ? undefined : end);
  const tb = body.indexOf('<tbody');
  const rows = [];
  for (const tr of (tb < 0 ? '' : body.slice(tb)).split(/<tr[\s>]/i).slice(1)) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim());
    const name = cells.find((c) => c && !/^\d+$/.test(c));
    const total = cells.length ? cells[cells.length - 1] : '';
    if (name && /^\d+$/.test(total)) rows.push({ name, total: +total });
  }
  return rows.length === 2 ? rows : null;
}


// ---------- playoff teams (each game's own page) ----------
// When a round robin ends, RAMP puts the real teams on the playoff game's own
// page ("Eastern Ontario U19AA Surge" / Home) well before its calendar file
// stops saying "2nd Place U19AA". The page shows each team as
//   <div class="link-table-game-teamname …">…<div>Team name</div> <div>Home </div></div>
// Returns { home, away } or null when the page doesn't have both.
export function parseGameTeams(html) {
  const t = {};
  for (const m of html.matchAll(/link-table-game-teamname[^>]*>(?:(?!link-table-game-teamname)[\s\S]){0,1500}?<div>([^<]*)<\/div>\s*<div>\s*(Home|Away)\s*<\/div>/g)) {
    const side = m[2].toLowerCase();
    if (!(side in t)) t[side] = decodeEntities(m[1]).trim();  // may be '' when RAMP hasn't decided the team
  }
  return 'home' in t && 'away' in t ? t : null;
}

