// "Map Test"-tab: kaart en resultaat samengevoegd in één levend, pannable/
// zoombaar canvas — de gestylde kaart IS de interactieve kaart, in
// tegenstelling tot Location (aparte rauwe Leaflet-achtergrond die je met
// een kader selecteert, gevolgd door een losse "Genereer"-stap). Hier pas je
// gewoon meteen aan wat je ziet, en exporteer je vanaf hetzelfde scherm.
//
// Overpass mag niet op elke pixel pan/zoom bevraagd worden (rate-limits),
// dus: elke pan/zoom tekent METEEN opnieuw met de al opgehaalde data (snel,
// geen netwerk), en een gedebounced timer haalt pas verse data op zodra je
// even stilstaat — voor een ruimer gebied dan strikt zichtbaar is, zodat
// kleine bewegingen binnen die marge niets hoeven te verversen.
window.MapTestApp = (() => {
  const RATIO_PRESETS = [
    { id: '2x3', label: '2:3', w: 2, h: 3 },
    { id: '3x4', label: '3:4', w: 3, h: 4 },
    { id: '4x5', label: '4:5', w: 4, h: 5 },
    { id: '1x1', label: '1:1', w: 1, h: 1 },
    { id: '3x2', label: '3:2', w: 3, h: 2 },
  ];

  const LAYOUT_PRESETS = [
    { id: 'default', label: 'Default', hint: 'The map sits above a plain mat that holds the caption.' },
    { id: 'fade', label: 'Fade', hint: 'Full-bleed map — the caption sits directly on it, over a dark fade at the bottom.' },
    { id: 'gallery', label: 'Gallery', hint: 'Like Default, with a thin frame line and museum-label rules around the caption.' },
    { id: 'stamp', label: 'Stamp', hint: 'Full-bleed map with a small captioned label tucked in the bottom-left corner.' },
    { id: 'ledger', label: 'Ledger', hint: 'Full-bleed map with a slim, left-aligned caption strip along the bottom edge.' },
  ];
  const FULL_BLEED_LAYOUTS = new Set(['fade', 'stamp', 'ledger']);

  const MASK_PRESETS = [
    { id: 'none', label: 'None' },
    { id: 'circle', label: 'Circle' },
    { id: 'heart', label: 'Heart' },
    { id: 'diamond', label: 'Diamond' },
    { id: 'hexagon', label: 'Hexagon' },
    { id: 'arch', label: 'Arch' },
    { id: 'bloom', label: 'Bloom' },
  ];

  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Large area — only main roads are shown, to keep the map fast and readable.',
    country: 'Very large area (country level) — only main roads and major bodies of water are shown.',
    continent: 'Continent level — at this scale, street/road data isn\'t meaningful; only the silhouette of the area is drawn.',
  };

  const CANVAS_LONG_EDGE = 900; // preview-resolutie, niet de exportresolutie
  const FETCH_DEBOUNCE_MS = 550;
  const FETCH_PADDING = 0.6; // extra marge rond het zichtbare gebied bij ophalen

  const state = {
    center: { lat: 52.3676, lon: 4.9041 },
    scale: 0, // px per graad breedtegraad ("zoom") — gezet in init()
    ratioId: '2x3', ratio: { w: 2, h: 3 },
    layoutId: 'default', maskId: 'none',
    mapPaletteId: MAP_PALETTES[0].id,
    showPlace: true, showCountry: true, showCoords: true,
    pins: [], addingPin: false,
    place: '', country: '', autoPlace: '', autoCountry: '',
    streets: [], tier: 'street',
    fetchedBounds: null, fetchedTier: null,
    fetching: false,
  };

  let canvas = null, ctx = null;
  let pinColorTouched = false;
  let fetchTimer = null;
  let placeNameTimer = null;
  let renderQueued = false;
  let ready = false;
  let drag = null; // { x, y, moved, center }

  const el = id => document.getElementById(id);
  const searchInput = el('mapTestSearchInput');
  const searchBtn = el('mapTestSearchBtn');
  const searchResults = el('mapTestSearchResults');
  const ratioTabs = el('mapTestRatioTabs');
  const areaTierHint = el('mapTestAreaTierHint');
  const statusEl = el('mapTestStatus');
  const layoutTabs = el('mapTestLayoutTabs');
  const layoutHint = el('mapTestLayoutHint');
  const maskTabs = el('mapTestMaskTabs');
  const paletteGrid = el('mapTestPaletteGrid');
  const showPlaceCheck = el('mapTestShowPlaceCheck');
  const placeNameInput = el('mapTestPlaceNameInput');
  const showCountryCheck = el('mapTestShowCountryCheck');
  const countryNameInput = el('mapTestCountryNameInput');
  const showCoordsCheck = el('mapTestShowCoordsCheck');
  const addPinBtn = el('mapTestAddPinBtn');
  const clearPinsBtn = el('mapTestClearPinsBtn');
  const pinColorInput = el('mapTestPinColorInput');
  const pinAddressInput = el('mapTestPinAddressInput');
  const pinAddressSearchBtn = el('mapTestPinAddressSearchBtn');
  const pinAddressResults = el('mapTestPinAddressResults');
  const exportSizeSelect = el('mapTestExportSize');
  const exportSVGBtn = el('mapTestExportSVGBtn');
  const exportPNGBtn = el('mapTestExportPNGBtn');
  const exportStatus = el('mapTestExportStatus');

  function relLuminance(hex) {
    const { r, g, b } = Utils.hexToRgb(hex);
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  }
  function autoPinColor(bgHex) {
    return relLuminance(bgHex) > 0.5 ? '#e63946' : '#ffb703';
  }
  function refreshAutoPinColor() {
    if (!pinColorTouched) pinColorInput.value = autoPinColor(getMapPalette(state.mapPaletteId).bg);
  }

  // ---- geometrie: canvaspixels <-> lat/lon ----
  // Zelfde "cover"-wiskunde als MapGeo.makeCoverProjector, maar dan
  // omgekeerd opgebouwd: de bounds worden hier AFGELEID van center+scale+
  // canvasgrootte (i.p.v. andersom), zodanig dat spanX/spanY exact de
  // canvas-verhouding hebben — daardoor komt makeCoverProjector's
  // cover-fit altijd 1-op-1 uit (geen crop/offset), en blijven klikken/
  // pins pixel-nauwkeurig kloppen met wat er getekend wordt.
  function fullBleed() {
    return FULL_BLEED_LAYOUTS.has(state.layoutId);
  }
  function captionOpts() {
    return { showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords };
  }
  function mapAreaHeight(h) {
    if (fullBleed()) return h;
    const layout = MapRender.captionLayout(h, captionOpts());
    return h - layout.total;
  }
  function computeViewBounds() {
    const mapH = mapAreaHeight(canvas.height);
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    const spanLatDeg = mapH / state.scale;
    const spanLonDeg = canvas.width / (state.scale * cosLat);
    return {
      north: state.center.lat + spanLatDeg / 2, south: state.center.lat - spanLatDeg / 2,
      east: state.center.lon + spanLonDeg / 2, west: state.center.lon - spanLonDeg / 2,
    };
  }
  function pixelToLatLon(px, py) {
    const bounds = computeViewBounds();
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    return { lat: bounds.north - py / state.scale, lon: bounds.west + px / (state.scale * cosLat) };
  }
  function projectLatLon(lat, lon) {
    const bounds = computeViewBounds();
    const cosLat = Math.cos((state.center.lat * Math.PI) / 180) || 0.0001;
    return { x: (lon - bounds.west) * state.scale * cosLat, y: (bounds.north - lat) * state.scale };
  }
  function clampScale(s) {
    const minScale = canvas.height / 55; // uitgezoomd tot een groot land/regio
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
  function scheduleFetch(delay = FETCH_DEBOUNCE_MS) {
    clearTimeout(fetchTimer);
    fetchTimer = setTimeout(maybeFetch, delay);
  }
  async function maybeFetch() {
    if (state.fetching) { scheduleFetch(200); return; }
    const viewBounds = computeViewBounds();
    const tier = MapGeo.classifyAreaTier(viewBounds);
    const haveEnough = state.fetchedBounds && state.fetchedTier === tier && boundsContain(state.fetchedBounds, viewBounds);
    if (haveEnough) return;
    state.fetching = true;
    statusEl.textContent = 'Loading map data…';
    try {
      const padded = padBounds(viewBounds, FETCH_PADDING);
      const streets = await MapGeo.fetchStreets(padded, tier);
      state.streets = streets;
      state.fetchedBounds = padded;
      state.fetchedTier = tier;
      state.tier = tier;
      areaTierHint.textContent = AREA_TIER_NOTE[tier] || '';
      areaTierHint.hidden = !AREA_TIER_NOTE[tier];
      render();
      statusEl.textContent = '';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
      schedulePlaceNameRefresh();
    } catch (err) {
      statusEl.textContent = `Couldn't load map data: ${err.message}. Try zooming out a little.`;
    } finally {
      state.fetching = false;
    }
  }

  function schedulePlaceNameRefresh() {
    clearTimeout(placeNameTimer);
    placeNameTimer = setTimeout(refreshPlaceName, 400);
  }
  async function refreshPlaceName() {
    try {
      const geo = await MapGeo.reverseGeocode(state.center.lat, state.center.lon);
      state.autoPlace = geo.place; state.autoCountry = geo.country;
      render();
    } catch { /* stille no-op: het onderschrift is puur decoratief, geen blokkerende fout waard */ }
  }

  // ---- tekenen ----
  function buildRenderOpts() {
    return {
      bounds: computeViewBounds(),
      streets: state.streets,
      palette: getMapPalette(state.mapPaletteId),
      tier: state.tier,
      layout: state.layoutId,
      mask: state.maskId,
      pins: state.pins,
      pinColor: pinColorInput.value,
      caption: {
        showPlace: state.showPlace, showCountry: state.showCountry, showCoords: state.showCoords,
        place: placeNameInput.value.trim() || state.autoPlace,
        country: countryNameInput.value.trim() || state.autoCountry,
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
    const { x, y } = projectLatLon(pin.lat, pin.lon);
    const r = Math.min(canvas.width, mapAreaHeight(canvas.height)) * 0.016;
    const headCenter = { x, y: y - r * 1.7 };
    const dHead = Math.hypot(pt.x - headCenter.x, pt.y - headCenter.y);
    const dTip = Math.hypot(pt.x - x, pt.y - y);
    return dHead < r * 1.5 || dTip < r * 0.7;
  }

  function handleCanvasClick(pt) {
    if (pt.y > mapAreaHeight(canvas.height)) return; // klik in de onderschrift-mat: negeren
    const hitIdx = state.pins.findIndex(p => pinHitTest(pt, p));
    if (hitIdx >= 0) {
      state.pins.splice(hitIdx, 1);
      render();
      return;
    }
    if (!state.addingPin) return;
    const { lat, lon } = pixelToLatLon(pt.x, pt.y);
    state.pins.push({ lat, lon });
    render();
  }

  function wireCanvasInteraction() {
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
      const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
      state.center = {
        lat: drag.center.lat + dy / state.scale,
        lon: drag.center.lon - dx / (state.scale * cosLat),
      };
      requestRender();
      scheduleFetch();
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
      state.scale = clampScale(state.scale * Math.exp(-e.deltaY * 0.0016));
      requestRender();
      scheduleFetch();
    }, { passive: false });

    // Eenvoudige touch-ondersteuning: één vinger = pannen, twee vingers =
    // knijpen om te zoomen (afstand tussen de vingers t.o.v. de vorige frame).
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
        const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
        state.center = {
          lat: drag.center.lat + dy / state.scale,
          lon: drag.center.lon - dx / (state.scale * cosLat),
        };
        requestRender();
        scheduleFetch();
      } else if (e.touches.length === 2 && pinchDist != null) {
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
  function jumpTo(lat, lon) {
    state.center = { lat, lon };
    state.scale = clampScale(mapAreaHeight(canvas.height) / 0.02);
    placeNameInput.value = ''; countryNameInput.value = '';
    render();
    scheduleFetch(0);
  }

  async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchResults.hidden = false;
    searchResults.innerHTML = '<div class="location-search-result">Searching…</div>';
    try {
      const results = await MapGeo.searchPlace(q);
      searchResults.innerHTML = '';
      if (results.length === 0) { searchResults.innerHTML = '<div class="location-search-result">Nothing found.</div>'; return; }
      results.forEach(r => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'location-search-result'; btn.textContent = r.display_name;
        btn.addEventListener('click', () => { searchResults.hidden = true; jumpTo(parseFloat(r.lat), parseFloat(r.lon)); });
        searchResults.appendChild(btn);
      });
    } catch (err) {
      searchResults.innerHTML = `<div class="location-search-result">Search failed: ${err.message}</div>`;
    }
  }

  // Zelfde soort adres-zoekopdracht als bij Location's Pins, maar hier zet
  // een gekozen resultaat gewoon een pin neer zonder het zicht te verplaatsen.
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

  // ---- canvasgrootte ----
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
    const preset = RATIO_PRESETS.find(r => r.id === id);
    state.ratio = { w: preset.w, h: preset.h };
    resizeCanvasForRatio();
    updateExportSizes();
    render();
    scheduleFetch(0);
  }

  function selectLayout(id) {
    state.layoutId = id;
    [...layoutTabs.children].forEach(b => b.classList.toggle('active', b.dataset.layoutId === id));
    layoutHint.textContent = LAYOUT_PRESETS.find(l => l.id === id).hint;
    render();
    scheduleFetch(0); // de kaart-hoogte kan veranderen (full-bleed vs. mat), dus check of er meer data nodig is
  }

  function selectMask(id) {
    state.maskId = id;
    [...maskTabs.children].forEach(b => b.classList.toggle('active', b.dataset.maskId === id));
    render();
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

  function exportResult(wantSVG) {
    const opt = exportSizeSelect.selectedOptions[0];
    const w = parseInt(opt.dataset.w, 10), h = parseInt(opt.dataset.h, 10);
    exportStatus.textContent = `Rendering at ${w}×${h}px…`;
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    setTimeout(() => {
      const opts = buildRenderOpts();
      const place = (opts.caption.place || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().slice(0, 10);
      if (wantSVG) {
        const painter = new SVGPainter(w, h);
        MapRender.render(painter, w, h, opts);
        Utils.downloadSVGString(painter.toString(), `maptest-${place}-${opt.value}-${date}.svg`);
      } else {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = w; exportCanvas.height = h;
        MapRender.render(new CanvasPainter(exportCanvas.getContext('2d'), w, h), w, h, opts);
        Utils.downloadCanvasPNG(exportCanvas, `maptest-${place}-${opt.value}-${date}.png`);
      }
      exportStatus.textContent = 'Saved.';
      exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    }, 20);
  }

  function init() {
    canvas = el('mapTestCanvas');
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
      scheduleFetch(0); // het onderschrift-blok kan van hoogte veranderen (mapH), dus check of er meer data nodig is
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

  return { onShow };
})();
