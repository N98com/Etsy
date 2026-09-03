// De werkbank: contactvel genereren, favorieten markeren, personaliseren
// op seed, en op printresolutie exporteren (SVG waar het kan, PNG anders).
(() => {
  const FAV_KEY = 'genart-favorites-v1';
  const THUMB_PX = 260;   // canvas-resolutie per tegel in het contactvel
  const MODAL_PX = 760;   // canvas-resolutie in het grote voorbeeld
  const THUMB_ATTRACTOR_ITER = 90000;

  const state = {
    algoId: 'attractor',
    paletteId: PALETTES[0].id,
    batchSize: 24,
    baseSeed: RNG.randomSeed(),
    seeds: [],
    favorites: loadFavorites(),
    triptych: [null, null, null],
    modal: null, // { algoId, seed, paletteId }
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
  const customBg = el('customBg');
  const customInk1 = el('customInk1');
  const customInk2 = el('customInk2');
  const customInk3 = el('customInk3');
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
    paletteSelect.value = state.paletteId;
    paletteSelect.addEventListener('change', () => {
      state.paletteId = paletteSelect.value;
      renderContactSheet();
    });

    customPaletteToggle.addEventListener('click', () => {
      customPalettePanel.hidden = !customPalettePanel.hidden;
      customPaletteToggle.textContent = customPalettePanel.hidden ? '+ Eigen kleuren samenstellen' : '− Eigen kleuren verbergen';
    });
    customPaletteApplyBtn.addEventListener('click', applyCustomPalette);
    customPaletteRandomBtn.addEventListener('click', () => {
      customBg.value = randomHexColor();
      customInk1.value = randomHexColor();
      customInk2.value = randomHexColor();
      customInk3.value = randomHexColor();
      applyCustomPalette();
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
    batchSizeInput.addEventListener('change', () => {
      state.batchSize = Math.max(4, Math.min(60, parseInt(batchSizeInput.value, 10) || 24));
      batchSizeInput.value = state.batchSize;
      generateBatch();
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

  function applyCustomPalette() {
    const bg = customBg.value;
    const inks = [customInk1.value, customInk2.value, customInk3.value];
    const id = registerCustomPalette(bg, inks, customPaletteName.value);
    upsertPaletteOption(getPalette(id));
    paletteSelect.value = id;
    state.paletteId = id;
    renderContactSheet();
    renderCustomPalettePresetList();
  }

  function renderCustomPalettePresetList() {
    customPalettePresetList.innerHTML = '';
    const presets = Object.values(CUSTOM_PALETTES);
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
        customBg.value = p.bg;
        customInk1.value = p.inks[0] || p.bg;
        customInk2.value = p.inks[1] || p.bg;
        customInk3.value = p.inks[2] || p.bg;
        customPaletteName.value = p.name;
        upsertPaletteOption(p);
        paletteSelect.value = p.id;
        state.paletteId = p.id;
        renderContactSheet();
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
          done++;
          if (done === filled.length) {
            triptychExportBtn.disabled = false;
            triptychExportBtn.textContent = 'Exporteer triptiek (3 bestanden)';
          }
        });
      }, i * 300);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
