/**
 * /api/fpl-transfers
 * Proxies the FPL entry transfers endpoint for a given team.
 * Returns the transfer history for that manager.
 *
 * Query params:
 *   ?team=1234567  — FPL manager entry ID (required)
 *
 * Cache: 5 minutes — transfers update at deadline
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const teamId = parseInt(req.query.team, 10);

  if (!teamId || isNaN(teamId) || teamId < 1) {
    return res.status(400).json({ error: 'Missing or invalid ?team= parameter' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  try {
    const response = await fetch(
      `${FPL_BASE}/entry/${teamId}/transfers/`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PitchIQ/1.0)' } }
    );

    if (response.status === 404) {
      return res.status(404).json({ error: 'Team not found or set to private' });
    }
    if (!response.ok) {
      return res.status(502).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[fpl-transfers] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch transfers', detail: err.message });
  }
}
