export default async function handler(req, res) {
  const { type, country, alt, spd, hdg, vr } = req.query;
  const tp = decodeURIComponent(type || '');
  const co = decodeURIComponent(country || '');
  
  const CLAUDE_KEY = process.env.CLAUDE_KEY;
  if (!CLAUDE_KEY || CLAUDE_KEY === 'WKLEJ_TUTAJ_KLUCZ_CLAUDE') {
    return res.status(200).json({ text: null });
  }
  
  const telemetry = `Wysokosc:${alt} m, Predkosc:${spd} km/h, Predkosc pionowa:${vr} m/s, Kierunek:${hdg} st.`;
  const pr = `Napisz 3-4 fascynujace zdania po polsku o maszynie ${tp} z ${co}. Najpierw krotko przypomnij do czego powstal ten sprzet, a nastepnie na podstawie danych lotu (${telemetry}) sprobuj zabawnie lub zwiadowczo odgadnac co on TERAZ robi na niebie (np. wznosi sie dynamicznie, zrzuca zop/ladunek, tankuje, patroluje powoli na niskim pulapie, pedzi w misji przechwytujacej). Uzyj fajnego, wywiadowczego stylu!`;
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 350,
        messages: [{ role: 'user', content: pr }]
      })
    });
    
    if (!response.ok) {
      return res.status(200).json({ text: null });
    }
    
    const data = await response.json();
    let txt = data.content[0].text;
    txt = txt.replace(/\n/g, ' ').replace(/\r/g, '');
    
    return res.status(200).json({ text: txt });
  } catch (error) {
    return res.status(200).json({ text: null });
  }
}
