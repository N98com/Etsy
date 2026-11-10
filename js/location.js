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
// Isoleren/Game Styles blijven bestaan naast dit live-pannen: "Isolate area"
// en "Highlight area" waren losse gebruikersopties, maar zijn op verzoek uit
// de UI gehaald. Isoleren zelf (contain-fit op een vaste, opgezochte grens)
// bestaat wel nog — nu alleen nog automatisch aangestuurd door een Game
// Style (MW2/RDR2, zie forcesIsolate) — pannen/zoomen is dan zinloos (het is
// geen navigeerbaar venster meer) en wordt uitgeschakeld zolang dat actief
// is; zonder een opgezochte grens valt isoleren terug op de laatst bekeken
// live-view als rechthoek.
window.LocationApp = (() => {
  // Arabische Unicode-blokken (basis + presentatievormen) — gebruikt om te
  // detecteren of een getypte zoekterm Arabisch is, zodat we Nominatim
  // vragen om de plaatsnaam/land in het Arabisch terug te geven (voor
  // klanten uit het Midden-Oosten). Triggert alléén op een Arabische
  // zoekterm — een gewone (Latijnse) zoekopdracht verandert niets.
  const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  function isArabicText(s) { return ARABIC_RE.test(s || ''); }

  // Sizes-dropdown: de echte, bestelbare formaten uit Prodigi's Enhanced
  // Matte Art-maattabel (200gsm print-on-demand papier, zie de N°98 Print
  // Sizes-referentietool) — alleen de staand/liggend-formaten (dus geen
  // vierkante) die wereldwijd verzonden worden (dus zonder de vijf grootste,
  // die alleen vanuit UK/EU/VS-printlocaties gaan). Elke optie is dus een
  // écht Prodigi-product: kiezen zet niet alleen de beeldverhouding, maar
  // toont ook meteen exact dát ene bestelbare formaat in "Format" hieronder
  // — geen tussenmaat die toevallig in de buurt komt.
  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
  // Gelato's eigen "nette" cm-maten zijn de echte druk-target (niet inch×2,54
  // afgerond) — anders wijkt het exportbestand 1-2cm af van wat er echt wordt
  // afgedrukt. [inW, inH, cmW, cmH] per formaat, zoals Gelato ze zelf voert.
  const GELATO_SIZES = [
    [8, 10, 20, 25], [11, 14, 27, 35], [12, 16, 30, 40], [16, 20, 40, 50],
    [18, 24, 45, 60], [20, 28, 50, 70], [24, 36, 60, 90], [28, 40, 70, 100],
  ];
  const RATIO_PRESETS = GELATO_SIZES.map(([inW, inH, cmW, cmH]) => {
    const g = gcd(cmW, cmH);
    const dpi = 300;
    return {
      id: `in${inW}x${inH}`, label: `${inW}×${inH}in · ${cmW}×${cmH}cm`,
      w: cmW / g, h: cmH / g,
      inW, inH, cmW, cmH,
      pxW: Math.round((cmW / 2.54) * dpi), pxH: Math.round((cmH / 2.54) * dpi),
    };
  });

  // De oorspronkelijke, bredere maatlijst (van vóór de overstap naar Gelato's
  // 8 vaste formaten) — niet meer de standaardkeuzes, maar nog steeds nodig
  // voor niet-standaard/custom-orders. Ondergebracht onder Sizes → "Other".
  const OTHER_SIZES_IN = [
    [10, 12], [11, 14], [11, 17], [12, 16], [10, 20], [12, 18], [12, 24],
    [16, 20], [14, 24], [16, 32], [20, 30], [20, 36], [24, 32], [20, 40],
    [24, 36], [26, 38], [28, 40], [30, 45], [30, 60], [40, 48], [40, 50],
  ];
  // Meest gangbare beeldverhoudingen als losse voorkeuze — handig om snel een
  // custom-aanvraag buiten de vaste maten te fulfillen zonder zelf px/cm uit
  // te rekenen. Basislengte 24in (ruim genoeg voor een hoge-resolutie export,
  // vervolgens desgewenst nog op te schalen via "Format" hieronder).
  const RATIO_ONLY_SIZES = [
    { name: 'Square', ratio: '1:1', inW: 24, inH: 24 },
    { name: 'Portrait', ratio: '4:5', inW: 19, inH: 24 },
    { name: 'Portrait', ratio: '3:4', inW: 18, inH: 24 },
    { name: 'Portrait', ratio: '2:3', inW: 16, inH: 24 },
    { name: 'Portrait', ratio: '5:7', inW: 17, inH: 24 },
    { name: 'Landscape', ratio: '4:3', inW: 24, inH: 18 },
    { name: 'Landscape', ratio: '16:9', inW: 24, inH: 14 },
    { name: 'ISO / A-series', ratio: '1:1.41', inW: 16, inH: 22 },
  ];
  const OTHER_RATIO_PRESETS = [
    ...OTHER_SIZES_IN.map(([inW, inH]) => {
      const g = gcd(inW, inH);
      const cmW = Math.round(inW * 2.54), cmH = Math.round(inH * 2.54);
      const dpi = 300;
      return {
        id: `other-in${inW}x${inH}`, label: `${inW}×${inH}in · ${cmW}×${cmH}cm`,
        w: inW / g, h: inH / g,
        inW, inH, cmW, cmH,
        pxW: Math.round(inW * dpi), pxH: Math.round(inH * dpi),
      };
    }),
    ...RATIO_ONLY_SIZES.map(({ name, ratio, inW, inH }) => {
      const g = gcd(inW, inH);
      const cmW = Math.round(inW * 2.54), cmH = Math.round(inH * 2.54);
      const dpi = 300;
      return {
        id: `other-ratio-${inW}x${inH}`, label: `${name} · ${ratio} · ${inW}×${inH}in · ${cmW}×${cmH}cm`,
        w: inW / g, h: inH / g,
        inW, inH, cmW, cmH,
        pxW: Math.round(inW * dpi), pxH: Math.round(inH * dpi),
      };
    }),
  ];
  RATIO_PRESETS.push({ id: 'custom', label: 'Custom', w: null, h: null });
  RATIO_PRESETS.push({ id: 'other', label: 'Other', w: null, h: null });

  // Vijf posterlayouts — zie js/mapRender.js voor de tekencode van elk.
  const LAYOUT_PRESETS = [
    { id: 'default', label: 'Frame', hint: 'The map sits above a plain mat that holds the caption.' },
    { id: 'fade', label: 'Fade', hint: 'Full-bleed map. The caption sits directly on it, over a dark fade at the bottom.' },
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

  // Pin-icoontjes — zie mapRender.js's drawPinIcon voor de tekencode van elk.
  const PIN_ICON_PRESETS = [
    { id: 'basic', label: 'Basic' },
    { id: 'heart', label: 'Heart' },
    { id: 'house', label: 'House' },
    // uit de pin-collectie (nrs. 16, 1, 7, 8, 12) — zie drawPinIcon in mapRender.js
    { id: 'heartpin', label: 'Heart pin' },
    { id: 'rings', label: 'Rings' },
    { id: 'paw', label: 'Paw' },
    { id: 'tree', label: 'Tree' },
    { id: 'star', label: 'Star' },
    // losse letters/initialen in Cinzel (max. 3 tekens) — zie drawLetters in mapRender.js
    { id: 'letters', label: 'Letters' },
  ];

  // Vijf onderschrift-lettertypes, gekozen uit een specimen-vergelijking op
  // basis van een aangeleverde referentieafbeelding — id's + family/weight/
  // style komen 1-op-1 overeen met CAPTION_FONT_PRESETS in mapRender.js
  // (dat de daadwerkelijke tekencode heeft). previewFamily/previewWeight/
  // previewStyle renderen de knop zelf al in dat lettertype, zodat je het
  // verschil meteen ziet zonder eerst te hoeven klikken.
  const CAPTION_FONT_PRESETS = [
    { id: 'default', label: 'Default', previewFamily: 'Georgia, serif', previewWeight: '600', previewStyle: 'normal' },
    { id: 'eb-garamond-italic', label: 'EB Garamond', previewFamily: "'EB Garamond', Georgia, serif", previewWeight: '400', previewStyle: 'italic' },
    { id: 'playfair-bold', label: 'Playfair Display', previewFamily: "'Playfair Display', Georgia, serif", previewWeight: '700', previewStyle: 'normal' },
    { id: 'space-mono', label: 'Space Mono', previewFamily: "'Space Mono', monospace", previewWeight: '700', previewStyle: 'normal' },
    { id: 'kalam-bold', label: 'Kalam', previewFamily: "'Kalam', cursive", previewWeight: '700', previewStyle: 'normal' },
    { id: 'archivo-black', label: 'Archivo Black', previewFamily: "'Archivo Black', sans-serif", previewWeight: '400', previewStyle: 'normal' },
    { id: 'bebas-neue', label: 'Bebas Neue', previewFamily: "'Bebas Neue', sans-serif", previewWeight: '400', previewStyle: 'normal' },
    { id: 'lobster-two', label: 'Lobster Two', previewFamily: "'Lobster Two', cursive", previewWeight: '700', previewStyle: 'normal' },
    { id: 'kaushan-script', label: 'Kaushan Script', previewFamily: "'Kaushan Script', cursive", previewWeight: '400', previewStyle: 'normal' },
  ];

  const AREA_TIER_NOTE = {
    street: '', city: '',
    region: 'Large area selected. Only main roads are shown, to keep the map fast and readable.',
    country: 'Very large area (country level) selected. Only main roads and major bodies of water are shown.',
    continent: 'Huge area selected (a large country or continent). Only motorways, major water and country borders are shown, at a coarser zoom, to keep it fast.',
  };

  const CANVAS_LONG_EDGE = 900; // preview-resolutie, niet de exportresolutie
  const FETCH_DEBOUNCE_MS = 550;
  const FETCH_PADDING = 0.6; // extra marge rond het zichtbare gebied bij ophalen
  const FETCH_CACHE_MAX = 20; // aantal eerder opgehaalde gebieden dat warm blijft

  // Grens (in totaal aantal pixels) waarboven een PNG-export via Utils'
  // tegel-encoder loopt i.p.v. in één keer op één grote canvas — bij bv.
  // 96×120cm@300dpi (ruim 160 miljoen pixels) heeft die ene canvas alleen al
  // ~640MB nodig, wat op mobiel vaak simpelweg mislukt. 35 miljoen pixels
  // ligt tussen het 60cm-formaat (blijft op de snelle, directe weg) en het
  // 70cm-formaat (waar dit voor het eerst misging) in. STREAMING_PNG_TILE_
  // PIXEL_BUDGET is hoeveel pixels (~4 bytes elk) één tegel maximaal beslaat
  // — ruim binnen het geheugen van elk toestel, ongeacht het totale formaat.
  const LARGE_PNG_PIXEL_THRESHOLD = 35_000_000;
  const STREAMING_PNG_TILE_PIXEL_BUDGET = 12_000_000;

  const state = {
    center: { lat: 52.3676, lon: 4.9041 },
    scale: 0, // px per graad breedtegraad ("zoom") — gezet in init()
    ratioId: 'in10x12', ratio: { w: 5, h: 6 },
    layoutId: 'fade', maskId: 'none', pinIconId: 'basic', pinScale: 1,
    mapPaletteId: MAP_PALETTES[0].id,
    captionFontId: CAPTION_FONT_PRESETS[0].id,
    showPlace: true, showRegion: false, showCountry: true, showCoords: true,
    placeFontScale: 1, regionFontScale: 1, countryFontScale: 1, coordsFontScale: 1,
    gtaStyle: false, mw2Style: false, rdr2Style: false, experimentalStyle: false, nightlightStyle: false,
    pins: [], addingPin: false, selectedPin: null,
    autoPlace: '', autoRegion: '', autoCountry: '', captionLang: null,
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
  // Een klaarstaande grote PNG (zie exportResult): het tegel-encoderen kan
  // tientallen seconden duren, ruim voorbij het korte venster waarin een
  // mobiele browser een <a download>-klik nog aan de oorspronkelijke tik
  // koppelt — dus wordt niet meteen gedownload zodra het klaar is, maar pas
  // bij een tweede, verse tik op dezelfde knop (zie exportPNGBtn's listener).
  let pendingPNGDownload = null;
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
  const ratioSizesHint = el('ratioSizesHint');
  const customRatioRow = el('customRatioRow');
  const customRatioW = el('customRatioW');
  const customRatioH = el('customRatioH');
  const otherRatioRow = el('otherRatioRow');
  const otherRatioSelect = el('otherRatioSelect');
  const areaTierHint = el('areaTierHint');
  const statusEl = el('locationStatus');
  const layoutTabs = el('layoutTabs');
  const layoutHint = el('layoutHint');
  const maskTabs = el('maskTabs');
  const maskColorInput = el('maskColorInput');
  const pinIconTabs = el('pinIconTabs');
  const paletteGrid = el('mapPaletteGrid');
  const solidPaletteGrid = el('solidPaletteGrid');
  const fontTabs = el('fontTabs');
  const captionColorOverrideCheck = el('captionColorOverrideCheck');
  const captionColorInput = el('captionColorInput');
  const showPlaceCheck = el('showPlaceCheck');
  const placeNameInput = el('placeNameInput');
  const placeFontSizeInput = el('placeFontSizeInput');
  const placeFontSizeRow = el('placeFontSizeRow');
  const showRegionCheck = el('showRegionCheck');
  const regionNameInput = el('regionNameInput');
  const regionFontSizeInput = el('regionFontSizeInput');
  const regionFontSizeRow = el('regionFontSizeRow');
  const showCountryCheck = el('showCountryCheck');
  const countryNameInput = el('countryNameInput');
  const countryFontSizeInput = el('countryFontSizeInput');
  const countryFontSizeRow = el('countryFontSizeRow');
  const showCoordsCheck = el('showCoordsCheck');
  const coordsFontSizeInput = el('coordsFontSizeInput');
  const coordsFontSizeRow = el('coordsFontSizeRow');
  const addPinBtn = el('addPinBtn');
  const clearPinsBtn = el('clearPinsBtn');
  const pinColorInput = el('pinColorInput');
  const pinAddressInput = el('pinAddressInput');
  const pinSizeInput = el('pinSizeInput');
  const pinsHint = el('pinsHint');
  const pinTextRow = el('pinTextRow');
  const pinTextInput = el('pinTextInput');
  let pinText = 'A'; // tekens voor de volgende letters-pin
  // nieuwe pin van het gekozen type (letters krijgen de ingevoerde tekens mee)
  function newPin(lat, lon) {
    const pin = { lat, lon, icon: state.pinIconId };
    if (pin.icon === 'letters') pin.text = MapRender.cleanPinText(pinText) || 'A';
    return pin;
  }
  function syncPinTextRow() {
    if (!pinTextRow) return;
    pinTextRow.hidden = state.pinIconId !== 'letters';
    const sel = state.selectedPin != null && state.pins[state.selectedPin];
    if (pinTextInput && sel && sel.icon === 'letters' && document.activeElement !== pinTextInput) pinTextInput.value = sel.text || '';
  }
  const pinAddressSearchBtn = el('pinAddressSearchBtn');
  const pinAddressResults = el('pinAddressResults');
  const gtaStyleCheck = el('gtaStyleCheck');
  const gtaStyleHint = el('gtaStyleHint');
  const mw2StyleCheck = el('mw2StyleCheck');
  const mw2StyleHint = el('mw2StyleHint');
  const rdr2StyleCheck = el('rdr2StyleCheck');
  const rdr2StyleHint = el('rdr2StyleHint');
  const experimentalStyleCheck = el('experimentalStyleCheck');
  const experimentalStyleHint = el('experimentalStyleHint');
  const nightlightStyleCheck = el('nightlightStyleCheck');
  const nightlightStyleHint = el('nightlightStyleHint');
  const mapgenLegacyCheck = el('mapgenLegacyCheck');
  const exportSizeSelect = el('locationExportSize');
  const exportSVGBtn = el('locationExportSVGBtn');
  const exportPNGBtn = el('locationExportPNGBtn');
  const exportStatus = el('locationExportStatus');
  const printBorderCheck = el('printBorderCheck');
  const watermarkRow = el('watermarkRow');
  const watermarkEnabledCheck = el('watermarkEnabledCheck');
  const watermarkTextInput = el('watermarkTextInput');

  // Watermerk-export: puur voor deze ene gebruiker, om klanten alvast een
  // preview te kunnen sturen zonder dat het eindresultaat zomaar overgenomen
  // kan worden — niemand anders die inlogt ziet deze optie. Client-side
  // check (geen server-side afdwinging), zoals afgesproken puur een UI-gemak.
  const WATERMARK_ACCOUNT_EMAIL = 'bramengbers@hotmail.nl';
  function canUseWatermark() { return window.currentUserEmail === WATERMARK_ACCOUNT_EMAIL; }

  function getActivePalette() {
    if (state.gtaStyle) return GTA_STYLE_PALETTE;
    if (state.mw2Style) return MW2_STYLE_PALETTE;
    if (state.rdr2Style) return RDR2_STYLE_PALETTE;
    if (state.experimentalStyle) return EXPERIMENTAL_STYLE_PALETTE;
    if (state.nightlightStyle) return NIGHTLIGHT_STYLE_PALETTE;
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

  // Elke tekstgrootte-slider heeft alleen zin zolang de bijbehorende regel
  // ook echt getoond wordt — verstopt dus mee met de show-checkbox.
  function refreshFontSizeRowVisibility() {
    placeFontSizeRow.hidden = !state.showPlace;
    regionFontSizeRow.hidden = !state.showRegion;
    countryFontSizeRow.hidden = !state.showCountry;
    coordsFontSizeRow.hidden = !state.showCoords;
  }

  // ---- modus-helpers ----
  // Isoleren is geen losse gebruikersoptie meer (die knop is verwijderd) —
  // het gebeurt alleen nog automatisch zodra een Game Style (MW2/RDR2) dat
  // nodig heeft, zie forcesIsolate hieronder.
  function forcesIsolate() { return state.mw2Style || state.rdr2Style; }
  function hasRealBoundary() { return !!(state.selectedPlace && state.selectedPlace.rings); }
  function isolating() { return forcesIsolate(); }

  // ---- geometrie: canvaspixels <-> lat/lon ----
  function fullBleed() { return FULL_BLEED_LAYOUTS.has(state.layoutId); }
  function captionOpts() {
    return {
      showPlace: state.showPlace, showRegion: state.showRegion, showCountry: state.showCountry, showCoords: state.showCoords,
      font: state.captionFontId,
    };
  }
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
    updateExportSizes(currentRatioPreset());
    exportSVGBtn.disabled = false; exportPNGBtn.disabled = false;
    if (embedMode) embedConfirmBtn.disabled = false;
    statusEl.textContent = isolating()
      ? `Isolated (${tier} level)${state.mw2Style ? ` · ${buildings.length} buildings` : ''}.`
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
    const styleHint = state.gtaStyle ? 'gta' : state.rdr2Style ? 'rdr2' : state.experimentalStyle ? 'experimental' : state.nightlightStyle ? 'nightlight' : null;
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
    // Bij isoleren met een echte grens gebruiken we de letterlijke zoekterm
    // als plaatsnaam (zie computePlaceCountry) — geen reverse-geocode nodig,
    // en die zou hier ook vaak het verkeerde antwoord geven.
    if (isolating() && hasRealBoundary()) return;
    try {
      const geo = await MapGeo.reverseGeocode(state.center.lat, state.center.lon, state.captionLang);
      state.autoPlace = geo.place; state.autoRegion = geo.region; state.autoCountry = geo.country;
      render();
    } catch { /* stille no-op: het onderschrift is puur decoratief */ }
  }

  function computePlaceCountry() {
    if (isolating() && hasRealBoundary()) {
      // De letterlijke zoekterm/weergavenaam heeft geen apart staat/provincie-
      // veld (het is vrije tekst, komma-gescheiden) — dat blijft hier dus
      // leeg; de handmatige override vult het zo nodig zelf in.
      const parts = state.selectedPlace.name.split(',').map(s => s.trim()).filter(Boolean);
      return { place: state.selectedPlace.query || parts[0] || state.selectedPlace.name, region: '', country: parts.length > 1 ? parts[parts.length - 1] : '' };
    }
    return { place: state.autoPlace, region: state.autoRegion, country: state.autoCountry };
  }

  // ---- tekenen ----
  function buildRenderOpts() {
    const pc = computePlaceCountry();
    return {
      bounds: effectiveBounds(),
      streets: state.streets,
      buildings: state.buildings,
      palette: getMapPalette(state.mapPaletteId),
      gtaStyle: state.gtaStyle, mw2Style: state.mw2Style, rdr2Style: state.rdr2Style, experimentalStyle: state.experimentalStyle,
      nightlightStyle: state.nightlightStyle,
      tier: state.tier,
      isolate: currentIsolateOpts(),
      layout: state.layoutId, mask: state.maskId, matColor: maskColorInput.value,
      captionTextColor: captionColorOverrideCheck.checked ? captionColorInput.value : null,
      pins: state.pins, pinColor: pinColorInput.value, pinIcon: state.pinIconId, pinScale: state.pinScale,
      caption: {
        showPlace: state.showPlace, showRegion: state.showRegion, showCountry: state.showCountry, showCoords: state.showCoords,
        place: placeNameInput.value.trim() || pc.place,
        region: regionNameInput.value.trim() || pc.region,
        country: countryNameInput.value.trim() || pc.country,
        lat: state.center.lat, lon: state.center.lon,
        font: state.captionFontId,
        placeScale: state.placeFontScale, regionScale: state.regionFontScale, countryScale: state.countryFontScale, coordsScale: state.coordsFontScale,
      },
    };
  }
  function render() {
    // Een klaarstaande grote-PNG-download (zie exportResult) hoort bij
    // precies de instellingen van het moment dat 'm werd voorbereid — zodra
    // er iets verandert (elke aanpassing loopt via deze render()) is hij
    // niet meer geldig.
    if (pendingPNGDownload) {
      pendingPNGDownload = null;
      exportPNGBtn.textContent = 'Export PNG';
    }
    MapRender.render(new CanvasPainter(ctx, canvas.width, canvas.height), canvas.width, canvas.height, buildRenderOpts());
    renderListeners.forEach(f => { try { f(); } catch (e) { /* luisteraar mag de kaart nooit breken */ } });
  }
  const renderListeners = [];
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  // ---- pan/zoom/klik-interactie op het canvas zelf ----
  function pinHitTest(pt, pin) {
    const [x, y] = forwardProject(pin.lat, pin.lon);
    const r = Math.min(canvas.width, mapAreaHeight(canvas.height)) * 0.016 * state.pinScale;
    if (pin.icon === 'letters') { // letters staan gecentreerd op het punt
      const n = Math.max(1, (pin.text || 'A').length);
      return Math.abs(pt.x - x) < r * (1.2 * n + 0.6) && Math.abs(pt.y - y) < r * 1.7;
    }
    const headCenter = { x, y: y - r * 1.7 };
    const dHead = Math.hypot(pt.x - headCenter.x, pt.y - headCenter.y);
    const dTip = Math.hypot(pt.x - x, pt.y - y);
    return dHead < r * 1.5 || dTip < r * 0.7;
  }

  // Bovenste pin onder de cursor (laatst geplaatste ligt bovenop), of -1.
  function pinAt(pt) {
    for (let i = state.pins.length - 1; i >= 0; i--) if (pinHitTest(pt, state.pins[i])) return i;
    return -1;
  }

  // Eén tik = één pin: na het plaatsen staat de plaatsmodus meteen weer uit
  // en is de nieuwe pin geselecteerd (iconen-keuze en "Remove this pin"
  // werken dan op die pin). Een tik op een bestaande pin selecteert 'm —
  // verwijderen gaat bewust alleen via de knop, zodat een mislukte sleep-
  // poging nooit per ongeluk een pin weghaalt.
  function handleCanvasClick(pt) {
    if (pt.y > mapAreaHeight(canvas.height)) return; // klik in de onderschrift-mat: negeren
    const hitIdx = pinAt(pt);
    if (hitIdx >= 0 && !state.addingPin) { selectPin(hitIdx); return; }
    if (!state.addingPin) { if (state.selectedPin != null) selectPin(null); return; }
    const { lat, lon } = inverseProject(pt.x, pt.y);
    state.pins.push(newPin(lat, lon));
    setAddingPin(false);
    selectPin(state.pins.length - 1);
  }

  function setAddingPin(on) {
    state.addingPin = on;
    addPinBtn.classList.toggle('active', on);
    // Touchscreen: "Tap", muis: "Click". Daarna terug naar de oorspronkelijke
    // tekst van de knop (die verschilt per pagina).
    if (!addPinBtn.dataset.label) addPinBtn.dataset.label = addPinBtn.textContent;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    addPinBtn.textContent = on ? (touch ? 'Tap the map…' : 'Click the map…') : addPinBtn.dataset.label;
  }

  // Geselecteerde pin: het iconen-rijtje toont zijn type, een nieuw icoon
  // kiezen past alléén die pin aan, en de verwijderknop haalt alleen hem weg.
  function selectPin(idx) {
    state.selectedPin = idx;
    const pin = idx != null ? state.pins[idx] : null;
    if (pin) {
      state.pinIconId = pin.icon || state.pinIconId;
      [...pinIconTabs.children].forEach(b => b.classList.toggle('active', b.dataset.pinIconId === state.pinIconId));
      if (pin.icon === 'letters' && pin.text) pinText = pin.text;
    }
    refreshPinControls();
    render();
  }
  function refreshPinControls() {
    // Laat andere onderdelen (bv. de pinnenlijst in shop.html) weten dat de
    // pins of de selectie veranderd zijn.
    document.dispatchEvent(new CustomEvent('mapgen:pins'));
    syncPinTextRow();
    if (!clearPinsBtn.dataset.label) clearPinsBtn.dataset.label = clearPinsBtn.textContent;
    const sel = state.selectedPin != null && state.pins[state.selectedPin];
    clearPinsBtn.textContent = sel ? 'Remove this pin' : clearPinsBtn.dataset.label;
    clearPinsBtn.disabled = state.pins.length === 0;
    if (pinsHint) {
      if (!pinsHint.dataset.text) pinsHint.dataset.text = pinsHint.textContent;
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const label = sel ? ((PIN_ICON_PRESETS.find(p => p.id === (sel.icon || state.pinIconId)) || {}).label || 'Pin') : '';
      pinsHint.textContent = sel
        ? (sel.icon === 'letters'
          ? `Letters “${sel.text || ''}”. Drag them to move, or type new letters below.`
          : `${label} pin. Drag it to move it, or pick another icon to change it.`)
        : (state.pins.length
          ? `${touch ? 'Tap' : 'Click'} a pin to select it, or drag it to move it.`
          : pinsHint.dataset.text);
    }
  }

  function wireCanvasInteraction() {
    // Pannen/zoomen is zinloos zolang isoleren een vaste, opgezochte grens
    // toont (dat is geen navigeerbaar venster) — klikken (voor pins) blijft
    // dan wel gewoon werken.
    const panLocked = () => (isolating() && hasRealBoundary()) || window.N98MapLocked === true;

    // Na een tik op een touchscreen stuurt de browser er nog een nagebootste
    // mousedown/mouseup achteraan. Zonder deze rem werd een tik dus twee keer
    // als klik verwerkt: de eerste zette een pin neer, de tweede raakte die
    // nieuwe pin en haalde 'm meteen weer weg.
    let lastTouchAt = 0;
    const isEmulatedMouse = () => Date.now() - lastTouchAt < 800;

    // Begint een sleep op een pin, dan verplaatst die pin (met dezelfde
    // afstand tussen vinger en pinpunt als bij het oppakken); anders pant de kaart.
    function startDrag(pt) {
      const pinIdx = state.addingPin ? -1 : pinAt(pt);
      drag = { x: pt.x, y: pt.y, moved: false, center: { ...state.center }, pinIdx };
      if (pinIdx >= 0) {
        const [px, py] = forwardProject(state.pins[pinIdx].lat, state.pins[pinIdx].lon);
        drag.offX = px - pt.x; drag.offY = py - pt.y;
      }
    }
    function dragPin(pt) {
      const nx = pt.x + drag.offX;
      const ny = Math.min(pt.y + drag.offY, mapAreaHeight(canvas.height)); // niet in het onderschrift
      const { lat, lon } = inverseProject(nx, ny);
      const pin = state.pins[drag.pinIdx];
      pin.lat = lat; pin.lon = lon;
      if (state.selectedPin !== drag.pinIdx) { state.selectedPin = drag.pinIdx; refreshPinControls(); }
      requestRender();
    }
    function endDrag(pt) {
      const d = drag; drag = null;
      if (!d) return;
      if (d.pinIdx >= 0) { if (d.moved) selectPin(d.pinIdx); else handleCanvasClick(pt); return; }
      if (!d.moved) handleCanvasClick(pt);
    }

    canvas.addEventListener('mousedown', e => {
      if (isEmulatedMouse()) return;
      const pt = canvasPoint(e);
      if (pt.y > mapAreaHeight(canvas.height)) return;
      startDrag(pt);
    });
    canvas.addEventListener('mousemove', e => {
      if (drag || state.addingPin) return;
      canvas.style.cursor = pinAt(canvasPoint(e)) >= 0 ? 'move' : '';
    });
    window.addEventListener('mousemove', e => {
      if (!drag) return;
      const pt = canvasPoint(e);
      const dx = pt.x - drag.x, dy = pt.y - drag.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      if (drag.pinIdx >= 0) { if (drag.moved) dragPin(pt); return; }
      if (!panLocked()) {
        const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
        state.center = { lat: drag.center.lat + dy / state.scale, lon: drag.center.lon - dx / (state.scale * cosLat) };
        requestRender();
        scheduleFetch();
      }
    });
    window.addEventListener('mouseup', e => {
      if (!drag) return;
      endDrag(canvasPoint(e));
    });
    canvas.addEventListener('wheel', e => {
      if (window.N98MapLocked === true) return; // vaste kaart: gewoon de pagina laten scrollen
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
      lastTouchAt = Date.now();
      if (e.touches.length === 1) {
        const pt = canvasPoint(e);
        if (pt.y > mapAreaHeight(canvas.height)) return;
        startDrag(pt);
      } else if (e.touches.length === 2) {
        drag = null;
        pinchDist = touchDist(e);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && drag) {
        const pt = canvasPoint(e);
        const dx = pt.x - drag.x, dy = pt.y - drag.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true; // vinger: iets ruimere tik-marge
        if (drag.pinIdx >= 0) { if (drag.moved) dragPin(pt); e.preventDefault(); return; }
        if (window.N98MapLocked === true) return; // vaste kaart: de vinger scrolt de pagina
        if (!panLocked()) {
          const cosLat = Math.cos((drag.center.lat * Math.PI) / 180) || 0.0001;
          state.center = { lat: drag.center.lat + dy / state.scale, lon: drag.center.lon - dx / (state.scale * cosLat) };
          requestRender();
          scheduleFetch();
        }
      } else if (e.touches.length === 2 && window.N98MapLocked === true) {
        return;
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
      lastTouchAt = Date.now();
      if (drag && e.changedTouches.length === 1) {
        if (!drag.moved) e.preventDefault(); // geen nagebootste muisklik na deze tik (zie lastTouchAt)
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        endDrag({
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
    placeNameInput.value = ''; regionNameInput.value = ''; countryNameInput.value = '';
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
  // resultaat proberen op te halen — nodig zodra een Game Style (MW2/RDR2)
  // het gebied automatisch isoleert (zie forcesIsolate). Niet elk resultaat
  // heeft zo'n grens (bv. een los adres); currentIsolateOpts valt dan terug
  // op de live-view als rechthoekige "grens".
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
    // isoleren gebruiken we die als plaatsnaam-onderschrift, want een
    // reverse-geocode van het middelpunt van een regio/land wijst vaak een
    // toevallige kleine plaats daarbinnen aan (bv. "Twente" -> "Ambt Delden").
    state.selectedPlace = { name: result.display_name, query, rings: null, bounds: null };

    MapGeo.fetchBoundary(result).then(boundary => {
      if (!state.selectedPlace || state.selectedPlace.name !== result.display_name) return;
      if (!boundary) return;
      state.selectedPlace.rings = boundary.rings;
      state.selectedPlace.bounds = boundary.bounds;
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
    }).catch(() => { /* stille no-op: alleen relevant voor forcesIsolate, geen UI meer om te melden */ });
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
          const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
          state.pins.push(newPin(lat, lon));
          state.selectedPin = state.pins.length - 1;
          setAddingPin(false);
          refreshPinControls();
          // Het zicht blijft staan zolang de pin al in beeld valt; ligt het
          // adres erbuiten, dan schuift de kaart ernaartoe — anders lijkt het
          // alsof er niets gebeurd is.
          const [px, py] = forwardProject(lat, lon);
          const inView = px >= 0 && px <= canvas.width && py >= 0 && py <= mapAreaHeight(canvas.height);
          if (!inView && !(isolating() && hasRealBoundary())) {
            state.center = { lat, lon };
            scheduleFetch(0);
          }
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
    customRatioRow.hidden = id !== 'custom';
    otherRatioRow.hidden = id !== 'other';
    if (id === 'custom') { applyCustomRatio(); return; }
    if (id === 'other') { applyOtherRatio(); return; }
    const preset = RATIO_PRESETS.find(r => r.id === id);
    state.ratio = { w: preset.w, h: preset.h };
    resizeCanvasForRatio();
    updateExportSizes(preset);
    render();
    invalidateFetch();
  }
  // "Other" is de oude, bredere maatlijst (zie OTHER_RATIO_PRESETS) — zelfde
  // mechanisme als een normale Sizes-preset, maar dan via de secundaire
  // dropdown i.p.v. rechtstreeks uit RATIO_PRESETS.
  function applyOtherRatio() {
    const preset = OTHER_RATIO_PRESETS.find(p => p.id === otherRatioSelect.value) || OTHER_RATIO_PRESETS[0];
    state.ratio = { w: preset.w, h: preset.h };
    resizeCanvasForRatio();
    updateExportSizes(preset);
    showFormatHint(preset);
    render();
    invalidateFetch();
  }
  // Custom vraagt tegenwoordig rechtstreeks om pixelafmetingen (niet langer
  // een abstracte verhouding) — zie customRatioW/H in index.html. De
  // verhouding voor de live preview (resizeCanvasForRatio) volgt daar
  // gewoon uit (w/h), en het exacte px-formaat wordt, net als bij een
  // gekozen Sizes-preset, direct in "Format" getoond via updateExportSizes.
  function applyCustomRatio() {
    const pxW = Math.max(1, Math.round(parseFloat(customRatioW.value)) || 1);
    const pxH = Math.max(1, Math.round(parseFloat(customRatioH.value)) || 1);
    state.ratio = { w: pxW, h: pxH };
    resizeCanvasForRatio();
    const dpi = 300;
    const exact = { id: 'custom', pxW, pxH, cmW: Math.round((pxW / dpi) * 2.54), cmH: Math.round((pxH / dpi) * 2.54) };
    updateExportSizes(exact);
    showFormatHint(exact);
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
  function selectPinIcon(id) {
    state.pinIconId = id; // ook het type voor de volgende nieuwe pin
    [...pinIconTabs.children].forEach(b => b.classList.toggle('active', b.dataset.pinIconId === id));
    const sel = state.selectedPin != null && state.pins[state.selectedPin];
    if (sel) {
      sel.icon = id;
      if (id === 'letters' && !sel.text) sel.text = MapRender.cleanPinText(pinText) || 'A';
    }
    refreshPinControls();
    if (id === 'letters' && pinTextInput) { pinTextInput.value = (sel && sel.text) || pinText; }
    render();
  }
  function selectCaptionFont(id) {
    state.captionFontId = id;
    [...fontTabs.children].forEach(b => b.classList.toggle('active', b.dataset.fontId === id));
    render();
    // webfont nog niet binnen? Dan zodra hij geladen is opnieuw tekenen,
    // anders blijft het eerste beeld in het reservelettertype staan.
    const p = CAPTION_FONT_PRESETS.find(f => f.id === id);
    if (p && document.fonts && document.fonts.load) {
      document.fonts.load(`${p.previewStyle || 'normal'} ${p.previewWeight || '400'} 40px ${p.previewFamily}`).then(() => {
        if (state.captionFontId === id) render();
      }).catch(() => {});
    }
  }

  function setGameStyle(style) {
    state.gtaStyle = style === 'gta';
    state.mw2Style = style === 'mw2';
    state.rdr2Style = style === 'rdr2';
    state.experimentalStyle = style === 'experimental';
    state.nightlightStyle = style === 'nightlight';
    gtaStyleCheck.checked = state.gtaStyle;
    mw2StyleCheck.checked = state.mw2Style;
    rdr2StyleCheck.checked = state.rdr2Style;
    experimentalStyleCheck.checked = state.experimentalStyle;
    nightlightStyleCheck.checked = state.nightlightStyle;
    gtaStyleHint.hidden = !state.gtaStyle;
    mw2StyleHint.hidden = !state.mw2Style;
    rdr2StyleHint.hidden = !state.rdr2Style;
    experimentalStyleHint.hidden = !state.experimentalStyle;
    nightlightStyleHint.hidden = !state.nightlightStyle;
    paletteGrid.classList.toggle('disabled', !!style);
    refreshAutoPinColor();
    render();
    invalidateFetch();
  }

  function currentRatioPreset() {
    if (state.ratioId === 'other') {
      return OTHER_RATIO_PRESETS.find(p => p.id === otherRatioSelect.value) || OTHER_RATIO_PRESETS[0];
    }
    return RATIO_PRESETS.find(r => r.id === state.ratioId);
  }

  // Permanent (niet-hover) readout onder de Sizes-dropdown/Custom-velden,
  // zodat het exacte formaat meteen zichtbaar is zonder naar "Format"
  // onderin te hoeven scrollen.
  function showFormatHint(exact) {
    if (!exact || !exact.pxW) { ratioSizesHint.hidden = true; return; }
    ratioSizesHint.textContent = `→ ${exact.cmW}×${exact.cmH}cm @300dpi (${exact.pxW}×${exact.pxH}px)`;
    ratioSizesHint.hidden = false;
  }

  // Bij een gekozen Sizes-preset (een écht, bestelbaar Prodigi-formaat) toont
  // "Format" dat exacte formaat als standaardkeuze (zie showFormatHint) —
  // plus, op verzoek, een paar oversized varianten erboven op dezelfde
  // beeldverhouding. Die zijn niet bedoeld voor de normale catalogus, maar
  // voor de uitzondering: een klant die zelf om een groter formaat vraagt
  // dan wat je standaard aanbiedt — dan kun je alsnog de juiste PNG op
  // maat leveren. Alleen mogelijk voor een Sizes-preset (die kent inW/inH
  // in inches, dus schaalt exact); "Custom" (pixels) en de oude
  // proportionele reeks blijven ongewijzigd.
  const OVERSIZE_SCALES = [1, 1.5, 2, 3];
  function updateExportSizes(exactPreset) {
    exportSizeSelect.innerHTML = '';
    if (exactPreset && exactPreset.pxW) {
      const dpi = 300;
      const scales = exactPreset.inW ? OVERSIZE_SCALES : [1];
      scales.forEach((scale, i) => {
        // Schaal vanaf Gelato's eigen cm-maat (niet inches×2,54) zodat het
        // basisformaat (scale 1) exact matcht met wat er echt wordt gedrukt.
        const pxW = exactPreset.inW ? Math.round((exactPreset.cmW * scale / 2.54) * dpi) : exactPreset.pxW;
        const pxH = exactPreset.inW ? Math.round((exactPreset.cmH * scale / 2.54) * dpi) : exactPreset.pxH;
        const cmW = exactPreset.inW ? Math.round(exactPreset.cmW * scale) : exactPreset.cmW;
        const cmH = exactPreset.inW ? Math.round(exactPreset.cmH * scale) : exactPreset.cmH;
        const opt = document.createElement('option');
        opt.value = `${exactPreset.id}@${scale}x`;
        opt.textContent = scale === 1
          ? `${cmW}×${cmH}cm @300dpi (${pxW}×${pxH})`
          : `${cmW}×${cmH}cm @300dpi (${pxW}×${pxH}), ${scale}× oversized (custom orders)`;
        opt.dataset.w = pxW; opt.dataset.h = pxH;
        opt.selected = i === 0;
        exportSizeSelect.appendChild(opt);
      });
      return;
    }
    Utils.computeExportSizes(state.ratio.w, state.ratio.h).forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.label; opt.dataset.w = s.w; opt.dataset.h = s.h;
      if (i === 1) opt.selected = true;
      exportSizeSelect.appendChild(opt);
    });
  }

  // Tekent alleen de rijen [y0, y0+tileH) van de volledige w×h afbeelding,
  // in een kleine tileH-hoge canvas — voor Utils.encodeStreamingPNG (zie
  // exportResult), dat een grote PNG in stroken opbouwt i.p.v. in één keer
  // op één grote (bij de grootste formaten: honderden MB's) canvas. Werkt
  // door MapRender's bestaande translate/restoreTranslate (dezelfde die de
  // print-rand al gebruikt) — de tekencode zelf blijft in w×h-coördinaten
  // rekenen, alleen de fysieke canvas waar dat op landt is klein en
  // verschoven; alles buiten die kleine canvas wordt simpelweg niet
  // getekend, precies zoals normale canvas-clipping werkt.
  // Volautomatisch printbestand (tools/render-order): exact formaat @300dpi
  // (eerste optie = Gelato-maat, schaal 1), altijd via de streaming-encoder
  // zodat ook 70×100cm (~100 MP) past. Geeft { blob, w, h, sizeId } terug.
  // scale 2 = 600 dpi (zelfde ontwerp, dubbele resolutie in beide richtingen):
  // de standaard voor zowel de Studio-export als de automatische orders.
  const PRINT_SCALE_DEFAULT = 1.5; // 300 dpi met 50% extra pixels per zijde
  function renderPrintBlob(scale) {
    const want = scale || PRINT_SCALE_DEFAULT;
    const opt = [...exportSizeSelect.options].find(o => o.value.endsWith('@' + want + 'x')) || exportSizeSelect.options[0];
    const usedScale = parseFloat((/@([\d.]+)x$/.exec(opt.value) || [0, 1])[1]) || 1;
    const w = parseInt(opt.dataset.w, 10), h = parseInt(opt.dataset.h, 10);
    const opts = buildRenderOpts();
    opts.printBorder = printBorderCheck.checked;
    const tileHeight = Math.max(64, Math.min(h, Math.floor(STREAMING_PNG_TILE_PIXEL_BUDGET / w)));
    return Utils.encodeStreamingPNG(w, h, tileHeight, (y0, tileH) => renderPNGTile(y0, tileH, w, h, opts), () => {})
      .then(blob => ({ blob, w, h, sizeId: opt.value, dpi: Math.round(300 * usedScale) }));
  }

  function renderPNGTile(y0, tileH, w, h, opts) {
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = w; tileCanvas.height = tileH;
    const tileCtx = tileCanvas.getContext('2d');
    const painter = new CanvasPainter(tileCtx, w, h);
    painter.translate(0, -y0);
    MapRender.render(painter, w, h, opts);
    painter.restoreTranslate();
    return tileCtx.getImageData(0, 0, w, tileH);
  }

  // Belangrijk: het renderen + de daadwerkelijke <a>-klik in Utils'
  // triggerSave draaien bewust zonder setTimeout ertussen — dat brak
  // downloaden op mobiel (vooral iOS Safari): zo'n macrotaak-vertraging
  // verbreekt de koppeling met de "user gesture" van de klik, en zonder die
  // koppeling doet een <a download>-klik naar een blob-URL op mobiel vaak
  // stilzwijgend niets. canvas.toBlob() (gebruikt door Utils.downloadCanvasPNG
  // voor kleinere/normale PNG's) werkt wél via een korte async callback —
  // dat mag, want de klik zelf volgt nog steeds direct op diezelfde
  // gebruikersactie, alleen iets later.
  //
  // Bij een heel groot PNG-formaat (zie LARGE_PNG_PIXEL_THRESHOLD) geldt dat
  // niet meer: het tegel-encoderen (zie renderPNGTile/Utils.encodeStreamingPNG
  // hierboven) kan tientallen seconden duren — ruim voorbij het korte venster
  // waarin een mobiele browser een klik nog als "verse gebruikersactie"
  // beschouwt. Zo'n export wordt dus NIET automatisch gedownload zodra hij
  // klaar is; in plaats daarvan verandert de knop in "Tap to download PNG"
  // en pas een tweede, eigen tik (een echte, verse klik) triggert de
  // daadwerkelijke <a>-download — zie exportPNGBtn's listener in init().
  function exportResult(wantSVG) {
    const opt = exportSizeSelect.selectedOptions[0];
    const w = parseInt(opt.dataset.w, 10), h = parseInt(opt.dataset.h, 10);
    // Alles hieronder in try/catch: bij een heel groot PNG-formaat kan een
    // mobiel toestel simpelweg de canvas niet aan (bv. een canvas-grootte-
    // limiet van het besturingssysteem/de browser, of te weinig geheugen —
    // 11339×14173px is ruim 160 miljoen pixels, ~640MB alleen al aan ruwe
    // pixels). Zonder deze try/catch liep zo'n fout ongevangen tot buiten de
    // klik-handler: geen foutmelding, gewoon stilte — precies het gemelde
    // "doet niks". Nu krijgt de gebruiker in elk geval een duidelijke
    // melding i.p.v. niets, met SVG als alternatief (vectordata, geen
    // pixel-geheugenlimiet, werkt op elk formaat).
    try {
      const opts = buildRenderOpts();
      // Witte print-veiligheidsrand: alleen op de export, nooit op de live
      // preview (die rekent voor pan/zoom/pin-plaatsing op ruwe canvaspixels,
      // een rand zou dat ontregelen — zie MapRender.render's PRINT_BORDER_FRACTION).
      // Stond voorheen altijd aan; nu via een checkbox (standaard aan, zelfde
      // gedrag als voorheen) zodat 'm ook uitgezet kan worden.
      opts.printBorder = printBorderCheck.checked;
      // Watermerk: alleen op de daadwerkelijk gedownloade export, nooit op
      // de live preview — en client-side nogmaals achter canUseWatermark()
      // i.p.v. alleen op de (verborgen) checkbox-state vertrouwen.
      if (canUseWatermark() && watermarkEnabledCheck.checked) {
        opts.watermarkText = watermarkTextInput.value.trim() || 'PREVIEW';
      }
      const placeSlug = (opts.caption.place || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const date = new Date().toISOString().slice(0, 10);
      if (wantSVG) {
        const painter = new SVGPainter(w, h);
        MapRender.render(painter, w, h, opts);
        Utils.downloadSVGString(painter.toString(), `location-${placeSlug}-${opt.value}-${date}.svg`);
        exportStatus.textContent = 'Saved.';
        return;
      }
      const filename = `location-${placeSlug}-${opt.value}-${date}.png`;
      if (w * h > LARGE_PNG_PIXEL_THRESHOLD && Utils.supportsStreamingPNG()) {
        const tileHeight = Math.max(64, Math.min(h, Math.floor(STREAMING_PNG_TILE_PIXEL_BUDGET / w)));
        exportPNGBtn.textContent = 'Preparing…';
        exportStatus.textContent = 'Preparing large export… this can take a minute.';
        Utils.encodeStreamingPNG(
          w, h, tileHeight,
          (y0, tileH) => renderPNGTile(y0, tileH, w, h, opts),
          ({ tile, tileCount }) => { exportStatus.textContent = `Preparing large export… ${Math.round((tile / tileCount) * 100)}%`; },
        ).then(blob => {
          pendingPNGDownload = { blob, filename };
          exportPNGBtn.textContent = 'Tap to download PNG';
          exportStatus.textContent = 'Ready. Tap "Tap to download PNG" to save it.';
        }).catch(e => {
          console.error('Export mislukt:', e);
          exportPNGBtn.textContent = 'Export PNG';
          exportStatus.textContent = 'PNG export failed. This size may be too large for your device. Try a smaller size, or export as SVG instead (works at any size).';
        });
        return;
      }
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = w; exportCanvas.height = h;
      // Sommige browsers klemmen een te grote canvas.width/height stil af
      // i.p.v. een fout te gooien — dat is dan de eerste, betrouwbaarste
      // aanwijzing dat dit formaat het toestel te boven gaat.
      if (exportCanvas.width !== w || exportCanvas.height !== h) {
        throw new Error(`canvas werd afgeklemd naar ${exportCanvas.width}×${exportCanvas.height}`);
      }
      const ctx2d = exportCanvas.getContext('2d');
      if (!ctx2d) throw new Error('kon geen 2D-canvascontext aanmaken op dit formaat');
      MapRender.render(new CanvasPainter(ctx2d, w, h), w, h, opts);
      Utils.downloadCanvasPNG(
        exportCanvas, filename,
        () => { exportStatus.textContent = 'Saved.'; },
        (e) => {
          console.error('Export mislukt:', e);
          exportStatus.textContent = 'PNG export failed. This size may be too large for your device. Try a smaller size, or export as SVG instead (works at any size).';
        },
      );
    } catch (e) {
      console.error('Export mislukt:', e);
      exportPNGBtn.textContent = 'Export PNG';
      exportStatus.textContent = wantSVG
        ? 'Export failed. Please try again.'
        : 'PNG export failed. This size may be too large for your device. Try a smaller size, or export as SVG instead (works at any size).';
    }
  }

  // ---- embed-modus (Shopify-productpagina) ----
  // ?embed=1 schakelt de tool om naar "klant kiest, bevestigt, en de
  // omringende pagina neemt het over" i.p.v. "klant download zelf een
  // bestand". ?parentOrigin=<url> is optioneel: geef 'm mee zodra het
  // definitieve Shopify-domein bekend is, dan gaan berichten alleen naar
  // die origin i.p.v. naar '*'. Zonder parentOrigin valt dit terug op '*'
  // (prima voor lokaal testen, maar scherp dit aan zodra er een echte
  // winkel achter zit — anders kan elke pagina die deze tool in een
  // iframe zet de bevestigde ontwerp-data afluisteren).
  const embedParams = new URLSearchParams(window.location.search);
  // shop.html (de klant-configurator) zet data-shop="1" op <html> en draait
  // altijd in deze klant-modus, ook zonder ?embed=1 in de URL.
  const embedMode = embedParams.get('embed') === '1' || document.documentElement.dataset.shop === '1';
  const embedParentOrigin = embedParams.get('parentOrigin') || '*';
  const embedConfirmRow = el('embedConfirmRow');
  const embedConfirmBtn = el('embedConfirmBtn');
  const embedConfirmStatus = el('embedConfirmStatus');

  function postToParent(type, payload) {
    if (window.parent === window) return; // niet in een iframe — niks te doen
    window.parent.postMessage({ source: 'mapgen2', type, payload }, embedParentOrigin);
  }

  // Compacte, klant-relevante samenvatting van de huidige keuzes — geen
  // interne staat (fetchedBounds, pins-array, caches) die de ontvangende
  // pagina toch niks aan heeft. Wordt zowel nu (bij bevestigen) als later
  // bij het genereren van het print-klare bestand gebruikt, dus de vorm
  // hiervan is ook de contractvorm richting de fulfillment-pipeline.
  // ---- Ontwerpcode: het complete ontwerp, om een bestelling exact na te maken ----
  // Alles wat het beeld bepaalt: uitsnede (middelpunt + zoom), formaat,
  // palet, layout, vorm, kleuren, de teksten zoals ze getekend zijn,
  // lettertype en -groottes, pins (met eigen icoon), witte rand. Met
  // applyDesignState() tekent de werkbank precies hetzelfde beeld, waarna
  // "Export" het printbestand op volle resolutie maakt.
  const DESIGN_STATE_VERSION = 1;
  function exportDesignState() {
    const cap = buildRenderOpts().caption;
    return {
      v: DESIGN_STATE_VERSION,
      center: { lat: +state.center.lat.toFixed(7), lon: +state.center.lon.toFixed(7) },
      scale: state.scale,
      ratioId: state.ratioId,
      palette: state.mapPaletteId,
      layout: state.layoutId,
      mask: state.maskId,
      matColor: maskColorInput.value,
      textColor: captionColorOverrideCheck.checked ? captionColorInput.value : null,
      font: state.captionFontId,
      show: { place: state.showPlace, region: state.showRegion, country: state.showCountry, coords: state.showCoords },
      text: { place: cap.place || '', region: cap.region || '', country: cap.country || '' },
      textScale: { place: state.placeFontScale, region: state.regionFontScale, country: state.countryFontScale, coords: state.coordsFontScale },
      pins: state.pins.map(p => Object.assign({ lat: +p.lat.toFixed(7), lon: +p.lon.toFixed(7), icon: p.icon || state.pinIconId }, p.icon === 'letters' ? { text: p.text || 'A' } : {})),
      pinColor: pinColorInput.value,
      pinScale: state.pinScale,
      printBorder: printBorderCheck.checked,
      style: state.gtaStyle ? 'gta' : state.mw2Style ? 'mw2' : state.rdr2Style ? 'rdr2' : state.experimentalStyle ? 'experimental' : state.nightlightStyle ? 'nightlight' : null,
    };
  }
  function applyDesignState(d) {
    if (!d || typeof d !== 'object') throw new Error('No design found');
    if (d.state) d = d.state; // de hele bestel-samenvatting mag ook
    if (d.v !== DESIGN_STATE_VERSION) throw new Error('Unknown design version');
    // formaat eerst: dat bepaalt de canvasgrootte (en dus de uitsnede)
    if (d.ratioId && [...ratioTabs.options].some(o => o.value === d.ratioId)) {
      ratioTabs.value = d.ratioId;
      selectRatio(d.ratioId);
      showFormatHint(currentRatioPreset());
    }
    setGameStyle(d.style || null);
    state.mapPaletteId = d.palette || state.mapPaletteId;
    [...paletteGrid.children, ...solidPaletteGrid.children].forEach(c => c.classList.toggle('active', c.dataset.paletteId === state.mapPaletteId));
    if (d.layout) selectLayout(d.layout);
    if (d.mask) selectMask(d.mask);
    if (d.font) selectCaptionFont(d.font);
    if (d.matColor) maskColorInput.value = d.matColor;
    captionColorOverrideCheck.checked = !!d.textColor;
    captionColorInput.disabled = !d.textColor;
    if (d.textColor) captionColorInput.value = d.textColor;
    const show = d.show || {};
    showPlaceCheck.checked = state.showPlace = show.place !== false;
    showRegionCheck.checked = state.showRegion = !!show.region;
    showCountryCheck.checked = state.showCountry = show.country !== false;
    showCoordsCheck.checked = state.showCoords = show.coords !== false;
    refreshFontSizeRowVisibility();
    // de teksten precies zoals de klant ze zag (ook als die automatisch waren)
    const t = d.text || {};
    placeNameInput.value = t.place || '';
    regionNameInput.value = t.region || '';
    countryNameInput.value = t.country || '';
    const ts = d.textScale || {};
    state.placeFontScale = +(ts.place || 1); placeFontSizeInput.value = state.placeFontScale;
    state.regionFontScale = +(ts.region || 1); regionFontSizeInput.value = state.regionFontScale;
    state.countryFontScale = +(ts.country || 1); countryFontSizeInput.value = state.countryFontScale;
    state.coordsFontScale = +(ts.coords || 1); coordsFontSizeInput.value = state.coordsFontScale;
    state.pins = (d.pins || []).map(p => Object.assign({ lat: +p.lat, lon: +p.lon, icon: p.icon || 'basic' }, p.icon === 'letters' ? { text: MapRender.cleanPinText(p.text) || 'A' } : {}));
    state.selectedPin = null;
    if (d.pinColor) { pinColorInput.value = d.pinColor; pinColorTouched = true; }
    state.pinScale = +(d.pinScale || 1); pinSizeInput.value = state.pinScale;
    printBorderCheck.checked = d.printBorder !== false;
    // uitsnede als laatste, zodat niets hem nog verschuift
    if (d.center) state.center = { lat: +d.center.lat, lon: +d.center.lon };
    if (d.scale) state.scale = clampScale(+d.scale);
    refreshPinControls();
    updateExportSizes(currentRatioPreset());
    invalidateFetch();
    // pas weer exporteerbaar zodra de kaartdata voor dít ontwerp binnen is
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    render();
    scheduleFetch(0);
  }

  // Bestelopties buiten de kaart zelf (bv. lijst) — gezet door shop.js
  let orderExtras = { frame: 'none', frameLabel: 'No frame' };
  function buildDesignSummary() {
    const preset = currentRatioPreset();
    const opts = buildRenderOpts();
    const palette = getActivePalette();
    return {
      location: {
        place: opts.caption.place, region: opts.caption.region, country: opts.caption.country,
        lat: opts.caption.lat, lon: opts.caption.lon,
      },
      size: preset ? {
        id: preset.id, label: preset.label,
        inW: preset.inW, inH: preset.inH, cmW: preset.cmW, cmH: preset.cmH,
      } : { id: state.ratioId, label: 'Custom', pxW: customRatioW ? parseInt(customRatioW.value, 10) : null, pxH: customRatioH ? parseInt(customRatioH.value, 10) : null },
      palette: { id: state.mapPaletteId, name: palette.name || state.mapPaletteId },
      layoutId: state.layoutId, maskId: state.maskId, pinIconId: state.pinIconId, pinScale: state.pinScale,
      matColor: maskColorInput.value,
      printBorder: printBorderCheck.checked,
      captionTextColor: captionColorOverrideCheck.checked ? captionColorInput.value : null,
      style: { gta: state.gtaStyle, mw2: state.mw2Style, rdr2: state.rdr2Style, experimental: state.experimentalStyle, nightlight: state.nightlightStyle },
      caption: {
        showPlace: opts.caption.showPlace, showRegion: opts.caption.showRegion,
        showCountry: opts.caption.showCountry, showCoords: opts.caption.showCoords,
      },
      pins: state.pins.map(p => ({ lat: p.lat, lon: p.lon, icon: p.icon || state.pinIconId, text: p.icon === 'letters' ? (p.text || 'A') : undefined, color: pinColorInput.value })),
      frame: orderExtras.frame, frameLabel: orderExtras.frameLabel,
      // het complete ontwerp — hiermee maakt de werkbank de bestelling exact na
      state: exportDesignState(),
    };
  }

  // Snelle, lichte preview (lange zijde ~700px) puur als thumbnail voor in
  // de winkelwagen — geen printBorder/watermark, dat slaat alleen op de
  // uiteindelijke print-export. Synchroon: bij deze resolutie duurt dat
  // hooguit een fractie van een seconde, geen setTimeout-yield nodig.
  function renderEmbedPreviewDataURL() {
    const preset = currentRatioPreset();
    const aspect = preset && preset.inW ? preset.inW / preset.inH : (state.ratio.w / state.ratio.h);
    const longSide = 700;
    const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
    const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = w; previewCanvas.height = h;
    const pctx = previewCanvas.getContext('2d');
    MapRender.render(new CanvasPainter(pctx, w, h), w, h, buildRenderOpts());
    return previewCanvas.toDataURL('image/jpeg', 0.85);
  }

  function confirmDesign() {
    try {
      embedConfirmBtn.disabled = true;
      embedConfirmStatus.textContent = 'Preparing preview…';
      const summary = buildDesignSummary();
      const previewDataUrl = renderEmbedPreviewDataURL();
      postToParent('confirm', { design: summary, previewDataUrl });
      embedConfirmStatus.textContent = 'Design confirmed.';
    } catch (e) {
      console.error('Confirm mislukt:', e);
      embedConfirmStatus.textContent = 'Something went wrong preparing your design. Please try again.';
    } finally {
      embedConfirmBtn.disabled = false;
    }
  }

  function init() {
    canvas = el('locationCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvasForRatio();
    state.scale = clampScale(mapAreaHeight(canvas.height) / 0.05);

    // De Sizes-dropdown toont, per optie, meteen het echte Prodigi-formaat
    // (inches + cm) — geen aparte hover-preview meer nodig, want zodra je
    // kiest verschijnt exact dat formaat ook in "Format" hieronder (zie
    // updateExportSizes). ratioSizesHint blijft staan als permanent
    // (niet-hover) leesbaar readout van de huidige keuze.
    RATIO_PRESETS.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.label;
      opt.selected = r.id === state.ratioId;
      ratioTabs.appendChild(opt);
    });
    ratioTabs.addEventListener('change', () => selectRatio(ratioTabs.value));
    // Bij "custom" houdt applyCustomRatio() de hint zelf al bij (dynamisch,
    // op basis van de ingevoerde pixels) — hier alleen voor de vaste
    // Sizes-presets, anders overschrijft dit elkaar in de verkeerde volgorde.
    ratioTabs.addEventListener('change', () => {
      if (state.ratioId === 'custom' || state.ratioId === 'other') return;
      showFormatHint(currentRatioPreset());
    });
    showFormatHint(currentRatioPreset());
    [customRatioW, customRatioH].forEach(inp => inp.addEventListener('input', () => {
      if (state.ratioId !== 'custom') return;
      applyCustomRatio();
    }));

    OTHER_RATIO_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.label;
      otherRatioSelect.appendChild(opt);
    });
    otherRatioSelect.addEventListener('change', () => {
      if (state.ratioId !== 'other') return;
      applyOtherRatio();
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
    PIN_ICON_PRESETS.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.dataset.pinIconId = p.id;
      btn.className = 'pin-icon-btn' + (p.id === state.pinIconId ? ' active' : '');
      // klein voorbeeld van het icoon zelf, vóór de naam
      const ic = document.createElement('canvas');
      const dpr = Math.max(2, window.devicePixelRatio || 1), sz = 22;
      ic.width = sz * dpr; ic.height = sz * dpr;
      ic.style.cssText = `width:${sz}px;height:${sz}px;display:inline-block;vertical-align:middle;margin-right:7px;`;
      ic.setAttribute('aria-hidden', 'true');
      const ictx = ic.getContext('2d');
      ictx.scale(dpr, dpr);
      if (p.id === 'letters') MapRender.drawPinIcon(new CanvasPainter(ictx, sz, sz), sz / 2, sz / 2, sz / 3.2, '#D94848', null, 'letters', 'A', null);
      else MapRender.drawPinIcon(new CanvasPainter(ictx, sz, sz), sz / 2, sz - 1.5, (sz - 3) / 2.7, '#D94848', '#ffffff', p.id);
      btn.append(ic, document.createTextNode(p.label));
      btn.addEventListener('click', () => selectPinIcon(p.id));
      pinIconTabs.appendChild(btn);
    });
    CAPTION_FONT_PRESETS.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = f.label; btn.dataset.fontId = f.id;
      btn.className = f.id === state.captionFontId ? 'active' : '';
      btn.style.fontFamily = f.previewFamily;
      btn.style.fontWeight = f.previewWeight;
      btn.style.fontStyle = f.previewStyle;
      btn.addEventListener('click', () => selectCaptionFont(f.id));
      fontTabs.appendChild(btn);
    });

    // Twee aparte roosters (gewone paletten + effen kleuren), maar samen
    // één keuze (state.mapPaletteId) — selecteren in het ene rooster moet
    // de actieve kaart in het andere dus altijd deselecteren.
    function buildPaletteCard(p, grid) {
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
        [...paletteGrid.children, ...solidPaletteGrid.children].forEach(c => c.classList.toggle('active', c.dataset.paletteId === p.id));
        refreshAutoPinColor();
        render();
      });
      grid.appendChild(card);
    }
    MAP_PALETTES.forEach(p => buildPaletteCard(p, paletteGrid));
    SOLID_PALETTES.forEach(p => buildPaletteCard(p, solidPaletteGrid));

    searchBtn.addEventListener('click', runSearch);
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    [showPlaceCheck, showRegionCheck, showCountryCheck, showCoordsCheck].forEach(cb => cb.addEventListener('change', () => {
      state.showPlace = showPlaceCheck.checked;
      state.showRegion = showRegionCheck.checked;
      state.showCountry = showCountryCheck.checked;
      state.showCoords = showCoordsCheck.checked;
      refreshFontSizeRowVisibility();
      render();
      invalidateFetch(); // het onderschrift-blok kan van hoogte veranderen (mapH)
    }));
    [placeNameInput, regionNameInput, countryNameInput].forEach(inp => inp.addEventListener('input', render));
    placeFontSizeInput.addEventListener('input', () => { state.placeFontScale = parseFloat(placeFontSizeInput.value); render(); });
    regionFontSizeInput.addEventListener('input', () => { state.regionFontScale = parseFloat(regionFontSizeInput.value); render(); });
    countryFontSizeInput.addEventListener('input', () => { state.countryFontScale = parseFloat(countryFontSizeInput.value); render(); });
    coordsFontSizeInput.addEventListener('input', () => { state.coordsFontScale = parseFloat(coordsFontSizeInput.value); render(); });
    pinSizeInput.addEventListener('input', () => { state.pinScale = parseFloat(pinSizeInput.value); render(); });
    refreshFontSizeRowVisibility();

    // Nieuwe pin plaatsen = de vorige loslaten, zodat een icoon dat je nu
    // kiest alleen voor de nieuwe pin geldt (niet de vorige verandert).
    addPinBtn.addEventListener('click', () => {
      const on = !state.addingPin;
      if (on && state.selectedPin != null) selectPin(null);
      setAddingPin(on);
    });
    // Met een geselecteerde pin: alleen die weghalen (en de vorige selecteren,
    // zodat je er rustig een voor een af kunt). Zonder selectie: alles weg.
    clearPinsBtn.addEventListener('click', () => {
      const i = state.selectedPin;
      if (i != null && state.pins[i]) {
        state.pins.splice(i, 1);
        selectPin(state.pins.length ? Math.min(i, state.pins.length - 1) : null);
      } else {
        state.pins = [];
        selectPin(null);
      }
    });
    refreshPinControls();
    pinColorInput.addEventListener('input', () => { pinColorTouched = true; render(); });
    if (pinTextInput) {
      pinTextInput.addEventListener('input', () => {
        const clean = MapRender.cleanPinText(pinTextInput.value);
        if (pinTextInput.value !== clean) pinTextInput.value = clean;
        if (clean) pinText = clean;
        const sel = state.selectedPin != null && state.pins[state.selectedPin];
        if (sel && sel.icon === 'letters' && clean) { sel.text = clean; document.dispatchEvent(new CustomEvent('mapgen:pins')); render(); }
      });
    }
    // Cinzel (letters) laadt asynchroon — daarna opnieuw tekenen
    if (document.fonts && document.fonts.load) document.fonts.load("700 40px 'Cinzel'").then(() => {
      render();
      const chip = pinIconTabs.querySelector('[data-pin-icon-id="letters"] canvas');
      if (chip) {
        const c2 = chip.getContext('2d'), sz = 22;
        c2.clearRect(0, 0, sz, sz);
        MapRender.drawPinIcon(new CanvasPainter(c2, sz, sz), sz / 2, sz / 2, sz / 3.2, '#D94848', null, 'letters', 'A', null);
      }
      document.dispatchEvent(new CustomEvent('mapgen:pins'));
    }).catch(() => {});
    maskColorInput.addEventListener('input', () => render());
    captionColorOverrideCheck.addEventListener('change', () => {
      captionColorInput.disabled = !captionColorOverrideCheck.checked;
      render();
    });
    captionColorInput.addEventListener('input', () => {
      if (!captionColorOverrideCheck.checked) return;
      render();
    });
    pinAddressSearchBtn.addEventListener('click', runPinAddressSearch);
    pinAddressInput.addEventListener('keydown', e => { if (e.key === 'Enter') runPinAddressSearch(); });
    refreshAutoPinColor();

    gtaStyleCheck.addEventListener('change', () => setGameStyle(gtaStyleCheck.checked ? 'gta' : null));
    mw2StyleCheck.addEventListener('change', () => setGameStyle(mw2StyleCheck.checked ? 'mw2' : null));
    rdr2StyleCheck.addEventListener('change', () => setGameStyle(rdr2StyleCheck.checked ? 'rdr2' : null));
    experimentalStyleCheck.addEventListener('change', () => setGameStyle(experimentalStyleCheck.checked ? 'experimental' : null));
    nightlightStyleCheck.addEventListener('change', () => setGameStyle(nightlightStyleCheck.checked ? 'nightlight' : null));

    exportSVGBtn.addEventListener('click', () => exportResult(true));
    exportPNGBtn.addEventListener('click', () => {
      // Een grote PNG die al klaarstaat (zie exportResult) downloadt hier,
      // bij deze tweede, verse tik — niet automatisch zodra 'm klaar was,
      // want die voorbereiding kan te lang geduurd hebben voor een mobiele
      // browser om de download nog aan die eerdere tik te koppelen.
      if (pendingPNGDownload) {
        Utils.downloadBlob(pendingPNGDownload.blob, pendingPNGDownload.filename);
        pendingPNGDownload = null;
        exportPNGBtn.textContent = 'Export PNG';
        exportStatus.textContent = 'Saved.';
        return;
      }
      exportResult(false);
    });
    exportSVGBtn.disabled = true; exportPNGBtn.disabled = true;
    updateExportSizes(currentRatioPreset());
    watermarkRow.hidden = !canUseWatermark();
    watermarkEnabledCheck.addEventListener('change', () => { watermarkTextInput.disabled = !watermarkEnabledCheck.checked; });

    // Embed-modus: klant bevestigt i.p.v. zelf te downloaden — zie
    // confirmDesign/postToParent hierboven. De losse SVG/PNG-knoppen
    // blijven verborgen (die zijn voor los/handmatig gebruik van de tool).
    if (embedMode) {
      embedConfirmRow.hidden = false;
      embedConfirmBtn.addEventListener('click', confirmDesign);
      embedConfirmBtn.disabled = true;
    }

    initAccordion();
    initLookSubtabs();
    initColorSubtabs();
    initUiMode();
    wireCanvasInteraction();
    render();

    if (embedMode) postToParent('ready', {});
  }

  // Welke van de twee zijbalk-indelingen actief is ("v2" = de huidige
  // accordion, "v1" = "MapGen 1.0", de vier altijd-open panelen van
  // vroeger) — zie Instellingen ▸ "MapGen 1.0 layout". Beide indelingen
  // delen letterlijk dezelfde bedieningselementen (dus dezelfde state,
  // geen dubbele knoppen); applyUiMode verplaatst ze alleen tussen de
  // slot-div's in index.html.
  const UI_MODE_KEY = 'genart-location-ui-mode';
  const UNIT_PLACEMENT = [
    ['unitSearch', 'placeSlotOld', 'placeSlotNew'],
    ['unitRatio', 'placeSlotOld', 'placeSlotNew'],
    ['unitStatus', 'placeSlotOld', 'statusSlotNew'],
    ['unitLayout', 'layoutSlotOld', 'layoutSlotNew'],
    ['unitMask', 'maskSlotOld', 'maskSlotNew'],
    ['mapPaletteGrid', 'colorsSlotOld', 'colorsSlotNewPalettes'],
    ['solidPaletteGrid', 'colorsSlotOldSolid', 'colorsSlotNewSolid'],
    ['unitCaptionFont', 'fontSlotOld', 'fontSlotNew'],
    ['unitCaption', 'detailsSlotOld', 'detailsSlotNew'],
    ['unitPins', 'detailsSlotOld', 'detailsSlotNew'],
    ['unitEffects', 'effectsSlotOld', 'effectsSlotNew'],
    ['unitExport', 'exportSlotOld', 'exportSlotNew'],
  ];
  function applyUiMode(mode) {
    const legacy = mode === 'v1';
    UNIT_PLACEMENT.forEach(([unitId, oldSlotId, newSlotId]) => {
      document.getElementById(legacy ? oldSlotId : newSlotId).appendChild(document.getElementById(unitId));
    });
    document.getElementById('locationControlsOld').hidden = !legacy;
    document.getElementById('locationControlsNew').hidden = legacy;
    mapgenLegacyCheck.checked = legacy;
    try { localStorage.setItem(UI_MODE_KEY, mode); } catch (e) { /* privévenster e.d. — voorkeur onthouden is dan niet erg */ }
  }
  function initUiMode() {
    let saved = 'v2';
    try { saved = localStorage.getItem(UI_MODE_KEY) || 'v2'; } catch (e) { /* zie applyUiMode */ }
    applyUiMode(saved);
    mapgenLegacyCheck.addEventListener('change', () => applyUiMode(mapgenLegacyCheck.checked ? 'v1' : 'v2'));
  }

  // "Place"/"Look"/"Details"/"Effects" — maar één sectie tegelijk open,
  // i.p.v. de vier altijd-open panelen van vroeger. Puur UI-chrome, raakt
  // geen van de bestaande state/render-logica aan.
  function initAccordion() {
    document.querySelectorAll('.accordion-item').forEach(item => {
      item.querySelector('.accordion-head').addEventListener('click', () => {
        const wasOpen = item.classList.contains('open');
        document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
    });
  }

  // Sub-tabs binnen de "Look"-sectie (Layout/Mask/Colors): schakelt alleen
  // welk blok zichtbaar is, de layoutTabs/maskTabs/paletteGrid-knoppen
  // daarbinnen blijven precies dezelfde elementen met dezelfde listeners.
  function initLookSubtabs() {
    const tabs = document.getElementById('lookSubtabs');
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('button[data-sub]');
      if (!btn) return;
      [...tabs.children].forEach(b => b.classList.toggle('active', b === btn));
      tabs.closest('.accordion-body-inner').querySelectorAll('.subpane').forEach(p => p.classList.toggle('active', p.dataset.pane === btn.dataset.sub));
    });
  }

  // Geneste sub-tabs binnen "Colors" zelf (Palettes/Solid) — eigen
  // .color-subtabs/.color-subpane klassen (niet .subtabs/.subpane) zodat
  // initLookSubtabs()'s class-based query hierboven dit niveau niet ook
  // per ongeluk meeschakelt.
  function initColorSubtabs() {
    const tabs = document.getElementById('colorSubtabs');
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('button[data-csub]');
      if (!btn) return;
      [...tabs.children].forEach(b => b.classList.toggle('active', b === btn));
      tabs.parentElement.querySelectorAll('.color-subpane').forEach(p => p.classList.toggle('active', p.dataset.cpane === btn.dataset.csub));
    });
  }

  function onShow() {
    if (!ready) {
      ready = true;
      init();
      scheduleFetch(0);
    }
  }

  // getSummary: alleen-lezen samenvatting van het huidige ontwerp (plaats,
  // palet, formaat) — gebruikt door shop.html voor het naambordje en het
  // overzicht. Verandert niks aan de state.
  // Pinnen-API voor shop.html's lijst "Your pins": alleen-lezen kopie, plus
  // selecteren en één pin verwijderen via dezelfde paden als de knoppen.
  function removePin(i) {
    if (!state.pins[i]) return;
    state.pins.splice(i, 1);
    const sel = state.selectedPin;
    let next = null;
    if (state.pins.length) next = sel == null ? null : (sel === i ? Math.min(i, state.pins.length - 1) : (sel > i ? sel - 1 : sel));
    selectPin(next);
  }
  return {
    onShow,
    getSummary: () => buildDesignSummary(),
    getDesignState: () => exportDesignState(),
    // Zelfde kaart, op een ander (bv. scherper) formaat tekenen — voor de vergrote weergave in shop.html
    renderInto: cnv => MapRender.render(new CanvasPainter(cnv.getContext('2d'), cnv.width, cnv.height), cnv.width, cnv.height, buildRenderOpts()),
    onRender: f => { renderListeners.push(f); },
    setOrderExtras: x => {
      orderExtras = Object.assign({}, orderExtras, x || {});
      // Ingelijst: géén witte rand in het printbestand. De kaart loopt door tot
      // de rand en Gelato's lijst valt ~4–5 mm over de rand heen — zo is er nooit
      // een wit randje tussen lijst en kaart. Zonder lijst: witte rand aan.
      printBorderCheck.checked = false; // geen witte rand meer: altijd rand-tot-rand (lijst of eigen lijst valt ~5 mm over de rand)
    },
    isDataReady: () => !exportPNGBtn.disabled,
    renderPrintFile: scale => renderPrintBlob(scale),
    applyDesign: d => applyDesignState(d),
    getPins: () => ({
      selected: state.selectedPin,
      pins: state.pins.map(p => ({ lat: p.lat, lon: p.lon, icon: p.icon || state.pinIconId, text: p.text })),
      labels: Object.fromEntries(PIN_ICON_PRESETS.map(p => [p.id, p.label])),
    }),
    selectPin: i => selectPin(i),
    removePin,
  };
})();
