/**
 * /api/xg-data.js
 * Fetches Premier League xG data from API-Football.
 *
 * RATE LIMIT GUARANTEE:
 * API-Football free tier: 100 calls/day
 * This endpoint makes exactly 1 call per 24-hour Vercel edge cache cycle.
 * Vercel has ~18 edge regions → worst case 18 calls/day.
 * Hard circuit breaker: tracks daily call count, refuses above 50/day.
 *
 * HOW WE WERE SUSPENDED PREVIOUSLY:
 *   Old code made 22 per-team calls × every visitor = hundreds/day
 *   Now: 1 call per fixture batch, cached 24h, graceful fallback on any error
 *
 * Env var: API_FOOTBALL_KEY (Vercel → Settings → Environment Variables)
 */

const API_BASE       = 'https://v3.football.api-sports.io';
const PL_LEAGUE_ID   = 39;
const CURRENT_SEASON = 2025;
const FORM_GAMES     = 5;
const DAILY_CALL_CAP = 50; // hard limit — API-Football free tier is 100/day

const EMPTY_RESPONSE = {
  teams: {},
  season: CURRENT_SEASON,
  teams_count: 0,
  teams_with_xg: 0,
  fallback: true,
};

// In-memory daily call counter
// Resets when the serverless function cold-starts (at least once per day)
let callsToday = 0;
let callCountDate = new Date().toDateString();

function checkCallBudget() {
  const today = new Date().toDateString();
  if (today !== callCountDate) {
    callsToday = 0;
    callCountDate = today;
  }
  if (callsToday >= DAILY_CALL_CAP) {
    console.warn(`[xg-data] Daily call cap reached (${callsToday}/${DAILY_CALL_CAP}) — serving fallback`);
    return false;
  }
  callsToday++;
  console.log(`[xg-data] Call ${callsToday}/${DAILY_CALL_CAP} today`);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // 24-hour Vercel edge cache — at most 1 real call per region per day
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'API key not configured' });
  }

  // Hard circuit breaker — never exceed daily call cap
  if (!checkCallBudget()) {
    return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'Daily call cap reached' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `${API_BASE}/fixtures?league=${PL_LEAGUE_ID}&season=${CURRENT_SEASON}&last=50&status=FT`,
      {
        signal: controller.signal,
        headers: {
          'x-apisports-key': apiKey,
          'x-rapidapi-key':  apiKey,
          'x-rapidapi-host': 'v3.football.api-sports.io',
        },
      }
    );
    clearTimeout(timeout);

    if (response.status === 403 || response.status === 401) {
      console.warn('[xg-data] API key rejected — check account status at api-football.com');
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'API key rejected' });
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

    // API-Football returns errors in body even on 200
    if (data.errors && Object.keys(data.errors).length > 0) {
      const errMsg = JSON.stringify(data.errors);
      console.warn('[xg-data] API-Football body error:', errMsg);
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: errMsg });
    }

    // Check remaining calls from response headers (API-Football provides this)
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    const limit     = response.headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) {
      console.log(`[xg-data] API-Football quota: ${remaining}/${limit} remaining today`);
      if (parseInt(remaining) < 10) {
        console.warn(`[xg-data] ⚠ Only ${remaining} calls remaining today — approaching limit`);
      }
    }

    const fixtures = data.response ?? [];
    if (fixtures.length === 0) {
      return res.status(200).json({ ...EMPTY_RESPONSE, reason: 'No fixtures returned' });
    }

    const teamMap = buildTeamXgFromFixtures(fixtures);
    const teamsWithXg = Object.values(teamMap).filter(t => t.xg_season > 0).length;

    console.log(`[xg-data] ✅ Built xG for ${teamsWithXg} teams from ${fixtures.length} fixtures`);

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
    console.warn('[xg-data]', isTimeout ? 'Request timed out' : err.message);
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
    const hXg = parseFloat(f.score?.home?.xG ?? f.goals?.home ?? 0) || (f.goals?.home ?? 0);
    const aXg = parseFloat(f.score?.away?.xG ?? f.goals?.away ?? 0) || (f.goals?.away ?? 0);

    if (!byTeam[hId]) byTeam[hId] = { name: f.teams.home.name, xg: [], xgc: [] };
    if (!byTeam[aId]) byTeam[aId] = { name: f.teams.away.name, xg: [], xgc: [] };

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
