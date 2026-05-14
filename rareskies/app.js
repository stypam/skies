// ============================================================
// RARESKIES — app.js
// ============================================================

// ---- RARITY DEFINITIONS ----
const LEGENDARY_TYPES = ['B-2','E-4B','VC-25','E-6B','SR-71','U-2'];
const LEGENDARY_CALLSIGNS = ['SAM','EXEC','AF1','MARINE1'];
const EPIC_TYPES = ['AN-124','B-52','E-3','KC-135','P-8','B-1','E-8','RC-135'];
const EPIC_CALLSIGNS = ['RCH','REACH','JAKE','IRON'];
const RARE_TYPES = ['C-17','C-130','IL-76','V-22','C-5','A400','C-2','E-2'];

function classifyAircraft(state) {
  const cs = (state.callsign || '').trim().toUpperCase();
  const type = guessType(state);

  for (const t of LEGENDARY_TYPES) {
    if (type.includes(t)) return { rarity: 'legendary', type };
  }
  for (const pfx of LEGENDARY_CALLSIGNS) {
    if (cs.startsWith(pfx)) return { rarity: 'legendary', type };
  }
  for (const t of EPIC_TYPES) {
    if (type.includes(t)) return { rarity: 'epic', type };
  }
  for (const pfx of EPIC_CALLSIGNS) {
    if (cs.startsWith(pfx)) return { rarity: 'epic', type };
  }
  for (const t of RARE_TYPES) {
    if (type.includes(t)) return { rarity: 'rare', type };
  }
  return null;
}

function guessType(state) {
  const cs = (state.callsign || '').trim().toUpperCase();
  // Match known military callsign patterns to type guesses
  if (/^SAM\d+/.test(cs)) return 'VC-25 / SAM';
  if (/^EXEC/.test(cs)) return 'E-4B / EXEC';
  if (/^REACH\d+/.test(cs) || /^RCH\d+/.test(cs)) return 'C-17 / REACH';
  if (/^JAKE/.test(cs)) return 'KC-135 / JAKE';
  if (/^IRON/.test(cs)) return 'B-52';
  // Try to use the icao24 hex to recognize known type strings
  // In real data, OpenSky doesn't always provide aircraft type in states/all
  // We'll use callsign heuristics as primary signal
  return cs; // fallback: use callsign as type label
}

function filterCategory(aircraft, filter) {
  if (filter === 'all') return true;
  const cs = (aircraft.state.callsign || '').toUpperCase();
  const r = aircraft.rarity;
  if (filter === 'military') {
    return ['RCH','REACH','JAKE','IRON','SAM','EXEC'].some(p => cs.startsWith(p)) ||
           ['B-2','B-52','E-4B','VC-25','C-17','C-130','E-3','E-6B','RC-135','A400','E-2'].some(t => aircraft.type.includes(t));
  }
  if (filter === 'government') {
    return ['SAM','EXEC','AF1','MARINE'].some(p => cs.startsWith(p)) || r === 'legendary';
  }
  if (filter === 'rare_model') {
    return RARE_TYPES.some(t => aircraft.type.includes(t));
  }
  return true;
}

// ---- STATE ----
let allAircraft = [];
let currentFilter = 'all';
let collection = JSON.parse(localStorage.getItem('rareskies_collection') || '[]');
let aiCache = {};
let countdownVal = 30;
let countdownTimer = null;
let refreshTimer = null;
let selectedAircraft = null;

// ---- OPENSKY FETCH ----
async function fetchAircraft() {
  setStatus('loading');
  try {
    const res = await fetch('https://opensky-network.org/api/states/all');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    processStates(data.states || []);
    setStatus('live');
  } catch (e) {
    setStatus('error');
    console.warn('OpenSky fetch failed:', e.message);
    // Show demo data so UI is not empty
    if (allAircraft.length === 0) loadDemoData();
  }
  startCountdown();
}

