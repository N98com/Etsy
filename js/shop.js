// Klant-configurator (shop.html): de stap-voor-stap-indeling rond dezelfde
// kaartmotor als index.html. Dit bestand raakt geen kaart-state aan — het
// verplaatst alleen de bestaande bedieningselementen (die location.js bij ID
// kent) naar de vier stappen, en stuurt de bestaande <select>/knoppen aan.
// Alles wat de kaart doet blijft dus precies wat location.js al deed.
(() => {
  // ---- Prijzen per formaat (PLACEHOLDERS — zet hier je eigen prijzen) ----
  // Sleutels = de preset-id's uit GELATO_SIZES in location.js.
  const PRICES = {
    in8x10: 49, in11x14: 59, in12x16: 69, in16x20: 79,
    in18x24: 89, in20x28: 99, in24x36: 129, in28x40: 149,
  };
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
    const fromShop = {};
    list.split(',').forEach(pair => {
      const [id, cents] = pair.split(':');
      if (id && /^\d+$/.test(cents || '')) fromShop[id.trim()] = +cents / 100;
    });
    if (!Object.keys(fromShop).length) return;
    Object.keys(PRICES).forEach(k => delete PRICES[k]);
    Object.assign(PRICES, fromShop);
  })();
  function money(v) {
    if (v == null) return '—';
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
    function pinIconCanvas(icon) {
      const c = document.createElement('canvas');
      const dpr = Math.max(2, window.devicePixelRatio || 1), sz = 26;
      c.width = sz * dpr; c.height = sz * dpr;
      c.className = 'pin-item-icon';
      c.setAttribute('aria-hidden', 'true');
      const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
      MapRender.drawPinIcon(new CanvasPainter(ctx, sz, sz), sz / 2, sz - 2, (sz - 4) / 2.7, $('pinColorInput').value || '#D94848', '#ffffff', icon);
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
        const name = (labels[p.icon] || 'Pin') + (labels[p.icon] && !/pin$/i.test(labels[p.icon]) ? ' pin' : '');
        const li = document.createElement('li');
        li.className = 'pin-item' + (i === selected ? ' selected' : '');
        const main = document.createElement('button');
        main.type = 'button'; main.className = 'pin-item-main';
        main.setAttribute('aria-pressed', i === selected ? 'true' : 'false');
        const text = document.createElement('span'); text.className = 'pin-item-text';
        const t1 = document.createElement('span'); t1.className = 'pin-item-name'; t1.textContent = name;
        const t2 = document.createElement('span'); t2.className = 'pin-item-coords'; t2.textContent = fmtCoord(p.lat, p.lon);
        text.append(t1, t2);
        main.append(pinIconCanvas(p.icon), text);
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
      if (!last) nextBtn.textContent = 'Next — ' + STEP_NAMES[step + 1];
      if (last) updateSummary();
      if (focusPanel) {
        // Op telefoon staat het paneel onder de (sticky) kaart: scroll terug
        // naar het begin van de stappen, zodat je niet halverwege een lijst
        // begint.
        const panel = document.querySelector('.shop-panel');
        // desktop: het stappenpaneel scrolt zelf (zie css), dus dát terug naar boven
        if (window.innerWidth >= 900) { panel.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        const top = panel.getBoundingClientRect().top + window.scrollY - stageOffset();
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
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
      $('buyAmount').textContent = money(PRICES[id]);
      $('buySize').textContent = currentCm().toUpperCase();
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
        ['Price', money(PRICES[ratioSelect.value])],
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
    function updateBorderRing() {
      const r = liveCanvas.getBoundingClientRect();
      const n = Math.max(2, Math.round(Math.min(r.width, r.height) * PRINT_BORDER / (1 - 2 * PRINT_BORDER)));
      liveCanvas.style.setProperty('--print-border', n + 'px');
    }
    if (window.ResizeObserver) new ResizeObserver(updateBorderRing).observe(liveCanvas);
    window.addEventListener('resize', updateBorderRing);
    updateBorderRing();

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
      const f = FRAME_CM * PX_PER_CM;                        // lijstbreedte
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
      ctx.fillStyle = '#C9A87C';
      ctx.fillRect(x, y, ow, oh);
      ctx.restore();

      // houten lijst: licht eiken, met een zachte glans en afgeschuinde binnenrand
      const wood = ctx.createLinearGradient(x, y, x + ow, y + oh);
      wood.addColorStop(0, '#E2C79F'); wood.addColorStop(0.5, '#C9A87C'); wood.addColorStop(1, '#A9895F');
      ctx.fillStyle = wood;
      ctx.fillRect(x, y, ow, oh);
      ctx.strokeStyle = 'rgba(60, 40, 20, 0.35)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, ow - 1.5, oh - 1.5);

      // de print, met dezelfde witte rand als het printbestand
      const ix = x + f, iy = y + f;
      const wb = Math.min(pw, ph) * 0.03;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ix, iy, pw, ph);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mapCanvas, ix + wb, iy + wb, pw - 2 * wb, ph - 2 * wb);

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
      if (e.data.type === 'added') { buyLabel.textContent = 'Added — opening cart'; toast('Added to your cart.'); }
      if (e.data.type === 'error') { buyLabel.textContent = 'Add to cart'; toast(e.data.message || 'Something went wrong — please try again.'); }
    });

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
    }
    buyBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) { toast('Your map is still being drawn — one moment.'); return; }
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
    updatePlacard();
    goTo(0, false);
  });
})();
