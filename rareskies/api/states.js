let cache = null;
let cacheTime = 0;
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
  const now = Date.now();
  if (cache && (now - cacheTime < 35000)) {
    return res.status(200).json(cache);
  }

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
    
    const response = await fetch('https://opensky-network.org/api/states/all', {
      headers: headers
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
