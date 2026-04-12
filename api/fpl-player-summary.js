/**
 * /api/fpl-player-summary
 * Proxies the FPL element-summary endpoint for a specific player.
 * Cache: 30 minutes
 */

const FPL_BASE = 'https://fantasy.premierleague.com/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Origin': 'https://fantasy.premierleague.com',
  'Referer': 'https://fantasy.premierleague.com/',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const playerId = parseInt(req.query.id, 10);
  if (!playerId || isNaN(playerId)) {
    return res.status(400).json({ error: 'Missing or invalid ?id= parameter' });
  }

  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

  try {
    const response = await fetch(
      `${FPL_BASE}/element-summary/${playerId}/`,
      { headers: HEADERS }
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
    return res.status(200).json(data);

  } catch (err) {
    console.error('[fpl-player-summary] Error:', err.message);
    return res.status(503).json({ error: 'Failed to fetch player summary', detail: err.message });
  }
}
