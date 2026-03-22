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
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');

  try {
    const response = await fetch(FPL_URL, {
      headers: {
        // FPL occasionally blocks default fetch user-agents
        'User-Agent': 'Mozilla/5.0 (compatible; PitchIQ/1.0)',
      },
    });

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
    return res.status(500).json({ error: 'Failed to fetch FPL data', detail: err.message });
  }
}
