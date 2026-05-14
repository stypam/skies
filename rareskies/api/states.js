let cache = null;
let cacheTime = 0;

export default async function handler(req, res) {
  const now = Date.now();
  if (cache && (now - cacheTime < 35000)) {
    return res.status(200).json(cache);
  }

  try {
    const OPENSKY_USER = process.env.OPENSKY_USER || 'mast2137-api-client';
    const OPENSKY_PASS = process.env.OPENSKY_PASS || 'JVdFENxMS07hHYRK0NFIjI2ViKzgBU9K';
    const auth = Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64');
    
    const response = await fetch('https://opensky-network.org/api/states/all', {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    
    if (!response.ok) {
      if (cache) return res.status(200).json(cache);
      return res.status(response.status).json({ error: "OpenSky blad" });
    }
    
    const data = await response.json();
    cache = data;
    cacheTime = now;
    return res.status(200).json(data);
  } catch (error) {
    if (cache) return res.status(200).json(cache);
    return res.status(502).json({ error: error.message });
  }
}
