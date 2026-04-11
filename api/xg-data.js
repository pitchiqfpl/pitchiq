/**
 * /api/xg-data.js
 * Fetches Premier League xG data from API-Football.
 *
 * RATE LIMITING PROTECTION:
 * - 24-hour Vercel edge cache — at most 1 API call per day per region
 * - stale-while-revalidate means cached response served while refreshing
 * - Single API call (last 50 fixtures) — not per-team calls
 * - Returns graceful empty response if key missing or suspended
 *   so all tools fall back to FPL strength ratings without error
 *
 * API-Football free tier: 100 calls/day
 * This endpoint uses 1 call per cache miss = max 1/day = well within limits
 *
 * Env var: API_FOOTBALL_KEY (Vercel → Settings → Environment Variables)
 */

const API_BASE       = 'https://v3.football.api-sports.io';
const PL_LEAGUE_ID   = 39;
const CURRENT_SEASON = 2025;
const FORM_GAMES     = 5;

const EMPTY_RESPONSE = {
  teams: {},
  season: CURRENT_SEASON,
  teams_count: 0,
  teams_with_xg: 0,
  fallback: true,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // 24-hour cache — only 1 real API call per day maximum
  // stale-while-revalidate means visitors never wait for a slow API call
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    // No key configured — return empty so tools use FPL fallback
    console.log('[xg-data] API_FOOTBALL_KEY not set — using FPL fallback');
    return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'API key not configured' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `${API_BASE}/fixtures?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}&last=50&status=FT`,
      {
        signal: controller.signal,
        headers: {
          'x-apisports-key':  apiKey,
          'x-rapidapi-key':   apiKey,
          'x-rapidapi-host':  'v3.football.api-sports.io',
        },
      }
    );
    clearTimeout(timeout);

    // Handle API-Football specific error codes
    if (response.status === 403 || response.status === 401) {
      console.warn('[xg-data] API key rejected — account may be suspended');
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'API key rejected (account may be suspended)' });
    }
    if (response.status === 429) {
      console.warn('[xg-data] Rate limited by API-Football');
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'Rate limited' });
    }
    if (!response.ok) {
      console.warn(`[xg-data] API returned ${response.status}`);
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: `API error ${response.status}` });
    }

    const data = await response.json();

    // API-Football returns errors in the response body even on 200
    if (data.errors && Object.keys(data.errors).length > 0) {
      const errMsg = JSON.stringify(data.errors);
      console.warn('[xg-data] API-Football error in response:', errMsg);
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: errMsg });
    }

    const fixtures = data.response ?? [];
    if (fixtures.length === 0) {
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'No fixtures returned' });
    }

    const teamMap = buildTeamXgFromFixtures(fixtures);
    const teamsWithXg = Object.values(teamMap).filter(t => t.xg_season > 0).length;

    console.log(`[xg-data] Built xG for ${teamsWithXg} teams from ${fixtures.length} fixtures`);

    return res.status(200).json({
      teams:         teamMap,
      season:        CURRENT_SEASON,
      teams_count:   Object.keys(teamMap).length,
      teams_with_xg: teamsWithXg,
      generated_at:  new Date().toISOString(),
    });

  } catch (err) {
    clearTimeout(timeout);
    const isTimeout = err.name === 'AbortError';
    console.warn('[xg-data]', isTimeout ? 'Timed out' : err.message);
    // Always return 200 with empty data — tools gracefully fall back to FPL ratings
    return res.status(200).json({ ...EMPTY_RESPONSE, reason: isTimeout ? 'timeout' : err.message });
  }
}

function buildTeamXgFromFixtures(fixtures) {
  const mean = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const sorted = [...fixtures].sort(
    (a, b) => new Date(b.fixture.date) - new Date(a.fixture.date)
  );

  const byTeam = {};
  sorted.forEach(f => {
    const hId   = f.teams.home.id;
    const aId   = f.teams.away.id;
    const hName = f.teams.home.name;
    const aName = f.teams.away.name;
    const hXg = parseFloat(f.score?.home?.xG ?? f.goals?.home ?? 0) || (f.goals?.home ?? 0);
    const aXg = parseFloat(f.score?.away?.xG ?? f.goals?.away ?? 0) || (f.goals?.away ?? 0);

    if (!byTeam[hId]) byTeam[hId] = { name: hName, xg: [], xgc: [] };
    if (!byTeam[aId]) byTeam[aId] = { name: aName, xg: [], xgc: [] };

    byTeam[hId].xg.push(hXg);  byTeam[hId].xgc.push(aXg);
    byTeam[aId].xg.push(aXg);  byTeam[aId].xgc.push(hXg);
  });

  const result = {};
  Object.entries(byTeam).forEach(([id, t]) => {
    result[id] = {
      name:         t.name,
      xg_season:    mean(t.xg),
      xgc_season:   mean(t.xgc),
      xg_last5:     mean(t.xg.slice(0, FORM_GAMES)),
      xgc_last5:    mean(t.xgc.slice(0, FORM_GAMES)),
      games_played: t.xg.length,
    };
  });

  return result;
}
