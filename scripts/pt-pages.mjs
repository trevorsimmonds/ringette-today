// Reading Planitournoi's pages: shared by the GitHub job
// (scripts/fetch-planitournoi.mjs) and the Cloudflare live-score helper
// (worker/). Plain functions, no Node or Cloudflare specifics.

export const BASE = 'https://www.planitournoi.com';
export const scheduleUrl = (id) =>
  `${BASE}/tournament_public.php?tournament_id=${id}&filter_division=0&team_id=0&field_id=0&date=0&dropdown=1&lang=fr`;

// ---------- small HTML helpers (no packages) ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', icirc: 'î', ucirc: 'û', Eacute: 'É', laquo: '«', raquo: '»', rsquo: '’', ndash: '–', mdash: '—' };
export const text = (html) => String(html)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

// ---------- schedule page ----------
// Each game is a block <div class="row info_sc hidden-xs"> holding labelled
// parts: division, match-no (links to the game sheet), day, date-tournament,
// hour, away, result, home, field. A phone-layout copy follows each block
// (info_sc_xs) and is ignored.
// Teams link to ".../equipe/<slug>-<teamId>/..."; playoff slots have no link
// and read e.g. "Demi-finale Meilleure 3ème Pos." or "Finale Gagnant match 1934".
// Results look like "2 - <b>3</b>" (visitor - home, winner in bold).
const PARTS = ['division', 'match-no', 'day', 'date-tournament', 'hour', 'away', 'result', 'home', 'field'];

function partsOf(block) {
  const out = {};
  const re = /<div class="([a-z-]+)[ "]/g;
  const marks = [...block.matchAll(re)].filter((m) => PARTS.includes(m[1]));
  marks.forEach((m, i) => {
    if (out[m[1]] != null) return;
    out[m[1]] = block.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : block.length);
  });
  return out;
}

// A team cell. When the team is known it's a link whose first line is the
// name ("*&nbsp;Lévis 2", * = winner) and second line the bracket label
// ("Groupe B Pos. 2"); the round ("Quart de finale") sits above the link.
// Those are kept apart: { name, id, round?, slot? }. A playoff slot not
// decided yet has no link, and its text is kept whole ("Finale Gagnant match 1934").
function teamFrom(html) {
  html = html || '';
  const link = /\/equipe\/[a-z0-9-]*?-(\d+)\//i.exec(html);
  const id = link && +link[1] > 0 ? +link[1] : null;
  if (id) {
    const inner = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(html)?.[1] || '';
    const [first, ...rest] = inner.split(/<br\s*\/?>/i);
    const name = text(first).replace(/^\*\s*/, '').trim();
    const slot = text(rest.join(' '));
    const round = text(html.slice(0, html.search(/<a\b/i)));
    if (name) return { name, id, ...(round ? { round } : {}), ...(slot ? { slot } : {}) };
  }
  return { name: text(html).replace(/^\*\s*/, '').trim(), id };
}

export function parseSchedule(html) {
  const games = [];
  const seen = new Set();
  for (const raw of html.split(/<div class="row info_sc hidden-xs[^"]*"[^>]*>/).slice(1)) {
    const block = raw.split(/<div class="row info_sc_xs/)[0];
    const p = partsOf(block);
    const date = /(\d{4}-\d{2}-\d{2})/.exec(text(p['date-tournament'] || ''))?.[1];
    const t = /(\d{1,2})[:h](\d{2})/.exec(text(p.hour || ''));
    if (!date || !t) continue;
    const away = teamFrom(p.away), home = teamFrom(p.home);
    const arena = text(p.field || '');
    if (!away.name || !home.name) continue;
    const num = /^\d+$/.test(text(p['match-no'] || '')) ? +text(p['match-no']) : null;
    const gameId = /game_id=(\d+)/.exec(p['match-no'] || '')?.[1];
    const score = /(\d+)\s*[-–]\s*(\d+)/.exec(text(p.result || ''));
    // The division links to its schedule; the same path under "classements" is its standings.
    const divHref = /href="([^"]*\/horaire\/division\/[^"]+\.html)"/.exec(p.division || '')?.[1];
    const k = num ?? `${date}|${t[0]}|${arena}|${away.name}|${home.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    games.push({
      num,
      gameId: gameId ? +gameId : null,
      division: text(p.division || ''),
      date, time: `${t[1].padStart(2, '0')}:${t[2]}`, arena: arena || 'TBD',
      away, home,
      score: score ? { away: +score[1], home: +score[2] } : null,
      standingsUrl: divHref ? new URL(divHref.replace('/horaire/division/', '/classements/division/'), BASE).href : null,
    });
  }
  return games;
}

