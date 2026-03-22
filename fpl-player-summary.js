/**
 * /api/fpl-player-summary
 * Proxies the FPL element-summary endpoint for a specific player.
 * Returns gameweek-by-gameweek stats including goals, assists, minutes,
 * expected_goals, expected_assists, clean_sheets, bonus, etc.
 *
 * Query params:
 *   ?id=123   — FPL element ID (required)
 *
 * Used by the Captain Picker to compute xG+xA form over last 5 GWs.
 * Cache: 30 minutes — updates after each GW deadline
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const playerId = req.query.id;
  if (!playerId || isNaN(parseInt(playerId, 10))) {
    return res.status(400).json({ error: 'Missing or invalid ?id= parameter' });
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

  try {
    const response = await fetch(
      `${FPL_BASE}/element-summary/${parseInt(playerId, 10)}/`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PitchIQ/1.0)' } }
    );

    if (!response.ok) {
      return res.status(502).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[fpl-player-summary] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch player summary', detail: err.message });
  }
}
