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
    { id: 'natural', label: 'Natural wood', swatch: '#C9A87C' },
    { id: 'darkwood', label: 'Dark wood', swatch: '#5B3F2C' },
  ];
  const FRAMED_DEFAULT = {
    in8x10: 65, in11x14: 79, in12x16: 89, in16x20: 115,
    in18x24: 129, in20x28: 149, in24x36: 199, in28x40: 225,
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
  // Zes stappen, één keuze per scherm (uxTwoEarly/uxTwoLate), in de webshop
  // én de Studio. ?ux=1 toont de oude vier stappen nog, voor vergelijking.
  const UX2 = !/[?&]ux=1\b/.test(window.location.search);
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
      const groups = [{ id: 'all', label: 'All' }].concat(cats, [{ id: 'solid', label: 'Solid colours' }]);
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

    // ---- Zes stappen, één keuze per scherm ----
    // Place (+ tekst controleren) · Colours · Shape & layout · Text · Pins ·
    // Size · Frame. De kaart is te verslepen in stap 1 tot en met 4; bij
    // Pins, Size en Frame staat hij vast (pins plaatsen en slepen kan wel).
    if (UX2) (function uxTwoEarly() {
      document.documentElement.classList.add('ux2');
      STEP_NAMES.splice(0, STEP_NAMES.length, 'Place', 'Colours', 'Shape', 'Text', 'Pins', 'Size');
      const old = [0, 1, 2, 3].map(i => document.querySelector('.step-panel[data-panel="' + i + '"]'));
      const host = old[0].parentNode;
      const TITLES = [
        ['Where shall we <em>draw?</em>', 'Search a city, a street or an address, then drag and zoom until the framing feels right. Check the words below: you can change them right here.'],
        ['Choose your <em>colours</em>', 'Each palette is composed to live on a wall. You can still drag the map.'],
        ['Shape &amp; <em>layout</em>', 'Give your map a shape and a layout. Drag the map so nothing important falls away.'],
        ['Make the words <em>yours</em>', 'Choose a typeface, a text size and, if you like, your own colour.'],
        ['Mark where it <em>happened</em>', 'Optional. Choose an icon, then tap the spot on the map. You can drag it afterwards.'],
        ['Size &amp; <em>frame</em>', 'Eight gallery sizes, as a print or in a solid pine frame that arrives ready to hang.']
      ];
      const panels = TITLES.map(([t, l], i) => {
        const el = document.createElement('div');
        el.className = 'step-panel' + (i === 0 ? ' active' : '');
        el.dataset.panel = String(i); el.setAttribute('role', 'tabpanel');
        if (i) el.hidden = true;
        el.innerHTML = '<p class="step-eyebrow">Step ' + (i + 1) + ' of ' + TITLES.length + '</p><h2 class="step-title">' + t + '</h2><p class="step-lede">' + l + '</p>';
        return el;
      });
      const add = (i, ...els) => els.filter(Boolean).forEach(e => panels[i].appendChild(e));
      const sub = (txt, cls) => { const h = document.createElement('h3'); h.className = 'step-sub' + (cls ? ' ' + cls : ''); h.innerHTML = txt; return h; };
      // 1 Place: zoeken + meteen de tekst
      const sayHead = sub('Your map will say', 'ux-say');
      const captionSlot = $('shopSlotCaption');
      add(0, $('shopSlotSearch'), sayHead, captionSlot);
      // pas tonen zodra de klant een plek heeft gekozen (of een ontwerp is geladen)
      sayHead.hidden = true; captionSlot.hidden = true;
      document.addEventListener('mapgen:place', () => { sayHead.hidden = false; captionSlot.hidden = false; });
      // 2 Colours
      add(1, $('paletteCats'), $('shopSlotPalettes'), $('paletteSolidHead'), $('shopSlotSolid'));
      // 3 Shape & layout
      add(2, sub('Shape'), $('shopSlotMask'), sub('Layout'), $('shopSlotLayout'));
      // 4 Text
      add(3, sub('Typeface'), $('shopSlotFont'), sub('Text size'), $('shopSlotTextSizes'));
      // 5 Pins
      add(4, $('shopSlotPins'), $('shopPinList'));
      // 6 Size & frame: formaten, dan de lijst en de rest van de oude stap IV
      add(5, sub('Size'), $('shopSizeGrid'));
      const fhd = old[3].querySelector('.frame-head'); if (fhd) fhd.innerHTML = 'Frame <span class="optional">solid pine, ready to hang</span>';
      [...old[3].children].forEach(c => { if (!c.matches('.step-eyebrow, .step-title, .step-lede, #shopSizeGrid')) panels[5].appendChild(c); });
      old.forEach(o => o.remove());
      const navEl = host.querySelector('.step-nav');
      panels.forEach(pn => host.insertBefore(pn, navEl));
      if (navEl) navEl.hidden = true;
      // terug-knop onderin, links naast de prijs en "Next"
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'ux-back'; back.id = 'uxBackBtn'; back.hidden = true;
      back.setAttribute('aria-label', 'Back');
      back.innerHTML = '<svg width="20" height="10" viewBox="0 0 22 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M22 5H2M6 1L2 5l4 4"></path></svg><span>Back</span>';
      document.querySelector('.buy-row').insertBefore(back, document.querySelector('.buy-row').firstChild);
      // tabjes met alleen de naam van elke stap
      const bar = document.querySelector('.steps');
      bar.querySelectorAll('.step-tab').forEach(t => t.remove());
      const ind = bar.querySelector('.step-indicator');
      STEP_NAMES.forEach((n, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'step-tab' + (i === 0 ? ' active' : '');
        b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false'); b.dataset.step = String(i);
        b.setAttribute('aria-label', 'Step ' + (i + 1) + ': ' + n);
        b.innerHTML = '<span class="ux-dot"><svg class="ux-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4l2.6 2.6L12 5.4"/></svg><span class="ux-num">' + ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][i] + '</span></span><span class="step-tab-label">' + n + '</span>';
        bar.insertBefore(b, ind);
      });
    })();

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
      if (window.N98SyncBuyBtn) window.N98SyncBuyBtn();
      if (window.N98OnStep) window.N98OnStep(step);
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
      const m = window.N98Compact && window.N98Compact.metrics();
      return window.innerWidth < 900 ? (m ? m.min : document.querySelector('.shop-stage').offsetHeight) : 0;
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
      // "In the box": alleen bij een lijst; tot 50×70 zit er ook een standaard op de achterkant
      if (STUDIO) { const pr = document.querySelector('.promises'); if (pr) pr.remove(); }
      const inc = $('frameIncluded');
      if (inc) {
        inc.hidden = STUDIO || frameId === 'none';
        const big = /^in(24x36|28x40)$/.test(ratioSelect.value);
        $('frameIncludedStand').hidden = big;
        $('frameIncludedHang').textContent = big ? 'Hook attached on the back, ready for the wall' : 'Hanging kit included, for portrait or landscape';
      }
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
      if (inIframe) window.parent.postMessage({ source: 'n98-shop-frame', type: 'host-scroll', y: on ? 99999 : Math.max(0, window.scrollY) }, '*');
      if (!on && window.N98Compact) requestAnimationFrame(() => window.dispatchEvent(new Event('scroll')));
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

    // ---- mobiel: kaart klapt vloeiend in tijdens het scrollen (zie css) ----
    // De kaart staat vast bovenin; de stappen beginnen eronder. Elke pixel die
    // de klant scrolt, wordt de kaart een pixel lager tot hij klein is, dus
    // de onderrand van de kaart en de stappen bewegen precies met de vinger
    // mee. In Shopify schuift de winkel-header (menu, logo, mandje) op dezelfde
    // manier mee weg: die ligt over de bovenkant van dit frame (hostPad).
    const compactMq = window.matchMedia('(max-width: 899px)');
    const root = document.documentElement;
    const layoutEl = document.querySelector('.shop-layout');
    const panelEl = document.querySelector('.shop-panel');
    const hintEl = $('stageHint');
    const viewsEl = document.querySelector('.stage-views');
    const placardEl = document.querySelector('.stage-placard');
    // plaatje-onderschrift en hint klappen mee in, zodat de kaart de ruimte krijgt
    const folds = [placardEl, hintEl].filter(Boolean).map(el => ({ el, h: 0, m: 0 }));
    const hostSpacer = document.createElement('div');
    hostSpacer.className = 'host-spacer'; hostSpacer.setAttribute('aria-hidden', 'true');
    layoutEl.parentNode.insertBefore(hostSpacer, layoutEl);
    let hostPad = 0, M = null, lastHostY = -1, lastVh = 0, lastVw = 0;
    function measure(force) {
      const vh = window.innerHeight, vw = window.innerWidth;
      // adresbalk van de telefoon die in- en uitschuift: niet opnieuw meten
      if (!force && M && vw === lastVw && Math.abs(vh - lastVh) < 140) return;
      lastVh = vh; lastVw = vw;
      if (!compactMq.matches) {
        M = null;
        hostSpacer.style.height = '0px';
        root.style.removeProperty('--stage-full'); root.style.removeProperty('--stage-min');
        stageEl.style.transform = ''; stageEl.style.height = '';
        folds.forEach(f => { f.el.style.height = ''; f.el.style.marginTop = ''; f.el.style.overflow = ''; f.el.style.opacity = ''; });
        root.classList.remove('stage-compact');
        return;
      }
      hostSpacer.style.height = hostPad + 'px';
      folds.forEach(f => {
        f.el.style.height = ''; f.el.style.marginTop = ''; f.el.style.overflow = '';
        f.h = f.el.offsetHeight; f.m = parseFloat(getComputedStyle(f.el).marginTop) || 0;
      });
      const full = Math.round(vh * 0.52), min = Math.round(vh * 0.3);
      root.style.setProperty('--stage-full', full + 'px');
      root.style.setProperty('--stage-min', min + 'px');
      M = { full, min, host: Math.round(hostSpacer.getBoundingClientRect().bottom + window.scrollY) };
    }
    function update() {
      if (!M || stageEl.classList.contains('is-full')) return;
      const y = Math.max(0, window.scrollY);
      const top = Math.max(0, M.host - y);
      const range = M.full - M.min;
      const shrink = Math.min(range, Math.max(0, y - M.host));
      const p = range > 0 ? shrink / range : 0;
      stageEl.style.transform = top ? 'translate3d(0,' + top + 'px,0)' : 'none';
      stageEl.style.height = (M.full - shrink) + 'px';
      const k = 1 - p;
      folds.forEach(f => {
        f.el.style.overflow = 'hidden';
        f.el.style.height = (f.h * k).toFixed(2) + 'px';
        f.el.style.marginTop = (f.m * k).toFixed(2) + 'px';
        f.el.style.opacity = String(Math.max(0, 1 - p * 1.8));
      });
      if (viewsEl) { viewsEl.style.opacity = String(Math.max(0, 1 - p * 2)); viewsEl.style.pointerEvents = p > 0.5 ? 'none' : ''; }
      const compact = p > 0.96;
      if (root.classList.contains('stage-compact') !== compact) root.classList.toggle('stage-compact', compact);
      if (inIframe && hostPad) {
        const hy = Math.min(y, hostPad);
        if (hy !== lastHostY) { lastHostY = hy; window.parent.postMessage({ source: 'n98-shop-frame', type: 'host-scroll', y: hy }, '*'); }
      }
    }
    function relayout(force) { measure(force); update(); }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', () => relayout(false));
    compactMq.addEventListener && compactMq.addEventListener('change', () => relayout(true));
    // de muurweergave en de lijstrand volgen de krimpende kaart
    if (window.ResizeObserver) {
      let roRaf = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(roRaf);
        roRaf = requestAnimationFrame(() => { if (stageEl.classList.contains('is-room') && window.N98LayoutRoom) window.N98LayoutRoom(); });
      }).observe(document.querySelector('.stage-frame'));
    }
    // Shopify vertelt hoe hoog zijn header is (die ligt over ons heen)
    window.addEventListener('message', e => {
      if (e.source !== window.parent || !e.data || e.data.source !== 'n98-shop' || e.data.type !== 'host') return;
      hostPad = Math.max(0, Math.round(+e.data.top || 0));
      lastHostY = -1;
      relayout(true);
    });
    if (inIframe) window.parent.postMessage({ source: 'n98-shop-frame', type: 'hello' }, '*');
    $('stageExpandBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.N98Compact = { ignore: () => {}, metrics: () => M };
    relayout(true);
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
    window.N98LayoutRoom = layoutRoom;

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
      syncBuyBtn();
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
    // Webshop: in stap I tot III leidt de knop onderin naar de volgende stap,
    // zodat niemand een half gepersonaliseerde kaart of het verkeerde formaat
    // in het mandje legt. Pas in stap IV wordt het 'Add to cart'.
    function onLastStep() { return step === STEP_NAMES.length - 1; }
    function syncBuyBtn() {
      if (STUDIO || adding) return;
      const last = onLastStep();
      let label = last ? 'Add to cart' : 'Next: ' + STEP_NAMES[step + 1];
      if (UX2 && STEP_NAMES[step] === 'Pins') {
        const pp = window.LocationApp && window.LocationApp.getPins ? window.LocationApp.getPins() : null;
        if (!pp || !pp.pins || !pp.pins.length) label = 'Skip, no pins';
      }
      buyLabel.textContent = label;
      buyBtn.classList.toggle('is-next', !last);
      nextBtn.hidden = true; // de knop onderin neemt het over
    }
    window.N98SyncBuyBtn = syncBuyBtn;
    syncBuyBtn();
    if (STUDIO) {
      buyLabel.textContent = 'Export print file';
      const note = document.querySelector('.buy-note');
      if (note) note.textContent = 'Studio · Print file at ' + PRINT_LABEL + ', edge to edge';
    }

    buyBtn.addEventListener('click', () => {
      if (STUDIO) { exportPrint(); return; }
      if (!onLastStep()) { goTo(step + 1, true); return; }
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

    function uxTwoLate() {
      // vormen als tegels met een icoontje
      const ICONS = {
        none: '<rect x="5" y="3" width="14" height="18" rx="0.5"/>',
        circle: '<circle cx="12" cy="12" r="8.5"/>',
        heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
        diamond: '<path d="M12 3l8.5 9-8.5 9-8.5-9z"/>',
        hexagon: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/>'
      };
      [...$('maskTabs').children].forEach(b => {
        const k = (b.dataset.maskId || b.textContent).toLowerCase();
        const key = Object.keys(ICONS).find(n => k.includes(n)) || 'none';
        if (b.querySelector('svg')) return;
        const label = b.textContent;
        b.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">' + ICONS[key] + '</svg><span></span>';
        b.querySelector('span').textContent = label;
      });

      // tekstgrootte: Small · Medium · Large, fijnafstelling eronder
      const sizeSlot = $('shopSlotTextSizes');
      const presets = document.createElement('div');
      presets.className = 'ux-presets';
      const ranges = ['placeFontSizeInput', 'countryFontSizeInput', 'coordsFontSizeInput'].map(id => $(id)).filter(Boolean);
      const base = ranges.map(r => parseFloat(r.value) || 1);
      [['Small', 0.85], ['Medium', 1], ['Large', 1.2]].forEach(([label, f]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.setAttribute('aria-pressed', f === 1 ? 'true' : 'false');
        b.addEventListener('click', () => {
          ranges.forEach((r, j) => {
            const v = Math.min(+r.max, Math.max(+r.min, base[j] * f));
            r.value = String(Math.round(v * 20) / 20);
            r.dispatchEvent(new Event('input', { bubbles: true }));
            r.dispatchEvent(new Event('change', { bubbles: true }));
          });
          [...presets.children].forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        });
        presets.appendChild(b);
      });
      const fine = document.createElement('details');
      fine.className = 'step-more ux-fine';
      fine.innerHTML = '<summary>Fine-tune each line</summary>';
      sizeSlot.before(presets);
      presets.after(fine);
      fine.appendChild(sizeSlot);
      ranges.forEach(r => r.addEventListener('input', e => { if (e.isTrusted) [...presets.children].forEach(x => x.setAttribute('aria-pressed', 'false')); }));

      // lijst gekozen: meteen aan de muur laten zien
      let wasNone = frameId === 'none';
      frameGrid.addEventListener('click', e => {
        if (!e.target.closest('.frame-card')) return;
        const none = frameId === 'none';
        if (wasNone && !none) setView('room');
        if (none && !wasNone) setView('studio');
        wasNone = none;
      });

      // pins: iconen eerst; een icoon kiezen = meteen een pin plaatsen
      const unitPins = $('unitPins'), iconRow = $('pinIconTabs'), addBtn = $('addPinBtn');
      if (unitPins && iconRow) unitPins.insertBefore(iconRow, unitPins.firstChild);
      if (iconRow && addBtn) iconRow.addEventListener('click', e => {
        if (!e.target.closest('button')) return;
        const pp = window.LocationApp && window.LocationApp.getPins ? window.LocationApp.getPins() : null;
        const hasSelected = pp && pp.selected != null && pp.selected >= 0;
        if (!addBtn.classList.contains('active') && !hasSelected) addBtn.click();
      });
      const hint = $('pinsHint');
      if (hint) { hint.textContent = 'Choose an icon, then tap the spot on the map. You can drag it afterwards.'; hint.dataset.text = hint.textContent; }

      // kaart vast in Pins, Size en Frame (pins blijven te verslepen)
      const hintEl2 = $('stageHint');
      const freeHint = hintEl2 ? hintEl2.textContent : '';
      const bbtn = $('uxBackBtn');
      if (bbtn) bbtn.addEventListener('click', () => goTo(step - 1, true));
      window.N98OnStep = st => {
        const locked = st >= 4;
        const bb = $('uxBackBtn'); if (bb) bb.hidden = st === 0;
        tabs.forEach((t, k) => t.classList.toggle('past', k < st));
        window.N98MapLocked = locked;
        document.documentElement.classList.toggle('map-locked', locked);
        document.documentElement.classList.toggle('map-scrolls', st >= 5);
        if (hintEl2 && !stageEl.classList.contains('is-room')) {
          hintEl2.textContent = st === 4 ? 'Map fixed · Tap the map to place a pin' : locked ? 'Map fixed · Go back to step 1 to move it' : freeHint;
        }
        if (window.N98SyncBuyBtn) window.N98SyncBuyBtn();
      };
      document.addEventListener('mapgen:pins', () => { if (window.N98SyncBuyBtn) window.N98SyncBuyBtn(); });
      window.N98OnStep(step);
    }
    if (UX2) uxTwoLate();
    // ---- Cadeaus (test): gelegenheden + tekstsuggesties ----
    // #occasion=wedding (vanaf de homepage) zet woorden, pin, palet en vorm
    // klaar; zodra de klant een plek kiest, komen de woorden en de pin erop.
    // De suggesties onder "Your map will say" alleen met gifts=1 of een
    // gelegenheid, zodat de live winkel ongewijzigd blijft tot we live gaan.
    (function gifts() {
      const OCCASIONS = {
        'wedding':     { line: 'Where we said yes', pin: 'rings', palette: 'rosewater-bloom', mask: 'none', label: 'A wedding gift', lede: 'Search the place where you said yes. We have set the words and a pin for you.' },
        'new-home':    { line: 'Our first home', pin: 'house', palette: 'parchment-sepia', mask: 'none', label: 'A new home', lede: 'Search the address of the new home. We have set the words and a pin for you.' },
        'anniversary': { line: 'Where it all began', pin: 'heartpin', palette: 'bordeaux-gold', mask: 'heart', label: 'An anniversary', lede: 'Search the place where your story began. We have set the words, a heart and a pin for you.' },
        'new-baby':    { line: 'Where you were born', pin: 'star', palette: 'glacier-mist', mask: 'none', label: 'A new baby', lede: 'Search the place where your little one was born. We have set the words and a pin for you.' },
        'valentine':   { line: 'Where we met', pin: 'heart', palette: 'cherry-blossom', mask: 'heart', label: "Valentine's Day", lede: 'Search the place where you met. We have set the words, a heart and a pin for you.' },
        'memorial':    { line: 'Forever in our hearts', pin: 'star', palette: 'mono', mask: 'circle', label: 'In memory', lede: 'Search a place that holds their memory. We have set the words and a pin for you.' }
      };
      const loc = window.location;
      const m = /(?:^|[#&?])occasion=([a-z-]+)/.exec(loc.hash + '&' + loc.search);
      const occ = m && OCCASIONS[m[1]];
      const giftsOn = !!occ || /(?:^|[#&?])gifts=1\b/.test(loc.hash + '&' + loc.search);
      const LA = window.LocationApp;
      const subInput = $('countryNameInput');
      const setLine = txt => {
        if (!subInput) return;
        subInput.value = txt;
        subInput.dispatchEvent(new Event('input', { bubbles: true }));
        subInput.dispatchEvent(new Event('change', { bubbles: true }));
      };

      if (occ && !STUDIO) {
        // palet en vorm meteen
        const card = document.querySelector('.map-palette-card[data-palette-id="' + occ.palette + '"]');
        if (card) card.click();
        if (LA && LA.selectMask) LA.selectMask(occ.mask);
        // stap I: zeggen waar je naar zoekt
        const p0 = document.querySelector('.step-panel[data-panel="0"]');
        if (p0) {
          const lede = p0.querySelector('.step-lede');
          if (lede) lede.textContent = occ.lede;
          const tag = document.createElement('p');
          tag.className = 'gift-tag';
          tag.textContent = occ.label;
          p0.querySelector('.step-title').before(tag);
        }
        let ownPin = false;
        document.addEventListener('mapgen:place', () => {
          setLine(occ.line);
          if (!LA || !LA.addPinAt) return;
          const pins = LA.getPins().pins;
          const replace = ownPin && pins.length === 1;
          if (replace) LA.removePin(0);
          if (!pins.length || replace) {
            const c = LA.getDesignState().center;
            LA.addPinAt(c.lat, c.lon, occ.pin);
            if (LA.selectPin) LA.selectPin(null);
            ownPin = true;
          }
        });
        document.addEventListener('mapgen:pins', () => { if (ownPin && LA.getPins().pins.length !== 1) ownPin = false; });
      }

      if (giftsOn) {
        // woorden kiezen met één tik, plus een datum
        const slot = $('shopSlotCaption');
        if (!slot) return;
        const box = document.createElement('div');
        box.className = 'gift-words';
        box.innerHTML = '<p class="gift-words-head">Need words? <span>Tap one, then change it if you like.</span></p><div class="gift-chips"></div>' +
          '<label class="gift-date"><span>Add a date</span><input type="date" aria-label="Add a date to the second line"></label>';
        const chips = box.querySelector('.gift-chips');
        ['Where we met', 'Where we said yes', 'Our first home', 'Where it all began', 'Where you were born', 'Home is wherever you are', 'Forever in our hearts']
          .forEach(t => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = t;
            b.addEventListener('click', () => {
              const date = (subInput.value.match(/ · \d{2}\.\d{2}\.\d{4}$/) || [''])[0];
              setLine(t + date);
            });
            chips.appendChild(b);
          });
        const dateIn = box.querySelector('input[type=date]');
        dateIn.addEventListener('change', () => {
          if (!dateIn.value) return;
          const [y, mo, d] = dateIn.value.split('-');
          const base = (subInput.value || '').replace(/ · \d{2}\.\d{2}\.\d{4}$/, '') || (subInput.placeholder && !/automatic/i.test(subInput.placeholder) ? subInput.placeholder : '');
          setLine((base ? base + ' · ' : '') + d + '.' + mo + '.' + y);
        });
        slot.appendChild(box);
        const showCountry = $('showCountryCheck');
        box.addEventListener('click', () => { if (showCountry && !showCountry.checked) { showCountry.checked = true; showCountry.dispatchEvent(new Event('change', { bubbles: true })); } });
      }
    })();


    // location.js start op een formaat dat niet (meer) in de lijst staat —
    // daarom altijd expliciet het standaardformaat kiezen.
    selectSize(PRICES[DEFAULT_SIZE] ? DEFAULT_SIZE : sizeOptions[0].value);
    selectFrame(frameId);
    updatePlacard();
    goTo(0, false);
    // voor js/studio.js (ontwerp uit een bestel-link laden)
    window.N98Shop = { selectSize, selectFrame, goTo, updatePlacard, updateSummary, toast, lastStep: () => STEP_NAMES.length - 1 };
  });
})();
