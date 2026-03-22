/**
 * /api/fpl-results
 * Proxies the FPL event results endpoint.
 * Returns score distribution data used to calculate approximate live rank.
 *
 * The FPL results endpoint returns the total points scored by each manager
 * bucketed into score bands — this allows rank estimation without storing
 * every manager's picks.
 *
 * Query params:
 *   ?gw=34  — gameweek number (required)
 *
 * Cache: 2 minutes during live matches, longer outside match windows
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

  // Cache 2 minutes — score distribution shifts during live matches
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');

  try {
    const response = await fetch(
      `${FPL_BASE}/event/${gw}/results/`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PitchIQ/1.0)' } }
    );

    if (response.status === 404) {
      return res.status(404).json({ error: `GW${gw} results not available yet` });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[fpl-results] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch results', detail: err.message });
  }
}
