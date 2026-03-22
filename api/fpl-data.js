/**
 * fpl-data.js — PitchIQ shared FPL data layer
 *
 * Usage: <script src="fpl-data.js"></script>
 * Exposes: window.FPLData — singleton that fetches, caches, and serves
 * bootstrap + fixture data to any page that needs it.
 *
 * All pages call: await FPLData.load()
 * Then access:   FPLData.players, FPLData.teams, FPLData.currentGw, FPLData.isLive
 */

window.FPLData = (() => {

  /* ── Public state ──────────────────────────────────────────────────────── */
  let players     = [];   // enriched player objects
  let teams       = {};   // { [fplTeamId]: { name, short } }
  let currentGw   = 34;
  let deadline    = null; // ISO string
  let isLive      = false;
  let _loaded     = false;
  let _loadPromise = null;

  /* ── Internal fetch helper ─────────────────────────────────────────────── */
  async function fetchJ(url) {
    const r = await fetch(url);
    if (!r.ok) {
      const e = new Error(`HTTP ${r.status} from ${url}`);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  /* ── Main load function ────────────────────────────────────────────────── */
  async function load() {
    // Return cached promise if already loading/loaded
    if (_loadPromise) return _loadPromise;

    _loadPromise = (async () => {
      try {
        const bs = await fetchJ('api/fpl-bootstrap');
        if (!Array.isArray(bs.teams) || !Array.isArray(bs.elements)) {
          throw new Error('Unexpected bootstrap shape');
        }

        currentGw = resolveGw(bs);
        teams     = buildTeamsMap(bs.teams);
        players   = buildPlayers(bs.elements);
        deadline  = resolveDeadline(bs);
        isLive    = true;
        _loaded   = true;

      } catch (err) {
        if (err.status !== 404) {
          console.warn('[FPLData] Bootstrap failed:', err.message);
        }
        // Fall through — callers check isLive and use their own fallback data
        isLive  = false;
        _loaded = true;
      }
    })();

    return _loadPromise;
  }

  /* ── Fixture enrichment ────────────────────────────────────────────────── */
  async function loadFixtures() {
    if (!isLive) return;
    try {
      const fixes = await fetchJ('api/fpl-fixtures');
      if (!Array.isArray(fixes)) return;

      const byTeam = {};
      fixes
        .filter(f => f.event === currentGw && !f.finished)
        .forEach(f => {
          byTeam[f.team_h] = {
            opp:        teams[f.team_a]?.short ?? '?',
            oppId:      f.team_a,
            ha:         'H',
            difficulty: f.team_h_difficulty ?? 3,
            kickoff:    f.kickoff_time ?? null,
          };
          byTeam[f.team_a] = {
            opp:        teams[f.team_h]?.short ?? '?',
            oppId:      f.team_h,
            ha:         'A',
            difficulty: f.team_a_difficulty ?? 3,
            kickoff:    f.kickoff_time ?? null,
          };
        });

      players.forEach(p => {
        if (byTeam[p.teamId]) p.fix = byTeam[p.teamId];
      });

    } catch (err) {
      if (err.status !== 404) console.warn('[FPLData] Fixtures failed:', err.message);
    }
  }

  /* ── Deadline timer helper ─────────────────────────────────────────────── */
  let _timerHandle = null;
  function startDeadlineTimer(elementId) {
    if (_timerHandle) clearInterval(_timerHandle);
    if (!deadline) return;
    const el = document.getElementById(elementId);
    if (!el) return;

    function tick() {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) {
        el.textContent = 'Deadline passed';
        el.style.color = 'var(--muted)';
        clearInterval(_timerHandle);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000)  / 60000);
      const s = Math.floor((diff % 60000)    / 1000);

      let label, color;
      if (d > 1)      { label = `Deadline in ${d}d ${h}h`;           color = 'var(--muted)' }
      else if (h > 6) { label = `Deadline in ${d>0?d+'d ':''}${h}h ${m}m`; color = 'var(--muted)' }
      else if (h > 0) { label = `⚠ Deadline in ${h}h ${m}m`;        color = 'var(--gold)' }
      else            { label = `🔴 Deadline in ${m}m ${s}s`;        color = 'var(--accent)' }

      el.textContent = label;
      el.style.color  = color;
    }
    tick();
    _timerHandle = setInterval(tick, 1000);
  }

  /* ── Private helpers ───────────────────────────────────────────────────── */
  function resolveGw(bs) {
    return (
      bs.events?.find(e => e.is_current) ??
      bs.events?.find(e => e.is_next)
    )?.id ?? 1;
  }

  function resolveDeadline(bs) {
    const next    = bs.events?.find(e => e.is_next);
    const current = bs.events?.find(e => e.is_current);
    return (next ?? current)?.deadline_time ?? null;
  }

  function buildTeamsMap(rawTeams) {
    return rawTeams.reduce((m, t) => {
      m[t.id] = { name: t.name, short: t.short_name };
      return m;
    }, {});
  }

  function buildPlayers(elements) {
    return elements
      .filter(e => e.status !== 'u')
      .map(e => {
        const mins        = e.minutes || 1;
        const gamesPlayed = Math.max(Math.round(mins / 75), 1);
        const xg90        = Math.min(
          ((parseFloat(e.expected_goals)  || 0) +
           (parseFloat(e.expected_assists) || 0)) / (mins / 90),
          1.5
        );
        const minsPerGame = Math.min(mins / gamesPlayed, 90);
        const ppm         = e.now_cost > 0
          ? (e.total_points / (e.now_cost / 10))
          : 0;
        const ppmForm     = e.now_cost > 0
          ? ((parseFloat(e.form) || 0) * 5) / (e.now_cost / 10)
          : 0; // approx last-5-GW pts per £m

        return {
          id:              e.id,
          name:            e.web_name,
          fullName:        `${e.first_name} ${e.second_name}`,
          teamId:          e.team,
          pos:             ['', 'GK', 'DEF', 'MID', 'FWD'][e.element_type],
          posId:           e.element_type,
          price:           e.now_cost / 10,
          ownedPct:        parseFloat(e.selected_by_percent) || 0,
          form:            parseFloat(e.form)       || 0,
          xg90,
          ict:             parseFloat(e.ict_index)  || 0,
          minsReliability: minsPerGame,
          totalPts:        e.total_points            || 0,
          epNext:          parseFloat(e.ep_next)     || 0,
          starts:          e.starts ?? gamesPlayed,
          transfersDelta:  (e.transfers_in_event  || 0) - (e.transfers_out_event || 0),
          priceChange:     e.cost_change_event ?? 0,
          ppm,              // season pts per £m
          ppmForm,          // recent form pts per £m (approx)
          xgc90:           parseFloat(e.expected_goals_conceded) / gamesPlayed || 0,
          cleanSheets:     e.clean_sheets || 0,
          goalsConceded:   e.goals_conceded || 0,
          goals:           e.goals_scored || 0,
          assists:         e.assists || 0,
          status:          e.status,  // 'a' available, 'd' doubt, 'i' injured
          news:            e.news || '',
          fix:             null,
        };
      });
  }

  /* ── Z-score utility (shared by tools that need scoring) ──────────────── */
  const Z_CAP = 2.5;
  function zNorm(vals) {
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    const sd = Math.sqrt(variance) || 1;
    return vals.map(v => {
      const clamped = Math.max(-Z_CAP, Math.min(Z_CAP, (v - mean) / sd));
      return (clamped + Z_CAP) / (Z_CAP * 2);
    });
  }

  /* ── Public API ────────────────────────────────────────────────────────── */
  return {
    load,
    loadFixtures,
    startDeadlineTimer,
    zNorm,
    get players()   { return players },
    get teams()     { return teams },
    get currentGw() { return currentGw },
    get deadline()  { return deadline },
    get isLive()    { return isLive },
    get loaded()    { return _loaded },
    fetchJ,
  };

})();
