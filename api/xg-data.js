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
const PL_LEAGUE_ID   = 39;
const CURRENT_SEASON = 2025;
const FORM_ROUNDS    = 10;
const FORM_GAMES     = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Cache aggressively — 24 hours. xG data only changes after matchdays.
  // This means at most 1 API call per day regardless of traffic.
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

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
    // ── Single call: last 50 finished fixtures ────────────────────────────────
    // This gives us all the data we need in ONE call instead of 22.
    // We derive per-team xG from the fixture-level xG data.
    const fixturesRes = await fetch(
      `${API_BASE}/fixtures?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}&last=50&status=FT`,
      { headers }
    );
    if (!fixturesRes.ok) throw new Error(`Fixtures: HTTP ${fixturesRes.status}`);
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.response ?? [];

    console.log('[xg-data] Fixtures fetched:', fixtures.length);

    if (fixtures.length === 0) {
      throw new Error(`No fixture data for season ${CURRENT_SEASON}`);
    }

    // Build per-team xG from fixture data
    const teamMap = buildTeamXgFromFixtures(fixtures);

    const teamsWithXg = Object.values(teamMap).filter(t => t.xg_season > 0).length;
    console.log(`[xg-data] Teams with xG data: ${teamsWithXg}`);

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
 * buildTeamXgFromFixtures
 * Derives per-team xG from fixture-level data only — no per-team stats calls needed.
 * Uses actual goals as xG proxy when per-fixture xG is null (common on free tier).
 */
function buildTeamXgFromFixtures(fixtures) {
  const mean = arr => arr.length ? arr.reduce((s,v) => s+v, 0) / arr.length : 0;

  // Sort newest first
  const sorted = [...fixtures].sort(
    (a,b) => new Date(b.fixture.date) - new Date(a.fixture.date)
  );

  const byTeam = {};

  sorted.forEach(f => {
    const hId   = f.teams.home.id;
    const aId   = f.teams.away.id;
    const hName = f.teams.home.name;
    const aName = f.teams.away.name;

    // Use xG if available, fall back to actual goals
    const hXg = parseFloat(f.score?.home?.xG ?? f.goals?.home ?? 0) || (f.goals?.home ?? 0);
    const aXg = parseFloat(f.score?.away?.xG ?? f.goals?.away ?? 0) || (f.goals?.away ?? 0);

    if (!byTeam[hId]) byTeam[hId] = { name: hName, xg: [], xgc: [] };
    if (!byTeam[aId]) byTeam[aId] = { name: aName, xg: [], xgc: [] };

    byTeam[hId].xg.push(hXg);
    byTeam[hId].xgc.push(aXg);
    byTeam[aId].xg.push(aXg);
    byTeam[aId].xgc.push(hXg);
  });

  const result = {};
  Object.entries(byTeam).forEach(([id, t]) => {
    const xgAll  = t.xg;
    const xgcAll = t.xgc;
    result[id] = {
      name:         t.name,
      xg_season:    mean(xgAll),
      xgc_season:   mean(xgcAll),
      xg_last5:     mean(xgAll.slice(0, FORM_GAMES)),
      xgc_last5:    mean(xgcAll.slice(0, FORM_GAMES)),
      games_played: xgAll.length,
    };
  });

  return result;
}
