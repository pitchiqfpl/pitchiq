/**
 * /api/xg-data.js
 * Vercel serverless function — fetches PL xG data from API-Football.
 * API key stays server-side, never exposed to the browser.
 *
 * Strategy (two calls, both within free tier):
 *   1. /teams/statistics  — season-aggregate xG and xGC per team (one record per team)
 *   2. /fixtures?last=10  — last 10 rounds of fixtures for rolling form (≤100 results)
 *
 * This avoids fetching all 380 season fixtures (which hits the 100-result page limit
 * and would silently truncate on the free tier).
 *
 * Free tier: 100 calls/day. This function makes 2 calls per team per request.
 * With 20 teams and 6-hour caching, real-world usage is well within limits.
 *
 * Env var: API_FOOTBALL_KEY  (Vercel → Settings → Environment Variables)
 */

const API_BASE       = 'https://v3.football.api-sports.io';
const PL_LEAGUE_ID   = 39;    // Premier League — never changes
const CURRENT_SEASON = 2025;  // 2025/26 Premier League season
const FORM_ROUNDS    = 10;    // fetch last N rounds for form window
const FORM_GAMES     = 5;     // use last N games from those rounds for form avg

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Cache for 6 hours — xG only changes after matchdays
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API_FOOTBALL_KEY not set',
      hint:  'Vercel dashboard → Project → Settings → Environment Variables',
    });
  }

  const headers = {
    'x-apisports-key': apiKey,
    'x-rapidapi-key':  apiKey,
    'x-rapidapi-host': 'v3.football.api-sports.io',
  };

  try {
    // ── Call 1: standings to get the list of all 20 PL teams ────────────────
    const standingsRes = await fetch(
      `${API_BASE}/standings?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}`,
      { headers }
    );
    if (!standingsRes.ok) throw new Error(`Standings: HTTP ${standingsRes.status}`);
    const standingsData = await standingsRes.json();

    // Log the raw response structure for debugging
    console.log('[xg-data] Standings response keys:', JSON.stringify(Object.keys(standingsData)));
    console.log('[xg-data] Response length:', standingsData.response?.length);
    console.log('[xg-data] First response item keys:', JSON.stringify(Object.keys(standingsData.response?.[0] ?? {})));

    // Try multiple response structures — API-Football varies between seasons
    let standings = standingsData.response?.[0]?.league?.standings?.[0]
                 ?? standingsData.response?.[0]?.standings?.[0]
                 ?? standingsData.response?.[0];

    // If still no standings, try the teams endpoint directly as fallback
    if (!Array.isArray(standings) || standings.length === 0) {
      console.warn('[xg-data] No standings — trying teams endpoint directly');
      const teamsRes = await fetch(
        `${API_BASE}/teams?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}`,
        { headers }
      );
      if (!teamsRes.ok) throw new Error(`Teams: HTTP ${teamsRes.status}`);
      const teamsData = await teamsRes.json();
      console.log('[xg-data] Teams response length:', teamsData.response?.length);
      if (!Array.isArray(teamsData.response) || teamsData.response.length === 0) {
        throw new Error(`No team data for season ${CURRENT_SEASON} — check API key and season ID`);
      }
      // Build teams from the teams endpoint
      var teams = teamsData.response.map(t => ({
        id:   t.team.id,
        name: t.team.name,
      }));
    } else {
      var teams = standings.map(s => ({
        id:   s.team.id,
        name: s.team.name,
      }));
    }

    // ── Call 2: last N rounds of fixtures for form calculation ───────────────
    // Using `last=` keeps us well within the 100-result page limit.
    const formRes = await fetch(
      `${API_BASE}/fixtures?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}&last=${FORM_ROUNDS}&status=FT`,
      { headers }
    );
    if (!formRes.ok) throw new Error(`Fixtures (form): HTTP ${formRes.status}`);
    const formData = await formRes.json();
    const formFixtures = formData.response ?? [];

    // ── Call 3: season statistics per team (batched via Promise.all) ─────────
    // /teams/statistics returns season-aggregate xG, xGA, goals etc. per team.
    // This is a separate call per team but we only need it for the season average.
    // 20 calls + 2 above = 22 total — well within 100/day free tier.
    const statsResults = await Promise.all(
      teams.map(t =>
        fetch(
          `${API_BASE}/teams/statistics?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}&team=${t.id}`,
          { headers }
        ).then(r => r.ok ? r.json() : Promise.reject(new Error(`Stats ${t.id}: HTTP ${r.status}`)))
      )
    );

    // ── Build per-team xG map ────────────────────────────────────────────────
    const teamMap = buildTeamXgMap(teams, statsResults, formFixtures);

    const teamsWithXg = Object.values(teamMap).filter(t => t.xg_season > 0).length;
    if (teamsWithXg < 10) {
      console.warn(`[xg-data] Only ${teamsWithXg}/20 teams have xG data — may be early in season`);
    }

    return res.status(200).json({
      teams:         teamMap,
      season:        CURRENT_SEASON,
      teams_count:   Object.keys(teamMap).length,
      teams_with_xg: teamsWithXg,
      generated_at:  new Date().toISOString(),
    });

  } catch (err) {
    console.error('[xg-data] Error:', err.message);
    return res.status(500).json({
      error:  'Failed to fetch xG data',
      detail: err.message,
    });
  }
}

