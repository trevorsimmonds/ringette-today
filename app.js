/* Ringette Today — NCRRL + Ringette Ontario tournament schedules (PWA)
 *
 * Data source: RAMP InterActive (which runs ncrrl.com and the tournament sites)
 * serves schedules as JSON with CORS open, so the app reads them straight from
 * the browser — no scraping server needed.
 *   League games:     https://www.ncrrl.com/api/leaguegame/get/1648/{season}/0/0/0/0/
 *   Seasons:          https://www.ncrrl.com/api/association/getseasons/{aid}/
 *   Tournament games: https://www.ncrrl.com/api/leaguetournamentgame/get/{aid}/{season}/0/0/0/0/0
 * AID 1648 = NCRRL. Tournament IDs and dates live in tournaments.json.
 * Team IDs are shared between the league and tournaments, so following a team
 * picks up its tournament games too.
 */
(() => {
  'use strict';

  const AID = 1648;
  const FALLBACK_SEASON = 14554; // 2026-2027, used only if season lookup fails with no cache
  const API = 'https://www.ncrrl.com/api';
  const LOOKAHEAD_DAYS = 31;     // download tournaments starting within this many days
  const LOOKBACK_DAYS = 7;       // …or that ended within this many days (for results)
  const LS = {
    tracked: 'rt.tracked',       // [teamId, ...]
    season: 'rt.season',         // {sid, name, checkedAt}
    cache: 'rt.cache',           // {season, fetchedAt, games}
    tourn: 'rt.t.',              // + aid -> {sid, fetchedAt, games}
  };
  const params = new URLSearchParams(location.search);
  const FIXTURE = params.has('fixture');
  // ?today=2026-11-20 lets you preview how the app behaves on another date.
  const TODAY_OVERRIDE = params.get('today');

  // ---------- state ----------
  const state = {
    view: 'upcoming',
    games: [],          // league + tournament, normalized, sorted by start
    league: [],         // normalized league games
    tourGames: new Map(), // aid -> normalized games
    tournaments: [],    // from tournaments.json
    teams: new Map(),   // id -> {id, name, division} (league teams)
    byIce: new Map(),   // "rinkId|yyyy-mm-dd" -> [games sorted]
    tracked: new Set(readJSON(LS.tracked, [])),
    season: readJSON(LS.season, null),
    fetchedAt: null,
    teamFilter: '',
    teamOnlyMine: false,
  };

  // Teams shared via link: #teams=123,456
  (function importFromHash() {
    const m = location.hash.match(/teams=([\d,]+)/);
    if (!m) return;
    m[1].split(',').filter(Boolean).forEach((id) => state.tracked.add(Number(id)));
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
  function saveTracked() { writeJSON(LS.tracked, [...state.tracked]); }
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

  // Keep only the fields we use so the cache stays small.
  const slim = (raw) => raw.map((g) => ({
    GID: g.GID, sDate: g.sDate, eDate: g.eDate, ArenaName: g.ArenaName, RARID: g.RARID,
    HomeTeamName: g.HomeTeamName, homeTID: g.homeTID, homeScore: g.homeScore,
    AwayTeamName: g.AwayTeamName, awayTID: g.awayTID, awayScore: g.awayScore,
    HomeDivision: g.HomeDivision, AwayDivision: g.AwayDivision, GameTypeName: g.GameTypeName, notes: g.notes,
    completed: g.completed, cancelledHome: g.cancelledHome, cancelledAway: g.cancelledAway, rainout: g.rainout,
    trash: g.trash, deletedDate: g.deletedDate,
  }));

  // ---------- data ----------
  function normalize(raw, source) {
    return raw
      .filter((g) => !g.trash && !g.deletedDate)
      .map((g) => {
        const start = parseLocal(g.sDate);
        let end = parseLocal(g.eDate);
        if (end && start && end <= start) end = null; // some feeds repeat the start time as the end
        return {
          key: `${source ? source.aid : 'L'}-${g.GID}`,
          id: g.GID,
          start,
          end,                           // may be null for tournaments; filled in rebuild()
          endEstimated: !end,
          arena: String(g.ArenaName || 'TBD').trim(),
          rinkId: g.RARID ?? g.ArenaName,
          home: { id: g.homeTID, name: cleanName(g.HomeTeamName), score: g.homeScore },
          away: { id: g.awayTID, name: cleanName(g.AwayTeamName), score: g.awayScore },
          division: g.HomeDivision || g.AwayDivision || '',
          type: g.GameTypeName || '',
          notes: (g.notes || '').trim(),
          completed: !!g.completed,
          cancelled: !!(g.cancelledHome || g.cancelledAway || g.rainout),
          tournament: source || null,   // {aid, name, short} for tournament games
        };
      })
      .filter((g) => g.start);
  }

  function rebuild() {
    const all = [...state.league];
    for (const games of state.tourGames.values()) all.push(...games);
    all.sort((a, b) => a.start - b.start || a.arena.localeCompare(b.arena));

    state.games = all;
    state.teams = new Map();
    for (const g of state.league) {
      for (const t of [g.home, g.away]) {
        if (t.id && !state.teams.has(t.id)) state.teams.set(t.id, { id: t.id, name: t.name, division: g.division });
      }
    }
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
  }

  function iceNeighbours(g) {
    const list = state.byIce.get(`${g.rinkId}|${dayKey(g.start)}`) || [];
    const i = list.indexOf(g);
    return { before: i > 0 ? list[i - 1] : null, after: i >= 0 && i < list.length - 1 ? list[i + 1] : null, list };
  }

  const isTracked = (g) => state.tracked.has(g.home.id) || state.tracked.has(g.away.id);

  // --- season (automatic) ---
  async function resolveSeason() {
    const s = state.season;
    if (s && Date.now() - s.checkedAt < 24 * 3600000) return s.sid;
    try {
      const list = await getJSON(`${API}/association/getseasons/${AID}/`);
      const pick = list.find((x) => x.current) || [...list].sort((a, b) => b.sid - a.sid)[0];
      if (pick) {
        state.season = { sid: pick.sid, name: pick.name, checkedAt: Date.now() };
        writeJSON(LS.season, state.season);
        return pick.sid;
      }
    } catch {}
    return s ? s.sid : FALLBACK_SEASON;
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
    if (!force && cached && Date.now() - cached.fetchedAt < maxAge) return;

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
      const cached = readJSON(LS.cache, null);
      if (cached) {
        state.league = normalize(cached.games);
        state.fetchedAt = new Date(cached.fetchedAt);
      }
      await loadTournamentList();
      loadCachedTournaments();
      pruneTournamentCache();
      rebuild();
      render();
    }

    setBusy(true);
    const problems = [];
    try {
      // League: refresh if forced, no cache, or older than 10 minutes.
      const cached = readJSON(LS.cache, null);
      if (FIXTURE) state.season = { sid: FALLBACK_SEASON, name: '2026-2027 (test data)', checkedAt: Date.now() };
      const sid = FIXTURE ? FALLBACK_SEASON : await resolveSeason();
      const stale = !cached || cached.season !== sid || Date.now() - cached.fetchedAt > 10 * 60000;
      if (force || stale) {
        try {
          const raw = await getJSON(FIXTURE ? 'fixture.json' : `${API}/leaguegame/get/${AID}/${sid}/0/0/0/0/`);
          if (!Array.isArray(raw)) throw new Error('Unexpected response');
          const s = slim(raw);
          state.fetchedAt = new Date();
          writeJSON(LS.cache, { season: sid, fetchedAt: state.fetchedAt.getTime(), games: s });
          state.league = normalize(s);
        } catch (err) { problems.push(err); }
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
    el.textContent = state.fetchedAt
      ? `Updated ${fmtAgo(state.fetchedAt)} · ${state.league.length} league games${nT ? ` · ${nT} tournament${nT === 1 ? '' : 's'}` : ''}`
      : '';
  }
  function setBusy(b) { $('#refreshBtn').classList.toggle('spinning', b); }

  function teamLine(t, g, side) {
    const mine = state.tracked.has(t.id);
    const showScore = g.completed || (t.score !== null && t.score !== undefined && g.start < now());
    return `<div class="team${mine ? ' mine' : ''}">
      <span class="name"><span class="ha">${side}</span>${esc(t.name)}</span>
      ${showScore && t.score != null ? `<span class="score">${t.score}</span>` : ''}
    </div>`;
  }

  function iceRow(label, other, g, which) {
    if (!other) {
      return `<div class="ice-row"><span class="ice-label">${label}</span>
        <span class="ice-none">No game listed ${which === 'before' ? 'before' : 'after'} on this ice</span></div>`;
    }
    const gap = which === 'before' ? g.start - other.end : other.start - g.end;
    const tracked = isTracked(other);
    return `<div class="ice-row${tracked ? ' tracked' : ''}">
      <span class="ice-label">${label}</span>
      <span>
        <span class="ice-when">${fmtTime(other.start)}–${other.endEstimated ? '~' : ''}${fmtTime(other.end)}</span>
        <span class="ice-gap"> · ${fmtGap(gap)}</span>${tracked ? '<span class="chip">Following</span>' : ''}<br>
        <span class="ice-teams">${esc(other.away.name)} @ ${esc(other.home.name)}</span>
        <span class="muted small"> · ${esc(other.division)}${other.tournament ? ` · ${esc(other.tournament.short)}` : ''}</span>
      </span>
    </div>`;
  }

  function mapsLink(arena) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(arena)}`;
  }

  function gameCard(g, { showIce = true } = {}) {
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
      ${g.notes ? `<div class="note">${esc(g.notes)}</div>` : ''}
      ${showIce && !g.cancelled ? `<div class="ice">
        ${iceRow('Before', before, g, 'before')}
        ${iceRow('After', after, g, 'after')}
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

    const t0 = now();
    const startOfToday = new Date(t0); startOfToday.setHours(0, 0, 0, 0);
    let games = state.games.filter(isTracked);
    if (mode === 'upcoming') {
      games = games.filter((g) => g.end >= startOfToday && !(g.completed && g.end < t0));
    } else {
      games = games.filter((g) => g.completed || g.end < t0).reverse();
    }

    if (!games.length) {
      main.innerHTML = `<div class="empty"><h2>${mode === 'upcoming' ? 'No upcoming games posted' : 'No results yet'}</h2>
        <p>${mode === 'upcoming' ? 'NCRRL publishes the schedule a couple of weeks at a time, and tournaments usually post theirs a week or two before the event — check back after the next posting.' : 'Scores show up here once games are played.'}</p></div>`;
      return;
    }

    main.innerHTML = groupByDay(games).map((d) => {
      const rel = relDay(d.date);
      return `<h2 class="day">${esc(fmtDay(d.date))}${rel ? `<span class="rel">${rel}</span>` : ''}</h2>
        ${d.games.map((g) => gameCard(g, { showIce: mode === 'upcoming' })).join('')}`;
    }).join('');
  }

  function divisionSortKey(d) {
    const m = /U(\d+)(AA|A|B|C)?/.exec(d);
    if (/FUN/i.test(d)) return `0-${d}`;
    if (!m) return `9-${d}`;
    const tier = { AA: 0, A: 1, B: 2, C: 3 }[m[2]] ?? 4;
    return `1-${m[1].padStart(2, '0')}-${tier}`;
  }

  function tournamentSummary() {
    if (!state.tournaments.length) return '';
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
      <p class="muted small">The app checks Ringette Ontario tournaments starting in the next month. ${state.tournaments.length} tournaments are on the list.</p>
      ${active.length ? `<ul class="tlist">${active.map(line).join('')}</ul>` : '<p class="small">None in the next month.</p>'}
      ${next.length ? `<p class="muted small">Coming later: ${next.map(({ t, w }) => `${esc(t.short)} (${fmtShortDate(w.start)})`).join(', ')}</p>` : ''}`;
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
    const divs = [...byDiv.keys()].sort((a, b) => divisionSortKey(a).localeCompare(divisionSortKey(b)));

    const list = !state.teams.size
      ? '<div class="empty"><p>Loading teams…</p></div>'
      : divs.length
        ? divs.map((d) => `<section class="division"><h3>${esc(d)}</h3>
            ${byDiv.get(d).sort((a, b) => a.name.localeCompare(b.name)).map((t) => {
              const on = state.tracked.has(t.id);
              return `<label class="team-row${on ? ' on' : ''}">
                <input type="checkbox" data-team="${t.id}"${on ? ' checked' : ''}>
                <span>${esc(t.name)}</span></label>`;
            }).join('')}</section>`).join('')
        : '<div class="empty"><p>No teams match.</p></div>';

    const share = state.tracked.size
      ? `${location.origin}${location.pathname}#teams=${[...state.tracked].join(',')}`
      : '';

    main.innerHTML = `
      <input class="search" type="search" id="teamSearch" placeholder="Search teams, clubs or divisions (e.g. Ottawa Ice U14)" value="${esc(state.teamFilter)}" autocomplete="off">
      <div class="filters">
        <button id="filterMine" aria-pressed="${state.teamOnlyMine}">Only teams I follow (${state.tracked.size})</button>
      </div>
      <p class="muted small">Teams appear here once they have at least one game posted this season.</p>
      ${list}
      <section class="settings">
        <h3>Settings</h3>
        ${share ? `<div class="row"><button class="btn secondary" id="shareBtn">Share my teams</button>
          <span class="muted small">Sends a link that sets up the same teams on another phone.</span></div>` : ''}
        <p class="muted small">NCRRL season: ${esc(state.season ? state.season.name : 'checking…')} (picked automatically).</p>
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

  function render() {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
    $('#teamCount').textContent = state.tracked.size || '';
    if (state.view === 'teams') renderTeams();
    else renderSchedule(state.view);
  }

  function openRink(gameId) {
    const g = state.games.find((x) => x.key === gameId);
    if (!g) return;
    const { list } = iceNeighbours(g);
    $('#rinkTitle').textContent = g.arena;
    $('#rinkSub').textContent = `${fmtDay(g.start)} · ${list.length} game${list.length === 1 ? '' : 's'} listed`;
    $('#rinkList').innerHTML = list.map((x) => `<li class="${isTracked(x) ? 'tracked' : ''}${x === g ? ' this' : ''}">
      <span class="t">${fmtTime(x.start)}–${x.endEstimated ? '~' : ''}${fmtTime(x.end)} <span class="d">${esc(x.division)}${x.tournament ? ` · ${esc(x.tournament.short)}` : ''}</span></span>
      ${esc(x.away.name)} @ ${esc(x.home.name)}</li>`).join('');
    $('#rinkDialog').showModal();
  }

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
    if (e.target.id === 'shareBtn') {
      const url = `${location.origin}${location.pathname}#teams=${[...state.tracked].join(',')}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Ringette Today', text: 'My ringette teams', url });
        else { await navigator.clipboard.writeText(url); setStatus('Link copied.'); }
      } catch {}
    }
  });

  main.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-team]');
    if (!cb) return;
    const id = Number(cb.dataset.team);
    if (cb.checked) state.tracked.add(id); else state.tracked.delete(id);
    saveTracked();
    cb.closest('.team-row').classList.toggle('on', cb.checked);
    $('#teamCount').textContent = state.tracked.size || '';
    const fm = $('#filterMine'); if (fm) fm.textContent = `Only teams I follow (${state.tracked.size})`;
  });

  $('#refreshBtn').addEventListener('click', () => load({ force: true }));
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
