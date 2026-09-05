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
  // Bewaart alleen een miniatuur + metadata, niet de volledige straten/
  // water-geometrie — die kan flink oplopen qua omvang en is (anders dan
  // een generatieve seed) niet compact reproduceerbaar.
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
    current: null, // { bounds, streets, landmarks, place, country, lat, lon }
    generating: false,
  };

  let map = null;

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
  const showLandmarksCheck = el('showLandmarksCheck');
  const showPlaceCheck = el('showPlaceCheck');
  const showCountryCheck = el('showCountryCheck');
  const showCoordsCheck = el('showCoordsCheck');
  const gtaStyleCheck = el('gtaStyleCheck');
  const gtaStyleHint = el('gtaStyleHint');
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
    [showPlaceCheck, showCountryCheck, showCoordsCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showPlace = showPlaceCheck.checked;
      state.showCountry = showCountryCheck.checked;
      state.showCoords = showCoordsCheck.checked;
      if (state.current) renderResult();
    }));

    gtaStyleCheck.addEventListener('change', () => {
      state.gtaStyle = gtaStyleCheck.checked;
      paletteGrid.classList.toggle('disabled', state.gtaStyle);
      gtaStyleHint.hidden = !state.gtaStyle;
      if (state.current) renderResult();
    });

    exportSVGBtn.addEventListener('click', () => exportResult(true));
    exportPNGBtn.addEventListener('click', () => exportResult(false));

    window.addEventListener('resize', () => { if (map) updateOverlaySize(); });
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers',
    }).addTo(map);
    updateOverlaySize();
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
        btn.addEventListener('click', () => {
          map.setView([parseFloat(r.lat), parseFloat(r.lon)], 14);
          searchResults.hidden = true;
        });
        searchResults.appendChild(btn);
      });
    } catch (err) {
      searchResults.innerHTML = `<div class="location-search-result">Zoeken mislukt: ${err.message}</div>`;
    }
  }

  // ---- genereren ----
  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Groot gebied geselecteerd — alleen hoofdwegen en de bekendste landmarks worden getoond, om de kaart snel en overzichtelijk te houden.',
    country: 'Zeer groot gebied (land-niveau) geselecteerd — alleen hoofdwegen, grote wateren en de bekendste landmarks van dit land worden getoond.',
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
      const bounds = getOverlayBounds();
      const tier = MapGeo.classifyAreaTier(bounds);
      applyAreaTier(tier);
      const streets = await MapGeo.fetchStreets(bounds, tier);
      let landmarks = null;
      if (state.showLandmarks) {
        statusEl.textContent = 'Bezig met opzoeken van landmarks…';
        landmarks = await MapGeo.fetchLandmarks(bounds, tier);
      }
      const centerLat = (bounds.north + bounds.south) / 2;
      const centerLon = (bounds.east + bounds.west) / 2;
      statusEl.textContent = 'Plaatsnaam opzoeken…';
      let place = '', country = '';
      try {
        const geo = await MapGeo.reverseGeocode(centerLat, centerLon);
        place = geo.place; country = geo.country;
      } catch (geoErr) {
        statusEl.textContent = `Kaart opgehaald, maar plaatsnaam kon niet worden bepaald (${geoErr.message}).`;
      }
      state.current = { bounds, tier, streets, landmarks, place, country, lat: centerLat, lon: centerLon };
      renderResult();
      updateExportSizes();
      resultPanel.hidden = false;
      exportPanel.hidden = false;
      statusEl.textContent = `Klaar — ${streets.length} elementen geladen.`;
    } catch (err) {
      statusEl.textContent = `Ophalen mislukt: ${err.message}. Probeer een kleiner gebied of probeer het zo opnieuw.`;
    } finally {
      state.generating = false;
      generateBtn.disabled = false;
    }
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
      landmarks: c.landmarks || [],
      palette: getMapPalette(state.mapPaletteId),
      gtaStyle: state.gtaStyle,
      showStreetLabels: state.showStreetLabels,
      showLandmarks: state.showLandmarks && !!c.landmarks,
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

  function makeHistoryThumbnail() {
    const ratio = state.ratio.w / state.ratio.h;
    const th = 200;
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
        paletteName: state.gtaStyle ? GTA_STYLE_PALETTE.name : getMapPalette(state.mapPaletteId).name,
        format: wantSVG ? 'svg' : 'png',
        sizeLabel: opt.textContent,
        timestamp: Date.now(),
      });
      exportStatus.textContent = 'Opgeslagen.';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    }, 20);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onShow, getHistory: loadLocationHistory };
})();
