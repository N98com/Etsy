// Mockups-tab: een gekozen artwork uit de (Playground- of Locatie-)
// geschiedenis in al zijn beschikbare kleurvarianten naast elkaar zetten,
// met de kleurnaam erbij — zoals de "Choose Your Colours"-afbeelding die
// veel kaart-shops op Etsy als eerste listing-foto gebruiken. Eén PNG, klaar
// om te gebruiken in een advertentie of listing.
window.MockupsApp = (() => {
  const ASPECTS = [
    { id: '1x1', w: 1, h: 1, label: '1:1' },
    { id: '3x4', w: 3, h: 4, label: '3:4' },
    { id: '2x3', w: 2, h: 3, label: '2:3' },
    { id: '4x5', w: 4, h: 5, label: '4:5' },
  ];

  const EXPORT_WIDTHS = [
    { id: 'w1200', label: 'Web (1200px breed)', w: 1200 },
    { id: 'w1600', label: 'Etsy standaard (1600px breed)', w: 1600 },
    { id: 'w2000', label: 'Etsy groot (2000px breed)', w: 2000 },
    { id: 'w2400', label: 'Extra groot (2400px breed)', w: 2400 },
  ];

  const FRAME_STYLE = { frameColor: '#c9a876', matColor: '#faf7f1' };
  const PREVIEW_TARGET_WIDTH = 1040;

  const state = {
    sourceKind: 'playground',
    selectedKind: null,
    selectedIndex: -1,
    selectedEntry: null,
    artworkImage: null,
    aspectId: '3x4',
  };

  const imageCache = new Map();
  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imageCache.set(src, p);
    return p;
  }

  const el = id => document.getElementById(id);
  const sourceTabPlayground = el('mockupSourceTabPlayground');
  const sourceTabLocation = el('mockupSourceTabLocation');
  const sourceGrid = el('mockupSourceGrid');
  const titleInput = el('mockupTitleInput');
  const aspectLabel = el('mockupAspectLabel');
  const aspectTabs = el('mockupAspectTabs');
  const aspectHint = el('mockupAspectHint');
  const geoHint = el('mockupGeoHint');
  const previewWrap = el('mockupPreviewWrap');
  const emptyHint = el('mockupEmptyHint');
  const exportSizeSelect = el('mockupExportSize');
  const exportBtn = el('mockupExportBtn');
  const exportStatus = el('mockupExportStatus');

  let previewCanvas = null;

  function init() {
    sourceTabPlayground.addEventListener('click', () => selectSourceKind('playground'));
    sourceTabLocation.addEventListener('click', () => selectSourceKind('location'));

    ASPECTS.forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      btn.dataset.aspectId = a.id;
      btn.className = a.id === state.aspectId ? 'active' : '';
      btn.addEventListener('click', () => {
        state.aspectId = a.id;
        [...aspectTabs.children].forEach(b => b.classList.toggle('active', b.dataset.aspectId === a.id));
        scheduleRender();
      });
      aspectTabs.appendChild(btn);
    });

    EXPORT_WIDTHS.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.label;
      if (i === 2) opt.selected = true;
      exportSizeSelect.appendChild(opt);
    });

    titleInput.addEventListener('input', scheduleRender);
    exportBtn.addEventListener('click', exportShowcase);

    updateSourceDependentControls();
    renderSourceGrid();
  }

  function selectSourceKind(kind) {
    state.sourceKind = kind;
    sourceTabPlayground.classList.toggle('active', kind === 'playground');
    sourceTabLocation.classList.toggle('active', kind === 'location');
    renderSourceGrid();
  }

  function selectSource(kind, idx, entry) {
    state.selectedKind = kind;
    state.selectedIndex = idx;
    state.selectedEntry = entry;
    state.artworkImage = null;
    renderSourceGrid();
    updateSourceDependentControls();
    scheduleRender();
  }

  function updateSourceDependentControls() {
    const isLocation = state.selectedKind === 'location';
    aspectTabs.style.display = isLocation ? 'none' : '';
    aspectLabel.style.display = isLocation ? 'none' : '';
    aspectHint.hidden = !isLocation;
    geoHint.hidden = !(isLocation && state.selectedEntry && !state.selectedEntry.recolor);
  }

  function renderSourceGrid() {
    sourceGrid.innerHTML = '';
    const entries = state.sourceKind === 'playground'
      ? (window.PlaygroundApp ? window.PlaygroundApp.getHistory() : [])
      : (window.LocationApp ? window.LocationApp.getHistory() : []);
    if (entries.length === 0) {
      sourceGrid.innerHTML = '<p class="mockup-source-empty">Nog niets geëxporteerd in dit tabblad — zie Geschiedenis.</p>';
      return;
    }
    entries.forEach((entry, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mockup-source-thumb' + (state.selectedKind === state.sourceKind && idx === state.selectedIndex ? ' active' : '');
      if (state.sourceKind === 'playground' && window.PlaygroundApp) {
        const canvas = document.createElement('canvas');
        canvas.width = 140; canvas.height = 140;
        window.PlaygroundApp.renderEntry(entry, canvas.getContext('2d'), 140, 140);
        btn.appendChild(canvas);
        btn.title = window.PlaygroundApp.labelFor(entry);
      } else {
        const img = document.createElement('img');
        img.src = entry.thumbnail;
        btn.appendChild(img);
        btn.title = `${entry.place || 'kaart'}${entry.country ? ', ' + entry.country : ''}`;
      }
      btn.addEventListener('click', () => selectSource(state.sourceKind, idx, entry));
      sourceGrid.appendChild(btn);
    });
  }

  // ---- kleurvarianten bepalen ----
  function getVariants() {
    if (!state.selectedEntry) return [];
    if (state.selectedKind === 'playground') {
      return PALETTES.map(p => ({ id: p.id, label: p.name, kind: 'playground' }));
    }
    const entry = state.selectedEntry;
    if (!entry.recolor) {
      return [{ id: null, label: entry.paletteName || 'Origineel', kind: 'location-flat' }];
    }
    const variants = MAP_PALETTES.map(mp => ({ id: mp.id, label: mp.name, kind: 'location' }));
    variants.push({ id: 'gta5', label: GTA_STYLE_PALETTE.name, kind: 'location' });
    return variants;
  }

  function getAspect() {
    if (state.selectedKind === 'playground') {
      const a = ASPECTS.find(x => x.id === state.aspectId) || ASPECTS[0];
      return a.w / a.h;
    }
    const entry = state.selectedEntry;
    if (entry.recolor && entry.recolor.ratio) return entry.recolor.ratio.w / entry.recolor.ratio.h;
    if (state.artworkImage) return state.artworkImage.naturalWidth / state.artworkImage.naturalHeight;
    return 3 / 4;
  }

  function renderVariant(variant, ctx, w, h) {
    const entry = state.selectedEntry;
    if (state.selectedKind === 'playground') {
      window.PlaygroundApp.renderEntry(entry, ctx, w, h, variant.id);
      return;
    }
    if (variant.kind === 'location-flat') {
      if (state.artworkImage) ctx.drawImage(state.artworkImage, 0, 0, w, h);
      return;
    }
    const isGta = variant.id === 'gta5';
    MapRender.render(new CanvasPainter(ctx, w, h), w, h, {
      bounds: entry.recolor.bounds,
      streets: entry.recolor.streets,
      landmarks: entry.recolor.landmarks || [],
      palette: isGta ? GTA_STYLE_PALETTE : getMapPalette(variant.id),
      gtaStyle: isGta,
      tier: entry.recolor.tier,
      isolate: entry.recolor.isolate || null,
      showStreetLabels: !!entry.showStreetLabels && !isGta,
      showLandmarks: !!entry.showLandmarks && (entry.recolor.landmarks || []).length > 0,
      caption: { showPlace: true, showCountry: true, showCoords: false, place: entry.place, country: entry.country, lat: entry.lat, lon: entry.lon },
    });
  }

  function captionFor(variant) {
    if (state.selectedKind === 'playground') {
      const algo = Algorithms[state.selectedEntry.algoId];
      return { main: algo ? algo.label : state.selectedEntry.algoId, sub: `seed #${state.selectedEntry.seed}` };
    }
    const entry = state.selectedEntry;
    return { main: entry.place || 'Onbekende plaats', sub: entry.country || '' };
  }

  // ---- layout + tekenen ----
  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawFramedArt(ctx, x, y, w, h, drawInner) {
    const frameW = w * 0.05, matW = w * 0.07;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = w * 0.045;
    ctx.shadowOffsetY = h * 0.02;
    ctx.fillStyle = FRAME_STYLE.frameColor;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const mx = x + frameW, my = y + frameW, mw = w - frameW * 2, mh = h - frameW * 2;
    ctx.fillStyle = FRAME_STYLE.matColor;
    ctx.fillRect(mx, my, mw, mh);

    const ax = mx + matW, ay = my + matW;
    const aw = Math.max(1, Math.round(mw - matW * 2)), ah = Math.max(1, Math.round(mh - matW * 2));
    const off = document.createElement('canvas');
    off.width = aw; off.height = ah;
    drawInner(off.getContext('2d'), aw, ah);
    ctx.drawImage(off, ax, ay);

    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, w * 0.003);
    ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
  }

  function computeLayout(targetWidth, cols, aspect, hasTitle) {
    const kMargin = 0.22, kGutter = 0.14, kLabel = 0.16, kCaptionMain = 0.13, kCaptionSub = 0.10, kCaptionGap = 0.05;
    const cellW = targetWidth / (2 * kMargin + cols + (cols - 1) * kGutter);
    const margin = cellW * kMargin, gutter = cellW * kGutter;
    const labelH = cellW * kLabel;
    const cellArtH = cellW / aspect;
    const captionH = cellW * (kCaptionMain + kCaptionGap + kCaptionSub);
    const cellTotalH = labelH + cellArtH + captionH;
    const titleH = hasTitle ? cellW * 0.55 : cellW * 0.18;
    return {
      cellW, margin, gutter, labelH, cellArtH, captionH, cellTotalH, titleH,
      labelFont: cellW * 0.075, titleFont: cellW * 0.16,
      captionMainFont: cellW * kCaptionMain * 0.72, captionSubFont: cellW * kCaptionSub * 0.72,
    };
  }

  function drawShowcase(ctx, canvasW, canvasH, layout, title, cols, variants) {
    ctx.fillStyle = '#faf8f4';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.textAlign = 'center';
    if (title) {
      ctx.fillStyle = '#231f1a';
      ctx.font = `600 ${layout.titleFont}px Georgia, serif`;
      ctx.fillText(title, canvasW / 2, layout.titleH * 0.64);
    }
    variants.forEach((variant, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = layout.margin + col * (layout.cellW + layout.gutter);
      const cy = layout.titleH + row * (layout.cellTotalH + layout.gutter);

      ctx.fillStyle = '#231f1a';
      ctx.font = `600 ${layout.labelFont}px Georgia, serif`;
      ctx.fillText(variant.label.toUpperCase(), cx + layout.cellW / 2, cy + layout.labelH * 0.68);

      const artY = cy + layout.labelH;
      drawFramedArt(ctx, cx, artY, layout.cellW, layout.cellArtH, (ictx, iw, ih) => renderVariant(variant, ictx, iw, ih));

      const caption = captionFor(variant);
      const capY = artY + layout.cellArtH;
      ctx.fillStyle = '#231f1a';
      ctx.font = `600 ${layout.captionMainFont}px Georgia, serif`;
      ctx.fillText(caption.main, cx + layout.cellW / 2, capY + layout.captionMainFont * 1.5);
      if (caption.sub) {
        ctx.fillStyle = '#8a8074';
        ctx.font = `${layout.captionSubFont}px Georgia, serif`;
        ctx.fillText(caption.sub, cx + layout.cellW / 2, capY + layout.captionMainFont * 1.5 + layout.captionSubFont * 1.7);
      }
    });
  }

  function ensurePreviewCanvas() {
    if (previewCanvas) return previewCanvas;
    previewCanvas = document.createElement('canvas');
    return previewCanvas;
  }

  let renderToken = 0;
  function scheduleRender() {
    const token = ++renderToken;
    renderMockup(token);
  }

  async function renderMockup(token) {
    if (!state.selectedEntry) {
      emptyHint.hidden = false;
      if (previewCanvas && previewCanvas.parentElement) previewCanvas.remove();
      exportBtn.disabled = true;
      return;
    }
    exportBtn.disabled = false;
    if (state.selectedKind === 'location' && !state.artworkImage) {
      try { state.artworkImage = await loadImage(state.selectedEntry.thumbnail); } catch { /* laat leeg */ }
      if (token !== renderToken) return;
    }
    const variants = getVariants();
    const aspect = getAspect();
    const cols = Math.min(5, variants.length);
    const title = titleInput.value.trim() || 'Kies je kleur';
    const layout = computeLayout(PREVIEW_TARGET_WIDTH, cols, aspect, true);
    const rows = Math.ceil(variants.length / cols);
    const canvasW = Math.round(PREVIEW_TARGET_WIDTH);
    const canvasH = Math.round(layout.titleH + rows * layout.cellTotalH + (rows - 1) * layout.gutter + layout.margin);

    const canvas = ensurePreviewCanvas();
    canvas.width = canvasW; canvas.height = canvasH;
    if (!canvas.parentElement) {
      previewWrap.innerHTML = '';
      previewWrap.appendChild(canvas);
    }
    emptyHint.hidden = true;
    drawShowcase(canvas.getContext('2d'), canvasW, canvasH, layout, title, cols, variants);
  }

  function exportShowcase() {
    if (!state.selectedEntry) return;
    const opt = exportSizeSelect.selectedOptions[0];
    const width = (EXPORT_WIDTHS.find(s => s.id === opt.value) || EXPORT_WIDTHS[2]).w;
    exportBtn.disabled = true;
    exportStatus.textContent = `Bezig met renderen op ${width}px breed…`;
    setTimeout(async () => {
      if (state.selectedKind === 'location' && !state.artworkImage) {
        try { state.artworkImage = await loadImage(state.selectedEntry.thumbnail); } catch { /* laat leeg */ }
      }
      const variants = getVariants();
      const aspect = getAspect();
      const cols = Math.min(5, variants.length);
      const title = titleInput.value.trim() || 'Kies je kleur';
      const layout = computeLayout(width, cols, aspect, true);
      const rows = Math.ceil(variants.length / cols);
      const canvasW = Math.round(width);
      const canvasH = Math.round(layout.titleH + rows * layout.cellTotalH + (rows - 1) * layout.gutter + layout.margin);
      const canvas = document.createElement('canvas');
      canvas.width = canvasW; canvas.height = canvasH;
      drawShowcase(canvas.getContext('2d'), canvasW, canvasH, layout, title, cols, variants);
      const name = state.selectedKind === 'playground'
        ? `showcase-${state.selectedEntry.algoId}-seed${state.selectedEntry.seed}-${opt.value}.png`
        : `showcase-${(state.selectedEntry.place || 'kaart').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${opt.value}.png`;
      Utils.downloadCanvasPNG(canvas, name);
      exportStatus.textContent = 'Opgeslagen.';
      exportBtn.disabled = false;
    }, 20);
  }

  function onShow() {
    renderSourceGrid();
    if (state.selectedEntry) scheduleRender();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onShow };
})();
