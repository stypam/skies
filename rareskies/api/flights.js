let tokenCache = null;
let tokenExpiresAt = 0;

async function getOpenSkyToken(clientId, clientSecret) {
  if (tokenCache && Date.now() < tokenExpiresAt) return tokenCache;
  const body = new URLSearchParams();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);
  
  const res = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) throw new Error('Auth failed');
  const data = await res.json();
  tokenCache = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 30) * 1000;
  return tokenCache;
}

module.exports = async function handler(req, res) {
  const { icao24 } = req.query;
  if (!icao24) return res.status(200).json([]);

  const end = Math.floor(Date.now() / 1000);
  const beg = end - (14 * 24 * 3600);

  try {
    const OPENSKY_USER = process.env.OPENSKY_USER;
    const OPENSKY_PASS = process.env.OPENSKY_PASS;
    const headers = {};
    
    if (OPENSKY_USER && OPENSKY_PASS) {
      try {
        const token = await getOpenSkyToken(OPENSKY_USER, OPENSKY_PASS);
        headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        console.error('Token fetch failed', e);
      }
    }
    
    const response = await fetch(`https://opensky-network.org/api/flights/aircraft?icao24=${icao24}&begin=${beg}&end=${end}`, {
      headers: headers
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
