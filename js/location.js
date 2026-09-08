// UI-laag voor de Locatie-tab: kaart-picker, stijlkeuzes en export.
// Analoog aan main.js, maar voor kaart-kunst i.p.v. de generatieve
// algoritmes — losse module zodat de twee elkaar niet in de weg zitten.
window.LocationApp = (() => {
  const HISTORY_KEY = 'genart-location-history-v1';

  function loadLocationHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }
  function saveLocationHistory(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }
  // Bewaart een miniatuur + metadata, en (als het compact genoeg is) ook een
  // verkleinde kopie van de geometrie voor Showcase — zie buildRecolorGeometry.
  function recordLocationExport(entry) {
    const history = loadLocationHistory();
    history.unshift(entry);
    saveLocationHistory(history);
  }

  const RATIO_PRESETS = [
    { id: '2x3', label: '2:3', w: 2, h: 3 },
    { id: '3x4', label: '3:4', w: 3, h: 4 },
    { id: '4x5', label: '4:5', w: 4, h: 5 },
    { id: '1x1', label: '1:1', w: 1, h: 1 },
    { id: '3x2', label: '3:2', w: 3, h: 2 },
    { id: 'custom', label: 'Custom', w: null, h: null },
  ];

  // Vijf posterlayouts — zie js/mapRender.js voor de tekencode van elk.
  // "Default" is de vertrouwde opmaak (kaart + effen mat met onderschrift
  // eronder); de rest is full-bleed (de kaart vult de hele afbeelding) met
  // het onderschrift er op een eigen manier overheen getekend.
  const LAYOUT_PRESETS = [
    { id: 'default', label: 'Default', hint: 'The map sits above a plain mat that holds the caption.' },
    { id: 'fade', label: 'Fade', hint: 'Full-bleed map — the caption sits directly on it, over a dark fade at the bottom.' },
    { id: 'gallery', label: 'Gallery', hint: 'Like Default, with a thin frame line and museum-label rules around the caption.' },
    { id: 'stamp', label: 'Stamp', hint: 'Full-bleed map with a small captioned label tucked in the bottom-left corner.' },
    { id: 'ledger', label: 'Ledger', hint: 'Full-bleed map with a slim, left-aligned caption strip along the bottom edge.' },
  ];

  // "Masks" knippen de kaart tot een vaste vorm — zie MapRender.render's
  // buildMaskRing voor de tekencode van elke vorm.
  const MASK_PRESETS = [
    { id: 'none', label: 'None' },
    { id: 'circle', label: 'Circle' },
    { id: 'heart', label: 'Heart' },
    { id: 'diamond', label: 'Diamond' },
    { id: 'hexagon', label: 'Hexagon' },
    { id: 'arch', label: 'Arch' },
    { id: 'bloom', label: 'Bloom' },
  ];

  const state = {
    ratioId: '2x3',
    ratio: { w: 2, h: 3 },
    layoutId: 'default',
    maskId: 'none',
    mapPaletteId: MAP_PALETTES[0].id,
    showPlace: true,
    showCountry: true,
    showCoords: true,
    gtaStyle: false,
    mw2Style: false,
    rdr2Style: false,
    isolateArea: false,
    highlightArea: false,
    pins: [], // [{ lat, lon }]
    addingPin: false,
    selectedPlace: null, // { name, rings, bounds } — gevuld zodra een zoekresultaat een bestuurlijke grens blijkt te hebben
    current: null, // { bounds, streets, place, country, lat, lon, isolate, highlight, pins }
    generating: false,
  };

  let map = null;
  let osmLayer = null;
  let satelliteLayer = null;
  let pinMarkers = []; // Leaflet circleMarkers op de picker-kaart, index-voor-index gelijk aan state.pins.
  let pinColorTouched = false;

  function getActivePalette() {
    if (state.gtaStyle) return GTA_STYLE_PALETTE;
    if (state.mw2Style) return MW2_STYLE_PALETTE;
    if (state.rdr2Style) return RDR2_STYLE_PALETTE;
    return getMapPalette(state.mapPaletteId);
  }

  // Een pinkleur die altijd goed opvalt tegen de achtergrond — een fel rood
  // op een lichte kaart, een fel goud op een donkere, tenzij de gebruiker
  // zelf iets anders kiest.
  function relLuminance(hex) {
    const { r, g, b } = Utils.hexToRgb(hex);
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  }
  function autoPinColor(bgHex) {
    return relLuminance(bgHex) > 0.5 ? '#e63946' : '#ffb703';
  }
  function refreshAutoPinColor() {
    if (!pinColorTouched) pinColorInput.value = autoPinColor(getActivePalette().bg);
  }

  const el = id => document.getElementById(id);
  const searchInput = el('locationSearchInput');
  const searchBtn = el('locationSearchBtn');
  const searchResults = el('locationSearchResults');
  const ratioTabs = el('ratioTabs');
  const customRatioRow = el('customRatioRow');
  const customRatioW = el('customRatioW');
  const customRatioH = el('customRatioH');
  const layoutTabs = el('layoutTabs');
  const layoutHint = el('layoutHint');
  const maskTabs = el('maskTabs');
  const addPinBtn = el('addPinBtn');
  const clearPinsBtn = el('clearPinsBtn');
  const pinColorInput = el('pinColorInput');
  const pinAddressInput = el('pinAddressInput');
  const pinAddressSearchBtn = el('pinAddressSearchBtn');
  const pinAddressResults = el('pinAddressResults');
  const overlayEl = el('locationOverlay');
  const generateBtn = el('locationGenerateBtn');
  const statusEl = el('locationStatus');
  const paletteGrid = el('mapPaletteGrid');
  const showPlaceCheck = el('showPlaceCheck');
  const placeNameInput = el('placeNameInput');
  const showCountryCheck = el('showCountryCheck');
  const countryNameInput = el('countryNameInput');
  const showCoordsCheck = el('showCoordsCheck');
  const isolateAreaCheck = el('isolateAreaCheck');
  const isolateAreaHint = el('isolateAreaHint');
  const highlightAreaCheck = el('highlightAreaCheck');
  const highlightAreaHint = el('highlightAreaHint');
  const gtaStyleCheck = el('gtaStyleCheck');
  const gtaStyleHint = el('gtaStyleHint');
  const mw2StyleCheck = el('mw2StyleCheck');
  const mw2StyleHint = el('mw2StyleHint');
  const rdr2StyleCheck = el('rdr2StyleCheck');
  const rdr2StyleHint = el('rdr2StyleHint');
  const areaTierHint = el('areaTierHint');
  const resultPanel = el('locationResult');
  const resultPreview = el('locationResultPreview');
  const exportPanel = el('locationExportPanel');
  const exportSizeSelect = el('locationExportSize');
  const exportSVGBtn = el('locationExportSVGBtn');
  const exportPNGBtn = el('locationExportPNGBtn');
  const exportStatus = el('locationExportStatus');

  function init() {
    RATIO_PRESETS.forEach(r => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = r.label;
      btn.dataset.ratioId = r.id;
      btn.className = r.id === state.ratioId ? 'active' : '';
      btn.addEventListener('click', () => selectRatio(r.id));
      ratioTabs.appendChild(btn);
    });

    [customRatioW, customRatioH].forEach(inp => inp.addEventListener('input', () => {
      if (state.ratioId !== 'custom') return;
      applyCustomRatio();
    }));

    LAYOUT_PRESETS.forEach(l => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = l.label;
      btn.dataset.layoutId = l.id;
      btn.className = l.id === state.layoutId ? 'active' : '';
      btn.addEventListener('click', () => selectLayout(l.id));
      layoutTabs.appendChild(btn);
    });
    layoutHint.textContent = LAYOUT_PRESETS.find(l => l.id === state.layoutId).hint;

    MASK_PRESETS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = m.label;
      btn.dataset.maskId = m.id;
      btn.className = m.id === state.maskId ? 'active' : '';
      btn.addEventListener('click', () => selectMask(m.id));
      maskTabs.appendChild(btn);
    });

    addPinBtn.addEventListener('click', () => {
      state.addingPin = !state.addingPin;
      addPinBtn.classList.toggle('active', state.addingPin);
      addPinBtn.textContent = state.addingPin ? 'Click the map…' : 'Add pin';
    });
    clearPinsBtn.addEventListener('click', clearPins);
    pinColorInput.addEventListener('input', () => {
      pinColorTouched = true;
      pinMarkers.forEach(m => m && m.setStyle && m.setStyle({ fillColor: pinColorInput.value }));
      if (state.current) renderResult();
    });
    pinAddressSearchBtn.addEventListener('click', runPinAddressSearch);
    pinAddressInput.addEventListener('keydown', e => { if (e.key === 'Enter') runPinAddressSearch(); });
    refreshAutoPinColor();

    MAP_PALETTES.forEach(p => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'map-palette-card' + (p.id === state.mapPaletteId ? ' active' : '');
      card.dataset.paletteId = p.id;
      const strip = document.createElement('div');
      strip.className = 'swatch-strip';
      [p.bg, p.water, p.park, p.road].forEach(c => {
        const sw = document.createElement('span');
        sw.style.background = c;
        strip.appendChild(sw);
      });
      const name = document.createElement('div');
      name.className = 'map-palette-name';
      name.textContent = p.name;
      card.appendChild(strip);
      card.appendChild(name);
      card.addEventListener('click', () => {
        state.mapPaletteId = p.id;
        [...paletteGrid.children].forEach(c => c.classList.toggle('active', c.dataset.paletteId === p.id));
        refreshAutoPinColor();
        if (state.current) renderResult();
      });
      paletteGrid.appendChild(card);
    });

    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    generateBtn.addEventListener('click', generate);

    [showPlaceCheck, showCountryCheck, showCoordsCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showPlace = showPlaceCheck.checked;
      state.showCountry = showCountryCheck.checked;
      state.showCoords = showCoordsCheck.checked;
      if (state.current) renderResult();
    }));

    // Isoleren (weg-knippen) en uitlichten (omgeving laten staan maar
    // vervagen) zijn twee verschillende weergaven van dezelfde opgezochte
    // grens — elkaar dus uitsluitend, net als de Game Styles hieronder.
    isolateAreaCheck.addEventListener('change', () => {
      state.isolateArea = isolateAreaCheck.checked;
      if (state.isolateArea) { state.highlightArea = false; highlightAreaCheck.checked = false; }
      if (state.current) generate();
    });
    highlightAreaCheck.addEventListener('change', () => {
      state.highlightArea = highlightAreaCheck.checked;
      if (state.highlightArea) { state.isolateArea = false; isolateAreaCheck.checked = false; }
      if (state.current) generate();
    });

    // GTA V, OG MW2 en RDR2 zijn elk een vast, alles-vervangend kleurenschema
    // — elkaar dus uitsluitend, net als hun eigen kleurenpalet-lock. Elke
    // wissel kan de isolatie-bron veranderen (alleen MW2/RDR2 forceren die),
    // dus altijd opnieuw genereren, niet alleen opnieuw tekenen.
    gtaStyleCheck.addEventListener('change', () => setGameStyle(gtaStyleCheck.checked ? 'gta' : null));
    mw2StyleCheck.addEventListener('change', () => setGameStyle(mw2StyleCheck.checked ? 'mw2' : null));
    rdr2StyleCheck.addEventListener('change', () => setGameStyle(rdr2StyleCheck.checked ? 'rdr2' : null));

    [placeNameInput, countryNameInput].forEach(inp => inp.addEventListener('input', applyCaptionNameOverrides));

    exportSVGBtn.addEventListener('click', () => exportResult(true));
    exportPNGBtn.addEventListener('click', () => exportResult(false));

    window.addEventListener('resize', () => { if (map) updateOverlaySize(); });
  }

  function setGameStyle(style) {
    state.gtaStyle = style === 'gta';
    state.mw2Style = style === 'mw2';
    state.rdr2Style = style === 'rdr2';
    gtaStyleCheck.checked = state.gtaStyle;
    mw2StyleCheck.checked = state.mw2Style;
    rdr2StyleCheck.checked = state.rdr2Style;
    gtaStyleHint.hidden = !state.gtaStyle;
    mw2StyleHint.hidden = !state.mw2Style;
    rdr2StyleHint.hidden = !state.rdr2Style;
    paletteGrid.classList.toggle('disabled', !!style);
    updatePickerTileLayer();
    refreshAutoPinColor();
    if (state.current) generate();
  }

  function selectRatio(id) {
    state.ratioId = id;
    [...ratioTabs.children].forEach(b => b.classList.toggle('active', b.dataset.ratioId === id));
    customRatioRow.hidden = id !== 'custom';
    if (id === 'custom') { applyCustomRatio(); return; }
    const preset = RATIO_PRESETS.find(r => r.id === id);
    state.ratio = { w: preset.w, h: preset.h };
    updateOverlaySize();
  }

  function applyCustomRatio() {
    const w = Math.max(1, parseFloat(customRatioW.value) || 1);
    const h = Math.max(1, parseFloat(customRatioH.value) || 1);
    state.ratio = { w, h };
    updateOverlaySize();
  }

  // Een layout is puur een tekenkeuze (zie MapRender.render) — geen nieuwe
  // Overpass-data nodig, dus gewoon opnieuw tekenen i.p.v. opnieuw genereren.
  function selectLayout(id) {
    state.layoutId = id;
    [...layoutTabs.children].forEach(b => b.classList.toggle('active', b.dataset.layoutId === id));
    layoutHint.textContent = LAYOUT_PRESETS.find(l => l.id === id).hint;
    if (state.current) renderResult();
  }

  // Een mask is, net als een layout, puur een tekenkeuze — geen nieuwe data
  // nodig, dus gewoon opnieuw tekenen.
  function selectMask(id) {
    state.maskId = id;
    [...maskTabs.children].forEach(b => b.classList.toggle('active', b.dataset.maskId === id));
    if (state.current) renderResult();
  }

  // ---- pins ----
  // Pins worden vastgelegd als platte { lat, lon } in state.pins (zo kunnen
  // ze zonder omwegen mee de geschiedenis/Showcase-opslag in); de bijbehorende
  // Leaflet circleMarker op de picker-kaart houden we er apart naast (index
  // voor index gelijk), puur voor de live preview + het aanklikken om te
  // verwijderen.
  function addPin(lat, lon) {
    state.pins.push({ lat, lon });
    const marker = (map && typeof map.on === 'function' && typeof L !== 'undefined' && typeof L.circleMarker === 'function')
      ? L.circleMarker([lat, lon], { radius: 6, color: '#ffffff', weight: 2, fillColor: pinColorInput.value || '#e63946', fillOpacity: 1 }).addTo(map)
      : null;
    if (marker) marker.on('click', () => removePinAt(pinMarkers.indexOf(marker)));
    pinMarkers.push(marker);
    syncPinsToCurrent();
  }

  function removePinAt(idx) {
    if (idx < 0) return;
    const marker = pinMarkers[idx];
    if (map && marker) map.removeLayer(marker);
    pinMarkers.splice(idx, 1);
    state.pins.splice(idx, 1);
    syncPinsToCurrent();
  }

  function clearPins() {
    pinMarkers.forEach(m => { if (map && m) map.removeLayer(m); });
    pinMarkers = [];
    state.pins = [];
    syncPinsToCurrent();
  }

  // Naast klikken op de kaart kan een pin ook op een getypt adres gezet
  // worden — dezelfde Nominatim-zoekopdracht als "Search for a place"
  // hierboven, maar het resultaat wordt alleen als pin toegevoegd (het
  // gekozen kader/gebied blijft ongewijzigd).
  async function runPinAddressSearch() {
    const q = pinAddressInput.value.trim();
    if (!q) return;
    pinAddressResults.hidden = false;
    pinAddressResults.innerHTML = '<div class="location-search-result">Searching…</div>';
    try {
      const results = await MapGeo.searchPlace(q);
      pinAddressResults.innerHTML = '';
      if (results.length === 0) {
        pinAddressResults.innerHTML = '<div class="location-search-result">Nothing found.</div>';
        return;
      }
      results.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'location-search-result';
        btn.textContent = r.display_name;
        btn.addEventListener('click', () => {
          addPin(parseFloat(r.lat), parseFloat(r.lon));
          pinAddressResults.hidden = true;
          pinAddressInput.value = '';
        });
        pinAddressResults.appendChild(btn);
      });
    } catch (err) {
      pinAddressResults.innerHTML = `<div class="location-search-result">Search failed: ${err.message}</div>`;
    }
  }

  function syncPinsToCurrent() {
    if (!state.current) return;
    state.current.pins = state.pins.map(p => ({ lat: p.lat, lon: p.lon }));
    renderResult();
  }

  // ---- kaart (Leaflet) ----
  function ensureMap() {
    if (map) return;
    if (typeof L === 'undefined') {
      el('locationMap').innerHTML = '<p class="hint" style="padding:16px;">Could not load the map library. Check your internet connection and reload the page.</p>';
      return;
    }
    map = L.map('locationMap', { attributionControl: true }).setView([52.3676, 4.9041], 13);
    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers',
    });
    // Gratis, geen API-key nodig (i.t.t. Google Maps) — alleen als ondergrond
    // om een gebied te herkennen voor OG MW2; de export zelf bevat geen
    // satellietpixels, alleen de getekende MW2-stijl (zie MapRender).
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    });
    (state.mw2Style ? satelliteLayer : osmLayer).addTo(map);
    // "Add pin"-modus: een klik op de kaart plaatst een pin op die plek.
    if (typeof map.on === 'function') {
      map.on('click', e => { if (state.addingPin) addPin(e.latlng.lat, e.latlng.lng); });
    }
    updateOverlaySize();
  }

  function updatePickerTileLayer() {
    if (!map || !osmLayer || !satelliteLayer) return;
    const wantSatellite = state.mw2Style;
    if (map.removeLayer) map.removeLayer(wantSatellite ? osmLayer : satelliteLayer);
    (wantSatellite ? satelliteLayer : osmLayer).addTo(map);
  }

  function onShow() {
    ensureMap();
    setTimeout(() => { if (map) { map.invalidateSize(); updateOverlaySize(); } }, 50);
  }

  function updateOverlaySize() {
    const wrap = overlayEl.parentElement;
    const margin = 28;
    const availW = Math.max(40, wrap.clientWidth - margin * 2);
    const availH = Math.max(40, wrap.clientHeight - margin * 2);
    const ratio = state.ratio.w / state.ratio.h;
    let w, h;
    if (availW / availH > ratio) { h = availH; w = h * ratio; }
    else { w = availW; h = w / ratio; }
    overlayEl.style.width = `${w}px`;
    overlayEl.style.height = `${h}px`;
  }

  function getOverlayBounds() {
    const mapEl = el('locationMap');
    const overlayRect = overlayEl.getBoundingClientRect();
    const mapRect = mapEl.getBoundingClientRect();
    const nw = map.containerPointToLatLng([overlayRect.left - mapRect.left, overlayRect.top - mapRect.top]);
    const se = map.containerPointToLatLng([overlayRect.right - mapRect.left, overlayRect.bottom - mapRect.top]);
    return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
  }

  // ---- zoeken ----
  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchResults.hidden = false;
    searchResults.innerHTML = '<div class="location-search-result">Searching…</div>';
    try {
      const results = await MapGeo.searchPlace(q);
      searchResults.innerHTML = '';
      if (results.length === 0) {
        searchResults.innerHTML = '<div class="location-search-result">Nothing found.</div>';
        return;
      }
      results.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'location-search-result';
        btn.textContent = r.display_name;
        btn.addEventListener('click', () => selectSearchResult(r, q));
        searchResults.appendChild(btn);
      });
    } catch (err) {
      searchResults.innerHTML = `<div class="location-search-result">Search failed: ${err.message}</div>`;
    }
  }

  // Naast de kaart verplaatsen, ook de exacte bestuurlijke grens van dit
  // resultaat proberen op te halen — dat is wat "Isoleer gebied" gebruikt om
  // precies deze wijk/stad/land/werelddeel uit te snijden, i.p.v. wat er
  // toevallig in het handmatige kader staat. Niet elk resultaat heeft zo'n
  // grens (bv. een los adres); dan blijft de optie uitgeschakeld.
  function selectSearchResult(result, query) {
    // Het selectie-kader staat altijd in het midden van de kaart-picker (zie
    // .location-overlay in style.css), dus het centreren van de kaart op het
    // gekozen resultaat centreert daarmee ook meteen het kader erop — handig
    // vooral voor een verzoek om een specifiek adres. Zoom 16 (i.p.v. het
    // eerdere 12, dat een hele wijk liet zien) toont een paar straten rond
    // het adres, precies genoeg om zonder verder handmatig bijstellen te
    // kunnen genereren.
    map.setView([parseFloat(result.lat), parseFloat(result.lon)], 16);
    searchResults.hidden = true;

    // De letterlijk getypte zoekterm bewaren we apart van display_name: bij
    // "Isoleer gebied" gebruiken we die als plaatsnaam-onderschrift, want een
    // reverse-geocode van het middelpunt van een regio/land wijst vaak een
    // toevallige kleine plaats daarbinnen aan (bv. "Twente" -> "Ambt Delden").
    state.selectedPlace = { name: result.display_name, query, rings: null, bounds: null };
    state.isolateArea = false;
    state.highlightArea = false;
    placeNameInput.value = '';
    countryNameInput.value = '';
    isolateAreaCheck.checked = false;
    isolateAreaCheck.disabled = true;
    isolateAreaHint.hidden = false;
    isolateAreaHint.textContent = 'Fetching area boundary…';
    highlightAreaCheck.checked = false;
    highlightAreaCheck.disabled = true;
    highlightAreaHint.hidden = false;
    highlightAreaHint.textContent = 'Fetching area boundary…';

    MapGeo.fetchBoundary(result).then(boundary => {
      if (!state.selectedPlace || state.selectedPlace.name !== result.display_name) return;
      if (!boundary) {
        isolateAreaHint.textContent = `No exact area boundary available for "${result.display_name}".`;
        highlightAreaHint.textContent = `No exact area boundary available for "${result.display_name}".`;
        return;
      }
      state.selectedPlace.rings = boundary.rings;
      state.selectedPlace.bounds = boundary.bounds;
      isolateAreaCheck.disabled = false;
      isolateAreaHint.textContent = `Isolate exactly the boundary of "${result.display_name}".`;
      highlightAreaCheck.disabled = false;
      highlightAreaHint.textContent = `Highlight exactly the boundary of "${result.display_name}", fading everything else.`;
    }).catch(err => {
      isolateAreaHint.textContent = `Fetching area boundary failed: ${err.message}`;
      highlightAreaHint.textContent = `Fetching area boundary failed: ${err.message}`;
    });
  }

  // ---- genereren ----
  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Large area selected — only main roads are shown, to keep the map fast and readable.',
    country: 'Very large area (country level) selected — only main roads and major bodies of water are shown.',
    continent: 'Continent level selected — at this scale, street/road data isn\'t meaningful; only the silhouette of the area is drawn.',
  };

  function applyAreaTier(tier) {
    areaTierHint.textContent = AREA_TIER_NOTE[tier] || '';
    areaTierHint.hidden = !AREA_TIER_NOTE[tier];
  }

  async function generate() {
    if (state.generating) return;
    if (!map) {
      statusEl.textContent = 'The map hasn\'t loaded yet — check your internet connection and reload the page.';
      return;
    }
    state.generating = true;
    generateBtn.disabled = true;
    statusEl.textContent = 'Fetching map data…';
    try {
      // OG MW2 en RDR2 isoleren altijd — met een gekozen plaatsgrens indien
      // beschikbaar, anders gewoon het handmatig gekozen kader zelf (zodat
      // de stijl ook zonder zoekopdracht bruikbaar is).
      const forcesIsolate = state.mw2Style || state.rdr2Style;
      const hasRealBoundary = !!(state.selectedPlace && state.selectedPlace.rings);
      const wantsIsolate = state.isolateArea || forcesIsolate;
      const isolating = wantsIsolate && (hasRealBoundary || forcesIsolate);
      // "Highlight area" gebruikt, anders dan isoleren, gewoon het handmatig
      // gekozen kader als bounds (de omgeving moet immers intact blijven) —
      // de opgezochte grens dient hier alleen om te bepalen wát er vervaagd
      // wordt, niet om op te knippen. Isoleren (of een Game Style die dat
      // forceert) gaat altijd voor: highlighten heeft dan geen betekenis.
      const highlighting = !isolating && state.highlightArea && hasRealBoundary;
      let bounds, isolateRings = null;
      if (isolating && hasRealBoundary) {
        bounds = state.selectedPlace.bounds;
        isolateRings = state.selectedPlace.rings;
      } else if (isolating) {
        bounds = getOverlayBounds();
        const { north, south, east, west } = bounds;
        isolateRings = [[[north, west], [north, east], [south, east], [south, west]]];
      } else {
        bounds = getOverlayBounds();
      }
      const tier = MapGeo.classifyAreaTier(bounds);
      applyAreaTier(tier);
      const styleHint = state.gtaStyle ? 'gta' : state.rdr2Style ? 'rdr2' : null;
      const streets = await MapGeo.fetchStreets(bounds, tier, styleHint);
      let buildings = [];
      if (state.mw2Style) {
        statusEl.textContent = 'Fetching buildings…';
        buildings = await MapGeo.fetchBuildings(bounds, tier);
      }
      const centerLat = (bounds.north + bounds.south) / 2;
      const centerLon = (bounds.east + bounds.west) / 2;
      let place = '', country = '';
      if ((isolating || highlighting) && hasRealBoundary) {
        // Geen reverse-geocode nodig (en die zou hier ook het verkeerde
        // antwoord geven — het middelpunt van een regio/land ligt vaak
        // toevallig in een kleine plaats daarbinnen). De letterlijke
        // zoekterm is wat de gebruiker bedoelde; het land halen we uit het
        // laatste onderdeel van de volledige naam die Nominatim teruggaf.
        const parts = state.selectedPlace.name.split(',').map(s => s.trim()).filter(Boolean);
        place = state.selectedPlace.query || parts[0] || state.selectedPlace.name;
        country = parts.length > 1 ? parts[parts.length - 1] : '';
      } else {
        statusEl.textContent = 'Looking up place name…';
        try {
          const geo = await MapGeo.reverseGeocode(centerLat, centerLon);
          place = geo.place; country = geo.country;
        } catch (geoErr) {
          statusEl.textContent = `Map fetched, but the place name could not be determined (${geoErr.message}).`;
        }
      }
      // De invulvelden tonen wat automatisch bepaald is, maar blijven altijd
      // aanpasbaar — automatische plaatsnaam-detectie is niet altijd
      // betrouwbaar (zeker bij isoleren), dus dit is het vangnet.
      if (!placeNameInput.value.trim()) placeNameInput.value = place;
      if (!countryNameInput.value.trim()) countryNameInput.value = country;
      state.current = {
        bounds, tier, streets, buildings, lat: centerLat, lon: centerLon,
        autoPlace: place, autoCountry: country,
        place: placeNameInput.value.trim() || place,
        country: countryNameInput.value.trim() || country,
        isolate: isolating ? { rings: isolateRings } : null,
        highlight: highlighting ? { rings: state.selectedPlace.rings } : null,
        pins: state.pins.map(p => ({ lat: p.lat, lon: p.lon })),
      };
      refreshAutoPinColor();
      renderResult();
      updateExportSizes();
      resultPanel.hidden = false;
      exportPanel.hidden = false;
      statusEl.textContent = isolating
        ? `Done — area isolated (${tier} level)${state.mw2Style ? ` · ${buildings.length} buildings` : ''}.`
        : highlighting
        ? `Done — area highlighted (${tier} level).`
        : `Done — ${streets.length} elements loaded.`;
    } catch (err) {
      statusEl.textContent = `Fetch failed: ${err.message}. Try a smaller area or try again.`;
    } finally {
      state.generating = false;
      generateBtn.disabled = false;
    }
  }

  // Handmatige correctie van plaatsnaam/land — altijd beschikbaar, niet
  // alleen bij isoleren, want automatische detectie kan altijd een keer
  // misgrijpen. Leeg veld = terugvallen op de automatisch bepaalde waarde.
  function applyCaptionNameOverrides() {
    if (!state.current) return;
    state.current.place = placeNameInput.value.trim() || state.current.autoPlace;
    state.current.country = countryNameInput.value.trim() || state.current.autoCountry;
    renderResult();
  }

  function renderResult() {
    if (!state.current) return;
    const ratio = state.ratio.w / state.ratio.h;
    const previewH = 640;
    const previewW = Math.round(previewH * ratio);
    resultPreview.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = previewW; canvas.height = previewH;
    resultPreview.appendChild(canvas);
    drawArtwork(new CanvasPainter(canvas.getContext('2d'), previewW, previewH), previewW, previewH);
  }

  function drawArtwork(painter, w, h) {
    const c = state.current;
    MapRender.render(painter, w, h, {
      bounds: c.bounds,
      streets: c.streets,
      buildings: c.buildings || [],
      palette: getMapPalette(state.mapPaletteId),
      gtaStyle: state.gtaStyle,
      mw2Style: state.mw2Style,
      rdr2Style: state.rdr2Style,
      tier: c.tier,
      isolate: c.isolate,
      highlight: c.highlight,
      layout: state.layoutId,
      mask: state.maskId,
      pins: c.pins || [],
      pinColor: pinColorInput.value,
      caption: {
        showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords,
        place: c.place, country: c.country, lat: c.lat, lon: c.lon,
      },
    });
  }

  // ---- export ----
  function updateExportSizes() {
    exportSizeSelect.innerHTML = '';
    Utils.computeExportSizes(state.ratio.w, state.ratio.h).forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.label; opt.dataset.w = s.w; opt.dataset.h = s.h;
      if (i === 1) opt.selected = true;
      exportSizeSelect.appendChild(opt);
    });
  }

  // Bewaart daarnaast (indien compact genoeg) een verkleinde kopie van de
  // geometrie, zodat de Showcase-tab dezelfde kaart later in elk kleurpalet
  // opnieuw kan tekenen — alleen tags die MapRender echt gebruikt, en een
  // harde grootte-cap zodat één grote export niet de hele geschiedenis in
  // localStorage opeet.
  const RECOLOR_MAX_JSON_LENGTH = 180000;

  function trimStreetsForStorage(streets) {
    return streets.map(s => {
      const tags = {
        highway: s.tags.highway, waterway: s.tags.waterway, natural: s.tags.natural,
        leisure: s.tags.leisure, landuse: s.tags.landuse, name: s.tags.name,
      };
      // Grote wateroppervlaktes uit een multipolygon-relatie (bijv. een baai
      // met een eiland erin) dragen "rings" i.p.v. "coords" — zie
      // MapGeo.parseAreaRelations. Zonder dit onderscheid zou de opgeslagen
      // geschiedenis/Showcase-versie zo'n water gewoon kwijtraken.
      return s.rings ? { tags, rings: s.rings } : { tags, coords: s.coords };
    });
  }

  function trimBuildingsForStorage(buildings) {
    return buildings.map(b => ({ coords: b.coords }));
  }

  function buildRecolorGeometry() {
    const c = state.current;
    const payload = {
      bounds: c.bounds,
      streets: trimStreetsForStorage(c.streets),
      buildings: trimBuildingsForStorage(c.buildings || []),
      ratio: state.ratio,
      layout: state.layoutId,
      mask: state.maskId,
      pins: c.pins || [],
      pinColor: pinColorInput.value,
      tier: c.tier,
      isolate: c.isolate || null,
      highlight: c.highlight || null,
    };
    return JSON.stringify(payload).length <= RECOLOR_MAX_JSON_LENGTH ? payload : null;
  }

  function makeHistoryThumbnail() {
    const ratio = state.ratio.w / state.ratio.h;
    // A bit larger than strictly needed for the history list itself, so it
    // still looks reasonable if reused/enlarged elsewhere.
    const th = 340;
    const tw = Math.round(th * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = tw; canvas.height = th;
    drawArtwork(new CanvasPainter(canvas.getContext('2d'), tw, th), tw, th);
    return canvas.toDataURL('image/png');
  }

  function exportResult(wantSVG) {
    if (!state.current) return;
    const opt = exportSizeSelect.selectedOptions[0];
    const w = parseInt(opt.dataset.w, 10), h = parseInt(opt.dataset.h, 10);
    exportStatus.textContent = `Rendering at ${w}×${h}px…`;
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    setTimeout(() => {
      const place = (state.current.place || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().slice(0, 10);
      if (wantSVG) {
        const painter = new SVGPainter(w, h);
        drawArtwork(painter, w, h);
        Utils.downloadSVGString(painter.toString(), `location-${place}-${opt.value}-${date}.svg`);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        drawArtwork(new CanvasPainter(canvas.getContext('2d'), w, h), w, h);
        Utils.downloadCanvasPNG(canvas, `location-${place}-${opt.value}-${date}.png`);
      }
      recordLocationExport({
        thumbnail: makeHistoryThumbnail(),
        place: state.current.place,
        country: state.current.country,
        lat: state.current.lat,
        lon: state.current.lon,
        paletteName: state.gtaStyle ? GTA_STYLE_PALETTE.name : state.mw2Style ? MW2_STYLE_PALETTE.name : state.rdr2Style ? RDR2_STYLE_PALETTE.name : getMapPalette(state.mapPaletteId).name,
        format: wantSVG ? 'svg' : 'png',
        sizeLabel: opt.textContent,
        timestamp: Date.now(),
        recolor: buildRecolorGeometry(),
      });
      exportStatus.textContent = 'Saved.';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    }, 20);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onShow, getHistory: loadLocationHistory };
})();
