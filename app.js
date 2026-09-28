/* Ringette Today — NCRRL schedule tracker (PWA)
 *
 * Data source: the NCRRL site (RAMP InterActive) serves every league game for a
 * season as JSON from one endpoint, with CORS open to any origin, so the app
 * reads it straight from the browser — no scraping server needed.
 *   https://www.ncrrl.com/api/leaguegame/get/{AID}/{SeasonID}/0/0/0/0/
 * AID 1648 = NCRRL. Season 14554 = 2026-2027 (change it in Teams → Settings).
 */
(() => {
  'use strict';

  const AID = 1648;
  const DEFAULT_SEASON = 14554;
  const LS = {
    tracked: 'rt.tracked',       // [teamId, ...]
    season: 'rt.season',
    cache: 'rt.cache',           // {season, fetchedAt, games}
    showPast: 'rt.showPast',
  };

  const apiUrl = (season) => `https://www.ncrrl.com/api/leaguegame/get/${AID}/${season}/0/0/0/0/`;

  // ---------- state ----------
  const state = {
    view: 'upcoming',
    games: [],          // normalized, sorted by start
    teams: new Map(),   // id -> {id, name, division}
    byIce: new Map(),   // "rinkId|yyyy-mm-dd" -> [games sorted]
    tracked: new Set(readJSON(LS.tracked, [])),
    season: Number(localStorage.getItem(LS.season)) || DEFAULT_SEASON,
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
  function saveTracked() {
    try { localStorage.setItem(LS.tracked, JSON.stringify([...state.tracked])); } catch {}
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Feed times are local rink time (Eastern) with no zone; parse as local wall-clock.
  function parseLocal(s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtTime = (d) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);
  const fmtDay = (d) => d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
  function relDay(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
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

  // ---------- data ----------
  function normalize(raw) {
    return raw
      .filter((g) => !g.trash && !g.deletedDate)
      .map((g) => {
        const start = parseLocal(g.sDate);
        const end = parseLocal(g.eDate) || (start && new Date(start.getTime() + 3600000));
        return {
          id: g.GID,
          number: g.gameNumber,
          start, end,
          arena: String(g.ArenaName || 'TBD').trim(),
          rinkId: g.RARID ?? g.ArenaName,
          home: { id: g.homeTID, name: cleanName(g.HomeTeamName), score: g.homeScore },
          away: { id: g.awayTID, name: cleanName(g.AwayTeamName), score: g.awayScore },
          division: g.HomeDivision || g.AwayDivision || '',
          type: g.GameTypeName || '',
          notes: (g.notes || '').trim(),
          completed: !!g.completed,
          cancelled: !!(g.cancelledHome || g.cancelledAway || g.rainout),
        };
      })
      .filter((g) => g.start)
      .sort((a, b) => a.start - b.start || a.arena.localeCompare(b.arena));
  }

  function index(games) {
    state.games = games;
    state.teams = new Map();
    state.byIce = new Map();
    for (const g of games) {
      for (const t of [g.home, g.away]) {
        if (t.id && !state.teams.has(t.id)) state.teams.set(t.id, { id: t.id, name: t.name, division: g.division });
      }
      if (g.cancelled) continue;
      const k = `${g.rinkId}|${dayKey(g.start)}`;
      if (!state.byIce.has(k)) state.byIce.set(k, []);
      state.byIce.get(k).push(g);
    }
  }

  function iceNeighbours(g) {
    const list = state.byIce.get(`${g.rinkId}|${dayKey(g.start)}`) || [];
    const i = list.indexOf(g);
    return { before: i > 0 ? list[i - 1] : null, after: i >= 0 && i < list.length - 1 ? list[i + 1] : null, list };
  }

  const isTracked = (g) => state.tracked.has(g.home.id) || state.tracked.has(g.away.id);

  async function load({ force = false } = {}) {
    const cached = readJSON(LS.cache, null);
    if (cached && cached.season === state.season && !state.games.length) {
      index(normalize(cached.games));
      state.fetchedAt = new Date(cached.fetchedAt);
      render();
    }
    // Refresh from network if forced, no cache, or cache older than 10 minutes.
    const stale = !cached || cached.season !== state.season || Date.now() - cached.fetchedAt > 10 * 60 * 1000;
    if (!force && !stale) { setStatus(); return; }

    setBusy(true);
    try {
      const url = new URLSearchParams(location.search).get('fixture') ? 'fixture.json' : apiUrl(state.season);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw)) throw new Error('Unexpected response');
      // Keep only the fields we use so the cache stays small.
      const slim = raw.map((g) => ({
        GID: g.GID, gameNumber: g.gameNumber, sDate: g.sDate, eDate: g.eDate, ArenaName: g.ArenaName, RARID: g.RARID,
        HomeTeamName: g.HomeTeamName, homeTID: g.homeTID, homeScore: g.homeScore,
        AwayTeamName: g.AwayTeamName, awayTID: g.awayTID, awayScore: g.awayScore,
        HomeDivision: g.HomeDivision, AwayDivision: g.AwayDivision, GameTypeName: g.GameTypeName, notes: g.notes,
        completed: g.completed, cancelledHome: g.cancelledHome, cancelledAway: g.cancelledAway, rainout: g.rainout,
        trash: g.trash, deletedDate: g.deletedDate,
      }));
      state.fetchedAt = new Date();
      try { localStorage.setItem(LS.cache, JSON.stringify({ season: state.season, fetchedAt: state.fetchedAt.getTime(), games: slim })); } catch {}
      index(normalize(slim));
      setStatus();
    } catch (err) {
      setStatus(state.games.length
        ? `Offline — showing schedule from ${fmtAgo(state.fetchedAt)}.`
        : `Couldn't reach ncrrl.com (${err.message}). Check your connection and tap refresh.`, true);
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
    el.textContent = msg || (state.fetchedAt ? `Updated ${fmtAgo(state.fetchedAt)} · ${state.games.length} league games` : '');
  }
  function setBusy(b) { $('#refreshBtn').classList.toggle('spinning', b); }

  function teamLine(t, g, side) {
    const mine = state.tracked.has(t.id);
    const showScore = g.completed || (t.score !== null && t.score !== undefined && g.start < new Date());
    return `<div class="team${mine ? ' mine' : ''}">
      <span class="name"><span class="ha">${side}</span>${esc(t.name)}</span>
      ${showScore && t.score != null ? `<span class="score">${t.score}</span>` : ''}
    </div>`;
  }

  function iceRow(label, other, g, which) {
    if (!other) {
      return `<div class="ice-row"><span class="ice-label">${label}</span>
        <span class="ice-none">No league game ${which === 'before' ? 'before' : 'after'} on this ice</span></div>`;
    }
    const gap = which === 'before' ? g.start - other.end : other.start - g.end;
    const tracked = isTracked(other);
    return `<div class="ice-row${tracked ? ' tracked' : ''}">
      <span class="ice-label">${label}</span>
      <span>
        <span class="ice-when">${fmtTime(other.start)}–${fmtTime(other.end)}</span>
        <span class="ice-gap"> · ${fmtGap(gap)}</span>${tracked ? '<span class="chip">Following</span>' : ''}<br>
        <span class="ice-teams">${esc(other.away.name)} @ ${esc(other.home.name)}</span>
        <span class="muted small"> · ${esc(other.division)}</span>
      </span>
    </div>`;
  }

  function mapsLink(arena) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(arena)}`;
  }

  function gameCard(g, { showIce = true } = {}) {
    const { before, after } = iceNeighbours(g);
    return `<article class="card">
      <div class="card-top">
        <span class="time">${fmtTime(g.start)} – ${fmtTime(g.end)}</span>
        <span class="div-tag">${esc(g.division)}</span>
      </div>
      <div class="place">
        <button class="arena" data-game="${g.id}">${esc(g.arena)}</button>
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

    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
    let games = state.games.filter(isTracked);
    if (mode === 'upcoming') {
      games = games.filter((g) => g.end >= startOfToday && !(g.completed && g.end < now));
    } else {
      games = games.filter((g) => g.completed || g.end < now).reverse();
    }

    if (!games.length) {
      main.innerHTML = `<div class="empty"><h2>${mode === 'upcoming' ? 'No upcoming games posted' : 'No results yet'}</h2>
        <p>${mode === 'upcoming' ? 'NCRRL publishes the schedule a couple of weeks at a time — check back after the next posting.' : 'Scores show up here once games are played.'}</p></div>`;
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
        <div class="row">
          <label for="seasonInput" class="small">Season ID</label>
          <input id="seasonInput" inputmode="numeric" value="${state.season}">
          <button class="btn secondary" id="seasonSave">Save</button>
        </div>
        <p class="muted small">2026-27 is ${DEFAULT_SEASON}. Only change this when NCRRL starts a new season.</p>
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
    const g = state.games.find((x) => x.id === gameId);
    if (!g) return;
    const { list } = iceNeighbours(g);
    $('#rinkTitle').textContent = g.arena;
    $('#rinkSub').textContent = `${fmtDay(g.start)} · ${list.length} league game${list.length === 1 ? '' : 's'}`;
    $('#rinkList').innerHTML = list.map((x) => `<li class="${isTracked(x) ? 'tracked' : ''}${x === g ? ' this' : ''}">
      <span class="t">${fmtTime(x.start)}–${fmtTime(x.end)} <span class="d">${esc(x.division)}</span></span>
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
    if (arena) { openRink(Number(arena.dataset.game)); return; }
    if (e.target.id === 'filterMine') { state.teamOnlyMine = !state.teamOnlyMine; renderTeams(); return; }
    if (e.target.id === 'seasonSave') {
      const v = Number($('#seasonInput').value);
      if (v > 0 && v !== state.season) {
        state.season = v;
        localStorage.setItem(LS.season, String(v));
        state.games = []; state.teams = new Map();
        render(); load({ force: true });
      }
      return;
    }
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