function processStates(states) {
  // Fields: [icao24,callsign,origin_country,time_position,last_contact,
  //          longitude,latitude,baro_altitude,on_ground,velocity,
  //          true_track,vertical_rate,sensors,geo_altitude,squawk,spi,position_source]
  const raw = states
    .filter(s => s[8] === false) // on_ground = false
    .map(s => ({
      icao24: s[0],
      callsign: (s[1] || '').trim(),
      origin_country: s[2],
      time_position: s[3],
      last_contact: s[4],
      longitude: s[5],
      latitude: s[6],
      baro_altitude: s[7],
      on_ground: s[8],
      velocity: s[9],
      true_track: s[10],
      vertical_rate: s[11],
      geo_altitude: s[13],
      squawk: s[14],
      spi: s[15],
      position_source: s[16],
    }));

  const classified = [];
  for (const s of raw) {
    const result = classifyAircraft(s);
    if (result) {
      classified.push({ state: s, rarity: result.rarity, type: result.type });
    }
  }
  // Sort: legendary first, then epic, then rare; then alphabetically by callsign
  const order = { legendary: 0, epic: 1, rare: 2 };
  classified.sort((a, b) => order[a.rarity] - order[b.rarity] || (a.state.callsign > b.state.callsign ? 1 : -1));
  allAircraft = classified;
  updateCounts();
  renderList();
}

// ---- DEMO DATA (shown when API fails / CORS blocked) ----
function loadDemoData() {
  const demo = [
    ['demo0','SAM001','United States',null,null,-77.0,38.9,10000,false,250,90,0,null,10500,'7700',false,0],
    ['demo1','IRON21','United States',null,null,-90.0,40.0,12000,false,300,0,0,null,12500,'2000',false,0],
    ['demo2','JAKE01','United States',null,null,-3.0,51.0,7000,false,180,45,0,null,7500,'1400',false,0],
    ['demo3','RCH123','United States',null,null,-80.0,35.0,9000,false,220,180,0,null,9500,'1200',false,0],
    ['demo4','RCH789','United States',null,null,2.0,48.0,11000,false,260,120,0,null,11500,'1500',false,0],
    ['demo5','REACH456','United States',null,null,10.0,52.0,8000,false,200,270,0,null,8500,'1300',false,0],
    ['demo6','EXEC01','United States',null,null,-100.0,45.0,11000,false,270,60,0,null,11500,'5000',false,0],
  ];
  processStates(demo);
}

// ---- RENDER ----
function renderList() {
  const list = document.getElementById('aircraftList');
  const filtered = allAircraft.filter(a => filterCategory(a, currentFilter));
  filteredCache = filtered;

  if (filtered.length === 0) {
    list.innerHTML = '<div class="no-results">BRAK WYNIKÓW DLA WYBRANEGO FILTRA</div>';
    return;
  }

  list.innerHTML = filtered.map((a, i) => rowHTML(a, i)).join('');
}

// Store filtered list for index lookup
let filteredCache = [];

function rowHTML(a, idx) {
  const s = a.state;
  const isCollected = collection.some(c => c.icao24 === s.icao24 && c.callsign === s.callsign);
  const alt = s.baro_altitude ? Math.round(s.baro_altitude) + 'm' : '—';
  const spd = s.velocity ? Math.round(s.velocity * 3.6) + 'km/h' : '—';
  const hdg = s.true_track != null ? Math.round(s.true_track) + '°' : '—';
  const vr = s.vertical_rate != null ? (s.vertical_rate >= 0 ? '▲' : '▼') + Math.abs(Math.round(s.vertical_rate)) + 'm/s' : '—';
  const country = s.origin_country || '—';
  const cs = s.callsign || s.icao24 || '—';
  const pillLabel = { legendary: '★ LEGENDARY', epic: '◆ EPIC', rare: '● RARE' }[a.rarity];
  const safeType = a.type.replace(/'/g,'').replace(/"/g,'');
  const safeCountry = country.replace(/'/g,'').replace(/"/g,'');

  return `<div class="aircraft-row ${a.rarity}" onclick="openDetailByIndex(${idx})">
    <span class="pill ${a.rarity}">${pillLabel}</span>
    <span class="aircraft-callsign">${cs}</span>
    <span class="aircraft-type">${a.type.length > 12 ? a.type.slice(0,12) : a.type}</span>
    <div class="aircraft-meta">
      <span>ALT <span class="val">${alt}</span></span>
      <span>SPD <span class="val">${spd}</span></span>
      <span>HDG <span class="val">${hdg}</span></span>
      <span>VR <span class="val">${vr}</span></span>
    </div>
    <span class="aircraft-country">${country}</span>
    <button class="collect-btn ${isCollected ? 'collected' : ''}"
      onclick="event.stopPropagation();toggleCollectIdx(${idx})"
      title="${isCollected ? 'W kolekcji' : 'Dodaj do kolekcji'}">
      ${isCollected ? '★' : '☆'}
    </button>
  </div>`;
}

function updateCounts() {
  document.getElementById('cntLeg').textContent = allAircraft.filter(a => a.rarity === 'legendary').length;
  document.getElementById('cntEpic').textContent = allAircraft.filter(a => a.rarity === 'epic').length;
  document.getElementById('cntRare').textContent = allAircraft.filter(a => a.rarity === 'rare').length;
  document.getElementById('cntTotal').textContent = allAircraft.length;
}

// ---- FILTER ----
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === f));
  renderList();
}

