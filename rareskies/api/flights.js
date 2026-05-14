module.exports = async function handler(req, res) {
  const { icao24 } = req.query;
  if (!icao24) return res.status(200).json([]);

  const end = Math.floor(Date.now() / 1000);
  const beg = end - (14 * 24 * 3600);

  try {
    const OPENSKY_USER = process.env.OPENSKY_USER || 'mast2137-api-client';
    const OPENSKY_PASS = process.env.OPENSKY_PASS || 'JVdFENxMS07hHYRK0NFIjI2ViKzgBU9K';
    const auth = Buffer.from(`${OPENSKY_USER}:${OPENSKY_PASS}`).toString('base64');
    
    const response = await fetch(`https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${beg}&end=${end}`, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    
    if (!response.ok) return res.status(200).json([]);
    
    const data = await response.json();
    if (!Array.isArray(data)) return res.status(200).json([]);
    
    const sorted = data.sort((a, b) => b.firstSeen - a.firstSeen).slice(0, 3);
    return res.status(200).json(sorted);
  } catch (error) {
    return res.status(200).json([]);
  }
}
