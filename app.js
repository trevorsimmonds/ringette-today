/* Ringette Today — NCRRL + Ringette Ontario tournament schedules (PWA)
 *
 * Data source: RAMP InterActive (which runs ncrrl.com and the tournament sites)
 * serves schedules as JSON with CORS open, so the app reads them straight from
 * the browser — no scraping server needed.
 *   League games:     https://www.ncrrl.com/api/leaguegame/get/1648/{season}/0/0/0/0/
 *   Seasons:          https://www.ncrrl.com/api/association/getseasons/{aid}/
 *   Tournament games: https://www.ncrrl.com/api/leaguetournamentgame/get/{aid}/{season}/0/0/0/0/0
 * Leagues: NCRRL (AID 1648), LERQ (Quebec AA, via quebec.json) and GAARA
 * adult league (AID 2786) — see LEAGUES.
 * LERQ comes from Ringuette Québec's site, which browser apps can't read
 * directly; a scheduled GitHub job (scripts/fetch-lerq.mjs) copies it into
 * quebec.json next to the app.
 * Tournament IDs and dates live in tournaments.json.
 * Quebec tournaments come from Planitournoi via planitournoi.json, written by
 * the same kind of GitHub job (scripts/fetch-planitournoi.mjs).
 * Team IDs are shared between the league and tournaments, so following a team
 * picks up its tournament games too.
 */
