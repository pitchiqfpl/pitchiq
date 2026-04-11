/**
 * /api/fpl-fixtures
 * Proxies the FPL fixtures endpoint.
 *
 * Query params:
 *   ?gw=34        - optional, returns only fixtures for that gameweek
 *   (no param)    - returns all fixtures for the season
 *
 * Cache: 30 minutes
 */

const FPL_URL = 'https://fantasy.premierleague.com/api/fixtures/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=300');

  try {
    const gw = req.query.gw;
    const url = gw ? `${FPL_URL}?event=${gw}` : FPL_URL;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });

    if (response.status === 403) {
      // FPL is rate-limiting or blocking this request
      // Return 429 so the client knows to back off
      return res.status(429).json({ error: 'FPL rate limited', status: 403 });
    }
    if (!response.ok) {
      return res.status(502).json({ error: 'FPL fixtures API error', status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('FPL fixtures proxy error:', err);
    return res.status(503).json({ error: 'Failed to fetch fixtures', detail: err.message });
  }
}
