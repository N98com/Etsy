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

    // ---- Stappen ----
    const tabs = [...document.querySelectorAll('.step-tab')];
    const panels = [...document.querySelectorAll('.step-panel')];
    const backBtn = $('stepBackBtn');
    const nextBtn = $('stepNextBtn');
    let step = 0;

    function goTo(i, focusPanel) {
      step = Math.max(0, Math.min(STEP_NAMES.length - 1, i));
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
        const top = panel.getBoundingClientRect().top + window.scrollY - stageOffset();
        if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
      }
    }
    function stageOffset() {
      const stage = document.querySelector('.shop-stage');
      return getComputedStyle(stage).position === 'sticky' && window.innerWidth < 900 ? stage.offsetHeight : 0;
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
        '<span class="size-text"><span class="size-cm"></span><span class="size-in"></span></span>' +
        '<span class="size-price"></span>';
      btn.querySelector('.size-cm').textContent = cm;
      btn.querySelector('.size-in').textContent = inch;
      btn.querySelector('.size-price').textContent = CURRENCY + PRICES[opt.value];
      // klein silhouet op schaal, zodat je de verhoudingen ziet
      const m = cm.match(/(\d+)×(\d+)/);
      if (m) {
        const shape = btn.querySelector('.size-shape');
        shape.style.width = Math.round(+m[1] * 0.42) + 'px';
        shape.style.height = Math.round(+m[2] * 0.42) + 'px';
      }
      btn.addEventListener('click', () => selectSize(opt.value));
      sizeGrid.appendChild(btn);
    });

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
      const opt = sizeOptions.find(o => o.value === id);
      const cm = opt ? sizeLabels(opt).cm : '';
      $('buyAmount').textContent = CURRENCY + (PRICES[id] ?? '—');
      $('buySize').textContent = cm;
      $('stageSize').textContent = cm;
      updateSummary();
    }
    // location.js start op een formaat dat niet (meer) in de lijst staat —
    // daarom altijd expliciet het standaardformaat kiezen.
    selectSize(PRICES[DEFAULT_SIZE] ? DEFAULT_SIZE : sizeOptions[0].value);

    function activePaletteName() {
      const card = document.querySelector('.map-palette-card.active .map-palette-name');
      return card ? card.textContent : '';
    }
    function updateSummary() {
      const place = $('placeNameInput').value.trim() || $('locationSearchInput').value.trim();
      const opt = sizeOptions.find(o => o.value === ratioSelect.value);
      const parts = [place, activePaletteName(), opt ? sizeLabels(opt).cm : ''].filter(Boolean);
      $('shopSummary').textContent = parts.length ? 'Your map: ' + parts.join(' · ') : '';
    }
    document.addEventListener('click', e => {
      if (e.target.closest('.map-palette-card')) updateSummary();
    });

    // ---- Laadstatus: vriendelijke tekst i.p.v. technische meldingen ----
    const statusEl = $('locationStatus');
    const stageFrame = document.querySelector('.stage-frame');
    const loader = document.createElement('div');
    loader.className = 'stage-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<span class="stage-loader-dot"></span><span class="stage-loader-text">Drawing your map…</span>';
    stageFrame.appendChild(loader);
    const friendly = document.createElement('p');
    friendly.className = 'stage-error';
    friendly.setAttribute('role', 'status');
    statusEl.after(friendly);

    function syncStatus() {
      const t = statusEl.textContent || '';
      const loading = /fetching/i.test(t);
      const failed = /fail/i.test(t);
      loader.classList.toggle('show', loading);
      friendly.textContent = failed ? "We couldn't load this area. Try zooming in a little, or search again." : '';
    }
    new MutationObserver(syncStatus).observe(statusEl, { childList: true, characterData: true, subtree: true });
    syncStatus();

    // ---- Kopen ----
    const buyBtn = $('buyBtn');
    const confirmBtn = $('embedConfirmBtn');
    const toastEl = $('shopToast');
    let toastTimer = null;
    if (inIframe) buyBtn.textContent = 'Confirm design';

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4200);
    }
    buyBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) { toast('Your map is still loading — one moment.'); return; }
      confirmBtn.click(); // location.js: bouwt ontwerp-samenvatting + preview en stuurt die naar Shopify
      toast(inIframe
        ? 'Design confirmed — you can now add it to your cart.'
        : 'Your design is ready. Checkout opens here once the shop is live.');
    });

    goTo(0, false);
  });
})();