(() => {
  'use strict';

  // Leagues in the order they appear in the team picker. NCRRL keeps its
  // original storage keys so existing installs don't lose their cache.
  // fallbackSeason is only used if the season lookup fails with nothing cached.
  const LEAGUES = [
    { type: 'ramp', aid: 1648, key: 'ncrrl', name: 'NCRRL', divPrefix: '', fallbackSeason: 14554,
      cacheKey: 'rt.cache', seasonKey: 'rt.season', fixture: 'fixture.json' },
    { type: 'lerq', key: 'lerq', name: 'LERQ', heading: 'LERQ — Quebec AA league',
      cacheKey: 'rt.lerq', fixture: 'fixture-quebec.json',
      divOrder: ['LERQ U16 AA', 'LERQ U19 AA'],
      // Only these teams are offered in the picker; all LERQ games still count
      // for opponents and for who's on the ice before and after.
      pickerTeams: ['Ottawa', 'Nepean', 'GCRA', 'West Ottawa', 'Outaouais', 'Eastern rush', 'Eastern surge'] },
    { type: 'ramp', aid: 2786, key: 'gaara', name: 'GAARA', heading: 'GAARA — adult league', divPrefix: 'GAARA ', fallbackSeason: 14539,
      cacheKey: 'rt.cache.2786', seasonKey: 'rt.season.2786', fixture: 'fixture-gaara.json',
      divOrder: ['Black', 'Brown', 'Red', 'Blue', 'Yellow', 'Green', 'Orange', 'Purple'] },
  ];
  const API = 'https://www.ncrrl.com/api';
  const RESULTS_AFTER_MIN = 90;  // a game moves to Results this long after it starts
  // Multi-pad buildings. The schedules list each pad separately, so this says
  // which pads share a building (for "Also in this building") and how to label
  // each pad. Any rink not matched here is treated as its own building.
  // pad: regex whose first capture names the pad; label: how to show it.
  const BUILDINGS = [
    { name: 'Ray Friel Centre', match: /^ray friel/i, pad: /(?:pad\s*|friel\s+)(\d)/i, label: 'Pad $1' },
    { name: 'Jim Durrell Complex', match: /^jim durr?ell|^walkley - ottawa/i, pad: /(walkley|peplinski)/i, label: '$1' },
    { name: 'Slush Puppie Complex', match: /^(centre )?slush puppie/i, pad: /(?:puppie(?: complex -)?|glace) ([a-d])\b/i, label: 'Pad $1' },
    { name: 'Nepean Sportsplex', match: /nepean sportsplex|^sportsplex \d+ - nepean/i, pad: /(?:arena|pad|sportsplex)\s*(\d)/i, label: 'Arena $1' },
    { name: 'CARDELREC Recreation Complex', match: /^cardelrec/i, pad: /cardelrec(?: recreation complex)? ([ab])\b/i, label: 'Pad $1' },
    { name: 'Walter Baker Sports Centre', match: /^walter baker/i, pad: /(?:pad |baker )([ab])\b/i, label: 'Pad $1' },
    { name: 'Carleton Ice House', match: /^carleton (ice house|university)/i, pad: /arena ([ab])\b/i, label: 'Arena $1' },
    { name: 'Bob MacQuarrie Recreation Complex', match: /^bob mac ?quarrie/i, pad: /(senecal|manley)/i, label: '$1' },
    { name: 'Fred Barrett Arena', match: /^fred barrett/i, pad: /(east|west)$/i, label: '$1' },
    { name: 'Minto Recreation Complex', match: /^minto recreation complex/i, pad: /(north|south)$/i, label: '$1' },
    { name: 'Nick Smith Centre', match: /^nick smith/i, pad: /pad ([ab])\b/i, label: 'Pad $1' },
    { name: 'Bernard Grandmaitre Arena', match: /^bernard grandmaitre/i, pad: /- (\w+)$/i, label: '$1' },
    { name: 'Bell Sensplex', match: /^bell sensplex/i, pad: /- (.+)$/i, label: '$1' },
    { name: 'Richcraft Sensplex', match: /^richcraft sensplex/i, pad: /\((.+)\)/, label: '$1' },
    { name: 'Tony Graham Recreation Complex', match: /^tony graham/i, pad: /rink ([a-d])\b/i, label: 'Rink $1' },
    { name: 'INVISTA Centre', match: /invista centre$/i, pad: /^(.+?) - invista/i, label: '$1' },
    { name: 'Canlan Ice Sports Scarborough', match: /^canlan ice sports - scarborough/i, pad: /scarborough (\d)/i, label: 'Pad $1' },
  ];
  // Ringuette Québec writes rink names its own way. These Ottawa-area rinks are
  // matched to RAMP's rink IDs so LERQ games line up with NCRRL/GAARA games on
  // the same ice. Rinks without a pad number (e.g. "Cardelrec - West Ottawa",
  // "Carleton University - Ottawa") are left unmatched on purpose.
  const RINK_ALIASES = {
    'Ray Friel 1 - Ottawa': [12436, 'Ray Friel Centre - Pad 1 (Ron Racette Arena)'],
    'Ray Friel 3 - Ottawa': [12438, 'Ray Friel Centre - Pad 3'],
    'Cardelrec A - West Ottawa': [13052, 'CARDELREC Recreation Complex A'],
    'Richmond - West Ottawa': [1730, 'Richmond Memorial Community Centre'],
    'Sportsplex 2 - Nepean': [13020, 'Nepean Sportsplex - Arena 2'],
    'Walter Baker B - Nepean': [13528, 'Walter Baker Sports Centre - Pad B'],
    'Walkley - Ottawa': [13019, 'Jim Durrell Complex - Walkley'],
    'Jim Durell Peplinski': [1438, 'Jim Durrell Complex - Peplinski'],
    'St-Laurent - Ottawa': [1801, 'St. Laurent Arena'],
    'Slush Puppie C - Gatineau': [13153, 'Slush Puppie Complex - C - Gerik Ice'],
    'Slush Puppie D - Gatineau': [13152, 'Slush Puppie Complex - D - Dilawri Ice'],
  };
  const LOOKAHEAD_DAYS = 31;     // download tournaments starting within this many days
  const LOOKBACK_DAYS = 7;       // …or that ended within this many days (for results)
  const LS = {
    tracked: 'rt.tracked',       // [teamId, ...]
    favs: 'rt.favs',             // [teamId, ...] — favourites (always also followed)
    upFilter: 'rt.upFilter',     // 'all' | 'fav' — Upcoming filter, remembered
    tourn: 'rt.t.',              // + aid -> {sid, fetchedAt, games}
    pt: 'rt.pt',                 // {fetchedAt, data} — planitournoi.json
  };
  const params = new URLSearchParams(location.search);
  const FIXTURE = params.has('fixture');
  // ?today=2026-11-20 lets you preview how the app behaves on another date.
  const TODAY_OVERRIDE = params.get('today');

  // ---------- state ----------
  const state = {
    view: 'upcoming',
    games: [],          // league + tournament, normalized, sorted by start
    league: [],         // normalized league games (all leagues)
    leagueGames: new Map(), // league key -> normalized games
    seasons: Object.fromEntries(LEAGUES.filter((l) => l.seasonKey).map((l) => [l.key, readJSON(l.seasonKey, null)])),
    lerqUpdatedAt: null,
    tourGames: new Map(), // aid -> normalized games
    tournaments: [],    // from tournaments.json
    ptTournaments: [],  // Quebec tournaments from planitournoi.json (no games)
    teams: new Map(),   // id -> {id, name, division, league} (league teams)
    byIce: new Map(),   // "rinkId|yyyy-mm-dd" -> [games sorted]
    byBuilding: new Map(), // "bldg:name|yyyy-mm-dd" -> [games sorted]
    tracked: new Set(readJSON(LS.tracked, []).map(String)), // team IDs as strings
    fetchedAt: null,
    favs: new Set(readJSON(LS.favs, []).map(String)),
    upFilter: readJSON(LS.upFilter, 'all') === 'fav' ? 'fav' : 'all',
    teamFilter: '',
    teamOnlyMine: false,
  };
  for (const id of state.favs) state.tracked.add(id); // a favourite is always followed

  // Teams shared via link: #teams=123,456,lerq104:ottawa&favs=456
  (function importFromHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has('teams') && !h.has('favs')) return;
    const ids = (k) => (h.get(k) || '').split(',').filter(Boolean);
    ids('teams').forEach((id) => state.tracked.add(id));
    ids('favs').forEach((id) => { state.favs.add(id); state.tracked.add(id); });
    saveTracked();
    history.replaceState(null, '', location.pathname + location.search);
  })();

  // ---------- helpers ----------
  function readJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function saveTracked() { writeJSON(LS.tracked, [...state.tracked]); writeJSON(LS.favs, [...state.favs]); }
  function shareUrl() {
    const favs = [...state.favs];
    return `${location.origin}${location.pathname}#teams=${[...state.tracked].join(',')}${favs.length ? `&favs=${favs.join(',')}` : ''}`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function now() {
    if (!TODAY_OVERRIDE) return new Date();
    const d = parseLocal(`${TODAY_OVERRIDE}T12:00`);
    return d || new Date();
  }
  // Feed times are local rink time (Eastern) with no zone; parse as local wall-clock.
  function parseLocal(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  }
  const DAY = 86400000;
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtTime = (d) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);
  const fmtDay = (d) => d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
  const fmtShortDate = (d) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  function relDay(d) {
    const today = now(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / DAY);
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : '';
  }
  function fmtGap(ms) {
    const min = Math.round(ms / 60000);
    if (min === 0) return 'back-to-back';
    const abs = Math.abs(min);
    const h = Math.floor(abs / 60), m = abs % 60;
    const txt = h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
    return min < 0 ? `overlaps ${txt}` : `${txt} gap`;
  }
  // "Ottawa Ice U14A - Reilly (4)" -> "Ottawa Ice U14A - Reilly"
  const cleanName = (n) => String(n || 'TBD').replace(/\s*\(\d+\)\s*$/, '').trim();

  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Saved schedules from before the box-score links lack the division ID;
  // treat them as out of date so they're downloaded again right away.
  const oldFormat = (cached) => !!(cached && cached.games && cached.games.length && !('homeDID' in cached.games[0]));

  // Keep only the fields we use so the cache stays small.
  const slim = (raw) => raw.map((g) => ({
    GID: g.GID, sDate: g.sDate, eDate: g.eDate, ArenaName: g.ArenaName, RARID: g.RARID,
    HomeTeamName: g.HomeTeamName, homeTID: g.homeTID, homeScore: g.homeScore,
    AwayTeamName: g.AwayTeamName, awayTID: g.awayTID, awayScore: g.awayScore,
    HomeDivision: g.HomeDivision, AwayDivision: g.AwayDivision, homeDID: g.homeDID, GameTypeName: g.GameTypeName, notes: g.notes,
    completed: g.completed, cancelledHome: g.cancelledHome, cancelledAway: g.cancelledAway, rainout: g.rainout,
    trash: g.trash, deletedDate: g.deletedDate,
  }));

  // ---------- data ----------
  function normalize(raw, source, league) {
    return raw
      .filter((g) => !g.trash && !g.deletedDate)
      .map((g) => {
        const start = parseLocal(g.sDate);
        let end = parseLocal(g.eDate);
        if (end && start && end <= start) end = null; // some feeds repeat the start time as the end
        return {
          key: `${source ? source.aid : league ? league.aid : 'L'}-${g.GID}`,
          id: g.GID,
          did: g.homeDID || null,        // division ID, needed for the box score link
          start,
          end,                           // may be null for tournaments; filled in rebuild()
          endEstimated: !end,
          arena: String(g.ArenaName || 'TBD').trim(),
          rinkId: g.RARID ?? g.ArenaName,
          home: { id: g.homeTID != null ? String(g.homeTID) : null, name: cleanName(g.HomeTeamName), score: g.homeScore },
          away: { id: g.awayTID != null ? String(g.awayTID) : null, name: cleanName(g.AwayTeamName), score: g.awayScore },
          division: `${league ? league.divPrefix : ''}${g.HomeDivision || g.AwayDivision || ''}`,
          baseDivision: g.HomeDivision || g.AwayDivision || '',
          league: league || null,
          type: g.GameTypeName || '',
          notes: (g.notes || '').trim(),
          completed: !!g.completed,
          cancelled: !!(g.cancelledHome || g.cancelledAway || g.rainout),
          tournament: source || null,   // {aid, name, short} for tournament games
        };
      })
      .filter((g) => g.start);
  }

  // LERQ games from quebec.json (see scripts/fetch-lerq.mjs). No end times are
  // published, so ends are estimated. Scores come from each game's own page.
  const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function normalizeLerq(data, league) {
    const names = Object.fromEntries((data.leagues || []).map((l) => [l.id, l.name]));
    return (data.games || []).map((g) => {
      const div = names[g.league] || 'LERQ';
      const alias = RINK_ALIASES[g.arena];
      const team = (n, score) => ({ id: `lerq${g.league}:${slug(n)}`, name: n, score: score ?? null });
      return {
        key: `Q-${g.num}`,
        detailId: g.detailId || null,  // Ringuette Québec's game page (box score)
        id: g.num,
        start: parseLocal(`${g.date}T${g.time}`),
        end: null,
        endEstimated: true,
        arena: alias ? alias[1] : g.arena,
        rinkId: alias ? alias[0] : `lerq:${g.arena}`,
        home: team(g.home, g.score && g.score.home),
        away: team(g.away, g.score && g.score.away),
        division: div,
        baseDivision: div,
        league,
        type: '',
        notes: '',
        completed: !!g.score,
        cancelled: false,
        tournament: null,
      };
    }).filter((g) => g.start);
  }

  // ---------- Quebec tournaments (Planitournoi, via planitournoi.json) ----------
  // See scripts/fetch-planitournoi.mjs. Planitournoi has its own team IDs and
  // names ("Nepean 16AA", "GCRA U16AA - DEARING"), so its teams are matched to
  // the league teams you follow by club name plus age and level.
  const PT_RINK_ALIASES = {
    'Centre Slush Puppie - Glace C': [13153, 'Slush Puppie Complex - C - Gerik Ice'],
    'Centre Slush Puppie - Glace D': [13152, 'Slush Puppie Complex - D - Dilawri Ice'],
  };
  // Club names written differently across leagues and tournaments → one name.
  const CLUB_ALIASES = [
    [/^west ottawa( wild)?$/, 'west ottawa'],
    [/^nepean( ravens)?$/, 'nepean'],
    [/^ottawa( ice)?$/, 'ottawa ice'],
    [/^eastern( ontario)? rush$/, 'eastern rush'],
    [/^eastern( ontario)? surge$/, 'eastern surge'],
    [/^(gcra|gloucester cumberland( devils)?)$/, 'gcra'],
    [/^(extreme (de l )?)?outaouais$/, 'outaouais'],
    [/^lac (saint|st) louis( lsl)?$|^lsl$/, 'lsl'],
  ];
  const plain = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function clubOf(name) {
    const [base, coach = ''] = String(name).split(/\s+-\s+/);
    let key = plain(base).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
      .filter((w) => w && !/^(u|m)?\d{1,2}(aa|bb|a|b|c)?$/.test(w) && !/^(aa|bb|a|b|c|fem|feminin)$/.test(w))
      .join(' ');
    for (const [re, to] of CLUB_ALIASES) if (re.test(key)) { key = to; break; }
    return { key, coach: plain(coach).trim() };
  }
  function ageLevel(s) {
    const m = /\b[um]\s?(\d{1,2})\s?(aa|bb|a|b|c)?\b/i.exec(s || '') || /\b(\d{2})\s?(aa|bb|a|b|c)\b/i.exec(s || '');
    return m ? { age: +m[1], level: (m[2] || '').toUpperCase() } : null;
  }
  const teamMatchCache = new Map();
  function matchLeagueTeam(name, division) {
    const k = `${name}|${division}`;
    if (teamMatchCache.has(k)) return teamMatchCache.get(k);
    const club = clubOf(name);
    const al = ageLevel(division) || ageLevel(name);
    let hit = null;
    if (club.key && al) {
      const cands = [...state.teams.values()].filter((t) => {
        if (clubOf(t.name).key !== club.key) return false;
        const tl = ageLevel(t.baseDivision || t.division) || ageLevel(t.name);
        return tl && tl.age === al.age && (!tl.level || !al.level || tl.level === al.level);
      });
      hit = (club.coach && cands.find((t) => plain(t.name).includes(club.coach)))
        || cands.find((t) => state.tracked.has(t.id)) || cands[0] || null;
    }
    teamMatchCache.set(k, hit);
    return hit;
  }
  // "Gagnant match 1930" → "Winner of game 1930", etc.
  const ptPlaceholder = (n) => n
    .replace(/quarts? de finale/i, 'Quarter-final').replace(/demi-finale/i, 'Semi-final')
    .replace(/finale consolation/i, 'Consolation final').replace(/\bfinale\b/i, 'Final')
    .replace(/meilleure? (\d+)\s*(?:ème|eme|e|ère|ere|re)\s*pos\.?/i, 'Best #$1')
    .replace(/groupe (\w+) pos\.? ?(\d+)/i, 'Group $1 #$2')
    .replace(/gagnant (?:du )?match (\d+)/i, 'Winner of game $1').replace(/perdant (?:du )?match (\d+)/i, 'Loser of game $1')
    .replace(/^(Quarter-final|Semi-final|Consolation final|Final) (?=\S)/, '$1 · ');
  const ptShort = (name) => name
    .replace(/^(la coupe|le défi|tournoi)\s+(de ringuette\s+|ringuette\s+)?(de la |de l'|des |du |de |d')?/i, '')
    .replace(/\s+(édition\s+)?20\d\d$/i, '').trim() || name;

  function normalizePt(data) {
    const out = new Map();
    for (const t of data.tournaments || []) {
      if (!tournamentWindow(t).active) continue;
      const source = { aid: `pt${t.id}`, name: t.name, short: ptShort(t.name), source: 'pt', url: t.url };
      out.set(source.aid, (t.games || []).map((g) => {
        const alias = PT_RINK_ALIASES[g.arena];
        const al = ageLevel(g.division);
        const division = al ? `U${al.age}${al.level ? ` ${al.level}` : ''}` : g.division;
        const team = (x, score) => ({
          id: x.id ? `pt:${x.id}` : null, ptId: x.id ? `pt:${x.id}` : null, ptName: x.name, division: g.division,
          name: x.id ? x.name : ptPlaceholder(x.name), score: score ?? null,
        });
        return {
          key: `P-${t.id}-${g.num ?? `${g.date}${g.time}${g.arena}`}`,
          id: g.num, gameId: g.gameId || null,
          start: parseLocal(`${g.date}T${g.time}`),
          end: null, endEstimated: true,
          arena: alias ? alias[1] : g.arena,
          rinkId: alias ? alias[0] : `pt:${g.arena}`,
          home: team(g.home, g.score && g.score.home),
          away: team(g.away, g.score && g.score.away),
          division, baseDivision: division,
          league: null, type: '', notes: '',
          completed: !!g.score, cancelled: false,
          tournament: source,
        };
      }).filter((g) => g.start));
    }
    return out;
  }
  function applyPt(data) {
    for (const k of [...state.tourGames.keys()]) if (String(k).startsWith('pt')) state.tourGames.delete(k);
    state.ptTournaments = (data.tournaments || []).map(({ games, ...t }) => ({ ...t, n: (games || []).length }));
    for (const [k, games] of normalizePt(data)) state.tourGames.set(k, games);
  }
  // Link Planitournoi teams to followed league teams (needs state.teams).
  function resolvePtTeams() {
    teamMatchCache.clear();
    for (const [k, games] of state.tourGames) {
      if (!String(k).startsWith('pt')) continue;
      for (const g of games) for (const t of [g.home, g.away]) {
        if (!t.ptId) continue; // placeholder ("Winner of game 1930")
        const hit = matchLeagueTeam(t.ptName, t.division);
        t.id = hit ? hit.id : t.ptId;
        t.logoName = hit ? hit.name : null;
        t.logoLeague = hit ? hit.league : null;
      }
    }
  }

  function rebuild() {
    state.league = [];
    for (const l of LEAGUES) state.league.push(...(state.leagueGames.get(l.key) || []));
    const all = [...state.league];
    for (const games of state.tourGames.values()) all.push(...games);
    all.sort((a, b) => a.start - b.start || a.arena.localeCompare(b.arena));

    state.games = all;
    state.teams = new Map();
    for (const g of state.league) {
      for (const t of [g.home, g.away]) {
        if (g.league && g.league.pickerTeams && !g.league.pickerTeams.includes(t.name)) continue;
        if (t.id && !state.teams.has(t.id)) state.teams.set(t.id, { id: t.id, name: t.name, division: g.division, baseDivision: g.baseDivision, league: g.league });
      }
    }
    resolvePtTeams();
    state.byIce = new Map();
    for (const g of all) {
      if (g.cancelled) continue;
      const k = `${g.rinkId}|${dayKey(g.start)}`;
      if (!state.byIce.has(k)) state.byIce.set(k, []);
      state.byIce.get(k).push(g);
    }
    // Tournaments often leave out end times: assume the ice turns over at the
    // next game's start (if within 2 h), otherwise one hour.
    for (const list of state.byIce.values()) {
      list.forEach((g, i) => {
        if (g.end) return;
        const next = list[i + 1];
        const gap = next ? next.start - g.start : Infinity;
        g.end = new Date(g.start.getTime() + (gap > 0 && gap <= 2 * 3600000 ? gap : 3600000));
      });
    }
    for (const g of all) if (!g.end) g.end = new Date(g.start.getTime() + 3600000);
    state.byBuilding = new Map();
    for (const g of all) {
      if (g.cancelled) continue;
      const b = buildingOf(g.arena);
      if (!b.key.startsWith('bldg:')) continue;
      const k = `${b.key}|${dayKey(g.start)}`;
      if (!state.byBuilding.has(k)) state.byBuilding.set(k, []);
      state.byBuilding.get(k).push(g);
    }
  }

  const buildingCache = new Map();
  function buildingOf(arena) {
    if (buildingCache.has(arena)) return buildingCache.get(arena);
    let out = { key: `rink:${arena}`, name: arena, pad: '' };
    for (const b of BUILDINGS) {
      if (!b.match.test(arena)) continue;
      const m = b.pad.exec(arena);
      // Tidy the pad name: "c" -> "C", "EAST" -> "East", "walkley" -> "Walkley"; keep "OT", "CUPE 109" as is.
      const raw = m ? m[1] : '';
      const tidy = raw.length === 1 ? raw.toUpperCase()
        : /^[A-Z]{4,}$/.test(raw) ? raw[0] + raw.slice(1).toLowerCase()
        : raw[0] ? raw[0].toUpperCase() + raw.slice(1) : '';
      const pad = m ? b.label.replace('$1', tidy) : '';
      out = { key: `bldg:${b.name}`, name: b.name, pad };
      break;
    }
    // Any other rink named like "Delpark Homes Centre - Pad 2", "X - Arena B" or
    // "X - Rink 3" belongs with the other pads of "X".
    if (out.key.startsWith('rink:')) {
      const m = /^(.+?)\s+[-–]\s+(pad|arena|rink|ice)\s+([a-z]|\d{1,2})\b/i.exec(arena);
      if (m) {
        const kind = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
        out = { key: `bldg:${m[1].trim()}`, name: m[1].trim(), pad: `${kind} ${m[3].toUpperCase()}` };
      }
    }
    buildingCache.set(arena, out);
    return out;
  }

  // Games on other pads of the same building that overlap this game's time.
  function alsoInBuilding(g) {
    const b = buildingOf(g.arena);
    if (!b.key.startsWith('bldg:')) return [];
    return (state.byBuilding.get(`${b.key}|${dayKey(g.start)}`) || [])
      .filter((x) => x !== g && x.rinkId !== g.rinkId && x.start < g.end && x.end > g.start);
  }

  // A game in a known building whose listing doesn't say which pad
  // (e.g. Ringuette Québec's "Cardelrec - West Ottawa").
  function padUnknown(g) {
    const b = buildingOf(g.arena);
    return b.key.startsWith('bldg:') && !b.pad;
  }

  // Before/after on the same ice. When the pad isn't known we don't guess:
  // the nearest games anywhere in the building are shown instead, flagged
  // `sameBuilding` so the card can say the pad isn't confirmed. A game on a
  // known pad falls back to pad-unknown games in its building only when its
  // own ice has nothing on that side.
  function iceNeighbours(g) {
    const list = state.byIce.get(`${g.rinkId}|${dayKey(g.start)}`) || [];
    const i = list.indexOf(g);
    let before = i > 0 ? list[i - 1] : null;
    let after = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const b = buildingOf(g.arena);
    if (b.key.startsWith('bldg:') && (!before || !after || padUnknown(g))) {
      const bl = (state.byBuilding.get(`${b.key}|${dayKey(g.start)}`) || [])
        .filter((x) => x !== g && x.rinkId !== g.rinkId && (padUnknown(g) || padUnknown(x))
          // games at the same time are on another pad — those go in "Also here"
          && !(x.start < g.end && x.end > g.start));
      const prev = bl.filter((x) => x.start < g.start).pop() || null;
      const next = bl.find((x) => x.start > g.start) || null;
      const closer = (own, other, isBefore) => !own ? other
        : !other ? own
        : (isBefore ? other.start > own.start : other.start < own.start) ? other : own;
      before = padUnknown(g) ? closer(before, prev, true) : before || prev;
      after = padUnknown(g) ? closer(after, next, false) : after || next;
    }
    return { before, after, list };
  }

  const isTracked = (g) => state.tracked.has(g.home.id) || state.tracked.has(g.away.id);
  const isFav = (g) => state.favs.has(g.home.id) || state.favs.has(g.away.id);

  // --- season (automatic) ---
  async function resolveSeason(league) {
    const s = state.seasons[league.key];
    if (s && Date.now() - s.checkedAt < 24 * 3600000) return s.sid;
    try {
      const list = await getJSON(`${API}/association/getseasons/${league.aid}/`);
      const pick = list.find((x) => x.current) || [...list].sort((a, b) => b.sid - a.sid)[0];
      if (pick) {
        state.seasons[league.key] = { sid: pick.sid, name: pick.name, checkedAt: Date.now() };
        writeJSON(league.seasonKey, state.seasons[league.key]);
        return pick.sid;
      }
    } catch {}
    return s ? s.sid : league.fallbackSeason;
  }

  // --- tournaments ---
  function tournamentWindow(t) {
    const today = now(); today.setHours(0, 0, 0, 0);
    const start = parseLocal(t.start), end = parseLocal(t.end);
    return {
      active: end >= new Date(today - LOOKBACK_DAYS * DAY) && start <= new Date(today.getTime() + LOOKAHEAD_DAYS * DAY),
      live: today >= start && today <= end,
      start, end,
    };
  }

  function loadCachedTournaments() {
    for (const t of state.tournaments) {
      const c = readJSON(LS.tourn + t.aid, null);
      if (c && c.games && c.games.length) state.tourGames.set(t.aid, normalize(c.games, { aid: t.aid, name: t.name, short: t.short }));
    }
  }

  async function fetchTournament(t, { force }) {
    const w = tournamentWindow(t);
    const cached = readJSON(LS.tourn + t.aid, null);
    // During the tournament refresh often (scores); otherwise a few times a day.
    const maxAge = w.live ? 10 * 60000 : 6 * 3600000;
    if (!force && cached && Date.now() - cached.fetchedAt < maxAge && !oldFormat(cached)) return;

    let games = [];
    let sid = null;
    if (FIXTURE) {
      const fx = await getJSON('fixture-tournaments.json');
      games = fx.games[t.aid] || [];
    } else {
      // Pick the tournament year whose games fall on this year's dates.
      const seasons = (await getJSON(`${API}/association/getseasons/${t.aid}/`)).sort((a, b) => b.sid - a.sid);
      const lo = w.start.getTime() - 4 * DAY, hi = w.end.getTime() + 4 * DAY;
      for (const s of seasons.slice(0, 3)) {
        const raw = await getJSON(`${API}/leaguetournamentgame/get/${t.aid}/${s.sid}/0/0/0/0/0`);
        if (!Array.isArray(raw) || !raw.length) continue;
        const inRange = raw.some((g) => { const d = parseLocal(g.sDate); return d && d >= lo && d <= hi; });
        if (inRange) { games = raw; sid = s.sid; break; }
      }
    }
    const s = slim(games);
    writeJSON(LS.tourn + t.aid, { sid, fetchedAt: Date.now(), games: s });
    if (s.length) state.tourGames.set(t.aid, normalize(s, { aid: t.aid, name: t.name, short: t.short }));
    else state.tourGames.delete(t.aid);
  }

  function pruneTournamentCache() {
    // Drop cached tournaments that ended more than 60 days ago.
    const cutoff = now().getTime() - 60 * DAY;
    for (const t of state.tournaments) {
      if (parseLocal(t.end) < cutoff) {
        try { localStorage.removeItem(LS.tourn + t.aid); } catch {}
        state.tourGames.delete(t.aid);
      }
    }
  }

  // ---------- club logos ----------
  // logos/logos.json lists each club's logo (linked live from the club's or
  // league's site) and which team names it belongs to.
  let logoClubs = [];
  const logoCache = new Map();
  async function loadLogos() {
    try { logoClubs = (await getJSON('logos/logos.json')).clubs || []; } catch { logoClubs = []; }
    logoCache.clear();
  }
  function logoFor(name, league) {
    const k = `${league ? league.key : ''}|${name}`;
    if (logoCache.has(k)) return logoCache.get(k);
    let hit = null;
    if (league && league.key === 'gaara') hit = logoClubs.find((c) => c.league === 'gaara');
    else if (league && league.key === 'lerq') hit = logoClubs.find((c) => (c.lerqNames || []).includes(name));
    else {
      // Longest matching prefix wins ("West Ottawa Wild" before "Ottawa…").
      const n = String(name).toLowerCase();
      let best = 0;
      for (const c of logoClubs) for (const p of c.prefixes || []) {
        const q = p.toLowerCase();
        if (q.length > best && (n === q || n.startsWith(q + ' ') || n.startsWith(q + '-'))) { best = q.length; hit = c; }
      }
    }
    const url = hit ? hit.url : null;
    logoCache.set(k, url);
    return url;
  }
  const logoImg = (url) => url
    ? `<span class="logo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>`
    : '';

  async function loadTournamentList() {
    try {
      const j = await getJSON(FIXTURE ? 'fixture-tournaments.json' : 'tournaments.json');
      state.tournaments = j.tournaments || [];
    } catch { /* offline and not cached by the service worker yet */ }
  }

  let firstLoad = true;
  async function load({ force = false } = {}) {
    if (firstLoad) {
      firstLoad = false;
      for (const l of LEAGUES) {
        const cached = readJSON(l.cacheKey, null);
        if (!cached) continue;
        if (l.type === 'lerq') {
          state.leagueGames.set(l.key, normalizeLerq(cached.data, l));
          state.lerqUpdatedAt = cached.data.updatedAt ? new Date(cached.data.updatedAt) : null;
          continue;
        }
        state.leagueGames.set(l.key, normalize(cached.games, null, l));
        const at = new Date(cached.fetchedAt);
        if (!state.fetchedAt || at < state.fetchedAt) state.fetchedAt = at;
      }
      await loadTournamentList();
      await loadLogos();
      loadCachedTournaments();
      const pt = readJSON(LS.pt, null);
      if (pt && pt.data) applyPt(pt.data);
      pruneTournamentCache();
      rebuild();
      render();
    }

    setBusy(true);
    const problems = [];
    try {
      // Leagues: refresh if forced, no cache, or older than 10 minutes.
      let refreshed = false;
      for (const l of LEAGUES) {
        const cached = readJSON(l.cacheKey, null);
        if (l.type === 'lerq') {
          // quebec.json changes at most every few hours; check it every 30 minutes.
          if (!force && cached && Date.now() - cached.fetchedAt < 30 * 60000) continue;
          try {
            const data = await getJSON(FIXTURE ? l.fixture : 'quebec.json');
            writeJSON(l.cacheKey, { fetchedAt: Date.now(), data });
            state.leagueGames.set(l.key, normalizeLerq(data, l));
            state.lerqUpdatedAt = data.updatedAt ? new Date(data.updatedAt) : null;
          } catch (err) {
            // No quebec.json yet (the GitHub job hasn't run) isn't an error worth showing.
            if (!/HTTP 404/.test(err.message)) problems.push(err);
          }
          continue;
        }
        if (FIXTURE) state.seasons[l.key] = { sid: l.fallbackSeason, name: '2026-2027 (test data)', checkedAt: Date.now() };
        const sid = FIXTURE ? l.fallbackSeason : await resolveSeason(l);
        const stale = !cached || cached.season !== sid || Date.now() - cached.fetchedAt > 10 * 60000 || oldFormat(cached);
        if (!force && !stale) continue;
        try {
          const raw = await getJSON(FIXTURE ? l.fixture : `${API}/leaguegame/get/${l.aid}/${sid}/0/0/0/0/`);
          if (!Array.isArray(raw)) throw new Error('Unexpected response');
          const s = slim(raw);
          writeJSON(l.cacheKey, { season: sid, fetchedAt: Date.now(), games: s });
          state.leagueGames.set(l.key, normalize(s, null, l));
          refreshed = true;
        } catch (err) { problems.push(err); }
      }
      if (refreshed && !problems.length) state.fetchedAt = new Date();

      // Quebec tournaments: planitournoi.json is updated by the GitHub job
      // (hourly); check it every 10 minutes.
      const ptCached = readJSON(LS.pt, null);
      if (force || !ptCached || Date.now() - ptCached.fetchedAt > 10 * 60000) {
        try {
          const data = await getJSON(FIXTURE ? 'fixture-planitournoi.json' : 'planitournoi.json');
          writeJSON(LS.pt, { fetchedAt: Date.now(), data });
          applyPt(data);
        } catch (err) {
          // No planitournoi.json yet (the GitHub job hasn't run) isn't worth showing.
          if (!/HTTP 404/.test(err.message)) problems.push(err);
        }
      }

      // Tournaments happening soon (or just finished).
      const active = state.tournaments.filter((t) => tournamentWindow(t).active);
      for (const t of active) {
        try { await fetchTournament(t, { force }); } catch (err) { problems.push(err); }
      }
      rebuild();
      if (problems.length) {
        setStatus(state.games.length
          ? `Offline — showing schedule from ${fmtAgo(state.fetchedAt)}.`
          : `Couldn't reach ncrrl.com (${problems[0].message}). Check your connection and tap refresh.`, true);
      } else setStatus();
    } finally {
      setBusy(false);
      render();
    }
  }

  // ---------- UI ----------
  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');

  function fmtAgo(d) {
    if (!d) return 'never';
    const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }
  function setStatus(msg, isError = false) {
    const el = $('#status');
    el.classList.toggle('error', isError);
    if (msg) { el.textContent = msg; return; }
    const nT = [...state.tourGames.keys()].filter((aid) => {
      const t = state.tournaments.find((x) => x.aid === aid);
      return t && tournamentWindow(t).active;
    }).length;
    const games = state.league.length + [...state.tourGames.values()].reduce((n, g) => n + g.length, 0);
    el.textContent = state.fetchedAt ? `Updated ${fmtAgo(state.fetchedAt)} · ${games} games` : '';
  }
  function setBusy(b) { $('#refreshBtn').classList.toggle('spinning', b); }

  function teamLine(t, g, side) {
    const mine = state.tracked.has(t.id);
    const showScore = g.completed || (t.score !== null && t.score !== undefined && g.start < now());
    return `<div class="team${mine ? ' mine' : ''}">
      <span class="name"><span class="ha">${side}</span>${state.favs.has(t.id) ? '<span class="fav-star" aria-label="Favourite">★</span>' : ''}${logoImg(logoFor(t.logoName || t.name, t.logoLeague || g.league))}${esc(t.name)}</span>
      ${showScore && t.score != null ? `<span class="score">${t.score}</span>` : ''}
    </div>`;
  }

  function iceRow(label, other, g, which) {
    if (!other) {
      return `<div class="ice-row"><span class="ice-label">${label}</span>
        <span class="ice-none">No game listed ${which === 'before' ? 'before' : 'after'} ${padUnknown(g) ? 'in this building' : 'on this ice'}</span></div>`;
    }
    const sameBuilding = other.rinkId !== g.rinkId;
    const otherPad = buildingOf(other.arena).pad;
    const where = sameBuilding
      ? `<br><span class="ice-where">${padUnknown(g)
          ? `Same building${otherPad ? `, ${esc(otherPad)}` : ''} · this game’s pad isn’t listed`
          : 'Same building · its pad isn’t listed'}</span>`
      : '';
    const gap = which === 'before' ? g.start - other.end : other.start - g.end;
    const tracked = isTracked(other);
    const fav = isFav(other);
    const tag = fav ? '<span class="chip fav">★ Favourite</span>' : tracked ? '<span class="chip">Following</span>' : '';
    return `<div class="ice-row${tracked ? ' tracked' : ''}">
      <span class="ice-label">${label}</span>
      <span>
        <span class="ice-when">${fmtTime(other.start)}–${other.endEstimated ? '~' : ''}${fmtTime(other.end)}</span>
        <span class="ice-gap"> · ${fmtGap(gap)}</span>${tag}<br>
        <span class="ice-teams">${esc(other.away.name)} @ ${esc(other.home.name)}</span>
        <span class="muted small"> · ${esc(other.division)}${other.tournament ? ` · ${esc(other.tournament.short)}` : ''}</span>${where}
      </span>
    </div>`;
  }

  // "Also here": what's on the building's other pads during this game.
  function alsoRow(g) {
    const list = alsoInBuilding(g);
    if (!list.length) return '';
    const MAX = 4;
    const item = (x) => {
      const fav = isFav(x), tracked = isTracked(x);
      const tag = fav ? '<span class="chip fav">★ Favourite</span>' : tracked ? '<span class="chip">Following</span>' : '';
      const pad = buildingOf(x.arena).pad || 'Other pad';
      return `<div class="also${tracked ? ' tracked' : ''}">
        <span class="ice-when">${esc(pad)}</span><span class="ice-gap"> · ${fmtTime(x.start)}–${x.endEstimated ? '~' : ''}${fmtTime(x.end)}</span>${tag}<br>
        <span class="ice-teams">${esc(x.away.name)} @ ${esc(x.home.name)}</span>
        <span class="muted small"> · ${esc(x.division)}${x.tournament ? ` · ${esc(x.tournament.short)}` : ''}</span>
      </div>`;
    };
    const more = list.length - MAX;
    return `<div class="ice-row also-row">
      <span class="ice-label">Also here</span>
      <span>${list.slice(0, MAX).map(item).join('')}${more > 0 ? `<div class="muted small">+ ${more} more in ${esc(buildingOf(g.arena).name)}</div>` : ''}</span>
    </div>`;
  }

  // Box score: RAMP's game sheet (works for NCRRL, GAARA and tournament games
  // through ncrrl.com, given any real division ID), or Ringuette Québec's game page.
  function boxScoreUrl(g) {
    if (g.tournament && g.tournament.source === 'pt') {
      return g.gameId ? `https://www.planitournoi.com/game_result.php?pdf=1&lang=fr&game_id=${g.gameId}&public&from=public&sheet=match` : null;
    }
    if (g.league && g.league.key === 'lerq') {
      return g.detailId ? `https://membres.ringuette-quebec.qc.ca/resultats_web.asp?cedules_id=${g.detailId}` : null;
    }
    return g.did ? `https://www.ncrrl.com/division/0/${g.did}/gamesheet/${g.id}` : null;
  }

  function mapsLink(arena) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(arena)}`;
  }

  function gameCard(g, { showIce = true, result = false } = {}) {
    const { before, after } = iceNeighbours(g);
    return `<article class="card${g.tournament ? ' tourney' : ''}">
      ${g.tournament ? `<div class="tourney-tag">Tournament · ${esc(g.tournament.name)}${g.type ? ` · ${esc(g.type)}` : ''}</div>` : ''}
      <div class="card-top">
        <span class="time">${fmtTime(g.start)} – ${g.endEstimated ? '~' : ''}${fmtTime(g.end)}</span>
        <span class="div-tag">${esc(g.division)}</span>
      </div>
      <div class="place">
        <button class="arena" data-game="${g.key}">${esc(g.arena)}</button>
        <a class="maplink" href="${mapsLink(g.arena)}" target="_blank" rel="noopener">Map</a>
      </div>
      <div class="matchup">
        ${teamLine(g.away, g, 'AWAY')}
        ${teamLine(g.home, g, 'HOME')}
      </div>
      ${g.cancelled ? '<div class="note">Cancelled</div>' : ''}
      ${result && !g.cancelled && g.home.score == null ? '<div class="pending">Score not posted yet</div>' : ''}
      ${result && g.completed && boxScoreUrl(g) ? `<a class="boxscore" href="${esc(boxScoreUrl(g))}" target="_blank" rel="noopener">Box score <span aria-hidden="true">›</span><span class="sr-only"> — goals, assists and penalties (opens the league's site)</span></a>` : ''}
      ${g.notes ? `<div class="note">${esc(g.notes)}</div>` : ''}
      ${showIce && !g.cancelled ? `<div class="ice">
        ${iceRow('Before', before, g, 'before')}
        ${iceRow('After', after, g, 'after')}
        ${alsoRow(g)}
      </div>` : ''}
    </article>`;
  }

  function groupByDay(games) {
    const out = [];
    let cur = null;
    for (const g of games) {
      const k = dayKey(g.start);
      if (!cur || cur.key !== k) { cur = { key: k, date: g.start, games: [] }; out.push(cur); }
      cur.games.push(g);
    }
    return out;
  }

  function renderSchedule(mode) {
    if (!state.tracked.size) {
      main.innerHTML = `<div class="empty">
        <h2>Pick the teams you follow</h2>
        <p>Choose one or more NCRRL teams and their games will show up here, with who's on the same ice right before and after.</p>
        <button class="btn" data-goto="teams">Choose teams</button>
      </div>`;
      return;
    }
    if (!state.games.length) { main.innerHTML = `<div class="empty"><p>Loading schedule…</p></div>`; return; }

    // A game moves from Upcoming to Results 1.5 hours after it starts,
    // whether or not its score has been posted yet.
    const t0 = now().getTime();
    const done = (g) => g.start.getTime() + RESULTS_AFTER_MIN * 60000 <= t0;
    let games = state.games.filter(isTracked);
    games = mode === 'upcoming' ? games.filter((g) => !done(g)) : games.filter(done).reverse();

    // Upcoming can be filtered to favourites with the ★ Favourites button in the
    // status line (remembered); Results always shows everything.
    const bar = '';
    if (mode === 'upcoming') {
      const onlyFav = state.upFilter === 'fav';
      if (onlyFav) {
        if (!state.favs.size) {
          main.innerHTML = `${bar}<div class="empty"><h2>No favourites yet</h2>
            <p>Tap the ☆ next to a team in the Teams tab to make it a favourite.</p>
            <button class="btn" data-goto="teams">Choose favourites</button></div>`;
          return;
        }
        games = games.filter(isFav);
        if (!games.length) {
          main.innerHTML = `${bar}<div class="empty"><h2>No upcoming games for your favourites</h2>
            <p>Tap ★ Favourites again to see games for all the teams you follow.</p></div>`;
          return;
        }
      }
    }

    if (!games.length) {
      main.innerHTML = `${bar}<div class="empty"><h2>${mode === 'upcoming' ? 'No upcoming games posted' : 'No results yet'}</h2>
        <p>${mode === 'upcoming' ? 'NCRRL publishes the schedule a couple of weeks at a time, and tournaments usually post theirs a week or two before the event — check back after the next posting.' : 'Scores show up here once games are played.'}</p></div>`;
      return;
    }

    main.innerHTML = bar + groupByDay(games).map((d) => {
      const rel = relDay(d.date);
      return `<h2 class="day">${esc(fmtDay(d.date))}${rel ? `<span class="rel">${rel}</span>` : ''}</h2>
        ${d.games.map((g) => gameCard(g, { showIce: mode === 'upcoming', result: mode === 'results' })).join('')}`;
    }).join('');
  }

  function divisionSortKey(d) {
    const m = /U(\d+)(AA|A|B|C)?/.exec(d);
    if (/FUN/i.test(d)) return `0-${d}`;
    if (!m) return `9-${d}`;
    const tier = { AA: 0, A: 1, B: 2, C: 3 }[m[2]] ?? 4;
    return `1-${m[1].padStart(2, '0')}-${tier}`;
  }

  function quebecTournamentSummary() {
    const list = state.ptTournaments.filter((t) => tournamentWindow(t).active);
    const line = (t) => {
      const w = tournamentWindow(t);
      return `<li><strong>${esc(t.name)}</strong> · ${fmtShortDate(w.start)}${+w.end !== +w.start ? `–${fmtShortDate(w.end)}` : ''} · <span class="muted">${t.n} games</span></li>`;
    };
    return `<h3 class="settings-sub">Quebec tournaments</h3>
      <p class="muted small">Copied from Planitournoi every hour for tournaments in the next month that have Ottawa-area teams. Teams are matched to the ones you follow by club, age and level.</p>
      ${list.length ? `<ul class="tlist">${list.map(line).join('')}</ul>` : '<p class="small">None in the next month.</p>'}`;
  }

  function tournamentSummary() {
    if (!state.tournaments.length) return quebecTournamentSummary();
    const today = now(); today.setHours(0, 0, 0, 0);
    const upcoming = state.tournaments
      .map((t) => ({ t, w: tournamentWindow(t) }))
      .filter(({ w }) => w.end >= today)
      .sort((a, b) => a.w.start - b.w.start);
    const active = upcoming.filter(({ w }) => w.active);
    const next = upcoming.filter(({ w }) => !w.active).slice(0, 3);
    const line = ({ t, w }) => {
      const n = (state.tourGames.get(t.aid) || []).length;
      const status = w.active ? (n ? `${n} games posted` : 'schedule not posted yet') : '';
      return `<li><strong>${esc(t.name)}</strong> · ${fmtShortDate(w.start)}${+w.end !== +w.start ? `–${fmtShortDate(w.end)}` : ''}${t.datesApprox ? ' (approx.)' : ''}${status ? ` · <span class="muted">${status}</span>` : ''}</li>`;
    };
    return `<h3 class="settings-sub">Tournaments</h3>
      <p class="muted small">The app checks Ringette Ontario tournaments (on RAMP) starting in the next month. ${state.tournaments.length} tournaments are on the list.</p>
      ${active.length ? `<ul class="tlist">${active.map(line).join('')}</ul>` : '<p class="small">None in the next month.</p>'}
      ${next.length ? `<p class="muted small">Coming later: ${next.map(({ t, w }) => `${esc(t.short)} (${fmtShortDate(w.start)})`).join(', ')}</p>` : ''}
      ${quebecTournamentSummary()}`;
  }

  function renderTeams() {
    const q = state.teamFilter.trim().toLowerCase();
    const teams = [...state.teams.values()]
      .filter((t) => !state.teamOnlyMine || state.tracked.has(t.id))
      .filter((t) => !q || `${t.name} ${t.division}`.toLowerCase().includes(q));
    const byDiv = new Map();
    for (const t of teams) {
      if (!byDiv.has(t.division)) byDiv.set(t.division, []);
      byDiv.get(t.division).push(t);
    }
    // League order first (NCRRL, then GAARA), then divisions within each league.
    const sortKey = (d) => {
      const t = byDiv.get(d)[0];
      const li = Math.max(0, LEAGUES.indexOf(t.league));
      const order = t.league && t.league.divOrder;
      const within = order ? String(order.indexOf(t.baseDivision) + 100) : divisionSortKey(d);
      return `${li}|${within}`;
    };
    const divs = [...byDiv.keys()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

    let lastLeague = null;
    const leagueHeading = (d) => {
      const l = byDiv.get(d)[0].league;
      if (!l || l === lastLeague) return '';
      const first = lastLeague === null;
      lastLeague = l;
      // Only label the extra leagues; NCRRL stays unlabelled at the top.
      return first && l === LEAGUES[0] ? '' : `<h2 class="league-heading">${esc(l.heading || l.name)}</h2>`;
    };

    // Checkbox = follow; star = favourite (starring also follows).
    const row = (t, showDiv = false) => {
      const on = state.tracked.has(t.id);
      const fav = state.favs.has(t.id);
      return `<div class="team-row${on ? ' on' : ''}${fav ? ' fav' : ''}">
        <label class="team-pick">
          <input type="checkbox" data-team="${esc(t.id)}"${on ? ' checked' : ''}>
          ${logoImg(logoFor(t.name, t.league))}<span>${esc(t.name)}${showDiv ? `<span class="muted small"> · ${esc(t.division)}</span>` : ''}</span>
        </label>
        <button class="star" data-star="${esc(t.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favourites' : 'Make favourite'}">${fav ? '★' : '☆'}</button>
      </div>`;
    };
    const favTeams = [...state.favs].map((id) => state.teams.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const favSection = favTeams.length && !q && !state.teamOnlyMine
      ? `<section class="division fav-section"><h3>★ Favourites</h3>${favTeams.map((t) => row(t, true)).join('')}</section>`
      : '';

    const list = !state.teams.size
      ? '<div class="empty"><p>Loading teams…</p></div>'
      : divs.length
        ? divs.map((d) => `${leagueHeading(d)}<section class="division"><h3>${esc(d)}</h3>
            ${byDiv.get(d).sort((a, b) => a.name.localeCompare(b.name)).map((t) => row(t)).join('')}</section>`).join('')
        : '<div class="empty"><p>No teams match.</p></div>';

    const share = state.tracked.size ? shareUrl() : '';

    main.innerHTML = `
      <input class="search" type="search" id="teamSearch" placeholder="Search teams, clubs or divisions (e.g. Ottawa Ice U14, GAARA)" value="${esc(state.teamFilter)}" autocomplete="off">
      <div class="filters">
        <button id="filterMine" aria-pressed="${state.teamOnlyMine}">Only teams I follow (${state.tracked.size})</button>
      </div>
      <p class="muted small">Tick a team to follow it. Tap ☆ to make it a favourite. Teams appear once they have a game posted this season.</p>
      ${favSection}
      ${list}
      <section class="settings">
        <h3>Settings</h3>
        ${share ? `<div class="row"><button class="btn secondary" id="shareBtn">Share my teams</button>
          <span class="muted small">Sends a link that sets up the same teams and favourites on another phone.</span></div>` : ''}
        <p class="muted small">${LEAGUES.filter((l) => l.type === 'ramp').map((l) => `${esc(l.name)} season: ${esc(state.seasons[l.key] ? state.seasons[l.key].name : 'checking…')}`).join(' · ')} (picked automatically).</p>
        <p class="muted small">LERQ schedule copied from Ringuette Québec ${state.lerqUpdatedAt ? `— last changed ${esc(fmtAgo(state.lerqUpdatedAt))}` : '— not available yet'}. Scores appear once they're entered on Ringuette Québec's site.</p>
        ${tournamentSummary()}
      </section>`;

    const search = $('#teamSearch');
    search.addEventListener('input', () => {
      state.teamFilter = search.value;
      const pos = search.selectionStart;
      renderTeams();
      const s = $('#teamSearch'); s.focus(); s.setSelectionRange(pos, pos);
    });
  }

  function updateBadge() {
    const n = state.tracked.size, f = state.favs.size;
    $('#teamCount').textContent = f ? `${f}★ · ${n}` : (n || '');
  }

  function updateFavToggle() {
    const b = $('#favToggle');
    b.hidden = !(state.view === 'upcoming' && state.tracked.size);
    const on = state.upFilter === 'fav';
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Showing favourites only. Tap to show all teams.' : 'Show favourites only');
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    updateBadge();
    updateFavToggle();
    if (state.view === 'teams') renderTeams();
    else renderSchedule(state.view);
  }

  // Rink card: the day's games on this pad. In a multi-pad building there's
  // one card per pad that day, side by side: flick sideways (or tap a pad name)
  // to see the others. Games whose pad isn't listed get their own card.
  const rinkView = { panes: [], g: null, idx: 0 };
  const padSort = (a, b) => (a.unknown - b.unknown) || a.label.localeCompare(b.label, 'en', { numeric: true });
  function rinkPanesFor(g) {
    const b = buildingOf(g.arena);
    const day = dayKey(g.start);
    if (!b.key.startsWith('bldg:')) return [{ label: '', title: g.arena, games: iceNeighbours(g).list, rinkId: g.rinkId }];
    const byRink = new Map();
    for (const x of state.byBuilding.get(`${b.key}|${day}`) || [g]) {
      const unknown = padUnknown(x);
      const k = unknown ? 'unknown' : x.rinkId;
      if (!byRink.has(k)) byRink.set(k, { label: unknown ? 'Pad not listed' : (buildingOf(x.arena).pad || x.arena), title: unknown ? b.name : x.arena, unknown: unknown ? 1 : 0, games: [], rinkId: k });
      byRink.get(k).games.push(x);
    }
    return [...byRink.values()].sort(padSort);
  }
  function showRinkPane(i, { scroll = false } = {}) {
    const { panes, g } = rinkView;
    i = Math.max(0, Math.min(panes.length - 1, i));
    rinkView.idx = i;
    const p = panes[i];
    const many = panes.length > 1;
    $('#rinkTitle').textContent = many ? buildingOf(g.arena).name : p.title;
    $('#rinkSub').textContent = `${many ? `${p.label} · ` : ''}${fmtDay(g.start)} · ${p.games.length} game${p.games.length === 1 ? '' : 's'} listed`;
    document.querySelectorAll('#rinkPads button').forEach((btn, j) => btn.setAttribute('aria-selected', String(j === i)));
    const pill = document.querySelectorAll('#rinkPads button')[i];
    if (pill) pill.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (scroll) { const box = $('#rinkPanes'); box.scrollTo({ left: i * box.clientWidth, behavior: 'instant' }); }
  }
  function openRink(gameId) {
    const g = state.games.find((x) => x.key === gameId);
    if (!g) return;
    const panes = rinkPanesFor(g);
    rinkView.panes = panes; rinkView.g = g;
    const start = Math.max(0, panes.findIndex((p) => p.games.includes(g)));
    const item = (x) => `<li class="${isTracked(x) ? 'tracked' : ''}${x === g ? ' this' : ''}">
      <span class="t">${isFav(x) ? '<span class="fav-star">★</span>' : ''}${fmtTime(x.start)}–${x.endEstimated ? '~' : ''}${fmtTime(x.end)} <span class="d">${esc(x.division)}${x.tournament ? ` · ${esc(x.tournament.short)}` : ''}</span></span>
      ${esc(x.away.name)} @ ${esc(x.home.name)}</li>`;
    $('#rinkPanes').innerHTML = panes.map((p, i) => `<section class="rink-pane" aria-label="${esc(p.label || p.title)}" data-i="${i}">
      <ol class="rink-list">${p.games.map(item).join('')}</ol></section>`).join('');
    const pads = $('#rinkPads');
    pads.hidden = panes.length < 2;
    pads.innerHTML = panes.length < 2 ? '' : panes.map((p, i) => {
      const mine = p.games.some(isTracked);
      return `<button type="button" role="tab" data-pane="${i}" class="${mine ? 'has-tracked' : ''}">${esc(p.label)}<span class="n" aria-label="${p.games.length} game${p.games.length === 1 ? '' : 's'}">${p.games.length}</span></button>`;
    }).join('') + '<span class="swipe-hint" aria-hidden="true">Swipe ›</span>';
    $('#rinkDialog').showModal();
    showRinkPane(start, { scroll: true });
  }
  $('#rinkPads').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-pane]');
    if (!btn) return;
    const i = +btn.dataset.pane, box = $('#rinkPanes');
    box.scrollTo({ left: i * box.clientWidth, behavior: 'smooth' });
    showRinkPane(i);
  });
  // Follow the flick: update the title and pad names once the cards settle.
  let paneTimer = null;
  $('#rinkPanes').addEventListener('scroll', () => {
    clearTimeout(paneTimer);
    paneTimer = setTimeout(() => {
      const box = $('#rinkPanes');
      const i = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
      if (i !== rinkView.idx) showRinkPane(i);
    }, 60);
  }, { passive: true });
  $('#rinkDialog').addEventListener('keydown', (e) => {
    if (rinkView.panes.length < 2 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    e.preventDefault();
    const i = rinkView.idx + (e.key === 'ArrowRight' ? 1 : -1), box = $('#rinkPanes');
    box.scrollTo({ left: Math.max(0, Math.min(rinkView.panes.length - 1, i)) * box.clientWidth, behavior: 'smooth' });
    showRinkPane(i);
  });

  // ---------- events ----------
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    render();
    window.scrollTo({ top: 0 });
  });

  main.addEventListener('click', async (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) { state.view = goto.dataset.goto; render(); return; }
    const arena = e.target.closest('.arena[data-game]');
    if (arena) { openRink(arena.dataset.game); return; }
    if (e.target.id === 'filterMine') { state.teamOnlyMine = !state.teamOnlyMine; renderTeams(); return; }
    const star = e.target.closest('[data-star]');
    if (star) {
      const id = star.dataset.star;
      if (state.favs.has(id)) state.favs.delete(id);
      else { state.favs.add(id); state.tracked.add(id); }
      saveTracked();
      rerenderTeamsKeepingScroll();
      return;
    }
    if (e.target.id === 'shareBtn') {
      const url = shareUrl();
      try {
        if (navigator.share) await navigator.share({ title: 'Ringette Today', text: 'My ringette teams', url });
        else { await navigator.clipboard.writeText(url); setStatus('Link copied.'); }
      } catch {}
    }
  });

  main.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-team]');
    if (!cb) return;
    const id = cb.dataset.team;
    if (cb.checked) state.tracked.add(id);
    else { state.tracked.delete(id); state.favs.delete(id); } // unfollowing removes the star
    saveTracked();
    rerenderTeamsKeepingScroll();
  });

  function rerenderTeamsKeepingScroll() {
    const y = window.scrollY;
    renderTeams();
    updateBadge();
    window.scrollTo(0, y);
  }

  $('#refreshBtn').addEventListener('click', () => load({ force: true }));
  $('#favToggle').addEventListener('click', () => {
    state.upFilter = state.upFilter === 'fav' ? 'all' : 'fav';
    writeJSON(LS.upFilter, state.upFilter);
    render();
    window.scrollTo({ top: 0 });
  });
  $('#rinkClose').addEventListener('click', () => $('#rinkDialog').close());
  $('#rinkDialog').addEventListener('click', (e) => { if (e.target.id === 'rinkDialog') e.target.close(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
  load();
  setInterval(() => setStatus(), 60000);
})();
