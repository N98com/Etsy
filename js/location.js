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
    { id: 'custom', label: 'Aangepast', w: null, h: null },
  ];

  const state = {
    ratioId: '2x3',
    ratio: { w: 2, h: 3 },
    mapPaletteId: MAP_PALETTES[0].id,
    showStreetLabels: false,
    showLandmarks: false,
    showPlace: true,
    showCountry: true,
    showCoords: true,
    gtaStyle: false,
    mw2Style: false,
    rdr2Style: false,
    landmarkIcon: 'star',
    isolateArea: false,
    selectedPlace: null, // { name, rings, bounds } — gevuld zodra een zoekresultaat een bestuurlijke grens blijkt te hebben
    safehouse: null, // { u, v } — genormaliseerde positie binnen het kaartvlak (0..1), alleen relevant/getekend bij GTA V
    current: null, // { bounds, streets, landmarks, place, country, lat, lon, isolate }
    generating: false,
  };

  let map = null;
  let osmLayer = null;
  let satelliteLayer = null;
  let streetLabelColorTouched = false;
  let landmarkColorTouched = false;

  function getActivePalette() {
    if (state.gtaStyle) return GTA_STYLE_PALETTE;
    if (state.mw2Style) return MW2_STYLE_PALETTE;
    if (state.rdr2Style) return RDR2_STYLE_PALETTE;
    return getMapPalette(state.mapPaletteId);
  }

  // Een label-kleur die altijd goed afsteekt tegen de achtergrond, los van
  // wegen-/tekstkleur (die soms te dicht bij elkaar liggen om als straatnaam
  // op te vallen) — warm amber op een donkere kaart, warm roodbruin op een
  // lichte, tenzij de gebruiker zelf iets anders kiest.
  function relLuminance(hex) {
    const { r, g, b } = Utils.hexToRgb(hex);
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  }
  function autoLabelColor(bgHex) {
    return relLuminance(bgHex) > 0.5 ? '#8a3d1f' : '#f2c14e';
  }
  function refreshAutoLabelColors() {
    const auto = autoLabelColor(getActivePalette().bg);
    if (!streetLabelColorTouched) streetLabelColorInput.value = auto;
    if (!landmarkColorTouched) landmarkColorInput.value = auto;
  }

  const el = id => document.getElementById(id);
  const searchInput = el('locationSearchInput');
  const searchBtn = el('locationSearchBtn');
  const searchResults = el('locationSearchResults');
  const ratioTabs = el('ratioTabs');
  const customRatioRow = el('customRatioRow');
  const customRatioW = el('customRatioW');
  const customRatioH = el('customRatioH');
  const overlayEl = el('locationOverlay');
  const generateBtn = el('locationGenerateBtn');
  const statusEl = el('locationStatus');
  const paletteGrid = el('mapPaletteGrid');
  const showStreetLabelsCheck = el('showStreetLabelsCheck');
  const streetLabelColorInput = el('streetLabelColorInput');
  const showLandmarksCheck = el('showLandmarksCheck');
  const landmarkColorInput = el('landmarkColorInput');
  const landmarkIconSelect = el('landmarkIconSelect');
  const showPlaceCheck = el('showPlaceCheck');
  const placeNameInput = el('placeNameInput');
  const showCountryCheck = el('showCountryCheck');
  const countryNameInput = el('countryNameInput');
  const showCoordsCheck = el('showCoordsCheck');
  const isolateAreaCheck = el('isolateAreaCheck');
  const isolateAreaHint = el('isolateAreaHint');
  const gtaStyleCheck = el('gtaStyleCheck');
  const gtaStyleHint = el('gtaStyleHint');
  const mw2StyleCheck = el('mw2StyleCheck');
  const mw2StyleHint = el('mw2StyleHint');
  const rdr2StyleCheck = el('rdr2StyleCheck');
  const rdr2StyleHint = el('rdr2StyleHint');
  const safehousePanel = el('safehousePanel');
  const safehouseAddressInput = el('safehouseAddressInput');
  const safehouseAddBtn = el('safehouseAddBtn');
  const safehouseStatus = el('safehouseStatus');
  const safehouseRemoveBtn = el('safehouseRemoveBtn');
  const streetLabelsHint = el('streetLabelsHint');
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
        refreshAutoLabelColors();
        if (state.current) renderResult();
      });
      paletteGrid.appendChild(card);
    });

    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    generateBtn.addEventListener('click', generate);

    [showStreetLabelsCheck, showLandmarksCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showStreetLabels = showStreetLabelsCheck.checked;
      state.showLandmarks = showLandmarksCheck.checked;
      // Landmarks vereisen een aparte Overpass-call; als die nog niet
      // opgehaald is voor het huidige gebied, opnieuw genereren.
      if (state.showLandmarks && state.current && !state.current.landmarks) { generate(); return; }
      if (state.current) renderResult();
    }));

    // De kleur staat altijd klaar (ook als de bijbehorende checkbox uit
    // staat) en wordt automatisch op een goed-contrasterende tint gezet
    // zodra er een nieuwe kaart/stijl komt — tenzij de gebruiker 'm zelf al
    // een keer heeft aangepast, dan blijft die keuze staan.
    streetLabelColorInput.addEventListener('input', () => {
      streetLabelColorTouched = true;
      if (state.current) renderResult();
    });
    landmarkColorInput.addEventListener('input', () => {
      landmarkColorTouched = true;
      if (state.current) renderResult();
    });
    landmarkIconSelect.addEventListener('change', () => {
      state.landmarkIcon = landmarkIconSelect.value;
      if (state.current) renderResult();
    });
    [showPlaceCheck, showCountryCheck, showCoordsCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showPlace = showPlaceCheck.checked;
      state.showCountry = showCountryCheck.checked;
      state.showCoords = showCoordsCheck.checked;
      if (state.current) renderResult();
    }));

    isolateAreaCheck.addEventListener('change', () => {
      state.isolateArea = isolateAreaCheck.checked;
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

    safehouseAddBtn.addEventListener('click', addSafehouseByAddress);
    safehouseAddressInput.addEventListener('keydown', e => { if (e.key === 'Enter') addSafehouseByAddress(); });
    safehouseRemoveBtn.addEventListener('click', () => {
      state.safehouse = null;
      safehouseRemoveBtn.hidden = true;
      safehouseStatus.textContent = SAFEHOUSE_DEFAULT_HINT;
      if (state.current) renderResult();
    });

    // Eén keer registreren, niet per render — anders stapelen window-brede
    // listeners zich op elke keer dat de preview opnieuw getekend wordt.
    window.addEventListener('mousemove', onSafehouseDragMove);
    window.addEventListener('mouseup', onSafehouseDragEnd);

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
    safehousePanel.hidden = !state.gtaStyle;
    paletteGrid.classList.toggle('disabled', !!style);
    updatePickerTileLayer();
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

  // ---- kaart (Leaflet) ----
  function ensureMap() {
    if (map) return;
    if (typeof L === 'undefined') {
      el('locationMap').innerHTML = '<p class="hint" style="padding:16px;">Kaartbibliotheek kon niet laden. Controleer je internetverbinding en herlaad de pagina.</p>';
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
    searchResults.innerHTML = '<div class="location-search-result">Zoeken…</div>';
    try {
      const results = await MapGeo.searchPlace(q);
      searchResults.innerHTML = '';
      if (results.length === 0) {
        searchResults.innerHTML = '<div class="location-search-result">Niets gevonden.</div>';
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
      searchResults.innerHTML = `<div class="location-search-result">Zoeken mislukt: ${err.message}</div>`;
    }
  }

  // Naast de kaart verplaatsen, ook de exacte bestuurlijke grens van dit
  // resultaat proberen op te halen — dat is wat "Isoleer gebied" gebruikt om
  // precies deze wijk/stad/land/werelddeel uit te snijden, i.p.v. wat er
  // toevallig in het handmatige kader staat. Niet elk resultaat heeft zo'n
  // grens (bv. een los adres); dan blijft de optie uitgeschakeld.
  function selectSearchResult(result, query) {
    map.setView([parseFloat(result.lat), parseFloat(result.lon)], 12);
    searchResults.hidden = true;

    // De letterlijk getypte zoekterm bewaren we apart van display_name: bij
    // "Isoleer gebied" gebruiken we die als plaatsnaam-onderschrift, want een
    // reverse-geocode van het middelpunt van een regio/land wijst vaak een
    // toevallige kleine plaats daarbinnen aan (bv. "Twente" -> "Ambt Delden").
    state.selectedPlace = { name: result.display_name, query, rings: null, bounds: null };
    state.isolateArea = false;
    placeNameInput.value = '';
    countryNameInput.value = '';
    isolateAreaCheck.checked = false;
    isolateAreaCheck.disabled = true;
    isolateAreaHint.hidden = false;
    isolateAreaHint.textContent = 'Bezig met ophalen van gebiedsgrens…';

    MapGeo.fetchBoundary(result).then(boundary => {
      if (!state.selectedPlace || state.selectedPlace.name !== result.display_name) return;
      if (!boundary) {
        isolateAreaHint.textContent = `Geen exacte gebiedsgrens beschikbaar voor "${result.display_name}".`;
        return;
      }
      state.selectedPlace.rings = boundary.rings;
      state.selectedPlace.bounds = boundary.bounds;
      isolateAreaCheck.disabled = false;
      isolateAreaHint.textContent = `Isoleer precies de grens van "${result.display_name}".`;
    }).catch(err => {
      isolateAreaHint.textContent = `Ophalen van gebiedsgrens mislukt: ${err.message}`;
    });
  }

  // ---- genereren ----
  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Groot gebied geselecteerd — alleen hoofdwegen en de bekendste landmarks worden getoond, om de kaart snel en overzichtelijk te houden.',
    country: 'Zeer groot gebied (land-niveau) geselecteerd — alleen hoofdwegen, grote wateren en de bekendste landmarks van dit land worden getoond.',
    continent: 'Werelddeel-niveau geselecteerd — op deze schaal is straat-/wegdata niet zinvol; alleen de silhouet van het gebied wordt getekend.',
  };

  // Straatnamen zijn bij een hele regio of een land niet leesbaar te tonen
  // (te veel, te klein) — schakel de optie dan uit i.p.v. hem stilletjes te
  // negeren, zodat duidelijk is waarom.
  function applyAreaTier(tier) {
    const labelsAllowed = tier === 'street' || tier === 'city';
    showStreetLabelsCheck.disabled = !labelsAllowed;
    streetLabelsHint.hidden = labelsAllowed;
    if (!labelsAllowed && showStreetLabelsCheck.checked) {
      showStreetLabelsCheck.checked = false;
      state.showStreetLabels = false;
    }
    areaTierHint.textContent = AREA_TIER_NOTE[tier] || '';
    areaTierHint.hidden = !AREA_TIER_NOTE[tier];
    return labelsAllowed;
  }

  async function generate() {
    if (state.generating) return;
    if (!map) {
      statusEl.textContent = 'De kaart is nog niet geladen — controleer je internetverbinding en herlaad de pagina.';
      return;
    }
    state.generating = true;
    generateBtn.disabled = true;
    statusEl.textContent = 'Bezig met ophalen van kaartdata…';
    try {
      // OG MW2 en RDR2 isoleren altijd — met een gekozen plaatsgrens indien
      // beschikbaar, anders gewoon het handmatig gekozen kader zelf (zodat
      // de stijl ook zonder zoekopdracht bruikbaar is).
      const forcesIsolate = state.mw2Style || state.rdr2Style;
      const hasRealBoundary = !!(state.selectedPlace && state.selectedPlace.rings);
      const wantsIsolate = state.isolateArea || forcesIsolate;
      const isolating = wantsIsolate && (hasRealBoundary || forcesIsolate);
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
      refreshAutoLabelColors();
      const streets = await MapGeo.fetchStreets(bounds, tier);
      let landmarks = null;
      if (state.showLandmarks) {
        statusEl.textContent = 'Bezig met opzoeken van landmarks…';
        landmarks = await MapGeo.fetchLandmarks(bounds, tier);
      }
      let buildings = [];
      if (state.mw2Style) {
        statusEl.textContent = 'Bezig met ophalen van gebouwen…';
        buildings = await MapGeo.fetchBuildings(bounds, tier);
      }
      const centerLat = (bounds.north + bounds.south) / 2;
      const centerLon = (bounds.east + bounds.west) / 2;
      let place = '', country = '';
      if (isolating && hasRealBoundary) {
        // Geen reverse-geocode nodig (en die zou hier ook het verkeerde
        // antwoord geven — het middelpunt van een regio/land ligt vaak
        // toevallig in een kleine plaats daarbinnen). De letterlijke
        // zoekterm is wat de gebruiker bedoelde; het land halen we uit het
        // laatste onderdeel van de volledige naam die Nominatim teruggaf.
        const parts = state.selectedPlace.name.split(',').map(s => s.trim()).filter(Boolean);
        place = state.selectedPlace.query || parts[0] || state.selectedPlace.name;
        country = parts.length > 1 ? parts[parts.length - 1] : '';
      } else {
        statusEl.textContent = 'Plaatsnaam opzoeken…';
        try {
          const geo = await MapGeo.reverseGeocode(centerLat, centerLon);
          place = geo.place; country = geo.country;
        } catch (geoErr) {
          statusEl.textContent = `Kaart opgehaald, maar plaatsnaam kon niet worden bepaald (${geoErr.message}).`;
        }
      }
      // De invulvelden tonen wat automatisch bepaald is, maar blijven altijd
      // aanpasbaar — automatische plaatsnaam-detectie is niet altijd
      // betrouwbaar (zeker bij isoleren), dus dit is het vangnet.
      if (!placeNameInput.value.trim()) placeNameInput.value = place;
      if (!countryNameInput.value.trim()) countryNameInput.value = country;
      state.current = {
        bounds, tier, streets, landmarks, buildings, lat: centerLat, lon: centerLon,
        autoPlace: place, autoCountry: country,
        place: placeNameInput.value.trim() || place,
        country: countryNameInput.value.trim() || country,
        isolate: isolating ? { rings: isolateRings } : null,
      };
      renderResult();
      updateExportSizes();
      resultPanel.hidden = false;
      exportPanel.hidden = false;
      statusEl.textContent = isolating
        ? `Klaar — gebied geïsoleerd (${tier}-niveau)${state.mw2Style ? ` · ${buildings.length} gebouwen` : ''}.`
        : `Klaar — ${streets.length} elementen geladen.`;
    } catch (err) {
      statusEl.textContent = `Ophalen mislukt: ${err.message}. Probeer een kleiner gebied of probeer het zo opnieuw.`;
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

  // ---- safehouse (alleen GTA V) ----
  const SAFEHOUSE_DEFAULT_HINT = 'Sleep het icoon op de kaart hiernaast om de positie handmatig aan te passen.';

  // Positie wordt bewaard als (u,v): een fractie (0..1) binnen het kaartvlak
  // zelf (dus exclusief het onderschrift eronder) — dat blijft, anders dan
  // een pixel-positie, correct ongeacht op welke resolutie later
  // geëxporteerd wordt, zonder dat we lat/lon hoeven te onthouden.
  function computeUVFromLatLon(lat, lon) {
    const c = state.current;
    const refW = 1000, refH = Math.round(refW / (state.ratio.w / state.ratio.h));
    const layout = MapRender.captionLayout(refH, { showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords });
    const mapW = refW, mapH = refH - layout.total;
    const project = c.isolate
      ? MapGeo.makeContainProjector(c.bounds, mapW, mapH)
      : MapGeo.makeCoverProjector(c.bounds, mapW, mapH);
    const [x, y] = project(lat, lon);
    return { u: x / mapW, v: y / mapH };
  }

  async function addSafehouseByAddress() {
    const address = safehouseAddressInput.value.trim();
    if (!address || !state.current) return;
    safehouseStatus.textContent = 'Bezig met opzoeken van adres…';
    try {
      const results = await MapGeo.searchPlace(address);
      if (!results.length) { safehouseStatus.textContent = `Niets gevonden voor "${address}".`; return; }
      state.safehouse = computeUVFromLatLon(parseFloat(results[0].lat), parseFloat(results[0].lon));
      safehouseRemoveBtn.hidden = false;
      safehouseStatus.textContent = SAFEHOUSE_DEFAULT_HINT;
      renderResult();
    } catch (err) {
      safehouseStatus.textContent = `Opzoeken mislukt: ${err.message}`;
    }
  }

  // Vertaalt een muispositie op de preview-canvas naar pixels binnen het
  // kaartvlak (mapW x mapH, dus exclusief onderschrift) op die canvas' eigen
  // resolutie — nodig om zowel te bepalen of je het icoon raakt als waar je
  // 'm naartoe sleept.
  function safehousePxFromEvent(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const py = (evt.clientY - rect.top) * (canvas.height / rect.height);
    const layout = MapRender.captionLayout(canvas.height, { showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords });
    return { px, py, mapW: canvas.width, mapH: canvas.height - layout.total };
  }

  let dragCanvas = null;
  let dragging = false;

  function onSafehouseMouseDown(canvas, evt) {
    if (!state.gtaStyle || !state.safehouse) return;
    const { px, py, mapW, mapH } = safehousePxFromEvent(canvas, evt);
    const sx = state.safehouse.u * mapW, sy = state.safehouse.v * mapH;
    const hitRadius = Math.min(mapW, mapH) * 0.05;
    if (Math.hypot(px - sx, py - sy) <= hitRadius) {
      dragCanvas = canvas;
      dragging = true;
      evt.preventDefault();
    }
  }

  function onSafehouseDragMove(evt) {
    if (!dragging || !dragCanvas) return;
    const { px, py, mapW, mapH } = safehousePxFromEvent(dragCanvas, evt);
    state.safehouse = { u: Math.min(1, Math.max(0, px / mapW)), v: Math.min(1, Math.max(0, py / mapH)) };
    drawArtwork(new CanvasPainter(dragCanvas.getContext('2d'), dragCanvas.width, dragCanvas.height), dragCanvas.width, dragCanvas.height);
  }

  function onSafehouseDragEnd() {
    dragging = false;
    dragCanvas = null;
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
    canvas.addEventListener('mousedown', evt => onSafehouseMouseDown(canvas, evt));
    drawArtwork(new CanvasPainter(canvas.getContext('2d'), previewW, previewH), previewW, previewH);
  }

  function drawArtwork(painter, w, h) {
    const c = state.current;
    MapRender.render(painter, w, h, {
      bounds: c.bounds,
      streets: c.streets,
      landmarks: c.landmarks || [],
      buildings: c.buildings || [],
      safehouse: state.gtaStyle ? state.safehouse : null,
      palette: getMapPalette(state.mapPaletteId),
      gtaStyle: state.gtaStyle,
      mw2Style: state.mw2Style,
      rdr2Style: state.rdr2Style,
      tier: c.tier,
      isolate: c.isolate,
      showStreetLabels: state.showStreetLabels,
      showLandmarks: state.showLandmarks && !!c.landmarks,
      streetLabelColor: streetLabelColorInput.value,
      landmarkColor: landmarkColorInput.value,
      landmarkIcon: state.landmarkIcon,
      caption: {
        showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords,
        place: c.place, country: c.country, lat: c.lat, lon: c.lon,
      },
    });
  }

  // ---- export ----
  function computeExportSizes(ratioW, ratioH) {
    const dpi = 300;
    const longEdgesCm = [21, 30, 40, 50, 60];
    const isPortrait = ratioH >= ratioW;
    return longEdgesCm.map(cm => {
      let wCm, hCm;
      if (isPortrait) { hCm = cm; wCm = (cm * ratioW) / ratioH; }
      else { wCm = cm; hCm = (cm * ratioH) / ratioW; }
      const wPx = Math.round((wCm / 2.54) * dpi), hPx = Math.round((hCm / 2.54) * dpi);
      return { id: `cm${cm}`, label: `${Math.round(wCm)}×${Math.round(hCm)}cm @300dpi (${wPx}×${hPx})`, w: wPx, h: hPx };
    });
  }

  function updateExportSizes() {
    exportSizeSelect.innerHTML = '';
    computeExportSizes(state.ratio.w, state.ratio.h).forEach((s, i) => {
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
    return streets.map(s => ({
      tags: {
        highway: s.tags.highway, waterway: s.tags.waterway, natural: s.tags.natural,
        leisure: s.tags.leisure, landuse: s.tags.landuse, name: s.tags.name,
      },
      coords: s.coords,
    }));
  }

  function trimBuildingsForStorage(buildings) {
    return buildings.map(b => ({ coords: b.coords }));
  }

  function buildRecolorGeometry() {
    const c = state.current;
    const payload = {
      bounds: c.bounds,
      streets: trimStreetsForStorage(c.streets),
      landmarks: c.landmarks || [],
      buildings: trimBuildingsForStorage(c.buildings || []),
      safehouse: state.gtaStyle ? state.safehouse : null,
      ratio: state.ratio,
      tier: c.tier,
      isolate: c.isolate || null,
    };
    return JSON.stringify(payload).length <= RECOLOR_MAX_JSON_LENGTH ? payload : null;
  }

  function makeHistoryThumbnail() {
    const ratio = state.ratio.w / state.ratio.h;
    // Iets groter dan strikt nodig voor de historielijst zelf, zodat de
    // Mockups-tab er ook nog redelijk uitziet als hij vergroot wordt in een
    // scene — Locatie-historie bewaart geen volledige geometrie (zie boven),
    // dus dit is de enige bron die daar beschikbaar is.
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
    exportStatus.textContent = `Bezig met renderen op ${w}×${h}px…`;
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    setTimeout(() => {
      const place = (state.current.place || 'kaart').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().slice(0, 10);
      if (wantSVG) {
        const painter = new SVGPainter(w, h);
        drawArtwork(painter, w, h);
        Utils.downloadSVGString(painter.toString(), `locatie-${place}-${opt.value}-${date}.svg`);
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        drawArtwork(new CanvasPainter(canvas.getContext('2d'), w, h), w, h);
        Utils.downloadCanvasPNG(canvas, `locatie-${place}-${opt.value}-${date}.png`);
      }
      recordLocationExport({
        thumbnail: makeHistoryThumbnail(),
        place: state.current.place,
        country: state.current.country,
        lat: state.current.lat,
        lon: state.current.lon,
        paletteName: state.gtaStyle ? GTA_STYLE_PALETTE.name : state.mw2Style ? MW2_STYLE_PALETTE.name : state.rdr2Style ? RDR2_STYLE_PALETTE.name : getMapPalette(state.mapPaletteId).name,
        showStreetLabels: state.showStreetLabels,
        showLandmarks: state.showLandmarks,
        streetLabelColor: streetLabelColorInput.value,
        landmarkColor: landmarkColorInput.value,
        landmarkIcon: state.landmarkIcon,
        format: wantSVG ? 'svg' : 'png',
        sizeLabel: opt.textContent,
        timestamp: Date.now(),
        recolor: buildRecolorGeometry(),
      });
      exportStatus.textContent = 'Opgeslagen.';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    }, 20);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onShow, getHistory: loadLocationHistory };
})();
