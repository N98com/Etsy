// Mockups-tab: haalt een artwork op uit de (Playground- of Locatie-)
// geschiedenis en zet 'm in een geïllustreerde sfeerscene — muur, vloer,
// meubelsilhouetten, lijst en passe-partout — allemaal getekend met canvas,
// niet met echte kamerfoto's (die zijn hier niet beschikbaar). Bedoeld als
// aantrekkelijke extra preview-afbeelding naast de gewone productfoto's op
// Etsy, niet als vervanging van een echte fotoshoot.
window.MockupsApp = (() => {
  const SCENES = [
    { id: 'leaning', label: 'Leunend tegen de muur', render: sceneLeaning },
    { id: 'console', label: 'Boven een dressoir', render: sceneConsole },
    { id: 'centered', label: 'Gecentreerd aan de muur', render: sceneCentered },
    { id: 'nook', label: 'Leeshoek', render: sceneNook },
  ];

  const FRAME_STYLES = [
    { id: 'oak', label: 'Licht eiken', frameColor: '#c9a876', matColor: '#f7f3ea' },
    { id: 'walnut', label: 'Walnoot', frameColor: '#6b4a35', matColor: '#f2ede2' },
    { id: 'black', label: 'Zwart', frameColor: '#1c1c1c', matColor: '#f4f1ea' },
    { id: 'white', label: 'Wit', frameColor: '#eeece6', matColor: '#ffffff' },
  ];

  const ASPECTS = [
    { id: '1x1', w: 1, h: 1, label: '1:1' },
    { id: '3x4', w: 3, h: 4, label: '3:4' },
    { id: '2x3', w: 2, h: 3, label: '2:3' },
    { id: '4x5', w: 4, h: 5, label: '4:5' },
  ];

  const EXPORT_SIZES = [
    { id: 'web-1600', label: 'Web preview (1600×1200)', w: 1600, h: 1200 },
    { id: 'etsy-2000sq', label: 'Etsy vierkant (2000×2000)', w: 2000, h: 2000 },
    { id: 'etsy-2000x1500', label: 'Etsy landscape (2000×1500)', w: 2000, h: 1500 },
    { id: 'etsy-2400x1600', label: 'Etsy landscape groot (2400×1600)', w: 2400, h: 1600 },
  ];

  const PREVIEW_W = 1000, PREVIEW_H = 750;

  const state = {
    sourceKind: 'playground',
    selectedKind: null,
    selectedIndex: -1,
    selectedEntry: null,
    artworkImage: null,
    sceneId: 'leaning',
    frameId: 'oak',
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
  const sceneGrid = el('mockupSceneGrid');
  const frameGrid = el('mockupFrameGrid');
  const aspectLabel = el('mockupAspectLabel');
  const aspectTabs = el('mockupAspectTabs');
  const aspectHint = el('mockupAspectHint');
  const previewWrap = el('mockupPreviewWrap');
  const emptyHint = el('mockupEmptyHint');
  const exportSizeSelect = el('mockupExportSize');
  const exportBtn = el('mockupExportBtn');
  const exportStatus = el('mockupExportStatus');

  let previewCanvas = null;

  function init() {
    sourceTabPlayground.addEventListener('click', () => selectSourceKind('playground'));
    sourceTabLocation.addEventListener('click', () => selectSourceKind('location'));

    SCENES.forEach(s => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mockup-option-card' + (s.id === state.sceneId ? ' active' : '');
      card.dataset.sceneId = s.id;
      card.textContent = s.label;
      card.addEventListener('click', () => {
        state.sceneId = s.id;
        [...sceneGrid.children].forEach(c => c.classList.toggle('active', c.dataset.sceneId === s.id));
        scheduleRender();
      });
      sceneGrid.appendChild(card);
    });

    FRAME_STYLES.forEach(f => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'mockup-option-card' + (f.id === state.frameId ? ' active' : '');
      card.dataset.frameId = f.id;
      const swatch = document.createElement('span');
      swatch.className = 'mockup-option-swatch';
      swatch.style.background = f.frameColor;
      const name = document.createElement('span');
      name.textContent = f.label;
      card.appendChild(swatch);
      card.appendChild(name);
      card.addEventListener('click', () => {
        state.frameId = f.id;
        [...frameGrid.children].forEach(c => c.classList.toggle('active', c.dataset.frameId === f.id));
        scheduleRender();
      });
      frameGrid.appendChild(card);
    });

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

    EXPORT_SIZES.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = s.label;
      if (i === 1) opt.selected = true;
      exportSizeSelect.appendChild(opt);
    });

    exportBtn.addEventListener('click', exportMockup);

    updateAspectControlsVisibility();
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
    updateAspectControlsVisibility();
    scheduleRender();
  }

  function updateAspectControlsVisibility() {
    const isLocation = state.selectedKind === 'location';
    aspectTabs.style.display = isLocation ? 'none' : '';
    aspectHint.hidden = !isLocation;
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

  function ensurePreviewCanvas() {
    if (previewCanvas) return previewCanvas;
    previewCanvas = document.createElement('canvas');
    previewCanvas.width = PREVIEW_W;
    previewCanvas.height = PREVIEW_H;
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
    let aspect, artworkImg = null;
    if (state.selectedKind === 'location') {
      try {
        artworkImg = await loadImage(state.selectedEntry.thumbnail);
      } catch {
        return;
      }
      if (token !== renderToken) return;
      aspect = artworkImg.naturalWidth / artworkImg.naturalHeight;
    } else {
      const a = ASPECTS.find(x => x.id === state.aspectId) || ASPECTS[0];
      aspect = a.w / a.h;
    }
    const canvas = ensurePreviewCanvas();
    if (!canvas.parentElement) {
      previewWrap.innerHTML = '';
      previewWrap.appendChild(canvas);
    }
    emptyHint.hidden = true;
    drawScene(canvas.getContext('2d'), canvas.width, canvas.height, aspect, artworkImg);
  }

  function fitAspect(maxW, maxH, aspect) {
    let w = maxW, h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }
    return { w, h };
  }

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

  function drawFramedArt(ctx, x, y, w, h, frameStyle, artworkImg) {
    const frameW = w * 0.045, matW = w * 0.065;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = w * 0.06;
    ctx.shadowOffsetX = w * 0.02;
    ctx.shadowOffsetY = h * 0.035;
    ctx.fillStyle = frameStyle.frameColor;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.fillStyle = frameStyle.frameColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, frameW * 0.15);
    ctx.strokeRect(x + frameW * 0.15, y + frameW * 0.15, w - frameW * 0.3, h - frameW * 0.3);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const mx = x + frameW, my = y + frameW, mw = w - frameW * 2, mh = h - frameW * 2;
    ctx.fillStyle = frameStyle.matColor;
    ctx.fillRect(mx, my, mw, mh);

    const ax = mx + matW, ay = my + matW;
    const aw = Math.max(1, Math.round(mw - matW * 2)), ah = Math.max(1, Math.round(mh - matW * 2));

    if (artworkImg) {
      ctx.drawImage(artworkImg, ax, ay, aw, ah);
    } else if (state.selectedEntry && window.PlaygroundApp) {
      const off = document.createElement('canvas');
      off.width = aw; off.height = ah;
      window.PlaygroundApp.renderEntry(state.selectedEntry, off.getContext('2d'), aw, ah);
      ctx.drawImage(off, ax, ay);
    }

    const glass = ctx.createLinearGradient(ax, ay, ax + aw * 0.6, ay + ah * 0.6);
    glass.addColorStop(0, 'rgba(255,255,255,0.10)');
    glass.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = glass;
    ctx.fillRect(ax, ay, aw, ah);

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, w * 0.003);
    ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
  }

  function drawWall(ctx, w, wallH, colorTop, colorBottom) {
    const g = ctx.createLinearGradient(0, 0, 0, wallH);
    g.addColorStop(0, colorTop);
    g.addColorStop(1, colorBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, wallH);
  }

  function drawFloor(ctx, w, h, wallH, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, wallH, w, h - wallH);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, wallH, w, Math.max(2, h * 0.006));
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    const planks = 9;
    for (let i = 1; i < planks; i++) {
      const px = (w / planks) * i;
      ctx.beginPath();
      ctx.moveTo(px, wallH);
      ctx.lineTo(w / 2 + (px - w / 2) * 1.15, h);
      ctx.stroke();
    }
  }

  function drawPlant(ctx, baseX, baseY, size) {
    const potW = size * 0.9, potH = size * 0.55;
    ctx.fillStyle = '#8a6b52';
    ctx.beginPath();
    ctx.moveTo(baseX - potW * 0.4, baseY - potH);
    ctx.lineTo(baseX + potW * 0.4, baseY - potH);
    ctx.lineTo(baseX + potW * 0.5, baseY);
    ctx.lineTo(baseX - potW * 0.5, baseY);
    ctx.closePath();
    ctx.fill();

    const leafBaseY = baseY - potH;
    const leaves = [
      { dx: -0.5, dy: -1.6, w: 0.35, h: 1.3, rot: -35 },
      { dx: 0.5, dy: -1.6, w: 0.35, h: 1.3, rot: 35 },
      { dx: 0, dy: -1.9, w: 0.3, h: 1.5, rot: 0 },
      { dx: -0.9, dy: -1.1, w: 0.3, h: 1.0, rot: -60 },
      { dx: 0.9, dy: -1.1, w: 0.3, h: 1.0, rot: 60 },
    ];
    ctx.fillStyle = '#4f6b46';
    leaves.forEach(l => {
      ctx.save();
      ctx.translate(baseX + l.dx * size, leafBaseY + l.dy * size);
      ctx.rotate((l.rot * Math.PI) / 180);
      ctx.beginPath();
      ctx.ellipse(0, 0, l.w * size, l.h * size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawArmchair(ctx, x, floorY, w, h, color) {
    const backH = h * 0.7, seatH = h * 0.36, armW = w * 0.16;
    ctx.fillStyle = color;
    roundRect(ctx, x, floorY - h, w, backH, w * 0.08); ctx.fill();
    roundRect(ctx, x, floorY - seatH, w, seatH, w * 0.06); ctx.fill();
    roundRect(ctx, x - armW * 0.15, floorY - h * 0.78, armW, h * 0.78, armW * 0.3); ctx.fill();
    roundRect(ctx, x + w - armW * 0.85, floorY - h * 0.78, armW, h * 0.78, armW * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + w * 0.08, floorY, w * 0.05, h * 0.06);
    ctx.fillRect(x + w * 0.87, floorY, w * 0.05, h * 0.06);
  }

  function drawConsole(ctx, x, floorY, w, h, color) {
    const legH = h * 0.2, bodyH = h - legH;
    ctx.fillStyle = color;
    roundRect(ctx, x, floorY - h, w, bodyH, Math.min(10, bodyH * 0.18));
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const legW = w * 0.025;
    ctx.fillRect(x + w * 0.06, floorY - legH, legW, legH);
    ctx.fillRect(x + w * 0.94 - legW, floorY - legH, legW, legH);
  }

  function sceneLeaning(ctx, w, h, aspect, drawArt) {
    const wallH = h * 0.76;
    drawWall(ctx, w, wallH, '#e7ded0', '#dcd2c1');
    drawFloor(ctx, w, h, wallH, '#b08a63');
    drawPlant(ctx, w * 0.14, h * 0.985, h * 0.16);
    const boxW = w * 0.4, boxH = wallH * 0.88;
    const boxX = w * 0.52, boxY = wallH - boxH;
    ctx.save();
    ctx.translate(boxX + boxW / 2, wallH);
    ctx.rotate(-0.035);
    ctx.translate(-(boxX + boxW / 2), -wallH);
    drawArt(boxX, boxY, boxW, boxH, aspect);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(boxX + boxW * 0.5, wallH + h * 0.014, boxW * 0.4, h * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function sceneConsole(ctx, w, h, aspect, drawArt) {
    drawWall(ctx, w, h, '#eee6d8', '#e2d8c6');
    const consoleW = w * 0.46, consoleH = h * 0.24, floorY = h * 0.9, consoleX = w * 0.27;
    drawConsole(ctx, consoleX, floorY, consoleW, consoleH, '#5a4432');
    drawPlant(ctx, consoleX + consoleW * 0.86, floorY - consoleH * 0.82, h * 0.09);
    const boxW = w * 0.34, boxH = h * 0.46;
    const boxX = consoleX + consoleW / 2 - boxW / 2;
    const boxY = floorY - consoleH - boxH - h * 0.035;
    drawArt(boxX, boxY, boxW, boxH, aspect);
  }

  function sceneCentered(ctx, w, h, aspect, drawArt) {
    drawWall(ctx, w, h, '#efe9df', '#e3dccb');
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    const boxW = w * 0.5, boxH = h * 0.72;
    drawArt(w / 2 - boxW / 2, h / 2 - boxH / 2, boxW, boxH, aspect);
  }

  function sceneNook(ctx, w, h, aspect, drawArt) {
    const wallH = h * 0.8;
    drawWall(ctx, w, wallH, '#e5ddcf', '#d9cfbd');
    drawFloor(ctx, w, h, wallH, '#a9835d');
    drawArmchair(ctx, w * 0.66, wallH, w * 0.26, h * 0.4, '#7d5c53');
    drawPlant(ctx, w * 0.94, h * 0.985, h * 0.1);
    const boxW = w * 0.3, boxH = wallH * 0.62;
    drawArt(w * 0.1, wallH * 0.12, boxW, boxH, aspect);
  }

  function drawScene(ctx, w, h, aspect, artworkImg) {
    ctx.clearRect(0, 0, w, h);
    const scene = SCENES.find(s => s.id === state.sceneId) || SCENES[0];
    const frameStyle = FRAME_STYLES.find(f => f.id === state.frameId) || FRAME_STYLES[0];
    const drawArt = (x, y, boxW, boxH, artAspect) => {
      const size = fitAspect(boxW, boxH, artAspect);
      const fx = x + (boxW - size.w) / 2;
      const fy = y + (boxH - size.h) / 2;
      drawFramedArt(ctx, fx, fy, size.w, size.h, frameStyle, artworkImg);
    };
    scene.render(ctx, w, h, aspect, drawArt);
  }

  function exportMockup() {
    if (!state.selectedEntry) return;
    const opt = exportSizeSelect.selectedOptions[0];
    const size = EXPORT_SIZES.find(s => s.id === opt.value) || EXPORT_SIZES[0];
    exportBtn.disabled = true;
    exportStatus.textContent = `Bezig met renderen op ${size.w}×${size.h}px…`;
    const finish = (artworkImg, aspect) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.w; canvas.height = size.h;
      drawScene(canvas.getContext('2d'), size.w, size.h, aspect, artworkImg);
      const name = state.selectedKind === 'playground'
        ? `mockup-${state.selectedEntry.algoId}-seed${state.selectedEntry.seed}-${state.sceneId}-${size.id}.png`
        : `mockup-${(state.selectedEntry.place || 'kaart').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.sceneId}-${size.id}.png`;
      Utils.downloadCanvasPNG(canvas, name);
      exportStatus.textContent = 'Opgeslagen.';
      exportBtn.disabled = false;
    };
    setTimeout(() => {
      if (state.selectedKind === 'location') {
        loadImage(state.selectedEntry.thumbnail).then(img => {
          finish(img, img.naturalWidth / img.naturalHeight);
        });
      } else {
        const a = ASPECTS.find(x => x.id === state.aspectId) || ASPECTS[0];
        finish(null, a.w / a.h);
      }
    }, 20);
  }

  function onShow() {
    renderSourceGrid();
    if (state.selectedEntry) scheduleRender();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onShow };
})();