// ---- STATUS ----
function setStatus(s) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  dot.className = 'status-dot ' + (s === 'live' ? 'live' : s === 'error' ? 'error' : '');
  txt.textContent = s === 'live' ? 'LIVE' : s === 'error' ? 'BŁĄD POŁĄCZENIA' : 'ŁADOWANIE...';
}

// ---- COUNTDOWN ----
function startCountdown() {
  clearInterval(countdownTimer);
  countdownVal = 30;
  document.getElementById('countdown').textContent = countdownVal + 's';
  countdownTimer = setInterval(() => {
    countdownVal--;
    document.getElementById('countdown').textContent = countdownVal + 's';
    if (countdownVal <= 0) {
      clearInterval(countdownTimer);
      fetchAircraft();
    }
  }, 1000);
}

// ---- DETAIL PANEL ----
function openDetailByIndex(idx) {
  try {
    console.log('[RS] openDetailByIndex', idx, 'cache len', filteredCache.length);
    const ac = filteredCache[idx];
    if (!ac) { console.error('[RS] no ac at idx', idx); return; }
    openDetailAc(ac);
  } catch(e) { console.error('[RS] openDetailByIndex error', e); }
}

function openDetail(icao24, callsign) {
  const ac = allAircraft.find(a => String(a.state.icao24) === String(icao24))
          || allAircraft.find(a => String(a.state.callsign) === String(callsign));
  if (!ac) return;
  openDetailAc(ac);
}

