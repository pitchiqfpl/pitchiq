/**
 * /api/fpl-l6-batch
 * Fetches last-6-game xG/xA/xGC stats for multiple players in a single call.
 *
 * Accepts a comma-separated list of FPL player IDs:
 *   GET /api/fpl-l6-batch?ids=1,2,3,4,5
 *
 * Returns:
 *   {
 *     [playerId]: {
 *       xg90L6:  number,   xG per 90 over last 6 games
 *       xa90L6:  number,   xA per 90 over last 6 games
 *       xgc90L6: number,   xGC per 90 over last 6 games (for DEF/GK)
 *       mins6:   number,   total minutes over last 6 games
 *       games6:  number,   games played in last 6
 *     }
 *   }
 *
 * Strategy:
 *   - Fetches all player summaries in parallel server-side (Promise.all)
 *   - 30-minute Vercel edge cache — browser makes 1 call, not N
 *   - Top 50 owned players: 1 Vercel invocation per 30 mins = ~48/day
 *   - Well within free tier at 1000 visitors/day
 *
 * Cache: 30 minutes (same as individual fpl-player-summary)
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const MAX_PLAYERS = 50;  // safety cap
const L6_GAMES    = 6;   // last N games to use

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Parse and validate IDs
  const raw = req.query.ids || '';
  const ids = raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n > 0)
    .slice(0, MAX_PLAYERS);

  if (ids.length === 0) {
    return res.status(400).json({ error: 'No valid player IDs provided' });
  }

  // Cache aggressively — 30 min edge cache, 10 min stale-while-revalidate
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

  try {
    // Fetch all player summaries in parallel
    const responses = await Promise.allSettled(
      ids.map(id =>
        fetch(`${FPL_BASE}/element-summary/${id}/`, {
          headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      )
    );

    const result = {};

    responses.forEach((res, i) => {
      const id = ids[i];
      if (res.status !== 'fulfilled' || !res.value?.history) return;

      const history = res.value.history;
      // Last L6_GAMES appearances (most recent first in FPL data is actually oldest first)
      // FPL history is chronological — take the last N entries
      const recent = history.slice(-L6_GAMES);
      if (recent.length === 0) return;

      const totalMins = recent.reduce((s, g) => s + (g.minutes || 0), 0);
      if (totalMins === 0) return;

      const per90 = v => totalMins > 0 ? (v / totalMins) * 90 : 0;

      const xgTotal  = recent.reduce((s, g) => s + (parseFloat(g.expected_goals)            || 0), 0);
      const xaTotal  = recent.reduce((s, g) => s + (parseFloat(g.expected_assists)           || 0), 0);
      const xgcTotal = recent.reduce((s, g) => s + (parseFloat(g.expected_goals_conceded)    || 0), 0);

      result[id] = {
        xg90L6:  Math.round(per90(xgTotal)  * 1000) / 1000,
        xa90L6:  Math.round(per90(xaTotal)  * 1000) / 1000,
        xgc90L6: Math.round(per90(xgcTotal) * 1000) / 1000,
        mins6:   totalMins,
        games6:  recent.length,
      };
    });

    return res.status(200).json(result);

  } catch (err) {
    console.error('[fpl-l6-batch] Error:', err.message);
    return res.status(503).json({ error: 'Failed to fetch L6 batch data', detail: err.message });
  }
}
