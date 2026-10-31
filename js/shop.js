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
  const CURRENCY = '€';
  const DEFAULT_SIZE = 'in20x28'; // 50×70 cm — het populairste wandformaat
  const STEP_NAMES = ['Place', 'Style', 'Text', 'Size'];

  // "Aan de muur": de lege middelste lijst in img/room-wall.jpg (760×1240).
  // Hoekpunten van de passe-partout-opening, in pixels van die foto:
  // linksboven, rechtsboven, rechtsonder, linksonder.
  const ROOM_W = 760, ROOM_H = 1240;
  const ROOM_QUAD = [[197, 208], [551, 171], [551, 785], [197, 790]];
  const POSTER_W = 354, POSTER_H = 600; // CSS-maat van .room-poster vóór vervorming

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

  // Projectieve transformatie (homografie) van een rechthoek naar vier
  // willekeurige hoekpunten, als CSS matrix3d — zo valt de poster precies in
  // het licht schuin hangende lijstje.
  function quadMatrix(w, h, quad) {
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
    const m = b.map((v, i) => v / A[i][i]);
    return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,1)`;
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
    const borderLabel = $('printBorderCheck') && $('printBorderCheck').closest('label');
    if (borderLabel) $('shopSlotBorder').appendChild(borderLabel);
    $('locationSearchInput').placeholder = 'A city, a street, an address…';
    $('pinAddressInput').placeholder = '…or type the address';

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
      btn.querySelector('.size-price').textContent = CURRENCY + PRICES[opt.value];
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
      $('buyAmount').textContent = CURRENCY + (PRICES[id] ?? '—');
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
        ['Price', CURRENCY + (PRICES[ratioSelect.value] ?? '—')],
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

    // ---- Studio / Aan de muur ----
    const stage = document.querySelector('.shop-stage');
    const stageFrame = document.querySelector('.stage-frame');
    const roomView = $('roomView');
    const roomBox = $('roomBox');
    const roomInner = $('roomInner');
    const roomPoster = $('roomPoster');
    const roomCtx = roomPoster.getContext('2d');
    const mapCanvas = $('locationCanvas');
    const stageHint = $('stageHint');
    const defaultHint = stageHint.textContent;
    let roomTimer = null;

    roomPoster.style.transform = quadMatrix(POSTER_W, POSTER_H, ROOM_QUAD);

    function layoutRoom() {
      if (roomView.hidden) return;
      const k = Math.min(stageFrame.clientWidth / ROOM_W, stageFrame.clientHeight / ROOM_H);
      roomInner.style.transform = `scale(${k})`;
      roomBox.style.width = Math.round(ROOM_W * k) + 'px';
      roomBox.style.height = Math.round(ROOM_H * k) + 'px';
    }
    function drawRoomPoster() {
      const W = roomPoster.width, H = roomPoster.height;
      const sw = mapCanvas.width, sh = mapCanvas.height;
      roomCtx.clearRect(0, 0, W, H);
      if (!sw || !sh) return;
      // gecentreerd in de passe-partout, met een gelijkmatige witrand
      const pad = W * 0.07;
      const s = Math.min((W - 2 * pad) / sw, (H - 2 * pad) / sh);
      const dw = sw * s, dh = sh * s;
      roomCtx.imageSmoothingQuality = 'high';
      roomCtx.drawImage(mapCanvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
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
      stageHint.textContent = room ? 'Switch to Studio to move the map' : defaultHint;
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
    if (inIframe) buyLabel.textContent = 'Confirm design';

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
    }
    buyBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) { toast('Your map is still being drawn — one moment.'); return; }
      confirmBtn.click(); // location.js: bouwt ontwerp-samenvatting + preview en stuurt die naar Shopify
      toast(inIframe
        ? 'Design confirmed — you can now add it to your cart.'
        : 'Your design is ready. Checkout opens here once the shop is live.');
    });

    // location.js start op een formaat dat niet (meer) in de lijst staat —
    // daarom altijd expliciet het standaardformaat kiezen.
    selectSize(PRICES[DEFAULT_SIZE] ? DEFAULT_SIZE : sizeOptions[0].value);
    updatePlacard();
    goTo(0, false);
  });
})();
