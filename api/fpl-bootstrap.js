/**
 * /api/fpl-bootstrap
 * Proxies the FPL bootstrap-static endpoint to avoid CORS issues.
 * Deployed as a Vercel serverless function.
 *
 * Returns: full FPL bootstrap JSON including teams[], elements[], events[]
 * Cache:   60 minutes (data only changes when FPL updates prices/transfers)
 */

const FPL_URL = 'https://fantasy.premierleague.com/api/bootstrap-static/';

export default async function handler(req, res) {
  // CORS headers — allow requests from your own domain in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // 30-minute edge cache — short enough to pick up price changes quickly
  // Pass ?bust=1 to force a fresh fetch (bypasses edge cache)
  const bustCache = req.query.bust === '1';
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Cache-Control', bustCache
    ? 'no-store'
    : 's-maxage=1800, stale-while-revalidate=300'
  );

  try {
    const response = await fetch(FPL_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
    });

    if (response.status === 403) {
      // FPL is rate-limiting or blocking this request
      // Return 429 so the client knows to back off
      return res.status(429).json({ error: 'FPL rate limited', status: 403 });
    }
    if (!response.ok) {
      return res.status(502).json({
        error: 'FPL API returned an error',
        status: response.status,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('FPL bootstrap proxy error:', err);
    return res.status(503).json({ error: 'Failed to fetch FPL data', detail: err.message });
  }
}