function openDetailAc(ac) {
  selectedAircraft = ac;
  const s = ac.state;
  const isCollected = collection.some(c => c.icao24 === s.icao24 && c.callsign === s.callsign);

  const alt_baro = s.baro_altitude != null ? Math.round(s.baro_altitude) + ' m' : '—';
  const alt_geo = s.geo_altitude != null ? Math.round(s.geo_altitude) + ' m' : '—';
  const spd_ms = s.velocity != null ? s.velocity.toFixed(1) + ' m/s' : '—';
  const spd_kmh = s.velocity != null ? Math.round(s.velocity * 3.6) + ' km/h' : '—';
  const hdg = s.true_track != null ? Math.round(s.true_track) + '°' : '—';
  const vr = s.vertical_rate != null ? s.vertical_rate.toFixed(1) + ' m/s' : '—';
  const lat = s.latitude != null ? s.latitude.toFixed(4) : '—';
  const lon = s.longitude != null ? s.longitude.toFixed(4) : '—';
  const squawk = s.squawk || '—';
  const country = s.origin_country || '—';
  const pillLabel = { legendary: '★ LEGENDARY', epic: '◆ EPIC', rare: '● RARE' }[ac.rarity];

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-header">
      <div class="pill ${ac.rarity}" style="margin-bottom:10px;display:inline-flex">${pillLabel}</div>
      <div class="detail-callsign">${s.callsign || s.icao24}</div>
      <div class="detail-type">${ac.type} · ${country}</div>
    </div>
    <div class="data-grid">
      <div class="data-cell"><div class="data-label">ICAO24</div><div class="data-value">${s.icao24}</div></div>
      <div class="data-cell"><div class="data-label">SQUAWK</div><div class="data-value">${squawk}</div></div>
      <div class="data-cell"><div class="data-label">ALT BARO</div><div class="data-value">${alt_baro}</div></div>
      <div class="data-cell"><div class="data-label">ALT GPS</div><div class="data-value">${alt_geo}</div></div>
      <div class="data-cell"><div class="data-label">PRĘDKOŚĆ</div><div class="data-value">${spd_kmh}</div></div>
      <div class="data-cell"><div class="data-label">PRĘDKOŚĆ m/s</div><div class="data-value">${spd_ms}</div></div>
      <div class="data-cell"><div class="data-label">KIERUNEK</div><div class="data-value">${hdg}</div></div>
      <div class="data-cell"><div class="data-label">VERTICAL RATE</div><div class="data-value">${vr}</div></div>
      <div class="data-cell"><div class="data-label">SZEROKOŚĆ</div><div class="data-value">${lat}</div></div>
      <div class="data-cell"><div class="data-label">DŁUGOŚĆ</div><div class="data-value">${lon}</div></div>
      <div class="data-cell"><div class="data-label">KRAJ</div><div class="data-value">${country}</div></div>
      <div class="data-cell"><div class="data-label">ŹRÓDŁO</div><div class="data-value">${posSource(s.position_source)}</div></div>
    </div>
    <div class="ai-section" id="aiSection">
      <div class="ai-label">◈ WYJAŚNIENIE AI</div>
      <div class="ai-loading" id="aiLoading"><span class="ai-spinner"></span> Generuję...</div>
      <div class="ai-text" id="aiText" style="display:none"></div>
    </div>
    <button class="detail-collect-btn ${isCollected ? 'collected' : ''}" id="detailCollectBtn"
      onclick="toggleCollectFromDetail()">
      ${isCollected ? '★ W KOLEKCJI' : '☆ DODAJ DO KOLEKCJI'}
    </button>`;

  document.getElementById('detailOverlay').classList.add('open');
  document.getElementById('detailPanel').classList.add('open');
  fetchAI(ac.type, country);
}

function posSource(v) {
  return ['ADS-B','ASTERIX','MLAT','FLARM'][v] || '—';
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  document.getElementById('detailPanel').classList.remove('open');
}

// ---- AI EXPLANATION ----
async function fetchAI(type, country) {
  const cacheKey = type + '|' + country;
  if (aiCache[cacheKey]) {
    showAIText(aiCache[cacheKey]);
    return;
  }

  const apiKey = localStorage.getItem('rareskies_apikey') || '';
  const proxy = localStorage.getItem('rareskies_proxy') || '';

  if (!apiKey) {
    // Fallback: static descriptions for known types
    const fallback = getFallbackDescription(type);
    aiCache[cacheKey] = fallback;
    showAIText(fallback);
    return;
  }

  const prompt = `W 2 zdaniach po polsku wytłumacz zwykłemu człowiekowi dlaczego ${type} z ${country} jest rzadki i wyjątkowy. Bez żargonu.`;

  try {
    const url = proxy + 'https://api.anthropic.com/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || getFallbackDescription(type);
    aiCache[cacheKey] = text;
    showAIText(text);
  } catch (e) {
    const fb = getFallbackDescription(type);
    aiCache[cacheKey] = fb;
    showAIText(fb);
  }
}

function showAIText(text) {
  const loadEl = document.getElementById('aiLoading');
  const textEl = document.getElementById('aiText');
  if (!loadEl || !textEl) return;
  loadEl.style.display = 'none';
  textEl.style.display = 'block';
  textEl.textContent = text;
}

function getFallbackDescription(type) {
  const t = type.toUpperCase();
  if (t.includes('B-2')) return 'Bombowiec B-2 Spirit to jeden z zaledwie 20 niewidzialnych samolotów na świecie, zdolny do niezauważalnego przebicia się przez każdą obronę powietrzną. Jego budowa kosztowała ponad 2 miliardy dolarów za sztukę — to najdroższy samolot w historii.';
  if (t.includes('E-4B')) return 'E-4B "Nightwatch" to latający ośrodek dowodzenia dla prezydenta USA na wypadek wojny nuklearnej — potocznie zwany "samolot Dnia Zagłady". Na całym świecie istnieją tylko 4 takie maszyny, zawsze gotowe do startu.';
  if (t.includes('VC-25') || t.includes('SAM')) return 'VC-25 to Air Force One — oficjalny samolot prezydenta Stanów Zjednoczonych, rozpoznawany na całym świecie. To ruchome centrum dowodzenia wyposażone w systemy łączności i zabezpieczeń nieosiągalne dla żadnego innego cywilnego samolotu.';
  if (t.includes('AN-124')) return 'Antonow An-124 to jeden z największych samolotów transportowych na świecie, mogący zabrać ponad 150 ton ładunku. Zbudowano ich mniej niż 60 i wciąż nie istnieje wiele maszyn zdolnych transportować tak ciężkie i nieporęczne ładunki.';
  if (t.includes('B-52')) return 'B-52 Stratofortress lata od 1952 roku i nadal aktywnie służy — to jeden z najdłużej eksploatowanych samolotów bojowych w historii. Widok tego giganta to jak podróż w czasie: maszyna zaprojektowana w epoce Stalina nadal patroluje niebo XXI wieku.';
  if (t.includes('C-17')) return 'C-17 Globemaster III to wojskowy transportowiec zdolny do lądowania na krótkich, nieutwardzonych pasach w każdym zakątku świata. Dostarczał pomoc humanitarną, czołgi i żołnierzy w miejsca, gdzie żaden inny duży samolot nie mógłby dolecieć.';
  if (t.includes('KC-135')) return 'KC-135 Stratotanker to latająca cysternia, która uzupełnia paliwo innym samolotom bezpośrednio w powietrzu, umożliwiając loty bez lądowania przez wiele tysięcy kilometrów. Bez takich maszyn nowoczesne lotnictwo wojskowe po prostu nie mogłoby funkcjonować.';
  if (t.includes('P-8')) return 'P-8 Poseidon to zaawansowany samolot patrolowy, który poluje na okręty podwodne za pomocą sonarów i torped, niczym detektyw morski. Każdy lot to prawdziwa operacja wywiadowcza — wykrywanie ukrytych zagrożeń głęboko pod powierzchnią oceanów.';
  if (t.includes('E-3')) return 'E-3 Sentry (AWACS) to latający radar, który widzi wszystkie samoloty w promieniu setek kilometrów i koordynuje całe operacje lotnicze. To latające centrum kontroli bitwy — bez niego piloci myśliwców są jak gracze w szachy bez możliwości widzenia planszy.';
  if (t.includes('IL-76')) return 'Ił-76 to radziecki ciężki transportowiec, który latał nad każdym kontynentem przez ponad 50 lat w barwach wojskowych i humanitarnych. Jego charakterystyczny sylwetka i dźwięk silników sprawiają, że rozpoznają go nawet osoby niezainteresowane lotnictwem.';
  if (t.includes('C-130')) return 'C-130 Hercules to legenda lotnictwa wojskowego produkowana bez przerwy od 1954 roku — żaden inny samolot wojskowy nie był wytwarzany tak długo. Potrafi startować z boisk piłkarskich i lądować na plażach, co czyni go niezastąpionym w każdej kryzysowej misji.';
  if (t.includes('V-22')) return 'V-22 Osprey to połączenie helikoptera i samolotu — startuje pionowo jak śmigłowiec, a następnie obraca silniki i leci jak turbośmigłowiec z dwukrotnie większą prędkością. To jeden z najbardziej innowacyjnych i skomplikowanych statków powietrznych kiedykolwiek zbudowanych.';
  if (t.includes('REACH') || t.includes('RCH')) return 'Samoloty z oznaczeniem REACH to wojskowe maszyny transportowe US Air Force Mobility Command, przemierzające glob w tajnych i jawnych misjach logistycznych. Ich pojawienie się na radarze zwykle oznacza gdzieś na świecie trwa ważna operacja wojskowa lub humanitarna.';
  return 'Ten samolot należy do rzadkiej kategorii maszyn wojskowych lub rządowych, spotykanych niezwykle rzadko na cywilnych ekranach radarowych. Jego obecność w przestrzeni powietrznej to wyjątkowe zdarzenie, które obserwują głównie entuzjaści lotnictwa wojskowego na całym świecie.';
}

// ---- COLLECTION ----
function toggleCollectIdx(idx) {
  const ac = filteredCache[idx];
  if (!ac) return;
  const s = ac.state;
  toggleCollect(s.icao24, s.callsign, ac.rarity, ac.type, s.origin_country);
}

function toggleCollect(icao24, callsign, rarity, type, country) {
  const idx = collection.findIndex(c => c.icao24 === icao24 && c.callsign === callsign);
  if (idx >= 0) {
    collection.splice(idx, 1);
  } else {
    collection.push({ icao24, callsign, rarity, type, country, collectedAt: new Date().toISOString() });
  }
  localStorage.setItem('rareskies_collection', JSON.stringify(collection));
  document.getElementById('trophyCount').textContent = collection.length;
  renderList();
}

function toggleCollectFromDetail() {
  if (!selectedAircraft) return;
  const s = selectedAircraft.state;
  toggleCollect(s.icao24, s.callsign, selectedAircraft.rarity, selectedAircraft.type, s.origin_country);
  // Update button in panel
  const isCollected = collection.some(c => c.icao24 === s.icao24 && c.callsign === s.callsign);
  const btn = document.getElementById('detailCollectBtn');
  if (btn) {
    btn.textContent = isCollected ? '★ W KOLEKCJI' : '☆ DODAJ DO KOLEKCJI';
    btn.className = 'detail-collect-btn ' + (isCollected ? 'collected' : '');
  }
}

function toggleCollection() {
  const panel = document.getElementById('collectionPanel');
  const overlay = document.getElementById('collectionOverlay');
  const isOpen = panel.classList.contains('open');
  if (!isOpen) renderCollection();
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
}

function renderCollection() {
  const el = document.getElementById('collectionContent');
  if (collection.length === 0) {
    el.innerHTML = '<div class="collection-empty">Twoja kolekcja jest pusta.<br>Kliknij ☆ przy samolocie,<br>aby dodać go do kolekcji.</div>';
    return;
  }
  el.innerHTML = collection.map(c => `
    <div class="collection-item">
      <span class="pill ${c.rarity}">${{ legendary:'★ LEGENDARY', epic:'◆ EPIC', rare:'● RARE' }[c.rarity]}</span>
      <div>
        <div class="coll-callsign">${c.callsign}</div>
        <div class="coll-type">${c.type} · ${c.country}</div>
      </div>
      <button class="coll-remove" onclick="removeFromCollection('${c.icao24}','${c.callsign}')">✕</button>
    </div>`).join('');
}

function removeFromCollection(icao24, callsign) {
  collection = collection.filter(c => !(c.icao24 === icao24 && c.callsign === callsign));
  localStorage.setItem('rareskies_collection', JSON.stringify(collection));
  document.getElementById('trophyCount').textContent = collection.length;
  renderCollection();
  renderList();
}

// ---- SETTINGS ----
function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
  document.getElementById('settingsOverlay').classList.toggle('open');
}
function saveApiKey() {
  localStorage.setItem('rareskies_apikey', document.getElementById('apiKeyInput').value);
}
function saveProxy() {
  localStorage.setItem('rareskies_proxy', document.getElementById('proxyInput').value);
}

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('trophyCount').textContent = collection.length;
  // Load saved settings
  const key = localStorage.getItem('rareskies_apikey');
  const proxy = localStorage.getItem('rareskies_proxy');
  if (key) document.getElementById('apiKeyInput').value = key;
  if (proxy) document.getElementById('proxyInput').value = proxy;

  fetchAircraft();
});
