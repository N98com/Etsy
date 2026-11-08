// Klant-configurator (shop.html): de stap-voor-stap-indeling rond dezelfde
// kaartmotor als index.html. Dit bestand raakt geen kaart-state aan — het
// verplaatst alleen de bestaande bedieningselementen (die location.js bij ID
// kent) naar de vier stappen, en stuurt de bestaande <select>/knoppen aan.
// Alles wat de kaart doet blijft dus precies wat location.js al deed.
(() => {
  // ---- Prijzen per formaat (PLACEHOLDERS — zet hier je eigen prijzen) ----
  // Sleutels = de preset-id's uit GELATO_SIZES in location.js.
  const PRICES = { // zonder lijst
    in8x10: 39, in11x14: 49, in12x16: 55, in16x20: 65,
    in18x24: 75, in20x28: 85, in24x36: 109, in28x40: 129,
  };
  // Met lijst (Gelato "Wooden framed poster", ready-to-hang): per formaat,
  // per lijstkleur. SKU in Shopify = "<formaat>-<lijst>", bv. in20x28-black.
  const FRAMES = [
    { id: 'none', label: 'No frame', swatch: null },
    { id: 'black', label: 'Black', swatch: '#1E1D1B' },
    { id: 'white', label: 'White', swatch: '#F4F2EE' },
    { id: 'natural', label: 'Natural oak', swatch: '#C9A87C' },
    { id: 'darkwood', label: 'Dark wood', swatch: '#5B3F2C' },
  ];
  const FRAMED_DEFAULT = {
    in8x10: 69, in11x14: 89, in12x16: 95, in16x20: 119,
    in18x24: 135, in20x28: 159, in24x36: 215, in28x40: 239,
  };
  const FRAMED = {}; // FRAMED[size][frame] = prijs
  Object.keys(FRAMED_DEFAULT).forEach(s => { FRAMED[s] = {}; FRAMES.slice(1).forEach(f => { FRAMED[s][f.id] = FRAMED_DEFAULT[s]; }); });
  function priceFor(size, frame) {
    if (!frame || frame === 'none') return PRICES[size];
    return FRAMED[size] ? FRAMED[size][frame] : undefined;
  }
  let CURRENCY = '€';

  // In Shopify (iframe op de productpagina) geeft de winkel zelf de prijzen
  // mee: ?prices=in8x10:4900,in11x14:5900,… (centen, per SKU = formaat-id).
  // Dan zijn de prijzen in de tool altijd gelijk aan die in de kassa, en
  // tonen we alleen de formaten die in Shopify bestaan.
  (function readShopPrices() {
    const qs = new URLSearchParams(window.location.search);
    const list = qs.get('prices');
    if (qs.get('currency')) CURRENCY = qs.get('currency');
    if (!list) return;
    const fromShop = {}, framedShop = {};
    list.split(',').forEach(pair => {
      const [id, cents] = pair.split(':');
      if (!id || !/^\d+$/.test(cents || '')) return;
      const [size, frame] = id.trim().split('-');
      if (frame) (framedShop[size] = framedShop[size] || {})[frame] = +cents / 100;
      else fromShop[size] = +cents / 100;
    });
    if (!Object.keys(fromShop).length) return;
    Object.keys(PRICES).forEach(k => delete PRICES[k]);
    Object.assign(PRICES, fromShop);
    Object.keys(FRAMED).forEach(k => delete FRAMED[k]);
    Object.assign(FRAMED, framedShop);
  })();
  // Valuta: in Shopify komt de valuta van de klant mee (?iso=USD, GBP, EUR …),
  // de prijzen zijn dan al door Shopify omgerekend.
  const ISO = (new URLSearchParams(window.location.search).get('iso') || '').toUpperCase();
  function money(v) {
    if (v == null) return '';
    if (/^[A-Z]{3}$/.test(ISO)) {
      try {
        return new Intl.NumberFormat(ISO === 'EUR' ? 'nl-NL' : 'en-' + (ISO === 'GBP' ? 'GB' : 'US'), {
          style: 'currency', currency: ISO,
          minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2,
        }).format(v).replace(/\s/g, '');
      } catch (e) { /* valt terug op het symbool hieronder */ }
    }
    return CURRENCY + (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));
  }
  const DEFAULT_SIZE = 'in20x28'; // 50×70 cm — het populairste wandformaat
  const STEP_NAMES = ['Place', 'Style', 'Text', 'Size'];

  // "Aan de muur": een lege muur (img/room-wall-empty.jpg, 1080×1300) waarop
  // we zelf een lijst tekenen — op echte schaal, zodat 20×25 en 70×100 ook
  // echt verschillend groot hangen.
  //
  // Het muurvlak staat licht schuin in de foto. WALL_REF beschrijft dat vlak:
  // een rechthoek van 354×600 "muur-eenheden" op het vlak valt in de foto
  // precies op deze vier hoekpunten (linksboven, rechtsboven, rechtsonder,
  // linksonder) — gemeten aan een lijst die oorspronkelijk in de foto hing.
  const ROOM_W = 1080, ROOM_H = 1300;
  const WALL_REF = { w: 354, h: 600, quad: [[476, 288], [830, 274], [830, 866], [476, 870]] }; // schuinte bewust afgezwakt t.o.v. de foto
  const PX_PER_CM = 8;              // muur-eenheden per centimeter
  const FRAME_CM = 2.2;             // breedte van de houten lijst
  const HANG_CENTER = [64, 300];    // middelpunt van de lijst op het muurvlak (midden van de foto)
  const HANG_MIN_TOP = -260, HANG_MAX_BOTTOM = 700; // blijf boven de plant, onder de bovenrand
  // het tekenvlak (canvas) op het muurvlak: genoeg ruimte voor 70×100 + schaduw
  const ART = { x: -440, y: -300, w: 1020, h: 1100 };

  const $ = id => document.getElementById(id);
  const inIframe = window.parent !== window;
  if (inIframe) document.documentElement.classList.add('is-embedded');
  // Studio (n98com.github.io/Etsy/ → shop.html?studio=1, achter de login van
  // js/studio.js): exact dezelfde tool, maar stap IV exporteert het
  // printbestand (300 dpi +50% pixels, exact Gelato-formaat) in plaats van "Add to cart".
  const STUDIO = !inIframe && new URLSearchParams(window.location.search).get('studio') === '1';
  if (STUDIO) document.documentElement.classList.add('is-studio');
  // Printbestand: basis 300 dpi, met 50% meer pixels per zijde (1,5×, dus
  // effectief 450 pixels per inch). Zie PRINT_SCALE_DEFAULT in location.js.
  const PRINT_DPI = 450;
  const PRINT_LABEL = '300 dpi +50%';

  function move(unitId, slotId) {
    const unit = $(unitId), slot = $(slotId);
    if (unit && slot) slot.appendChild(unit);
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function summary() {
    try { return window.LocationApp.getSummary(); } catch (e) { return null; }
  }

  // Projectieve transformatie (homografie) van een rechthoek (0,0)-(w,h) naar
  // vier willekeurige hoekpunten. solveHomography geeft de 8 coëfficiënten,
  // project past ze toe op een punt, quadMatrix maakt er een CSS matrix3d van.
  function project(m, x, y) {
    const d = m[6] * x + m[7] * y + 1;
    return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
  }
  function quadMatrix(w, h, quad) {
    const m = solveHomography(w, h, quad);
    return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
  }
  function solveHomography(w, h, quad) {
    const src = [[0, 0], [w, 0], [w, h], [0, h]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = quad[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // Gauss-eliminatie, 8×8
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  ready(() => {
    // location.js start normaal via views.js; hier is geen tab-wissel, dus
    // direct opstarten. onShow() bouwt alle knoppen/rasters en tekent de kaart.
    window.LocationApp.onShow();

    // ---- Bedieningselementen naar de stappen verplaatsen ----
    move('unitSearch', 'shopSlotSearch');
    move('unitPins', 'shopSlotPins');
    move('mapPaletteGrid', 'shopSlotPalettes');
    move('solidPaletteGrid', 'shopSlotSolid');

    // ---- Paletten in sfeergroepen (knopjes boven de paletten) ----
    (function paletteCategories() {
      const bar = $('paletteCats');
      const grid = $('mapPaletteGrid');
      const solidGrid = $('solidPaletteGrid');
      const solidHead = $('paletteSolidHead');
      const cats = (typeof PALETTE_CATEGORIES !== 'undefined' ? PALETTE_CATEGORIES : []);
      if (!bar || !grid || !cats.length) { if (bar) bar.hidden = true; return; }
      const catOf = {};
      cats.forEach((c, i) => c.ids.forEach((id, j) => { catOf[id] = { cat: c.id, order: i * 100 + j }; }));
      // "All" toont de paletten per groep gesorteerd
      [...grid.children]
        .sort((a, b) => ((catOf[a.dataset.paletteId] || { order: 9999 }).order) - ((catOf[b.dataset.paletteId] || { order: 9999 }).order))
        .forEach(el => grid.appendChild(el));
      const groups = [{ id: 'all', label: 'All' }].concat(cats, [{ id: 'solid', label: 'Solid' }]);
      bar.innerHTML = groups.map(g => `<button type="button" class="palette-cat" data-cat="${g.id}" aria-pressed="${g.id === 'all'}">${g.label}</button>`).join('');
      function show(cat) {
        bar.querySelectorAll('.palette-cat').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === cat ? 'true' : 'false'));
        grid.hidden = cat === 'solid';
        [...grid.children].forEach(el => { el.hidden = !(cat === 'all' || (catOf[el.dataset.paletteId] || {}).cat === cat); });
        const showSolid = cat === 'all' || cat === 'solid';
        if (solidGrid) solidGrid.hidden = !showSolid;
        if (solidHead) solidHead.hidden = cat !== 'all';
      }
      bar.addEventListener('click', e => {
        const b = e.target.closest('.palette-cat');
        if (!b) return;
        show(b.dataset.cat);
        b.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      });
      show('all');
    })();
    move('unitLayout', 'shopSlotLayout');
    move('unitMask', 'shopSlotMask');
    move('unitCaption', 'shopSlotCaption');
    move('unitCaptionFont', 'shopSlotFont');
    move('unitStatus', 'statusSlotNew');
    ['placeFontSizeRow', 'countryFontSizeRow', 'coordsFontSizeRow']
      .forEach(id => move(id, 'shopSlotTextSizes'));
    $('regionFontSizeRow').hidden = true;
    // Witte rand: altijd aan in de shop (de posters zijn bedoeld om in te
    // lijsten). Het vinkje blijft verborgen geparkeerd; location.js leest het
    // bij de export en in de ontwerpgegevens.
    $('printBorderCheck').checked = true;
    $('locationSearchInput').placeholder = 'A city, a street, an address…';
    $('pinAddressInput').placeholder = '…or type the address';

    // ---- "Your pins": geplaatste pins boven de Volgende-knop, met kruisje ----
    const pinList = $('shopPinList');
    function fmtCoord(lat, lon) {
      return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
    }
    function pinIconCanvas(icon, text) {
      const c = document.createElement('canvas');
      const dpr = Math.max(2, window.devicePixelRatio || 1), sz = 26;
      c.width = sz * dpr; c.height = sz * dpr;
      c.className = 'pin-item-icon';
      c.setAttribute('aria-hidden', 'true');
      const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
      const color = $('pinColorInput').value || '#D94848';
      if (icon === 'letters') MapRender.drawPinIcon(new CanvasPainter(ctx, sz, sz), sz / 2, sz / 2, sz / (3.4 + 1.6 * Math.max(0, (text || 'A').length - 1)), color, null, 'letters', text || 'A', null);
      else MapRender.drawPinIcon(new CanvasPainter(ctx, sz, sz), sz / 2, sz - 2, (sz - 4) / 2.7, color, '#ffffff', icon);
      return c;
    }
    function renderPinList() {
      const { pins, selected, labels } = window.LocationApp.getPins();
      pinList.innerHTML = '';
      if (!pins.length) return;
      const head = document.createElement('p');
      head.className = 'pin-list-head';
      head.textContent = pins.length === 1 ? 'Your pin' : `Your pins (${pins.length})`;
      const ul = document.createElement('ul');
      pins.forEach((p, i) => {
        const name = p.icon === 'letters' ? `Letters “${p.text || ''}”`
          : (labels[p.icon] || 'Pin') + (labels[p.icon] && !/pin$/i.test(labels[p.icon]) ? ' pin' : '');
        const li = document.createElement('li');
        li.className = 'pin-item' + (i === selected ? ' selected' : '');
        const main = document.createElement('button');
        main.type = 'button'; main.className = 'pin-item-main';
        main.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
        const text = document.createElement('span'); text.className = 'pin-item-text';
        const t1 = document.createElement('span'); t1.className = 'pin-item-name'; t1.textContent = name;
        const t2 = document.createElement('span'); t2.className = 'pin-item-coords'; t2.textContent = fmtCoord(p.lat, p.lon);
        text.append(t1, t2);
        main.append(pinIconCanvas(p.icon, p.text), text);
        main.addEventListener('click', () => window.LocationApp.selectPin(i));
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'pin-item-x';
        x.setAttribute('aria-label', `Remove ${name}`);
        x.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
        x.addEventListener('click', () => window.LocationApp.removePin(i));
        li.append(main, x);
        ul.appendChild(li);
      });
      pinList.append(head, ul);
    }
    document.addEventListener('mapgen:pins', () => requestAnimationFrame(renderPinList));
    $('pinColorInput').addEventListener('input', () => requestAnimationFrame(renderPinList));
    renderPinList();

    // ---- Stappen ----
    const tabs = [...document.querySelectorAll('.step-tab')];
    const panels = [...document.querySelectorAll('.step-panel')];
    const stepsBar = document.querySelector('.steps');
    const backBtn = $('stepBackBtn');
    const nextBtn = $('stepNextBtn');
    let step = 0;

    function goTo(i, focusPanel) {
      step = Math.max(0, Math.min(STEP_NAMES.length - 1, i));
      stepsBar.style.setProperty('--step', step);
      tabs.forEach((t, k) => {
        const on = k === step;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        if (k < step) t.classList.add('done');
      });
      panels.forEach((p, k) => { p.hidden = k !== step; p.classList.toggle('active', k === step); });
      backBtn.hidden = step === 0;
      const last = step === STEP_NAMES.length - 1;
      nextBtn.hidden = last;
      if (!last) nextBtn.textContent = 'Next: ' + STEP_NAMES[step + 1];
      if (last) updateSummary();
      if (focusPanel) {
        // Op telefoon staat het paneel onder de (sticky) kaart: scroll terug
        // naar het begin van de stappen, zodat je niet halverwege een lijst
        // begint.
        const panel = document.querySelector('.shop-panel');
        // desktop: het stappenpaneel scrolt zelf (zie css), dus dát terug naar boven
        if (window.innerWidth >= 900) { panel.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        const top = panel.getBoundingClientRect().top + window.scrollY - stageOffset();
        if (window.scrollY > top) { if (window.N98Compact) window.N98Compact.ignore(900); window.scrollTo({ top, behavior: 'smooth' }); }
      }
    }
    function stageOffset() {
      return window.innerWidth < 900 ? document.querySelector('.shop-stage').offsetHeight : 0;
    }
    tabs.forEach((t, k) => t.addEventListener('click', () => goTo(k, true)));
    nextBtn.addEventListener('click', () => goTo(step + 1, true));
    backBtn.addEventListener('click', () => goTo(step - 1, true));

    // ---- Formaat: kaarten i.p.v. de dropdown ----
    const ratioSelect = $('ratioTabs');
    const sizeGrid = $('shopSizeGrid');
    const sizeOptions = [...ratioSelect.options].filter(o => PRICES[o.value] != null);

    function sizeLabels(opt) {
      // optie-tekst is "20×28in · 50×70cm" (zie RATIO_PRESETS in location.js)
      const [inch, cm] = opt.textContent.split('·').map(s => s.trim());
      return { cm: cm.replace('cm', ' cm'), inch: inch.replace('in', ' in') };
    }
    sizeOptions.forEach(opt => {
      const { cm, inch } = sizeLabels(opt);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-card';
      btn.dataset.sizeId = opt.value;
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<span class="size-shape" aria-hidden="true"></span>' +
        '<span class="size-text"><span class="size-cm"></span>' +
        '<span class="size-meta"><span class="size-in"></span><span class="size-price"></span></span></span>';
      btn.querySelector('.size-cm').textContent = cm;
      btn.querySelector('.size-in').textContent = inch;
      btn.querySelector('.size-price').textContent = money(PRICES[opt.value]);
      // klein silhouet op schaal, zodat je de verhoudingen ziet
      const m = cm.match(/(\d+)×(\d+)/);
      if (m) {
        const shape = btn.querySelector('.size-shape');
        shape.style.width = Math.round(+m[1] * 0.32) + 'px';
        shape.style.height = Math.round(+m[2] * 0.32) + 'px';
      }
      btn.addEventListener('click', () => selectSize(opt.value));
      sizeGrid.appendChild(btn);
    });

    // ---- Lijst ----
    let frameId = 'none';
    const frameGrid = $('shopFrameGrid');
    // In Shopify alleen tonen als de productpagina lijsten ondersteunt (&frames=1),
    // anders zou een oudere pagina de lijst-keuze negeren.
    const framesSupported = !inIframe || new URLSearchParams(window.location.search).get('frames') === '1';
    const frameOptions = () => framesSupported ? FRAMES.filter(f => f.id === 'none' || Object.values(FRAMED).some(m => m[f.id] != null)) : [FRAMES[0]];
    function frameDelta(f) {
      if (f.id === 'none') return 'Print only';
      const d = priceFor(ratioSelect.value, f.id) - priceFor(ratioSelect.value, 'none');
      return isFinite(d) ? '+ ' + money(d) : '';
    }
    if (!framesSupported) { frameGrid.hidden = true; const h = document.querySelector('.frame-head'); if (h) h.hidden = true; }
    frameOptions().forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'frame-card' + (f.id === frameId ? ' active' : '');
      btn.dataset.frameId = f.id; btn.setAttribute('aria-pressed', f.id === frameId ? 'true' : 'false');
      btn.innerHTML = '<span class="frame-swatch" aria-hidden="true"></span><span class="frame-text"><span class="frame-name"></span><span class="frame-price"></span></span>';
      const sw = btn.querySelector('.frame-swatch');
      if (f.swatch) sw.style.setProperty('--sw', f.swatch); else sw.classList.add('is-none');
      btn.querySelector('.frame-name').textContent = f.label;
      btn.addEventListener('click', () => selectFrame(f.id));
      frameGrid.appendChild(btn);
    });
    function refreshPrices() {
      [...sizeGrid.children].forEach(b => { b.querySelector('.size-price').textContent = money(priceFor(b.dataset.sizeId, frameId)); });
      [...frameGrid.children].forEach(b => { b.querySelector('.frame-price').textContent = frameDelta(FRAMES.find(f => f.id === b.dataset.frameId)); });
      $('buyAmount').textContent = STUDIO ? printPx() : money(priceFor(ratioSelect.value, frameId));
    }
    function printPx() {
      const m = /(\d+)\s*[×x]\s*(\d+)\s*cm/i.exec(currentCm() || '');
      if (!m) return '';
      const px = cm => Math.round(cm / 2.54 * PRINT_DPI);
      return px(+m[1]) + ' × ' + px(+m[2]) + ' px';
    }
    function selectFrame(id) {
      frameId = id;
      [...frameGrid.children].forEach(b => {
        const on = b.dataset.frameId === id;
        b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const f = FRAMES.find(x => x.id === id);
      if (window.LocationApp && window.LocationApp.setOrderExtras) window.LocationApp.setOrderExtras({ frame: id, frameLabel: f ? f.label : id });
      $('buySize').textContent = STUDIO ? (currentCm() + ' · ' + PRINT_LABEL).toUpperCase() : (currentCm() + (id !== 'none' ? ' · framed' : '')).toUpperCase();
      refreshPrices();
      updateSummary();
      if (typeof drawRoomPoster === 'function') requestAnimationFrame(drawRoomPoster);
      if (typeof updateBorderRing === 'function') requestAnimationFrame(updateBorderRing);
    }
    window.N98Frame = () => FRAMES.find(f => f.id === frameId) || FRAMES[0];

    function currentCm() {
      const opt = sizeOptions.find(o => o.value === ratioSelect.value);
      return opt ? sizeLabels(opt).cm : '';
    }
    function selectSize(id) {
      if (ratioSelect.value !== id) {
        ratioSelect.value = id;
        ratioSelect.dispatchEvent(new Event('change'));
      }
      [...sizeGrid.children].forEach(b => {
        const on = b.dataset.sizeId === id;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('buySize').textContent = STUDIO ? (currentCm() + ' · ' + PRINT_LABEL).toUpperCase() : (currentCm() + (frameId !== 'none' ? ' · framed' : '')).toUpperCase();
      refreshPrices();
      $('stageSize').textContent = currentCm();
      updateSummary();
      requestAnimationFrame(layoutRoom);
    }

    // ---- Naambordje onder de kaart + overzicht ("bon") ----
    function placeName(s) {
      const own = $('placeNameInput').value.trim();
      return own || (s && s.location && s.location.place) || 'Your map';
    }
    function updatePlacard() {
      const s = summary();
      $('placardPlace').textContent = placeName(s);
    }
    function updateSummary() {
      const s = summary();
      const box = $('shopSummary');
      box.innerHTML = '';
      const rows = [
        ['Place', placeName(s)],
        ['Palette', s && s.palette ? s.palette.name : ''],
        ['Size', currentCm()],
        ['Frame', (FRAMES.find(f => f.id === frameId) || FRAMES[0]).label],
        STUDIO ? ['Print file', printPx() + ' · ' + PRINT_LABEL + ' · PNG'] : ['Price', money(priceFor(ratioSelect.value, frameId))],
        ['Shipping', STUDIO ? '' : 'Free'],
      ];
      rows.forEach(([k, v]) => {
        if (!v) return;
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        box.append(dt, dd);
      });
    }
    ['click', 'input', 'change'].forEach(ev => document.addEventListener(ev, () => {
      requestAnimationFrame(() => { updatePlacard(); if (step === 3) updateSummary(); });
    }));
    setInterval(updatePlacard, 1500); // plaatsnaam komt asynchroon binnen na zoeken/pannen

    // ---- Witte rand in de preview ----
    // De export zet er 3% van de kortste zijde aan wit omheen (zie
    // PRINT_BORDER_FRACTION in mapRender.js). In de live kaart tekenen we die
    // rand niet (dat zou slepen/pins verstoren), dus tonen we hem eromheen.
    const PRINT_BORDER = 0.03;
    const liveCanvas = $('locationCanvas');
    const FRAME_RING = { black: '#1E1D1B', white: '#F1EFEA', natural: '#C9A87C', darkwood: '#5B3F2C' };
    function updateBorderRing() {
      const r = liveCanvas.getBoundingClientRect();
      const fr = window.N98Frame ? window.N98Frame().id : 'none';
      if (FRAME_RING[fr]) {
        // ingelijst: de kaart loopt door tot onder de lijst — geen witte rand
        const [cmW, cmH] = (currentCm().match(/(\d+)×(\d+)/) || [0, 50, 70]).slice(1).map(Number);
        const n = Math.max(3, Math.round(Math.min(r.width, r.height) * 2.2 / Math.min(cmW, cmH)));
        liveCanvas.style.setProperty('--print-border', n + 'px');
        liveCanvas.style.setProperty('--ring-color', FRAME_RING[fr]);
        return;
      }
      // zonder lijst: de print is rand-tot-rand, dus geen witte rand meer
      liveCanvas.style.setProperty('--print-border', '0px');
      liveCanvas.style.setProperty('--ring-color', '#ffffff');
    }
    if (window.ResizeObserver) new ResizeObserver(updateBorderRing).observe(liveCanvas);
    window.addEventListener('resize', updateBorderRing);
    updateBorderRing();

    // ---- Vergroten: de kaart schermvullend, met een scherpe weergave ----
    // De live kaart tekent op een vaste resolutie (900 px lange zijde). Groot
    // op een telefoon wordt dat zacht, dus zodra je stilstaat tekent een tweede
    // canvas dezelfde kaart op schermresolutie eroverheen (klikken gaan er
    // dwars doorheen naar de echte kaart).
    const zoomBtn = $('stageZoomBtn');
    const sharp = $('stageSharp');
    const stageEl = document.querySelector('.shop-stage');
    let sharpTimer = null, interacting = false;
    function hideSharp() { sharp.hidden = true; }
    function drawSharp() {
      if (stageEl.classList.contains('is-room')) { hideSharp(); return; }
      if (!stageEl.classList.contains('is-full') || interacting || !window.LocationApp || !window.LocationApp.renderInto) return;
      const r = liveCanvas.getBoundingClientRect();
      const wrap = liveCanvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (w <= liveCanvas.width * 1.15) { hideSharp(); return; } // al scherp genoeg
      if (sharp.width !== w || sharp.height !== h) { sharp.width = w; sharp.height = h; }
      sharp.style.left = (r.left - wrap.left) + 'px'; sharp.style.top = (r.top - wrap.top) + 'px';
      sharp.style.width = r.width + 'px'; sharp.style.height = r.height + 'px';
      window.LocationApp.renderInto(sharp);
      sharp.hidden = false;
    }
    function scheduleSharp() { hideSharp(); clearTimeout(sharpTimer); sharpTimer = setTimeout(drawSharp, 260); }
    if (window.LocationApp && window.LocationApp.onRender) window.LocationApp.onRender(() => { if (stageEl.classList.contains('is-full')) scheduleSharp(); });
    liveCanvas.addEventListener('pointerdown', () => { interacting = true; hideSharp(); });
    window.addEventListener('pointerup', () => { if (interacting) { interacting = false; scheduleSharp(); } });
    window.addEventListener('pointercancel', () => { interacting = false; scheduleSharp(); });
    liveCanvas.addEventListener('wheel', scheduleSharp, { passive: true });
    function setFull(on) {
      stageEl.classList.toggle('is-full', on);
      document.documentElement.classList.toggle('stage-full', on);
      zoomBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      zoomBtn.setAttribute('aria-label', on ? 'Close the enlarged map' : 'Enlarge the map');
      hideSharp();
      requestAnimationFrame(() => {
        updateBorderRing();
        if (stageEl.classList.contains('is-room')) { layoutRoom(); drawRoomPoster(); }
        if (on) scheduleSharp();
      });
    }
    zoomBtn.addEventListener('click', () => setFull(!stageEl.classList.contains('is-full')));

    // ---- mobiel: kaart krimpt mee tijdens het invullen (zie css) ----
    const compactMq = window.matchMedia('(max-width: 899px)');
    let compactIgnoreUntil = 0, compactTimer = null;
    function setCompact(on) {
      if (on && !compactMq.matches) on = false;
      const root = document.documentElement;
      if (root.classList.contains('stage-compact') === on) return;
      root.classList.toggle('stage-compact', on);
      // na de animatie: lijstrand, muurweergave e.d. opnieuw uitlijnen
      clearTimeout(compactTimer);
      compactTimer = setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
    }
    window.addEventListener('scroll', () => {
      if (Date.now() < compactIgnoreUntil || stageEl.classList.contains('is-full')) return;
      const y = window.scrollY;
      if (y > 48) setCompact(true);
      else if (y <= 4) setCompact(false);
    }, { passive: true });
    const panelEl = document.querySelector('.shop-panel');
    panelEl.addEventListener('focusin', e => { if (e.target.matches('input, textarea, select')) setCompact(true); });
    $('stageExpandBtn').addEventListener('click', () => {
      compactIgnoreUntil = Date.now() + 900;
      setCompact(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    compactMq.addEventListener && compactMq.addEventListener('change', () => { if (!compactMq.matches) setCompact(false); });
    window.N98Compact = { ignore: ms => { compactIgnoreUntil = Date.now() + (ms || 900); } };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && stageEl.classList.contains('is-full')) setFull(false); });
    window.addEventListener('resize', () => { if (stageEl.classList.contains('is-full')) scheduleSharp(); });

    // ---- Studio / Aan de muur ----
    const stage = document.querySelector('.shop-stage');
    const stageFrame = document.querySelector('.stage-frame');
    const roomView = $('roomView');
    const roomBox = $('roomBox');
    const roomInner = $('roomInner');
    const roomArt = $('roomArt');
    const roomCtx = roomArt.getContext('2d');
    const mapCanvas = $('locationCanvas');
    const stageHint = $('stageHint');
    const defaultHint = stageHint.textContent;
    let roomTimer = null;

    // Het tekenvlak ligt op het (schuine) muurvlak: bereken waar zijn vier
    // hoeken in de foto vallen en vervorm het canvas daarnaar.
    const wallH = solveHomography(WALL_REF.w, WALL_REF.h, WALL_REF.quad);
    const artCorners = [[ART.x, ART.y], [ART.x + ART.w, ART.y], [ART.x + ART.w, ART.y + ART.h], [ART.x, ART.y + ART.h]]
      .map(([x, y]) => project(wallH, x, y));
    roomArt.style.transform = quadMatrix(ART.w, ART.h, artCorners);

    function layoutRoom() {
      if (roomView.hidden) return;
      const k = Math.min(stageFrame.clientWidth / ROOM_W, stageFrame.clientHeight / ROOM_H);
      roomInner.style.transform = `scale(${k})`;
      roomBox.style.width = Math.round(ROOM_W * k) + 'px';
      roomBox.style.height = Math.round(ROOM_H * k) + 'px';
    }

    // Echte afmeting van het gekozen formaat, in cm (uit location.js).
    function posterCm() {
      const s = summary();
      if (s && s.size && s.size.cmW) return [s.size.cmW, s.size.cmH];
      return [50, 70];
    }

    function drawRoomPoster() {
      const ctx = roomCtx;
      ctx.clearRect(0, 0, ART.w, ART.h);
      if (!mapCanvas.width || !mapCanvas.height) return;

      const [cmW, cmH] = posterCm();
      const pw = cmW * PX_PER_CM, ph = cmH * PX_PER_CM;     // de print zelf
      const frame = window.N98Frame ? window.N98Frame().id : 'natural';
      const FRAME_LOOK = {
        natural: ['#E2C79F', '#C9A87C', '#A9895F', '#C9A87C'],
        darkwood: ['#7A5640', '#5B3F2C', '#3E2A1D', '#5B3F2C'],
        black: ['#3A3835', '#1E1D1B', '#0E0E0D', '#1E1D1B'],
        white: ['#FFFFFF', '#F1EFEA', '#DCD8D0', '#F1EFEA'],
      };
      const look = FRAME_LOOK[frame];
      const f = look ? FRAME_CM * PX_PER_CM : 0;             // lijstbreedte (0 = losse print)
      const ow = pw + 2 * f, oh = ph + 2 * f;                // buitenmaat lijst
      // middelpunt op de vaste ophanghoogte, maar altijd binnen de muur
      let top = HANG_CENTER[1] - oh / 2;
      if (top + oh > HANG_MAX_BOTTOM) top = HANG_MAX_BOTTOM - oh;
      if (top < HANG_MIN_TOP) top = HANG_MIN_TOP;
      const x = HANG_CENTER[0] - ow / 2 - ART.x;
      const y = top - ART.y;

      // slagschaduw op de muur (licht valt van linksboven)
      ctx.save();
      ctx.shadowColor = 'rgba(8, 14, 10, 0.55)';
      ctx.shadowBlur = 34; ctx.shadowOffsetX = 14; ctx.shadowOffsetY = 20;
      if (!look) { ctx.shadowBlur = 16; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 9; ctx.shadowColor = 'rgba(8, 14, 10, 0.35)'; }
      ctx.fillStyle = look ? look[3] : '#ffffff';
      ctx.fillRect(x, y, ow, oh);
      ctx.restore();

      // lijst in de gekozen kleur, met een zachte glans en afgeschuinde binnenrand
      if (look) {
        const wood = ctx.createLinearGradient(x, y, x + ow, y + oh);
        wood.addColorStop(0, look[0]); wood.addColorStop(0.5, look[1]); wood.addColorStop(1, look[2]);
        ctx.fillStyle = wood;
        ctx.fillRect(x, y, ow, oh);
        ctx.strokeStyle = 'rgba(40, 30, 20, 0.35)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, ow - 1.5, oh - 1.5);
      }

      // de print, met dezelfde witte rand als het printbestand
      const ix = x + f, iy = y + f;
      const wb = 0; // rand-tot-rand: geen witte rand meer
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ix, iy, pw, ph);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mapCanvas, ix + wb, iy + wb, pw - 2 * wb, ph - 2 * wb);

      // zonder lijst: alleen de print op de muur, geen glas of lijstschaduw
      if (!look) return;
      // diepte: de lijst werpt een smalle schaduw op de print
      const depth = Math.max(6, f * 0.45);
      const sh = (x0, y0, x1, y1) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.32)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        return g;
      };
      ctx.fillStyle = sh(ix, iy, ix, iy + depth); ctx.fillRect(ix, iy, pw, depth);
      ctx.fillStyle = sh(ix, iy, ix + depth, iy); ctx.fillRect(ix, iy, depth, ph);
      ctx.strokeStyle = 'rgba(40, 26, 12, 0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(ix - 0.5, iy - 0.5, pw + 1, ph + 1);

      // glas: een heel subtiele diagonale reflectie + het licht van het raam
      const glass = ctx.createLinearGradient(ix, iy, ix + pw, iy + ph);
      glass.addColorStop(0, 'rgba(255, 255, 255, 0.10)');
      glass.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
      glass.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
      ctx.fillStyle = glass; ctx.fillRect(ix, iy, pw, ph);
    }
    function setView(view) {
      const room = view === 'room';
      document.querySelectorAll('.view-btn').forEach(b => {
        const on = b.dataset.view === view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      roomView.hidden = !room;
      if (room) sharp.hidden = true; else if (stageEl.classList.contains('is-full')) scheduleSharp();
      stage.classList.toggle('is-room', room);
      stageHint.textContent = room ? 'Shown to scale · Switch to Studio to move the map' : defaultHint;
      clearInterval(roomTimer);
      if (room) {
        layoutRoom();
        drawRoomPoster();
        roomTimer = setInterval(drawRoomPoster, 400); // volgt elke wijziging live
      }
    }
    document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    window.addEventListener('resize', layoutRoom);

    // ---- Laadstatus: vriendelijke tekst i.p.v. technische meldingen ----
    const statusEl = $('locationStatus');
    const loader = document.createElement('div');
    loader.className = 'stage-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<span class="stage-loader-dot"></span><span>Drawing your map…</span>';
    stageFrame.appendChild(loader);
    const friendly = document.createElement('p');
    friendly.className = 'stage-error';
    friendly.setAttribute('role', 'status');
    statusEl.after(friendly);

    function syncStatus() {
      const t = statusEl.textContent || '';
      loader.classList.toggle('show', /fetching/i.test(t));
      friendly.textContent = /fail/i.test(t) ? "We couldn't load this area. Try zooming in a little, or search again." : '';
    }
    new MutationObserver(syncStatus).observe(statusEl, { childList: true, characterData: true, subtree: true });
    syncStatus();

    // ---- Kopen ----
    const buyBtn = $('buyBtn');
    const buyLabel = $('buyLabel');
    const confirmBtn = $('embedConfirmBtn');
    const toastEl = $('shopToast');
    let toastTimer = null;
    // In Shopify: deze knop legt het ontwerp meteen in het winkelmandje (de
    // productpagina doet de eigenlijke toevoeging en stuurt een bericht terug).
    let adding = false;
    window.addEventListener('message', e => {
      if (e.source !== window.parent || !e.data || e.data.source !== 'n98-shop') return;
      adding = false;
      buyBtn.disabled = false;
      buyLabel.textContent = 'Add to cart';
      if (e.data.type === 'added') openAddedSheet(e.data.itemCount);
      if (e.data.type === 'error') toast(e.data.message || 'Something went wrong. Please try again.');
    });

    // Na toevoegen: afrekenen, of nog een kaart ontwerpen (ontwerp blijft
    // staan als vertrekpunt — handig voor dezelfde plek in een ander formaat,
    // of een tweede adres voor een cadeau).
    const addedSheet = $('addedSheet');
    function openAddedSheet(itemCount) {
      const s = summary();
      const fr = FRAMES.find(f => f.id === frameId);
      $('addedItem').textContent = [placeName(s), currentCm(), frameId !== 'none' && fr ? fr.label + ' frame' : '', money(priceFor(ratioSelect.value, frameId))].filter(Boolean).join(' · ');
      $('addedCheckoutLabel').textContent = itemCount > 1 ? `View cart (${itemCount}) & checkout` : 'View cart & checkout';
      addedSheet.hidden = false;
      $('addedCheckout').focus();
    }
    function closeAddedSheet() { addedSheet.hidden = true; }
    $('addedCheckout').addEventListener('click', () => {
      $('addedCheckoutLabel').textContent = 'Opening your cart…';
      window.parent.postMessage({ source: 'n98-shop-frame', type: 'go-cart' }, '*');
    });
    $('addedAnother').addEventListener('click', () => {
      closeAddedSheet();
      goTo(0, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('Design your next map. Your first one is safe in the cart.');
    });
    addedSheet.addEventListener('click', e => { if (e.target === addedSheet) closeAddedSheet(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !addedSheet.hidden) closeAddedSheet(); });

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
    }
    // Studio: printbestand exporteren (zelfde render als de automatische
    // orderverwerking: exact formaat, 300 dpi, rand tot rand).
    let exporting = false;
    function slugify(t) {
      return String(t || 'map').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
    }
    async function exportPrint() {
      if (exporting) return;
      if (!window.LocationApp || !window.LocationApp.isDataReady || !window.LocationApp.isDataReady()) {
        toast('Your map is still being drawn, one moment please.'); return;
      }
      exporting = true;
      buyBtn.disabled = true;
      buyLabel.textContent = 'Rendering print file… (can take a minute)';
      try {
        const r = await window.LocationApp.renderPrintFile();
        const name = (window.N98StudioFileName && window.N98StudioFileName()) || 'N98-' + slugify(placeName(summary())) + '-' + slugify(currentCm().replace(/\s*×\s*/g, 'x')).toLowerCase() + '-300dpi-plus50.png';
        const url = URL.createObjectURL(r.blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        window.dispatchEvent(new CustomEvent('n98:exported', { detail: { w: r.w, h: r.h, dpi: r.dpi, name } }));
        toast('Exported ' + r.w + ' × ' + r.h + ' px, ' + PRINT_LABEL + ' (' + (r.blob.size / 1e6).toFixed(1) + ' MB).');
      } catch (e) {
        toast('Export failed: ' + ((e && e.message) || e));
      } finally {
        exporting = false;
        buyBtn.disabled = false;
        buyLabel.textContent = 'Export print file';
      }
    }
    if (STUDIO) {
      buyLabel.textContent = 'Export print file';
      const note = document.querySelector('.buy-note');
      if (note) note.textContent = 'Studio · Print file at ' + PRINT_LABEL + ', edge to edge';
    }

    buyBtn.addEventListener('click', () => {
      if (STUDIO) { exportPrint(); return; }
      if (confirmBtn.disabled) { toast('Your map is still being drawn, one moment please.'); return; }
      if (adding) return;
      confirmBtn.click(); // location.js: bouwt ontwerp-samenvatting + preview en stuurt die naar Shopify
      if (inIframe) {
        adding = true;
        buyBtn.disabled = true;
        buyLabel.textContent = 'Adding…';
      } else {
        toast('Your design is ready. Checkout opens in the N°98 Maps shop.');
      }
    });

    // location.js start op een formaat dat niet (meer) in de lijst staat —
    // daarom altijd expliciet het standaardformaat kiezen.
    selectSize(PRICES[DEFAULT_SIZE] ? DEFAULT_SIZE : sizeOptions[0].value);
    selectFrame(frameId);
    updatePlacard();
    goTo(0, false);
    // voor js/studio.js (ontwerp uit een bestel-link laden)
    window.N98Shop = { selectSize, selectFrame, goTo, updatePlacard, updateSummary, toast };
  });
})();