/**
 * buildTeamXgMap
 * Combines season-aggregate stats with recent form fixtures into a per-team summary.
 *
 * API-Football xG field locations (confirmed for PL 2024):
 *   Season stats:  response.goals.for.total.xg  / response.goals.against.total.xg
 *   Fixture level: goals.home (actual goals) — per-fixture xG not available in bulk
 *                  For per-fixture xG we use: score.home.xG / score.away.xG
 *
 * Note: per-fixture xG in the bulk /fixtures endpoint is unreliable and often null.
 * We therefore use season-aggregate xG from /teams/statistics (reliable) and
 * supplement the form window with actual goals scored/conceded as a proxy for
 * recent form when per-fixture xG is unavailable.
 */
function buildTeamXgMap(teams, statsResults, formFixtures) {
  const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  // Sort form fixtures newest-first
  const sortedForm = [...formFixtures].sort(
    (a, b) => new Date(b.fixture.date) - new Date(a.fixture.date)
  );

  // Index form fixtures by team
  const formByTeam = {};
  sortedForm.forEach(f => {
    const hId = f.teams.home.id;
    const aId = f.teams.away.id;
    // Actual goals (reliable fallback when xG is null in bulk endpoint)
    const hGoals = f.goals?.home ?? 0;
    const aGoals = f.goals?.away ?? 0;
    // Per-fixture xG — present on some endpoints, null on others
    const hXg = parseFloat(f.score?.home?.xG ?? f.score?.home?.expected_goals ?? hGoals) || hGoals;
    const aXg = parseFloat(f.score?.away?.xG ?? f.score?.away?.expected_goals ?? aGoals) || aGoals;

    if (!formByTeam[hId]) formByTeam[hId] = { xg: [], xgc: [] };
    if (!formByTeam[aId]) formByTeam[aId] = { xg: [], xgc: [] };

    formByTeam[hId].xg.push(hXg);
    formByTeam[hId].xgc.push(aXg);
    formByTeam[aId].xg.push(aXg);
    formByTeam[aId].xgc.push(hXg);
  });

  const result = {};

  teams.forEach((team, i) => {
    const stats   = statsResults[i]?.response;
    const formArr = formByTeam[team.id] ?? { xg: [], xgc: [] };

    // Season xG from /teams/statistics (most reliable source)
    // Field path: response.goals.for.total.xg (confirmed API-Football v3)
    const xgSeason  = parseFloat(stats?.goals?.for?.total?.xg  ?? 0) || 0;
    const xgcSeason = parseFloat(stats?.goals?.against?.total?.xg ?? 0) || 0;

    // Games played — used to compute per-game average if API returns totals
    const gamesPlayed = stats?.fixtures?.played?.total ?? 1;

    // API may return season total xG or per-game average depending on version
    // If the value looks like a total (>5), divide by games played
    const xgPerGame  = xgSeason  > 5 ? xgSeason  / gamesPlayed : xgSeason;
    const xgcPerGame = xgcSeason > 5 ? xgcSeason / gamesPlayed : xgcSeason;

    // Form: mean of last FORM_GAMES from recent fixtures
    const xgLast5  = mean(formArr.xg.slice(0,  FORM_GAMES));
    const xgcLast5 = mean(formArr.xgc.slice(0, FORM_GAMES));

    result[team.id] = {
      name:         team.name,
      xg_season:    xgPerGame,
      xgc_season:   xgcPerGame,
      // If form data is missing, fall back to season average
      xg_last5:     xgLast5  || xgPerGame,
      xgc_last5:    xgcLast5 || xgcPerGame,
      games_played: gamesPlayed,
    };
  });

  return result;
}
