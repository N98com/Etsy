// De werkbank: contactvel genereren, favorieten markeren, personaliseren
// op seed, en op printresolutie exporteren (SVG waar het kan, PNG anders).
(() => {
  const FAV_KEY = 'genart-favorites-v1';
  const SETTINGS_KEY = 'genart-settings-v1';
  const HISTORY_KEY = 'genart-export-history-v1';
  const THUMB_PX = 260;   // canvas-resolutie per tegel in het contactvel
  const MODAL_PX = 760;   // canvas-resolutie in het grote voorbeeld
  const THUMB_ATTRACTOR_ITER = 90000;

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
  }
  const SAVED = loadSettings();

  // Permanente log van elk daadwerkelijk geëxporteerd ontwerp — los van (en
  // ongelimiteerd, anders dan) de snelkoppelingenlijst met eigen kleuren.
  // Elke regel bewaart een eigen kopie van het palet, zodat de geschiedenis
  // correct blijft ook als de originele preset intussen is opgeschoond.
  function loadExportHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }
  function saveExportHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.exportHistory));
  }
  function recordExport(algoId, seed, paletteId, format, sizeId) {
    const paletteSnapshot = JSON.parse(JSON.stringify(getPalette(paletteId)));
    state.exportHistory.unshift({ algoId, seed, palette: paletteSnapshot, format, sizeId, timestamp: Date.now() });
    saveExportHistory();
    if (!historyModalBackdrop.classList.contains('hidden')) renderHistoryList();
  }

  const state = {
    algoId: 'attractor',
    paletteId: SAVED.paletteId || PALETTES[0].id,
    batchSize: Math.max(4, Math.min(12, SAVED.batchSize || 12)),
    baseSeed: RNG.randomSeed(),
    seeds: [],
    favorites: loadFavorites(),
    triptych: [null, null, null],
    modal: null, // { algoId, seed, paletteId }
    exportHistory: loadExportHistory(),
    customInks: (Array.isArray(SAVED.customInks) && SAVED.customInks.length)
      ? SAVED.customInks.slice(0, 6)
      : ['#7f5539', '#9c6644', '#3d2b1f'],
  };

  // ---- DOM refs ----
  const el = id => document.getElementById(id);
  const algoTabs = el('algoTabs');
  const paletteSelect = el('paletteSelect');
  const batchSizeInput = el('batchSizeInput');
  const regenerateBtn = el('regenerateBtn');
  const seedBaseInput = el('seedBaseInput');
  const contactSheet = el('contactSheet');
  const statusLine = el('statusLine');
  const favList = el('favList');
  const triptychSlotsEl = [0, 1, 2].map(i => el(`triptychSlot${i}`));
  const triptychExportSize = el('triptychExportSize');
  const triptychExportBtn = el('triptychExportBtn');
  const personDate = el('personDate');
  const personName = el('personName');
  const personCoords = el('personCoords');
  const personGenerateBtn = el('personGenerateBtn');
  const personSeedDisplay = el('personSeedDisplay');
  const personOpenBtn = el('personOpenBtn');
  const customPaletteToggle = el('customPaletteToggle');
  const customPalettePanel = el('customPalettePanel');
  const customSwatchRow = el('customSwatchRow');
  const customBg = el('customBg');
  const customInkAddBtn = el('customInkAddBtn');
  const customPaletteName = el('customPaletteName');
  const customPaletteApplyBtn = el('customPaletteApplyBtn');
  const customPaletteRandomBtn = el('customPaletteRandomBtn');
  const customPalettePresetList = el('customPalettePresetList');

  const modalBackdrop = el('modalBackdrop');
  const modalCanvasWrap = el('modalCanvasWrap');
  const modalTitle = el('modalTitle');
  const modalSeedInput = el('modalSeedInput');
  const modalPaletteLabel = el('modalPaletteLabel');
  const modalKeywords = el('modalKeywords');
  const modalExportSize = el('modalExportSize');
  const modalExportSVGBtn = el('modalExportSVGBtn');
  const modalExportPNGBtn = el('modalExportPNGBtn');
  const modalStarBtn = el('modalStarBtn');
  const modalTriptychBtn = el('modalTriptychBtn');
  const modalStatus = el('modalStatus');
  const modalCloseBtn = el('modalCloseBtn');

  const settingsBtn = el('settingsBtn');
  const settingsMenu = el('settingsMenu');
  const historyMenuBtn = el('historyMenuBtn');
  const historyModalBackdrop = el('historyModalBackdrop');
  const historyCloseBtn = el('historyCloseBtn');
  const historyList = el('historyList');
  const historyTabPlayground = el('historyTabPlayground');
  const historyTabLocation = el('historyTabLocation');
  const historyPanelPlayground = el('historyPanelPlayground');
  const historyPanelLocation = el('historyPanelLocation');
  const locationHistoryList = el('locationHistoryList');

  // ---- init ----
  function init() {
    ALGORITHM_LIST.forEach(algo => {
      const btn = document.createElement('button');
      btn.textContent = algo.label;
      btn.dataset.algoId = algo.id;
      btn.className = algo.id === state.algoId ? 'active' : '';
      btn.addEventListener('click', () => selectAlgo(algo.id));
      algoTabs.appendChild(btn);
    });

    PALETTES.forEach(p => addPaletteOption(p));
    Object.values(CUSTOM_PALETTES).forEach(p => addPaletteOption(p));
    if (!paletteSelect.querySelector(`option[value="${state.paletteId}"]`)) {
      state.paletteId = PALETTES[0].id;
    }
    paletteSelect.value = state.paletteId;
    paletteSelect.addEventListener('change', () => {
      state.paletteId = paletteSelect.value;
      renderContactSheet();
      saveSettings();
    });

    // Onthouden invoer terugzetten: laatst ingevulde eigen kleuren (ook als
    // die nooit op "Toepassen" zijn bevestigd).
    if (SAVED.customBg) customBg.value = SAVED.customBg;
    if (SAVED.customName) customPaletteName.value = SAVED.customName;
    renderCustomInkSwatches();

    customPaletteToggle.addEventListener('click', () => {
      customPalettePanel.hidden = !customPalettePanel.hidden;
      customPaletteToggle.textContent = customPalettePanel.hidden ? '+ Eigen kleuren samenstellen' : '− Eigen kleuren verbergen';
    });
    customPaletteApplyBtn.addEventListener('click', applyCustomPalette);
    customPaletteRandomBtn.addEventListener('click', () => {
      setColorInput(customBg, randomHexColor());
      state.customInks = state.customInks.map(() => randomHexColor());
      renderCustomInkSwatches();
      applyCustomPalette();
    });
    customInkAddBtn.addEventListener('click', () => {
      if (state.customInks.length >= 6) return;
      state.customInks.push(randomHexColor());
      renderCustomInkSwatches();
      saveSettings();
    });
    [customBg, customPaletteName].forEach(field => {
      field.addEventListener('input', saveSettings);
    });

    EXPORT_SIZES.forEach(s => {
      [modalExportSize, triptychExportSize].forEach(sel => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.label;
        sel.appendChild(opt);
      });
    });
    modalExportSize.value = 'a3-300';
    triptychExportSize.value = 'a3-300';

    batchSizeInput.value = state.batchSize;
    // 'input' vuurt op elke toetsaanslag, dus ook als de pagina ververst
    // wordt vóórdat het veld de focus verliest (waar 'change' pas op wacht).
    batchSizeInput.addEventListener('input', () => {
      const parsed = parseInt(batchSizeInput.value, 10);
      if (!isNaN(parsed)) {
        state.batchSize = Math.max(4, Math.min(12, parsed));
        saveSettings();
      }
    });
    batchSizeInput.addEventListener('change', () => {
      state.batchSize = Math.max(4, Math.min(12, parseInt(batchSizeInput.value, 10) || 12));
      batchSizeInput.value = state.batchSize;
      generateBatch();
      saveSettings();
    });

    regenerateBtn.addEventListener('click', () => generateBatch());

    personGenerateBtn.addEventListener('click', () => {
      const combined = `${personDate.value}|${personName.value.trim().toLowerCase()}|${personCoords.value.trim()}`;
      if (combined.replace(/\|/g, '').length === 0) {
        personSeedDisplay.textContent = 'Vul minstens één veld in.';
        return;
      }
      const seed = RNG.seedFromString(combined);
      personSeedDisplay.textContent = `Seed: ${seed}`;
      personOpenBtn.disabled = false;
      personOpenBtn.dataset.seed = seed;
    });
    personOpenBtn.addEventListener('click', () => {
      const seed = parseInt(personOpenBtn.dataset.seed, 10);
      openModal(state.algoId, seed, state.paletteId);
    });

    modalCloseBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
    modalSeedInput.addEventListener('change', () => {
      const seed = parseInt(modalSeedInput.value, 10);
      if (!isNaN(seed)) openModal(state.algoId, seed >>> 0, state.paletteId);
    });
    modalStarBtn.addEventListener('click', () => {
      toggleFavorite(state.modal.algoId, state.modal.seed, state.modal.paletteId);
      renderModalStar();
      renderFavorites();
      renderContactSheet();
    });
    modalTriptychBtn.addEventListener('click', () => {
      addToTriptych(state.modal.algoId, state.modal.seed, state.modal.paletteId);
    });
    modalExportSVGBtn.addEventListener('click', () => exportModal(true));
    modalExportPNGBtn.addEventListener('click', () => exportModal(false));
    triptychExportBtn.addEventListener('click', exportTriptych);

    settingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      settingsMenu.hidden = !settingsMenu.hidden;
    });
    document.addEventListener('click', () => { settingsMenu.hidden = true; });
    historyMenuBtn.addEventListener('click', () => {
      settingsMenu.hidden = true;
      selectHistoryTab('playground');
      historyModalBackdrop.classList.remove('hidden');
    });
    historyCloseBtn.addEventListener('click', () => historyModalBackdrop.classList.add('hidden'));
    historyModalBackdrop.addEventListener('click', e => { if (e.target === historyModalBackdrop) historyModalBackdrop.classList.add('hidden'); });
    historyTabPlayground.addEventListener('click', () => selectHistoryTab('playground'));
    historyTabLocation.addEventListener('click', () => selectHistoryTab('location'));

    generateBatch();
    renderFavorites();
    renderTriptych();
    renderCustomPalettePresetList();
  }

  function paletteOptionLabel(palette) {
    return palette.custom ? `🎨 ${palette.name}` : palette.name;
  }

  function addPaletteOption(palette) {
    const opt = document.createElement('option');
    opt.value = palette.id;
    opt.textContent = paletteOptionLabel(palette);
    paletteSelect.appendChild(opt);
  }

  function upsertPaletteOption(palette) {
    const existing = paletteSelect.querySelector(`option[value="${palette.id}"]`);
    if (existing) existing.textContent = paletteOptionLabel(palette);
    else addPaletteOption(palette);
  }

  function randomHexColor() {
    return '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  }

  // Zet .value van een <input type="color"> en stuurt een 'input'-event mee.
  // Sommige browsers verversen het zichtbare kleurvakje pas op dat event
  // i.p.v. meteen bij het programmatisch zetten van .value.
  function setColorInput(inputEl, hex) {
    inputEl.value = hex;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      batchSize: state.batchSize,
      paletteId: state.paletteId,
      customBg: customBg.value,
      customInks: state.customInks,
      customName: customPaletteName.value,
    }));
  }

  // Bouwt de rij kleurvakjes voor de "eigen kleuren"-inkten opnieuw op vanuit
  // state.customInks — enige bron van waarheid, dus geen losse DOM-state om
  // uit sync te raken. Achtergrond-vakje staat er los van en blijft staan.
  function renderCustomInkSwatches() {
    customSwatchRow.querySelectorAll('.swatch-cell.ink').forEach(elm => elm.remove());
    state.customInks.forEach((hex, i) => {
      const cell = document.createElement('div');
      cell.className = 'swatch-cell ink';

      const head = document.createElement('div');
      head.className = 'swatch-cell-head';
      const label = document.createElement('span');
      label.textContent = `Kleur ${i + 1}`;
      head.appendChild(label);
      if (state.customInks.length > 1) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'swatch-remove';
        rm.textContent = '✕';
        rm.title = 'Kleur verwijderen';
        rm.addEventListener('click', () => {
          state.customInks.splice(i, 1);
          renderCustomInkSwatches();
          saveSettings();
        });
        head.appendChild(rm);
      }
      cell.appendChild(head);

      const input = document.createElement('input');
      input.type = 'color';
      input.value = hex;
      input.setAttribute('aria-label', `Kleur ${i + 1}`);
      input.addEventListener('input', () => {
        state.customInks[i] = input.value;
        saveSettings();
      });
      cell.appendChild(input);

      customSwatchRow.appendChild(cell);
    });
    customInkAddBtn.disabled = state.customInks.length >= 6;
  }

  function applyCustomPalette() {
    const bg = customBg.value;
    const inks = state.customInks.slice();
    const id = registerCustomPalette(bg, inks, customPaletteName.value);
    upsertPaletteOption(getPalette(id));
    paletteSelect.value = id;
    state.paletteId = id;
    renderContactSheet();
    renderCustomPalettePresetList();
    saveSettings();
  }

  function renderCustomPalettePresetList() {
    customPalettePresetList.innerHTML = '';
    const presets = Object.values(CUSTOM_PALETTES).reverse(); // meest recent eerst
    if (presets.length === 0) return;
    presets.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preset-item';

      const swatches = document.createElement('div');
      swatches.className = 'preset-swatches';
      [p.bg, ...p.inks].forEach(c => {
        const sw = document.createElement('span');
        sw.style.background = c;
        swatches.appendChild(sw);
      });
      item.appendChild(swatches);

      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = p.name;
      name.title = p.name;
      item.appendChild(name);

      const useBtn = document.createElement('button');
      useBtn.textContent = 'gebruik';
      useBtn.addEventListener('click', () => {
        setColorInput(customBg, p.bg);
        state.customInks = p.inks.length ? p.inks.slice(0, 6) : [p.bg];
        renderCustomInkSwatches();
        customPaletteName.value = p.name;
        upsertPaletteOption(p);
        paletteSelect.value = p.id;
        state.paletteId = p.id;
        renderContactSheet();
        saveSettings();
      });
      item.appendChild(useBtn);

      const rmBtn = document.createElement('button');
      rmBtn.innerHTML = '&#10005;';
      rmBtn.title = 'Preset verwijderen';
      rmBtn.addEventListener('click', () => {
        deleteCustomPalette(p.id);
        const opt = paletteSelect.querySelector(`option[value="${p.id}"]`);
        if (opt) opt.remove();
        if (state.paletteId === p.id) {
          state.paletteId = PALETTES[0].id;
          paletteSelect.value = state.paletteId;
          renderContactSheet();
          saveSettings();
        }
        renderCustomPalettePresetList();
      });
      item.appendChild(rmBtn);

      customPalettePresetList.appendChild(item);
    });
  }

  function selectAlgo(id) {
    state.algoId = id;
    [...algoTabs.children].forEach(b => b.classList.toggle('active', b.dataset.algoId === id));
    generateBatch();
  }

  function generateBatch() {
    state.baseSeed = RNG.randomSeed();
    state.seeds = Array.from({ length: state.batchSize }, (_, i) => (state.baseSeed + i * 104729) >>> 0);
    seedBaseInput.value = state.baseSeed;
    renderContactSheet();
  }

  // ---- contactvel ----
  function renderContactSheet() {
    contactSheet.innerHTML = '';
    const algo = Algorithms[state.algoId];
    const tiles = state.seeds.map(seed => {
      const tile = document.createElement('div');
      tile.className = 'tile loading';
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_PX; canvas.height = THUMB_PX;
      tile.appendChild(canvas);

      const star = document.createElement('button');
      star.className = 'star';
      star.textContent = isFavorite(state.algoId, seed, state.paletteId) ? '★' : '☆';
      star.classList.toggle('active', isFavorite(state.algoId, seed, state.paletteId));
      star.title = 'Markeer als favoriet';
      star.addEventListener('click', ev => {
        ev.stopPropagation();
        toggleFavorite(state.algoId, seed, state.paletteId);
        star.textContent = isFavorite(state.algoId, seed, state.paletteId) ? '★' : '☆';
        star.classList.toggle('active');
        renderFavorites();
      });
      tile.appendChild(star);

      const label = document.createElement('div');
      label.className = 'label';
      label.innerHTML = `<span>#${seed}</span>`;
      tile.appendChild(label);

      tile.addEventListener('click', () => openModal(state.algoId, seed, state.paletteId));
      contactSheet.appendChild(tile);
      return { tile, canvas, seed };
    });

    statusLine.textContent = `Bezig met renderen van ${tiles.length} varianten…`;
    Utils.runChunked(tiles.length, 2, i => {
      const { tile, canvas, seed } = tiles[i];
      drawThumb(algo, canvas, seed, state.paletteId);
      tile.classList.remove('loading');
    }, () => {
      statusLine.textContent = `${tiles.length} varianten — ${algo.label.toLowerCase()}, ${getPalette(state.paletteId).name}. Klik op een tegel voor groot voorbeeld en export.`;
    });
  }

  function drawThumb(algo, canvas, seed, paletteId) {
    const ctx = canvas.getContext('2d');
    const params = algo.generateParams(seed, paletteId);
    if (algo.vector) {
      algo.render(new CanvasPainter(ctx, canvas.width, canvas.height), params, canvas.width, canvas.height);
    } else {
      algo.renderToCanvas(ctx, params, canvas.width, canvas.height, { iterations: THUMB_ATTRACTOR_ITER });
    }
  }

  // ---- modal ----
  function openModal(algoId, seed, paletteId) {
    state.modal = { algoId, seed, paletteId };
    const algo = Algorithms[algoId];
    modalTitle.textContent = algo.label;
    modalSeedInput.value = seed;
    modalPaletteLabel.textContent = getPalette(paletteId).name;
    modalKeywords.textContent = getPalette(paletteId).keywords;
    modalStatus.textContent = '';

    modalCanvasWrap.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = MODAL_PX; canvas.height = MODAL_PX;
    modalCanvasWrap.appendChild(canvas);
    drawThumb(algo, canvas, seed, paletteId);

    modalExportSVGBtn.style.display = algo.vector ? 'inline-block' : 'none';
    renderModalStar();
    modalBackdrop.classList.remove('hidden');
  }

  function closeModal() {
    modalBackdrop.classList.add('hidden');
    state.modal = null;
  }

  function renderModalStar() {
    const fav = isFavorite(state.modal.algoId, state.modal.seed, state.modal.paletteId);
    modalStarBtn.textContent = fav ? '★ Favoriet' : '☆ Markeer als favoriet';
    modalStarBtn.classList.toggle('primary', fav);
  }

  function exportModal(wantSVG) {
    const { algoId, seed, paletteId } = state.modal;
    const algo = Algorithms[algoId];
    const params = algo.generateParams(seed, paletteId);
    const { w, h } = resolveExportSize(modalExportSize.value, 1);
    modalStatus.textContent = `Bezig met renderen op ${w}×${h}px… dit kan even duren bij grote formaten.`;
    modalExportSVGBtn.disabled = true; modalExportPNGBtn.disabled = true;
    renderForExport(algo, params, w, h, wantSVG, result => {
      const ext = result.svg ? 'svg' : 'png';
      const filename = filenameFor(algoId, seed, paletteId, modalExportSize.value, ext);
      if (result.svg) Utils.downloadSVGString(result.svg, filename);
      else Utils.downloadCanvasPNG(result.canvas, filename);
      modalStatus.textContent = `Opgeslagen als ${filename}`;
      modalExportSVGBtn.disabled = false; modalExportPNGBtn.disabled = false;
      recordExport(algoId, seed, paletteId, ext, modalExportSize.value);
    });
  }

  // ---- favorieten ----
  function favKey(algoId, seed, paletteId) { return `${algoId}|${seed}|${paletteId}`; }
  function loadFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
  }
  function saveFavorites() { localStorage.setItem(FAV_KEY, JSON.stringify(state.favorites)); }
  function isFavorite(algoId, seed, paletteId) {
    return state.favorites.some(f => favKey(f.algoId, f.seed, f.paletteId) === favKey(algoId, seed, paletteId));
  }
  function toggleFavorite(algoId, seed, paletteId) {
    const key = favKey(algoId, seed, paletteId);
    const idx = state.favorites.findIndex(f => favKey(f.algoId, f.seed, f.paletteId) === key);
    if (idx >= 0) state.favorites.splice(idx, 1);
    else state.favorites.unshift({ algoId, seed, paletteId, addedAt: Date.now() });
    saveFavorites();
  }

  function renderFavorites() {
    favList.innerHTML = '';
    if (state.favorites.length === 0) {
      favList.innerHTML = '<div class="hint">Nog geen favorieten. Klik op de ster bij een tegel.</div>';
      return;
    }
    state.favorites.forEach(f => {
      const item = document.createElement('div');
      item.className = 'fav-item';

      const mini = document.createElement('canvas');
      mini.width = 68; mini.height = 68;
      drawThumb(Algorithms[f.algoId], mini, f.seed, f.paletteId);
      const img = document.createElement('img');
      img.src = mini.toDataURL();
      item.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `${Algorithms[f.algoId].label} · #${f.seed} · ${getPalette(f.paletteId).name}`;
      meta.title = meta.textContent;
      item.appendChild(meta);

      const openBtn = document.createElement('button');
      openBtn.textContent = 'open';
      openBtn.addEventListener('click', () => openModal(f.algoId, f.seed, f.paletteId));
      item.appendChild(openBtn);

      const tBtn = document.createElement('button');
      tBtn.textContent = '→T';
      tBtn.title = 'Voeg toe aan triptiek';
      tBtn.addEventListener('click', () => addToTriptych(f.algoId, f.seed, f.paletteId));
      item.appendChild(tBtn);

      const rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.title = 'Verwijder favoriet';
      rmBtn.addEventListener('click', () => {
        toggleFavorite(f.algoId, f.seed, f.paletteId);
        renderFavorites();
        renderContactSheet();
      });
      item.appendChild(rmBtn);

      favList.appendChild(item);
    });
  }

  // ---- triptiek ----
  function addToTriptych(algoId, seed, paletteId) {
    let slot = state.triptych.findIndex(s => s === null);
    if (slot === -1) slot = 0; // schuif door als alle drie vol zijn
    state.triptych[slot] = { algoId, seed, paletteId };
    renderTriptych();
  }

  function renderTriptych() {
    state.triptych.forEach((entry, i) => {
      const slotEl = triptychSlotsEl[i];
      slotEl.innerHTML = '';
      if (!entry) {
        slotEl.textContent = `Slot ${i + 1} — leeg`;
        slotEl.onclick = null;
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      drawThumb(Algorithms[entry.algoId], canvas, entry.seed, entry.paletteId);
      slotEl.appendChild(canvas);
      slotEl.onclick = () => { state.triptych[i] = null; renderTriptych(); };
      slotEl.title = 'Klik om leeg te maken';
    });
    triptychExportBtn.disabled = state.triptych.every(s => s === null);
  }

  function exportTriptych() {
    const filled = state.triptych.filter(Boolean);
    if (filled.length === 0) return;
    const sizeId = triptychExportSize.value;
    const { w, h } = resolveExportSize(sizeId, 1);
    triptychExportBtn.disabled = true;
    triptychExportBtn.textContent = 'Bezig met exporteren…';
    let done = 0;
    filled.forEach((entry, i) => {
      const algo = Algorithms[entry.algoId];
      const params = algo.generateParams(entry.seed, entry.paletteId);
      setTimeout(() => {
        renderForExport(algo, params, w, h, algo.vector, result => {
          const ext = result.svg ? 'svg' : 'png';
          const filename = `triptiek-${i + 1}-${filenameFor(entry.algoId, entry.seed, entry.paletteId, sizeId, ext)}`;
          if (result.svg) Utils.downloadSVGString(result.svg, filename);
          else Utils.downloadCanvasPNG(result.canvas, filename);
          recordExport(entry.algoId, entry.seed, entry.paletteId, ext, sizeId);
          done++;
          if (done === filled.length) {
            triptychExportBtn.disabled = false;
            triptychExportBtn.textContent = 'Exporteer triptiek (3 bestanden)';
          }
        });
      }, i * 300);
    });
  }

  // ---- geschiedenis ----
  const EXPORT_FORMAT_LABEL = { svg: 'SVG', png: 'PNG' };

  // Als een geschiedenisregel verwijst naar een eigen kleurpreset die
  // intussen door de cap van 10 is opgeschoond, zet 'm terug (onder
  // hetzelfde, uit de kleuren zelf afgeleide id) zodat de tegel weer
  // met de juiste kleuren opent.
  function ensurePaletteAvailable(snapshot) {
    if (!snapshot.custom) return snapshot.id;
    if (!CUSTOM_PALETTES[snapshot.id]) registerCustomPalette(snapshot.bg, snapshot.inks, snapshot.name);
    return snapshot.id;
  }

  function renderHistoryList() {
    historyList.innerHTML = '';
    if (state.exportHistory.length === 0) {
      historyList.innerHTML = '<p class="history-empty">Nog niets geëxporteerd. Zodra je een ontwerp downloadt (SVG of PNG), verschijnt het hier.</p>';
      return;
    }
    state.exportHistory.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const mini = document.createElement('canvas');
      mini.width = 72; mini.height = 72;
      const algo = Algorithms[entry.algoId];
      if (algo) {
        const paletteId = ensurePaletteAvailable(entry.palette);
        drawThumb(algo, mini, entry.seed, paletteId);
      }
      const img = document.createElement('img');
      img.src = mini.toDataURL();
      item.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const line1 = document.createElement('div');
      line1.className = 'line1';
      line1.textContent = `${algo ? algo.label : entry.algoId} · #${entry.seed} · ${entry.palette.name}`;
      const line2 = document.createElement('div');
      line2.className = 'line2';
      const date = new Date(entry.timestamp);
      line2.textContent = `${EXPORT_FORMAT_LABEL[entry.format] || entry.format} · ${entry.sizeId} · ${date.toLocaleDateString('nl-NL')} ${date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
      meta.appendChild(line1);
      meta.appendChild(line2);
      item.appendChild(meta);

      const openBtn = document.createElement('button');
      openBtn.textContent = 'open';
      openBtn.disabled = !algo;
      openBtn.addEventListener('click', () => {
        const paletteId = ensurePaletteAvailable(entry.palette);
        historyModalBackdrop.classList.add('hidden');
        if (entry.algoId !== state.algoId) selectAlgo(entry.algoId);
        openModal(entry.algoId, entry.seed, paletteId);
      });
      item.appendChild(openBtn);

      historyList.appendChild(item);
    });
  }

  function selectHistoryTab(name) {
    historyTabPlayground.classList.toggle('active', name === 'playground');
    historyTabLocation.classList.toggle('active', name === 'location');
    historyPanelPlayground.hidden = name !== 'playground';
    historyPanelLocation.hidden = name !== 'location';
    if (name === 'playground') renderHistoryList();
    else renderLocationHistoryList();
  }

  // De Locatie-tab (js/location.js) houdt zijn eigen geschiedenis bij — een
  // kaart is geen seed+palet maar echte, potentieel zware geo-data, dus
  // daar wordt alleen een miniatuur + metadata van bewaard, geen volledige
  // straten/water-geometrie.
  function renderLocationHistoryList() {
    locationHistoryList.innerHTML = '';
    const entries = window.LocationApp ? window.LocationApp.getHistory() : [];
    if (entries.length === 0) {
      locationHistoryList.innerHTML = '<p class="history-empty">Nog niets geëxporteerd vanuit Locatie. Zodra je een kaart downloadt, verschijnt hij hier.</p>';
      return;
    }
    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const img = document.createElement('img');
      img.src = entry.thumbnail;
      item.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const line1 = document.createElement('div');
      line1.className = 'line1';
      line1.textContent = `${entry.place || 'Onbekende plaats'}${entry.country ? ', ' + entry.country : ''} · ${entry.paletteName}`;
      const line2 = document.createElement('div');
      line2.className = 'line2';
      const date = new Date(entry.timestamp);
      line2.textContent = `${EXPORT_FORMAT_LABEL[entry.format] || entry.format} · ${entry.sizeLabel} · ${date.toLocaleDateString('nl-NL')} ${date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
      meta.appendChild(line1);
      meta.appendChild(line2);
      item.appendChild(meta);

      locationHistoryList.appendChild(item);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
