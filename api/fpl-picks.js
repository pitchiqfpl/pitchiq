/**
 * /api/fpl-picks
 * Proxies the FPL entry picks endpoint for a given team and gameweek.
 * Returns the 15-player squad selection for that manager.
 *
 * Query params:
 *   ?team=1234567  — FPL manager entry ID (required)
 *   ?gw=34         — gameweek number (required)
 *
 * Cache: 30 minutes — picks can change up to the GW deadline
 *
 * Note: FPL picks are public by default unless the manager has set their
 * team to private. Private teams return a 404 from the FPL API.
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const teamId = parseInt(req.query.team, 10);
  const gw     = parseInt(req.query.gw,   10);

  if (!teamId || isNaN(teamId) || teamId < 1) {
    return res.status(400).json({ error: 'Missing or invalid ?team= parameter' });
  }
  if (!gw || isNaN(gw) || gw < 1 || gw > 38) {
    return res.status(400).json({ error: 'Missing or invalid ?gw= parameter (must be 1–38)' });
  }

  // Picks only matter up to the deadline — cache for 30 mins
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');

  try {
    const response = await fetch(
      `${FPL_BASE}/entry/${teamId}/event/${gw}/picks/`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PitchIQ/1.0)' } }
    );

    if (response.status === 404) {
      // Team ID doesn't exist, or team is set to private
      return res.status(404).json({
        error: 'Team not found or set to private',
        hint:  'Check your Team ID is correct. If your FPL team is set to private, picks cannot be loaded.',
      });
    }

    if (!response.ok) {
      return res.status(502).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();

    // data.picks is an array of { element, position, multiplier, is_captain, is_vice_captain }
    // element is the FPL player ID
    if (!Array.isArray(data.picks)) {
      return res.status(502).json({ error: 'Unexpected FPL response shape' });
    }

    return res.status(200).json({
      team_id:     teamId,
      gw,
      picks:       data.picks,
      active_chip: data.active_chip ?? null,
      entry_history: data.entry_history ?? null,
    });

  } catch (err) {
    console.error('[fpl-picks] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch picks', detail: err.message });
  }
}
