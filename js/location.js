// UI-laag voor de Locatie-tab: kaart en resultaat samengevoegd in één
// levend, pannable/zoombaar canvas — de gestylde kaart IS de interactieve
// kaart. Voorheen was dit een aparte rauwe Leaflet-achtergrond die je met
// een kader selecteerde, gevolgd door een losse "Genereer"-stap; nu pas je
// gewoon meteen aan wat je ziet, en exporteer je vanaf hetzelfde scherm.
//
// Niet elke pan/zoom-pixel mag een nieuwe tegel-fetch triggeren (netwerk-
// latency + decodeerwerk per tegel), dus: elke pan/zoom tekent METEEN
// opnieuw met de al opgehaalde data (snel, geen netwerk), en een
// gedebounced timer haalt pas verse data op zodra je even stilstaat — voor
// een ruimer gebied dan strikt zichtbaar is, zodat kleine bewegingen binnen
// die marge niets hoeven te verversen.
//
// Isoleren/uitlichten/Game Styles blijven bestaan naast dit live-pannen:
// - Uitlichten (highlight) gebruikt gewoon de normale live-view-bounds (de
//   ring wordt getekend waar hij toevallig binnen het huidige zicht valt),
//   dus pannen/zoomen blijft daarbij gewoon werken.
// - Isoleren (of een Game Style die dat forceert) toont in plaats daarvan
//   de vaste, opgezochte grens (contain-fit) — pannen/zoomen is dan
//   zinloos (het is geen navigeerbaar venster meer) en wordt uitgeschakeld
//   zolang dat actief is; zonder een opgezochte grens valt isoleren terug
//   op de laatst bekeken live-view als rechthoek (het equivalent van het
//   vroegere handmatige kader).
window.LocationApp = (() => {
  const HISTORY_KEY = 'genart-location-history-v1';

  // Arabische Unicode-blokken (basis + presentatievormen) — gebruikt om te
  // detecteren of een getypte zoekterm Arabisch is, zodat we Nominatim
  // vragen om de plaatsnaam/land in het Arabisch terug te geven (voor
  // klanten uit het Midden-Oosten). Triggert alléén op een Arabische
  // zoekterm — een gewone (Latijnse) zoekopdracht verandert niets.
  const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  function isArabicText(s) { return ARABIC_RE.test(s || ''); }

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
  const LAYOUT_PRESETS = [
    { id: 'default', label: 'Default', hint: 'The map sits above a plain mat that holds the caption.' },
    { id: 'fade', label: 'Fade', hint: 'Full-bleed map — the caption sits directly on it, over a dark fade at the bottom.' },
    { id: 'gallery', label: 'Gallery', hint: 'Like Default, with a thin frame line and museum-label rules around the caption.' },
    { id: 'stamp', label: 'Stamp', hint: 'Full-bleed map with a small captioned label tucked in the bottom-left corner.' },
    { id: 'ledger', label: 'Ledger', hint: 'Full-bleed map with a slim, left-aligned caption strip along the bottom edge.' },
  ];
  const FULL_BLEED_LAYOUTS = new Set(['fade', 'stamp', 'ledger']);

  // "Masks" knippen de kaart tot een vaste vorm — zie MapRender.render's
  // buildMaskRing voor de tekencode van elke vorm.
  const MASK_PRESETS = [
    { id: 'none', label: 'None' },
    { id: 'circle', label: 'Circle' },
    { id: 'heart', label: 'Heart' },
    { id: 'diamond', label: 'Diamond' },
    { id: 'hexagon', label: 'Hexagon' },
  ];

  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Large area selected — only main roads are shown, to keep the map fast and readable.',
    country: 'Very large area (country level) selected — only main roads and major bodies of water are shown.',
    continent: 'Huge area selected (a large country or continent) — only motorways, major water, and country borders are shown, at a coarser zoom, to keep it fast.',
  };

  const CANVAS_LONG_EDGE = 900; // preview-resolutie, niet de exportresolutie
  const FETCH_DEBOUNCE_MS = 550;
  const FETCH_PADDING = 0.6; // extra marge rond het zichtbare gebied bij ophalen
  const RECOLOR_MAX_JSON_LENGTH = 180000;
  const FETCH_CACHE_MAX = 20; // aantal eerder opgehaalde gebieden dat warm blijft

  const state = {
    center: { lat: 52.3676, lon: 4.9041 },
    scale: 0, // px per graad breedtegraad ("zoom") — gezet in init()
    ratioId: '2x3', ratio: { w: 2, h: 3 },
    layoutId: 'default', maskId: 'none',
    mapPaletteId: MAP_PALETTES[0].id,
    showPlace: true, showCountry: true, showCoords: true,
    gtaStyle: false, mw2Style: false, rdr2Style: false,
    isolateArea: false, highlightArea: false,
    pins: [], addingPin: false,
    autoPlace: '', autoCountry: '', captionLang: null,
    streets: [], buildings: [], tier: 'street',
    fetchedBounds: null, fetchedTier: null, fetching: false,
    selectedPlace: null, // { name, query, rings, bounds } — gevuld zodra een zoekresultaat een bestuurlijke grens blijkt te hebben
  };

  let canvas = null, ctx = null;
  let pinColorTouched = false;
  let fetchTimer = null;
  let placeNameTimer = null;
  let renderQueued = false;
  let ready = false;
  let drag = null; // { x, y, moved, center }
  // Cache van eerder opgehaalde gebieden: nieuwste vooraan, zie
  // findCachedFetch/storeCachedFetch. Voorkomt een nieuwe (trage) netwerkcall
  // zodra je terugpant/-zoomt naar een gebied dat al eerder is opgehaald.
  let fetchCache = [];

  const el = id => document.getElementById(id);
  const searchInput = el('locationSearchInput');
  const searchBtn = el('locationSearchBtn');
  const searchResults = el('locationSearchResults');
  const ratioTabs = el('ratioTabs');
  const customRatioRow = el('customRatioRow');
  const customRatioW = el('customRatioW');
  const customRatioH = el('customRatioH');
  const areaTierHint = el('areaTierHint');
  const statusEl = el('locationStatus');
  const layoutTabs = el('layoutTabs');
  const layoutHint = el('layoutHint');
  const maskTabs = el('maskTabs');
  const paletteGrid = el('mapPaletteGrid');
  const showPlaceCheck = el('showPlaceCheck');
  const placeNameInput = el('placeNameInput');
  const showCountryCheck = el('showCountryCheck');
  const countryNameInput = el('countryNameInput');
  const showCoordsCheck = el('showCoordsCheck');
  const addPinBtn = el('addPinBtn');
  const clearPinsBtn = el('clearPinsBtn');
  const pinColorInput = el('pinColorInput');
  const pinAddressInput = el('pinAddressInput');
  const pinAddressSearchBtn = el('pinAddressSearchBtn');
  const pinAddressResults = el('pinAddressResults');
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
  const exportSizeSelect = el('locationExportSize');
  const exportSVGBtn = el('locationExportSVGBtn');
  const exportPNGBtn = el('locationExportPNGBtn');
  const exportStatus = el('locationExportStatus');

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

  // ---- modus-helpers ----
  function forcesIsolate() { return state.mw2Style || state.rdr2Style; }
  function hasRealBoundary() { return !!(state.selectedPlace && state.selectedPlace.rings); }
  function isolating() { return state.isolateArea || forcesIsolate(); }
  function highlighting() { return !isolating() && state.highlightArea && hasRealBoundary(); }

  // ---- geometrie: canvaspixels <-> lat/lon ----
  function fullBleed() { return FULL_BLEED_LAYOUTS.has(state.layoutId); }
  function captionOpts() { return { showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords }; }
  function mapAreaHeight(h) {
    if (fullBleed()) return h;
    return h - MapRender.captionLayout(h, captionOpts()).total;
  }

  // Zelfde "cover"-wiskunde als MapGeo.makeCoverProjector, maar de bounds
  // worden hier AFGELEID van center+scale+canvasgrootte (i.p.v. andersom),
  // zodanig dat spanX/spanY exact de canvas-verhouding hebben — daardoor
  // komt makeCoverProjector's cover-fit altijd 1-op-1 uit (geen crop/
  // offset), en blijven klikken/pins pixel-nauwkeurig kloppen.
  function liveViewBounds() {
    const mapH = mapAreaHeight(canvas.height);
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    const spanLatDeg = mapH / state.scale;
    const spanLonDeg = canvas.width / (state.scale * cosLat);
    return {
      north: state.center.lat + spanLatDeg / 2, south: state.center.lat - spanLatDeg / 2,
      east: state.center.lon + spanLonDeg / 2, west: state.center.lon - spanLonDeg / 2,
    };
  }
  // De bounds die daadwerkelijk getekend/opgehaald worden: bij isoleren met
  // een echte opgezochte grens is dat de VASTE grens-bounds (niet pannable);
  // in elk ander geval (normaal, uitlichten, of isoleren zónder grens) de
  // huidige live-view.
  function effectiveBounds() {
    if (isolating() && hasRealBoundary()) return state.selectedPlace.bounds;
    return liveViewBounds();
  }
  function currentIsolateOpts() {
    if (!isolating()) return null;
    if (hasRealBoundary()) return { rings: state.selectedPlace.rings };
    const b = liveViewBounds();
    return { rings: [[[b.north, b.west], [b.north, b.east], [b.south, b.east], [b.south, b.west]]] };
  }

  // Isoleren tekent met MapGeo.makeContainProjector (contain-fit, dus vaak
  // met marge/letterbox) i.p.v. de cover-fit hierboven — voor pin-klikken
  // die ook tijdens isoleren moeten kloppen, hier dezelfde wiskunde
  // dupliceren (inclusief de inverse, die MapGeo niet aanbiedt).
  function containMetrics(bounds, mapW, mapH) {
    const midLatRad = ((bounds.south + bounds.north) / 2) * Math.PI / 180;
    const lonScale = Math.cos(midLatRad) || 0.0001;
    const spanX = (bounds.east - bounds.west) * lonScale;
    const spanY = (bounds.north - bounds.south) || 0.0001;
    const scale = Math.min(mapW / (spanX || 0.0001), mapH / spanY);
    const drawW = spanX * scale, drawH = spanY * scale;
    return { lonScale, scale, offsetX: (mapW - drawW) / 2, offsetY: (mapH - drawH) / 2 };
  }
  function forwardProject(lat, lon) {
    const bounds = effectiveBounds();
    const mapH = mapAreaHeight(canvas.height);
    if (isolating() && hasRealBoundary()) {
      const m = containMetrics(bounds, canvas.width, mapH);
      return [m.offsetX + (lon - bounds.west) * m.lonScale * m.scale, m.offsetY + (bounds.north - lat) * m.scale];
    }
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    return [(lon - bounds.west) * state.scale * cosLat, (bounds.north - lat) * state.scale];
  }
  function inverseProject(x, y) {
    const bounds = effectiveBounds();
    const mapH = mapAreaHeight(canvas.height);
    if (isolating() && hasRealBoundary()) {
      const m = containMetrics(bounds, canvas.width, mapH);
      return { lat: bounds.north - (y - m.offsetY) / m.scale, lon: bounds.west + (x - m.offsetX) / (m.lonScale * m.scale) };
    }
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    return { lat: bounds.north - y / state.scale, lon: bounds.west + x / (state.scale * cosLat) };
  }
  // minScale was 55 (uitgezoomd tot "een groot land/regio") totdat
  // scaleForBounds ook een heel land/continent op het canvas moest passen —
  // een breed land als de VS (~58-68° lengtegraad, gepadd) of Rusland
  // (~190°+) past domweg niet meer binnen die 55°-vloer op een liggend-
  // portret canvas: de vloer dwong dan een té ver ingezoomde schaal af,
  // waardoor het land links/rechts afgesneden werd i.p.v. volledig te
  // passen. 300 is ruim genoeg voor elk realistisch land/continent
  // (inclusief Rusland) en verandert verder niets aan het handmatige
  // uitzoom-bereik (scrollen/pinchen kan nu ook net wat verder uitzoomen,
  // ProtomapsFetch's continent-tier rendert op die schaal nog steeds
  // gewoon een complete, alleen grovere kaart).
  function clampScale(s) {
    const minScale = canvas.height / 300;
    const maxScale = canvas.height / 0.003; // ingezoomd tot straatniveau
    return Math.max(minScale, Math.min(maxScale, s));
  }
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - rect.left) * (canvas.width / rect.width), y: (cy - rect.top) * (canvas.height / rect.height) };
  }

  // ---- ophalen (gedebounced) ----
  function boundsContain(outer, inner) {
    return inner.north <= outer.north && inner.south >= outer.south && inner.east <= outer.east && inner.west >= outer.west;
  }
  function padBounds(b, factor) {
    const latPad = (b.north - b.south) * factor, lonPad = (b.east - b.west) * factor;
    return { north: b.north + latPad, south: b.south - latPad, east: b.east + lonPad, west: b.west - lonPad };
  }
  // De query-inhoud hangt alleen af van tier + styleHint (+ of gebouwen
  // meegevraagd zijn), niet van isoleren/uitlichten — dus een cache-entry is
  // bruikbaar voor elk gebied dat erin past, ongeacht in welke modus hij
  // oorspronkelijk werd opgehaald. Bij country/continent-tier bepaalt de
  // EXACTE bounds ook het zoomniveau (zie ProtomapsFetch.zoomForFetch) — een
  // cache-entry die een groter (dus ondieper gezoomd) gebied dekt, mag dus
  // alleen hergebruikt worden als hij op z'n minst even diep gezoomd was als
  // wat er voor het NIEUWE (kleinere) gebied gekozen zou worden. Zonder deze
  // check bleef een her-fit naar een strakkere grens (zie selectSearchResult's
  // her-fit na fetchBoundary) hangen op de eerdere, grovere data — de
  // kaart paste dan wel beter in beeld, maar kreeg nooit het extra detail
  // waar die strakkere grens juist ruimte voor gaf.
  function findCachedFetch(tier, styleHint, mw2, bounds) {
    const idx = fetchCache.findIndex(e => e.tier === tier && e.styleHint === styleHint && e.mw2 === mw2
      && boundsContain(e.bounds, bounds)
      && ProtomapsFetch.zoomForFetch(bounds, tier) <= ProtomapsFetch.zoomForFetch(e.bounds, tier));
    if (idx === -1) return null;
    const [entry] = fetchCache.splice(idx, 1);
    fetchCache.unshift(entry); // LRU: geraakte entry weer vooraan
    return entry;
  }
  function storeCachedFetch(tier, styleHint, mw2, bounds, streets, buildings) {
    fetchCache.unshift({ tier, styleHint, mw2, bounds, streets, buildings });
    if (fetchCache.length > FETCH_CACHE_MAX) fetchCache.length = FETCH_CACHE_MAX;
  }
  // Forceert een verse fetch — nodig telkens als de BETEKENIS van de bounds
  // verandert (isoleren/uitlichten aan/uit, Game Style, nieuwe zoekgrens),
  // ook als de numerieke bounds toevallig nog binnen de oude marge vallen.
  function invalidateFetch() {
    state.fetchedBounds = null;
    scheduleFetch(0);
  }
  function scheduleFetch(delay = FETCH_DEBOUNCE_MS) {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(maybeFetch, delay);
  }
  function applyFetchResult(padded, tier, streets, buildings, fromCache) {
    state.streets = streets;
    state.buildings = buildings;
    state.fetchedBounds = padded;
    state.fetchedTier = tier;
    state.tier = tier;
    applyAreaTier(tier);
    render();
    updateExportSizes();
    exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    statusEl.textContent = isolating()
      ? `Isolated (${tier} level)${state.mw2Style ? ` · ${buildings.length} buildings` : ''}.`
      : highlighting()
      ? `Highlighted (${tier} level).`
      : `${streets.length} elements loaded${fromCache ? ' (cached)' : ''}.`;
    schedulePlaceNameRefresh();
  }

  async function maybeFetch() {
    if (state.fetching) { scheduleFetch(200); return; }
    const bounds = effectiveBounds();
    const tier = MapGeo.classifyAreaTier(bounds);
    const haveEnough = state.fetchedBounds && state.fetchedTier === tier && boundsContain(state.fetchedBounds, bounds);
    if (haveEnough) return;
    // Een vaste, opgezochte isolatiegrens verandert niet door pannen, dus
    // die hoeft niet gepad te worden; de live-view (normaal/uitlichten/
    // isoleren-zonder-grens) wel, zodat kleine bewegingen niet meteen
    // opnieuw hoeven te verversen.
    const fixedBounds = isolating() && hasRealBoundary();
    const padded = fixedBounds ? bounds : padBounds(bounds, FETCH_PADDING);
    const styleHint = state.gtaStyle ? 'gta' : state.rdr2Style ? 'rdr2' : null;
    // Toets tegen de kale live-view (net als haveEnough hierboven), niet
    // tegen de al opgehoogde `padded` — twee opgehoogde gebieden bevatten
    // elkaar veel minder snel dan een kaal gebied in een opgehoogd gebied.
    const cached = findCachedFetch(tier, styleHint, state.mw2Style, bounds);
    if (cached) {
      // fetchedBounds moet het gebied blijven dat de gecachte data ECHT
      // dekt (de oude padded extent), niet de nieuw berekende `padded` voor
      // deze pan — anders denkt een volgende kleine pan onterecht dat hij
      // al genoeg data heeft voor een gebied dat feitelijk niet gecached is.
      applyFetchResult(cached.bounds, tier, cached.streets, cached.buildings, true);
      return;
    }
    state.fetching = true;
    statusEl.textContent = 'Fetching map data…';
    try {
      // Zelf-gehoste Protomaps-planeetdata (R2) i.p.v. live Overpass-queries.
      const streets = await ProtomapsFetch.fetchStreets(padded, tier, styleHint);
      let buildings = [];
      if (state.mw2Style) {
        statusEl.textContent = 'Fetching buildings…';
        buildings = await ProtomapsFetch.fetchBuildings(padded, tier);
      }
      storeCachedFetch(tier, styleHint, state.mw2Style, padded, streets, buildings);
      applyFetchResult(padded, tier, streets, buildings, false);
    } catch (err) {
      statusEl.textContent = `Fetch failed: ${err.message}. Try a smaller or different area.`;
    } finally {
      state.fetching = false;
    }
  }

  function applyAreaTier(tier) {
    areaTierHint.textContent = AREA_TIER_NOTE[tier] || '';
    areaTierHint.hidden = !AREA_TIER_NOTE[tier];
  }

  function schedulePlaceNameRefresh() {
    clearTimeout(placeNameTimer);
    placeNameTimer = setTimeout(refreshPlaceName, 400);
  }
  async function refreshPlaceName() {
    // Bij isoleren/uitlichten met een echte grens gebruiken we de letterlijke
    // zoekterm als plaatsnaam (zie computePlaceCountry) — geen reverse-
    // geocode nodig, en die zou hier ook vaak het verkeerde antwoord geven.
    if ((isolating() || highlighting()) && hasRealBoundary()) return;
    try {
      const geo = await MapGeo.reverseGeocode(state.center.lat, state.center.lon, state.captionLang);
      state.autoPlace = geo.place; state.autoCountry = geo.country;
      render();
    } catch { /* stille no-op: het onderschrift is puur decoratief */ }
  }

  function computePlaceCountry() {
    if ((isolating() || highlighting()) && hasRealBoundary()) {
      const parts = state.selectedPlace.name.split(',').map(s => s.trim()).filter(Boolean);
      return { place: state.selectedPlace.query || parts[0] || state.selectedPlace.name, country: parts.length > 1 ? parts[parts.length - 1] : '' };
    }
    return { place: state.autoPlace, country: state.autoCountry };
  }

  // ---- tekenen ----
  function buildRenderOpts() {
    const pc = computePlaceCountry();
    return {
      bounds: effectiveBounds(),
      streets: state.streets,
      buildings: state.buildings,
      palette: getMapPalette(state.mapPaletteId),
      gtaStyle: state.gtaStyle, mw2Style: state.mw2Style, rdr2Style: state.rdr2Style,
      tier: state.tier,
      isolate: currentIsolateOpts(),
      highlight: highlighting() ? { rings: state.selectedPlace.rings } : null,
      layout: state.layoutId, mask: state.maskId,
      pins: state.pins, pinColor: pinColorInput.value,
      caption: {
        showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords,
        place: placeNameInput.value.trim() || pc.place,
        country: countryNameInput.value.trim() || pc.country,
        lat: state.center.lat, lon: state.center.lon,
      },
    };
  }
  function render() {
    MapRender.render(new CanvasPainter(ctx, canvas.width, canvas.height), canvas.width, canvas.height, buildRenderOpts());
  }
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  // ---- pan/zoom/klik-interactie op het canvas zelf ----
  function pinHitTest(pt, pin) {
    const [x, y] = forwardProject(pin.lat, pin.lon);
    const r = Math.min(canvas.width, mapAreaHeight(canvas.height)) * 0.016;
    const headCenter = { x, y: y - r * 1.7 };
    const dHead = Math.hypot(pt.x - headCenter.x, pt.y - headCenter.y);
    const dTip = Math.hypot(pt.x - x, pt.y - y);
    return dHead < r * 1.5 || dTip < r * 0.7;
  }

  function handleCanvasClick(pt) {
    if (pt.y > mapAreaHeight(canvas.height)) return; // klik in de onderschrift-mat: negeren
    const hitIdx = state.pins.findIndex(p => pinHitTest(pt, p));
    if (hitIdx >= 0) { state.pins.splice(hitIdx, 1); render(); return; }
    if (!state.addingPin) return;
    const { lat, lon } = inverseProject(pt.x, pt.y);
    state.pins.push({ lat, lon });
    render();
  }

  function wireCanvasInteraction() {
    // Pannen/zoomen is zinloos zolang isoleren een vaste, opgezochte grens
    // toont (dat is geen navigeerbaar venster) — klikken (voor pins) blijft
    // dan wel gewoon werken.
    const panLocked = () => isolating() && hasRealBoundary();

    canvas.addEventListener('mousedown', e => {
      const pt = canvasPoint(e);
      if (pt.y > mapAreaHeight(canvas.height)) return;
      drag = { x: pt.x, y: pt.y, moved: false, center: { ...state.center } };
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const pt = canvasPoint(e);
      const dx = pt.x - drag.x, dy = pt.y - drag.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      if (!panLocked()) {
        const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
        state.center = { lat: drag.center.lat + dy / state.scale, lon: drag.center.lon - dx / (state.scale * cosLat) };
        requestRender();
        scheduleFetch();
      }
    });
    window.addEventListener('mouseup', e => {
      if (!drag) return;
      const wasClick = !drag.moved;
      const pt = canvasPoint(e);
      drag = null;
      if (wasClick) handleCanvasClick(pt);
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (panLocked()) return;
      state.scale = clampScale(state.scale * Math.exp(-e.deltaY * 0.0016));
      requestRender();
      scheduleFetch();
    }, { passive: false });

    // Eenvoudige touch-ondersteuning: één vinger = pannen, twee vingers =
    // knijpen om te zoomen.
    let pinchDist = null;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        const pt = canvasPoint(e);
        if (pt.y > mapAreaHeight(canvas.height)) return;
        drag = { x: pt.x, y: pt.y, moved: false, center: { ...state.center } };
      } else if (e.touches.length === 2) {
        drag = null;
        pinchDist = touchDist(e);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && drag) {
        const pt = canvasPoint(e);
        const dx = pt.x - drag.x, dy = pt.y - drag.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
        if (!panLocked()) {
          const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
          state.center = { lat: drag.center.lat + dy / state.scale, lon: drag.center.lon - dx / (state.scale * cosLat) };
          requestRender();
          scheduleFetch();
        }
      } else if (e.touches.length === 2 && pinchDist != null && !panLocked()) {
        const d = touchDist(e);
        state.scale = clampScale(state.scale * (d / pinchDist));
        pinchDist = d;
        requestRender();
        scheduleFetch();
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
      if (drag && !drag.moved && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        handleCanvasClick({
          x: (t.clientX - rect.left) * (canvas.width / rect.width),
          y: (t.clientY - rect.top) * (canvas.height / rect.height),
        });
      }
      drag = null; pinchDist = null;
    });
  }
  function touchDist(e) {
    const [a, b] = e.touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  // ---- zoeken / springen naar een plek ----
  // Zoomniveau waarop de HELE meegegeven bounding box (van het zoekresultaat)
  // in beeld past, met wat ademruimte rondom — i.p.v. altijd naar hetzelfde
  // vaste straatniveau-zoom te springen ongeacht wat je zocht. Zonder dit
  // sprong "United States" naar het middelpunt van het land maar bleef op
  // straatschaal ingezoomd (vandaar een toevallige "Mills/Decatur County" in
  // het onderschrift i.p.v. het hele land in beeld).
  const RESULT_FIT_MARGIN = 0.85; // laat ~15% lucht rondom het gevonden gebied
  function scaleForBounds(bounds) {
    const mapH = mapAreaHeight(canvas.height);
    const cosLat = Math.cos((((bounds.south + bounds.north) / 2) * Math.PI) / 180) || 0.0001;
    const spanLatDeg = Math.max(bounds.north - bounds.south, 0.0005) / RESULT_FIT_MARGIN;
    const spanLonDeg = Math.max(bounds.east - bounds.west, 0.0005) / RESULT_FIT_MARGIN;
    return clampScale(Math.min(mapH / spanLatDeg, canvas.width / (spanLonDeg * cosLat)));
  }
  function jumpTo(lat, lon, bounds) {
    state.center = { lat, lon };
    state.scale = bounds ? scaleForBounds(bounds) : clampScale(mapAreaHeight(canvas.height) / 0.02);
    placeNameInput.value = ''; countryNameInput.value = '';
    render();
    invalidateFetch();
  }

  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    // Arabische zoekterm -> vraag Nominatim expliciet om Arabische namen
    // terug (anders bepaalt de taal van de browser dit, meestal niet
    // Arabisch) — zie ARABIC_RE hierboven. state.captionLang wordt pas in
    // selectSearchResult gezet (per gekozen resultaat, niet per zoekactie).
    const lang = isArabicText(q) ? 'ar' : null;
    searchResults.hidden = false;
    searchResults.innerHTML = '<div class="location-search-result">Searching…</div>';
    try {
      const results = await MapGeo.searchPlace(q, lang);
      searchResults.innerHTML = '';
      if (results.length === 0) { searchResults.innerHTML = '<div class="location-search-result">Nothing found.</div>'; return; }
      results.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'location-search-result'; btn.textContent = r.display_name;
        if (lang) btn.dir = 'rtl';
        btn.addEventListener('click', () => selectSearchResult(r, q, lang));
        searchResults.appendChild(btn);
      });
    } catch (err) {
      searchResults.innerHTML = `<div class="location-search-result">Search failed: ${err.message}</div>`;
    }
  }

  // Naast de kaart verplaatsen, ook de exacte bestuurlijke grens van dit
  // resultaat proberen op te halen — dat is wat Isolate/Highlight gebruiken
  // om precies deze wijk/stad/land/werelddeel te tonen. Niet elk resultaat
  // heeft zo'n grens (bv. een los adres); dan blijven die opties uit.
  function selectSearchResult(result, query, lang) {
    searchResults.hidden = true;
    // Nominatim geeft altijd een boundingbox mee ([south, north, west,
    // east] als strings) — daarmee zoomt jumpTo meteen zo ver uit/in dat
    // het hele gevonden gebied in beeld past, i.p.v. een vast straatniveau.
    const bbox = result.boundingbox;
    const bounds = bbox ? {
      south: parseFloat(bbox[0]), north: parseFloat(bbox[1]),
      west: parseFloat(bbox[2]), east: parseFloat(bbox[3]),
    } : null;
    jumpTo(parseFloat(result.lat), parseFloat(result.lon), bounds);
    // Blijft staan zolang dit gezochte gebied actief is (ook tijdens
    // pannen, via refreshPlaceName hierboven) — de volgende zoekopdracht
    // (Arabisch of niet) overschrijft hem gewoon weer.
    state.captionLang = lang || null;

    // De letterlijk getypte zoekterm bewaren we apart van display_name: bij
    // isoleren/uitlichten gebruiken we die als plaatsnaam-onderschrift, want
    // een reverse-geocode van het middelpunt van een regio/land wijst vaak
    // een toevallige kleine plaats daarbinnen aan (bv. "Twente" -> "Ambt Delden").
    state.selectedPlace = { name: result.display_name, query, rings: null, bounds: null };
    state.isolateArea = false;
    state.highlightArea = false;
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
      // Deze grens dekt bewust maar de grootste aaneengesloten landmassa
      // (zie MapGeo.fetchBoundary) — voor een land met verafgelegen exclaves
      // (de VS met Alaska/Hawaii, Frankrijk met overzeese gebieden...) is dat
      // een VEEL strakkere pasvorm dan Nominatim's ruwe boundingbox waar de
      // eerste jumpTo hierboven nog op moest afgaan (die omvat immers ALLES).
      // Die te ruime bbox dwong een onnodig grof zoomniveau af (zie
      // ProtomapsFetch's pickZoomForBounds) — dus zodra de precieze grens
      // binnen is, opnieuw fitten op de live-view (isoleren gebruikt deze
      // bounds toch al rechtstreeks via effectiveBounds, geen her-fit nodig).
      if (!isolating()) {
        const lat = (boundary.bounds.north + boundary.bounds.south) / 2;
        const lon = (boundary.bounds.east + boundary.bounds.west) / 2;
        jumpTo(lat, lon, boundary.bounds);
      }
      if (forcesIsolate()) invalidateFetch(); // een Game Style stond al aan te wachten op deze grens
    }).catch(err => {
      isolateAreaHint.textContent = `Fetching area boundary failed: ${err.message}`;
      highlightAreaHint.textContent = `Fetching area boundary failed: ${err.message}`;
    });
  }

  // Zelfde soort adres-zoekopdracht als hierboven, maar een gekozen
  // resultaat zet gewoon een pin neer zonder het zicht te verplaatsen.
  async function runPinAddressSearch() {
    const q = pinAddressInput.value.trim();
    if (!q) return;
    pinAddressResults.hidden = false;
    pinAddressResults.innerHTML = '<div class="location-search-result">Searching…</div>';
    try {
      const results = await MapGeo.searchPlace(q);
      pinAddressResults.innerHTML = '';
      if (results.length === 0) { pinAddressResults.innerHTML = '<div class="location-search-result">Nothing found.</div>'; return; }
      results.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'location-search-result'; btn.textContent = r.display_name;
        btn.addEventListener('click', () => {
          state.pins.push({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
          render();
          pinAddressResults.hidden = true;
          pinAddressInput.value = '';
        });
        pinAddressResults.appendChild(btn);
      });
    } catch (err) {
      pinAddressResults.innerHTML = `<div class="location-search-result">Search failed: ${err.message}</div>`;
    }
  }

  // ---- canvasgrootte / ratio / layout / mask ----
  function resizeCanvasForRatio() {
    const ratio = state.ratio.w / state.ratio.h;
    let w, h;
    if (ratio >= 1) { w = CANVAS_LONG_EDGE; h = Math.round(w / ratio); }
    else { h = CANVAS_LONG_EDGE; w = Math.round(h * ratio); }
    canvas.width = w; canvas.height = h;
  }

  function selectRatio(id) {
    state.ratioId = id;
    [...ratioTabs.children].forEach(b => b.classList.toggle('active', b.dataset.ratioId === id));
    customRatioRow.hidden = id !== 'custom';
    if (id === 'custom') { applyCustomRatio(); return; }
    const preset = RATIO_PRESETS.find(r => r.id === id);
    state.ratio = { w: preset.w, h: preset.h };
    resizeCanvasForRatio();
    updateExportSizes();
    render();
    invalidateFetch();
  }
  function applyCustomRatio() {
    const w = Math.max(1, parseFloat(customRatioW.value) || 1);
    const h = Math.max(1, parseFloat(customRatioH.value) || 1);
    state.ratio = { w, h };
    resizeCanvasForRatio();
    updateExportSizes();
    render();
    invalidateFetch();
  }

  function selectLayout(id) {
    state.layoutId = id;
    [...layoutTabs.children].forEach(b => b.classList.toggle('active', b.dataset.layoutId === id));
    layoutHint.textContent = LAYOUT_PRESETS.find(l => l.id === id).hint;
    render();
    invalidateFetch(); // de kaart-hoogte kan veranderen (full-bleed vs. mat)
  }
  function selectMask(id) {
    state.maskId = id;
    [...maskTabs.children].forEach(b => b.classList.toggle('active', b.dataset.maskId === id));
    render();
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
    refreshAutoPinColor();
    render();
    invalidateFetch();
  }

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
  function trimStreetsForStorage(streets) {
    return streets.map(s => {
      const tags = {
        highway: s.tags.highway, waterway: s.tags.waterway, natural: s.tags.natural,
        leisure: s.tags.leisure, landuse: s.tags.landuse, name: s.tags.name,
      };
      return s.rings ? { tags, rings: s.rings } : { tags, coords: s.coords };
    });
  }
  function trimBuildingsForStorage(buildings) {
    return buildings.map(b => ({ coords: b.coords }));
  }
  function buildRecolorGeometry(opts) {
    const payload = {
      bounds: opts.bounds,
      streets: trimStreetsForStorage(state.streets),
      buildings: trimBuildingsForStorage(state.buildings),
      ratio: state.ratio,
      layout: state.layoutId,
      mask: state.maskId,
      pins: opts.pins,
      pinColor: opts.pinColor,
      tier: state.tier,
      isolate: opts.isolate,
      highlight: opts.highlight,
    };
    return JSON.stringify(payload).length <= RECOLOR_MAX_JSON_LENGTH ? payload : null;
  }

  function makeHistoryThumbnail() {
    const ratio = state.ratio.w / state.ratio.h;
    const th = 340;
    const tw = Math.round(th * ratio);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw; thumbCanvas.height = th;
    MapRender.render(new CanvasPainter(thumbCanvas.getContext('2d'), tw, th), tw, th, buildRenderOpts());
    return thumbCanvas.toDataURL('image/png');
  }

  function exportResult(wantSVG) {
    const opt = exportSizeSelect.selectedOptions[0];
    const w = parseInt(opt.dataset.w, 10), h = parseInt(opt.dataset.h, 10);
    exportStatus.textContent = `Rendering at ${w}×${h}px…`;
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    setTimeout(() => {
      const opts = buildRenderOpts();
      const placeSlug = (opts.caption.place || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().slice(0, 10);
      if (wantSVG) {
        const painter = new SVGPainter(w, h);
        MapRender.render(painter, w, h, opts);
        Utils.downloadSVGString(painter.toString(), `location-${placeSlug}-${opt.value}-${date}.svg`);
      } else {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w; exportCanvas.height = h;
        MapRender.render(new CanvasPainter(exportCanvas.getContext('2d'), w, h), w, h, opts);
        Utils.downloadCanvasPNG(exportCanvas, `location-${placeSlug}-${opt.value}-${date}.png`);
      }
      recordLocationExport({
        thumbnail: makeHistoryThumbnail(),
        place: opts.caption.place,
        country: opts.caption.country,
        lat: opts.caption.lat,
        lon: opts.caption.lon,
        paletteName: state.gtaStyle ? GTA_STYLE_PALETTE.name : state.mw2Style ? MW2_STYLE_PALETTE.name : state.rdr2Style ? RDR2_STYLE_PALETTE.name : getMapPalette(state.mapPaletteId).name,
        format: wantSVG ? 'svg' : 'png',
        sizeLabel: opt.textContent,
        timestamp: Date.now(),
        recolor: buildRecolorGeometry(opts),
      });
      exportStatus.textContent = 'Saved.';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    }, 20);
  }

  function init() {
    canvas = el('locationCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvasForRatio();
    state.scale = clampScale(mapAreaHeight(canvas.height) / 0.05);

    RATIO_PRESETS.forEach(r => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = r.label; btn.dataset.ratioId = r.id;
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
      btn.type = 'button'; btn.textContent = l.label; btn.dataset.layoutId = l.id;
      btn.className = l.id === state.layoutId ? 'active' : '';
      btn.addEventListener('click', () => selectLayout(l.id));
      layoutTabs.appendChild(btn);
    });
    layoutHint.textContent = LAYOUT_PRESETS.find(l => l.id === state.layoutId).hint;
    MASK_PRESETS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = m.label; btn.dataset.maskId = m.id;
      btn.className = m.id === state.maskId ? 'active' : '';
      btn.addEventListener('click', () => selectMask(m.id));
      maskTabs.appendChild(btn);
    });

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
        render();
      });
      paletteGrid.appendChild(card);
    });

    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    [showPlaceCheck, showCountryCheck, showCoordsCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showPlace = showPlaceCheck.checked;
      state.showCountry = showCountryCheck.checked;
      state.showCoords = showCoordsCheck.checked;
      render();
      invalidateFetch(); // het onderschrift-blok kan van hoogte veranderen (mapH)
    }));
    [placeNameInput, countryNameInput].forEach(inp => inp.addEventListener('input', render));

    addPinBtn.addEventListener('click', () => {
      state.addingPin = !state.addingPin;
      addPinBtn.classList.toggle('active', state.addingPin);
      addPinBtn.textContent = state.addingPin ? 'Click the map…' : 'Add pin';
    });
    clearPinsBtn.addEventListener('click', () => { state.pins = []; render(); });
    pinColorInput.addEventListener('input', () => { pinColorTouched = true; render(); });
    pinAddressSearchBtn.addEventListener('click', runPinAddressSearch);
    pinAddressInput.addEventListener('keydown', e => { if (e.key === 'Enter') runPinAddressSearch(); });
    refreshAutoPinColor();

    // Isoleren (weg-knippen) en uitlichten (omgeving laten staan maar
    // vervagen) zijn twee verschillende weergaven van dezelfde opgezochte
    // grens — elkaar dus uitsluitend, net als de Game Styles hieronder.
    isolateAreaCheck.addEventListener('change', () => {
      state.isolateArea = isolateAreaCheck.checked;
      if (state.isolateArea) { state.highlightArea = false; highlightAreaCheck.checked = false; }
      render();
      invalidateFetch();
    });
    highlightAreaCheck.addEventListener('change', () => {
      state.highlightArea = highlightAreaCheck.checked;
      if (state.highlightArea) { state.isolateArea = false; isolateAreaCheck.checked = false; }
      render();
      invalidateFetch();
    });
    gtaStyleCheck.addEventListener('change', () => setGameStyle(gtaStyleCheck.checked ? 'gta' : null));
    mw2StyleCheck.addEventListener('change', () => setGameStyle(mw2StyleCheck.checked ? 'mw2' : null));
    rdr2StyleCheck.addEventListener('change', () => setGameStyle(rdr2StyleCheck.checked ? 'rdr2' : null));

    exportSVGBtn.addEventListener('click', () => exportResult(true));
    exportPNGBtn.addEventListener('click', () => exportResult(false));
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    updateExportSizes();

    wireCanvasInteraction();
    render();
  }

  function onShow() {
    if (!ready) {
      ready = true;
      init();
      scheduleFetch(0);
    }
  }

  return { onShow, getHistory: loadLocationHistory };
})();
