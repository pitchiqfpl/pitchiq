/**
 * /api/fpl-live
 * Proxies the FPL event live endpoint for a given gameweek.
 * Returns real-time player stats: points, minutes, goals, assists, bonus.
 *
 * Query params:
 *   ?gw=34  — gameweek number (required)
 *
 * Cache: 60 seconds — live during matches, stable between GWs
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const gw = parseInt(req.query.gw, 10);
  if (!gw || isNaN(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Missing or invalid ?gw= parameter (must be 1–38)' });
  }

  // Short cache during live matches — 60 seconds
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  try {
    const response = await fetch(
      `${FPL_BASE}/event/${gw}/live/`,
      { headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      } }
    );

    if (response.status === 403) {
      // FPL is rate-limiting or blocking this request
      // Return 429 so the client knows to back off
      return res.status(429).json({ error: 'FPL rate limited', status: 403 });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();

    if (!Array.isArray(data.elements)) {
      return res.status(502).json({ error: 'Unexpected FPL live response shape' });
    }

    // Return a leaner payload — only the fields we need
    return res.status(200).json({
      gw,
      elements: data.elements.map(e => ({
        id: e.id,
        stats: {
          minutes:           e.stats.minutes          ?? 0,
          goals_scored:      e.stats.goals_scored      ?? 0,
          assists:           e.stats.assists           ?? 0,
          clean_sheets:      e.stats.clean_sheets      ?? 0,
          goals_conceded:    e.stats.goals_conceded    ?? 0,
          yellow_cards:      e.stats.yellow_cards      ?? 0,
          red_cards:         e.stats.red_cards         ?? 0,
          saves:             e.stats.saves             ?? 0,
          bonus:             e.stats.bonus             ?? 0,
          bps:               e.stats.bps               ?? 0,
          total_points:      e.stats.total_points      ?? 0,
        },
        explain: e.explain ?? [],
      }))
    });

  } catch (err) {
    console.error('[fpl-live] Error:', err.message);
    return res.status(503).json({ error: 'Failed to fetch live data', detail: err.message });
  }
}
