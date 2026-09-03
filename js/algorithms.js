// Elk algoritme is een seed -> params -> tekening pijplijn.
// generateParams(seed, paletteId) is puur en deterministisch: dezelfde seed
// geeft altijd exact dezelfde params, dus exact dezelfde afbeelding.
const Algorithms = {};

// ---------------------------------------------------------------------
// 1. Strange attractor (Clifford / De Jong) — raster, want dit zijn
//    honderdduizenden losse puntjes, geen vectorvorm.
// ---------------------------------------------------------------------
Algorithms.attractor = {
  id: 'attractor',
  label: 'Strange Attractor',
  vector: false,

  generateParams(seed, paletteId) {
    const rnd = RNG.rngFor(seed);
    const type = rnd() < 0.5 ? 'clifford' : 'dejong';
    const range = 3;
    const a = (rnd() * 2 - 1) * range;
    const b = (rnd() * 2 - 1) * range;
    const c = (rnd() * 2 - 1) * range;
    const d = (rnd() * 2 - 1) * range;
    return { seed, type, a, b, c, d, paletteId };
  },

  renderToCanvas(ctx, params, w, h, opts = {}) {
    const { type, a, b, c, d } = params;
    const step = type === 'clifford'
      ? (x, y) => [Math.sin(a * y) + c * Math.cos(a * x), Math.sin(b * x) + d * Math.cos(b * y)]
      : (x, y) => [Math.sin(a * y) - Math.cos(b * x), Math.sin(c * x) - Math.cos(d * y)];

    const burnIn = 50;

    // Pass 1: korte run om de bounding box van het attractor-object te schatten,
    // zodat we het daarna precies kunnen laten passen op het canvas.
    let x = 0.1, y = 0.1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 20000; i++) {
      [x, y] = step(x, y);
      if (i > burnIn) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const pad = 0.06;
    const sx = (w * (1 - 2 * pad)) / ((maxX - minX) || 1);
    const sy = (h * (1 - 2 * pad)) / ((maxY - minY) || 1);
    const s = Math.min(sx, sy);
    const ox = w / 2 - ((minX + maxX) / 2) * s;
    const oy = h / 2 - ((minY + maxY) / 2) * s;

    // Pass 2: volledige run, direct in een dichtheids-buffer (geen puntenlijst
    // in het geheugen — dat zou bij grote exports gigabytes kosten).
    const density = new Float32Array(w * h);
    const iterations = opts.iterations || Math.min(60_000_000, Math.max(150000, w * h * 5));
    x = 0.1; y = 0.1;
    let maxV = 0;
    for (let i = 0; i < iterations; i++) {
      [x, y] = step(x, y);
      if (i < burnIn) continue;
      const px = x * s + ox, py = y * s + oy;
      const xi = px | 0, yi = py | 0;
      if (xi >= 0 && xi < w && yi >= 0 && yi < h) {
        const idx = yi * w + xi;
        const v = (density[idx] += 1);
        if (v > maxV) maxV = v;
      }
    }

    const palette = getPalette(params.paletteId);
    const bg = Utils.hexToRgb(palette.bg);
    const ink = Utils.hexToRgb(palette.inks[palette.inks.length - 1]);
    const img = ctx.createImageData(w, h);
    const logMax = Math.log(maxV + 1) || 1;
    for (let i = 0; i < w * h; i++) {
      const v = density[i];
      const t = v > 0 ? Math.pow(Math.log(v + 1) / logMax, 0.5) : 0;
      const o = i * 4;
      img.data[o] = bg.r + (ink.r - bg.r) * t;
      img.data[o + 1] = bg.g + (ink.g - bg.g) * t;
      img.data[o + 2] = bg.b + (ink.b - bg.b) * t;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  },
};

// ---------------------------------------------------------------------
// 2. Phyllotaxis — gouden-hoek spiraal, van nature vectorwerk.
// ---------------------------------------------------------------------
Algorithms.phyllotaxis = {
  id: 'phyllotaxis',
  label: 'Phyllotaxis',
  vector: true,

  generateParams(seed, paletteId) {
    const rnd = RNG.rngFor(seed);
    const n = 180 + Math.floor(rnd() * 820);
    const angleDeg = 137.507764 + (rnd() * 1.2 - 0.6);
    const c = 3 + rnd() * 4;
    const dotScaleBase = 0.5 + rnd() * 1.3;
    const dotGrowth = rnd() * 0.9;
    const shape = rnd() < 0.7 ? 'circle' : 'petal';
    const paletteMode = rnd() < 0.5 ? 'gradient' : 'alternating';
    return { seed, n, angleDeg, c, dotScaleBase, dotGrowth, shape, paletteMode, paletteId };
  },

  render(painter, params, w, h) {
    const palette = getPalette(params.paletteId);
    painter.setBackground(palette.bg);
    const cx = w / 2, cy = h / 2;
    const maxR = Math.min(w, h) * 0.46;
    const angleRad = params.angleDeg * Math.PI / 180;
    const rawMaxR = params.c * Math.sqrt(params.n);
    const scaleC = maxR / (rawMaxR || 1);

    for (let i = 0; i < params.n; i++) {
      const r = params.c * Math.sqrt(i) * scaleC;
      const theta = i * angleRad;
      const px = cx + r * Math.cos(theta);
      const py = cy + r * Math.sin(theta);
      const t = i / params.n;
      const dotR = (w * 0.0035) * (params.dotScaleBase * (1 - params.dotGrowth) + params.dotGrowth * (0.4 + t * 1.6));
      const color = params.paletteMode === 'gradient'
        ? Utils.mixPaletteColor(palette.inks, t)
        : palette.inks[i % palette.inks.length];

      if (params.shape === 'circle') {
        painter.circle(px, py, dotR, { fill: color });
      } else {
        painter.ellipse(px, py, dotR * 1.9, dotR * 0.85, theta, { fill: color });
      }
    }
  },
};

// ---------------------------------------------------------------------
// 3. Voronoi — halfvlak-clipping (zie geom.js), optioneel naadloos
//    betegelbaar (toroidale 3x3-tiling) voor licentieerbare patronen.
// ---------------------------------------------------------------------
Algorithms.voronoi = {
  id: 'voronoi',
  label: 'Voronoi',
  vector: true,

  generateParams(seed, paletteId) {
    const rnd = RNG.rngFor(seed);
    const n = 24 + Math.floor(rnd() * 110);
    const relax = Math.floor(rnd() * 5);
    const seamless = rnd() < 0.6;
    const style = rnd() < 0.5 ? 'line' : 'filled';
    const strokeWidthRel = 0.0015 + rnd() * 0.0035;
    const sites = [];
    if (seamless) {
      const cols = Math.max(1, Math.round(Math.sqrt(n)));
      for (let i = 0; i < n; i++) {
        const gx = (i % cols) / cols;
        const gy = Math.floor(i / cols) / cols;
        const jitter = (1 / cols) * 0.85;
        sites.push([(gx + rnd() * jitter) % 1, (gy + rnd() * jitter) % 1]);
      }
    } else {
      for (let i = 0; i < n; i++) sites.push([rnd(), rnd()]);
    }
    return { seed, n, relax, seamless, style, strokeWidthRel, sites, paletteId };
  },

  _cellsAt(sites, w, h, seamless) {
    if (seamless) {
      const scaled = sites.map(([x, y]) => [x * w, y * h]);
      const tiled = [];
      const indexMap = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          scaled.forEach(([x, y], i) => {
            tiled.push([x + dx * w, y + dy * h]);
            indexMap.push(dx === 0 && dy === 0 ? i : -1);
          });
        }
      }
      const bounds = { minX: -w, minY: -h, maxX: 2 * w, maxY: 2 * h };
      const allCells = Geom.voronoiCells(tiled, bounds);
      const cells = new Array(scaled.length);
      for (let i = 0; i < tiled.length; i++) if (indexMap[i] >= 0) cells[indexMap[i]] = allCells[i];
      return cells;
    }
    const scaled = sites.map(([x, y]) => [x * w, y * h]);
    const margin = Math.max(w, h) * 0.4;
    const guards = [];
    const guardCount = 16;
    for (let i = 0; i < guardCount; i++) {
      const angle = (i / guardCount) * Math.PI * 2;
      const r = Math.max(w, h) * 0.95;
      guards.push([w / 2 + Math.cos(angle) * r, h / 2 + Math.sin(angle) * r]);
    }
    const bounds = { minX: -margin, minY: -margin, maxX: w + margin, maxY: h + margin };
    const allCells = Geom.voronoiCells(scaled.concat(guards), bounds);
    return allCells.slice(0, scaled.length).map(poly => Geom.clipToRect(poly, 0, 0, w, h));
  },

  _relaxedSites(params) {
    let sites = params.sites.map(p => p.slice());
    const REF = 1000;
    for (let iter = 0; iter < params.relax; iter++) {
      const cells = this._cellsAt(sites, REF, REF, params.seamless);
      sites = sites.map((s, i) => {
        const poly = cells[i];
        if (!poly || poly.length < 3) return s;
        const [cx, cy] = Geom.polygonCentroid(poly);
        let nx = cx / REF, ny = cy / REF;
        if (params.seamless) { nx = ((nx % 1) + 1) % 1; ny = ((ny % 1) + 1) % 1; }
        else { nx = Math.min(1, Math.max(0, nx)); ny = Math.min(1, Math.max(0, ny)); }
        return [nx, ny];
      });
    }
    return sites;
  },

  render(painter, params, w, h) {
    const palette = getPalette(params.paletteId);
    painter.setBackground(palette.bg);
    const sites = this._relaxedSites(params);
    const cells = this._cellsAt(sites, w, h, params.seamless);
    cells.forEach((poly, i) => {
      if (!poly || poly.length < 3) return;
      const strokeW = w * params.strokeWidthRel;
      if (params.style === 'line') {
        painter.polygon(poly, { stroke: palette.inks[i % palette.inks.length], strokeWidth: strokeW, fill: 'none' });
      } else {
        painter.polygon(poly, { fill: palette.inks[i % palette.inks.length], stroke: palette.bg, strokeWidth: strokeW * 0.7 });
      }
    });
  },
};

// ---------------------------------------------------------------------
// 4. Harmonograaf — gedempte parametrische kromme, vector-native.
// ---------------------------------------------------------------------
Algorithms.harmonograph = {
  id: 'harmonograph',
  label: 'Harmonograaf',
  vector: true,

  generateParams(seed, paletteId) {
    const rnd = RNG.rngFor(seed);
    const freq = () => (1 + Math.floor(rnd() * 5)) + (rnd() * 0.06 - 0.03);
    const f1 = freq(), f2 = freq(), f3 = freq(), f4 = freq();
    const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2, p3 = rnd() * Math.PI * 2, p4 = rnd() * Math.PI * 2;
    const d1 = 0.001 + rnd() * 0.006, d2 = 0.001 + rnd() * 0.006, d3 = 0.001 + rnd() * 0.006, d4 = 0.001 + rnd() * 0.006;
    const A1 = 0.6 + rnd() * 0.4, A2 = 0.6 + rnd() * 0.4, A3 = 0.6 + rnd() * 0.4, A4 = 0.6 + rnd() * 0.4;
    const strokeWidthRel = 0.0007 + rnd() * 0.0011;
    const multiLine = rnd() < 0.4;
    return { seed, f1, f2, f3, f4, p1, p2, p3, p4, d1, d2, d3, d4, A1, A2, A3, A4, strokeWidthRel, multiLine, paletteId };
  },

  render(painter, params, w, h) {
    const palette = getPalette(params.paletteId);
    painter.setBackground(palette.bg);
    const steps = 3600;
    const tMax = 120;
    const scale = Math.min(w, h) * 0.42;
    const cx = w / 2, cy = h / 2;
    const layers = params.multiLine ? 3 : 1;

    for (let l = 0; l < layers; l++) {
      const phase = l * 0.16;
      const pts = new Array(steps + 1);
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * tMax;
        const x = params.A1 * Math.sin(params.f1 * t + params.p1 + phase) * Math.exp(-params.d1 * t)
          + params.A2 * Math.sin(params.f2 * t + params.p2) * Math.exp(-params.d2 * t);
        const y = params.A3 * Math.sin(params.f3 * t + params.p3 + phase) * Math.exp(-params.d3 * t)
          + params.A4 * Math.sin(params.f4 * t + params.p4) * Math.exp(-params.d4 * t);
        pts[i] = [cx + (x * scale) / 2, cy + (y * scale) / 2];
      }
      const color = palette.inks[l % palette.inks.length];
      painter.polyline(pts, { stroke: color, strokeWidth: w * params.strokeWidthRel, fill: 'none', opacity: layers > 1 ? 0.75 : 1 });
    }
  },
};

// ---------------------------------------------------------------------
// 5. Verfspetters — Pollock-achtige "action painting": uitgeslingerde,
//    aflopende verflijnen die het canvas doorkruisen, met verfplassen
//    eronder en fijne spetters overal overheen. Volledig vector (elke
//    lijn is een dichtgetekende, taps toelopende ribbon-polygon), dus
//    ook als SVG te exporteren. Alle toeval zit in generateParams, zodat
//    render() puur blijft en dezelfde seed altijd hetzelfde oplevert.
// ---------------------------------------------------------------------
Algorithms.splatter = {
  id: 'splatter',
  label: 'Verfspetters',
  vector: true,

  generateParams(seed, paletteId) {
    const rnd = RNG.rngFor(seed);

    // Grote verfplassen als onderlaag.
    const blobCount = 3 + Math.floor(rnd() * 6);
    const blobs = [];
    for (let i = 0; i < blobCount; i++) {
      const cx = rnd(), cy = rnd();
      const baseR = 0.035 + rnd() * 0.1;
      const pointCount = 7 + Math.floor(rnd() * 6);
      const jitter = 0.3 + rnd() * 0.5;
      const rotation = rnd() * Math.PI * 2;
      const colorIdx = Math.floor(rnd() * 997);
      const edgeJitters = Array.from({ length: pointCount }, () => rnd());
      blobs.push({ cx, cy, baseR, pointCount, jitter, rotation, colorIdx, edgeJitters });
    }

    // Uitgeslingerde, taps toelopende verflijnen — het hoofdeffect.
    const flingCount = 16 + Math.floor(rnd() * 18);
    const flings = [];
    for (let i = 0; i < flingCount; i++) {
      const sx = rnd(), sy = rnd();
      const angle = rnd() * Math.PI * 2;
      const len = 0.4 + rnd() * 0.85;
      const curve = (rnd() * 2 - 1) * 0.6;
      const ex = sx + Math.cos(angle) * len;
      const ey = sy + Math.sin(angle) * len;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const perpAngle = angle + Math.PI / 2;
      const ctrlX = mx + Math.cos(perpAngle) * curve * len;
      const ctrlY = my + Math.sin(perpAngle) * curve * len;

      const maxWidth = 0.007 + rnd() * 0.024;
      const colorIdx = Math.floor(rnd() * 997);
      const segments = 24;
      const widthJitters = Array.from({ length: segments + 1 }, () => 0.55 + rnd() * 0.85);
      const taperPow = 0.8 + rnd() * 1.6;

      const dropletCount = Math.floor(rnd() * 9);
      const droplets = Array.from({ length: dropletCount }, () => ({
        t: rnd() * 0.55,
        side: rnd() < 0.5 ? -1 : 1,
        dist: 0.006 + rnd() * 0.03,
        size: 0.2 + rnd() * 0.8,
      }));

      flings.push({ sx, sy, ctrlX, ctrlY, ex, ey, maxWidth, colorIdx, segments, widthJitters, taperPow, droplets });
    }

    // Losse fijne spetters, verspreid over het hele vlak.
    const speckCount = 60 + Math.floor(rnd() * 100);
    const specks = Array.from({ length: speckCount }, () => ({
      x: rnd(), y: rnd(),
      r: 0.0015 + rnd() * 0.009,
      colorIdx: Math.floor(rnd() * 997),
    }));

    return { seed, blobs, flings, specks, paletteId };
  },

  render(painter, params, w, h) {
    const palette = getPalette(params.paletteId);
    painter.setBackground(palette.bg);
    const scale = Math.min(w, h);

    // 1) Verfplassen als onderlaag.
    params.blobs.forEach(b => {
      const color = palette.inks[b.colorIdx % palette.inks.length];
      const cx = b.cx * w, cy = b.cy * h;
      const baseR = b.baseR * scale;
      const pts = [];
      for (let i = 0; i < b.pointCount; i++) {
        const angle = (i / b.pointCount) * Math.PI * 2 + b.rotation;
        const rMul = 1 + (b.edgeJitters[i] * 2 - 1) * b.jitter;
        pts.push([cx + Math.cos(angle) * baseR * rMul, cy + Math.sin(angle) * baseR * rMul]);
      }
      painter.polygon(pts, { fill: color });
    });

    // 2) Uitgeslingerde lijnen: kwadratische bezier, getekend als een
    //    dichtgetekende ribbon die van maxWidth taps toeloopt naar dun.
    params.flings.forEach(f => {
      const color = palette.inks[f.colorIdx % palette.inks.length];
      const p0 = [f.sx * w, f.sy * h];
      const p1 = [f.ctrlX * w, f.ctrlY * h];
      const p2 = [f.ex * w, f.ey * h];
      const pts = [];
      for (let i = 0; i <= f.segments; i++) {
        const t = i / f.segments, mt = 1 - t;
        pts.push([
          mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
          mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
        ]);
      }
      const maxWidthPx = f.maxWidth * scale;
      const left = [], right = [];
      for (let i = 0; i <= f.segments; i++) {
        const t = i / f.segments;
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(f.segments, i + 1)];
        let dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const width = maxWidthPx * Math.pow(1 - t, f.taperPow) * f.widthJitters[i];
        left.push([pts[i][0] + nx * width / 2, pts[i][1] + ny * width / 2]);
        right.push([pts[i][0] - nx * width / 2, pts[i][1] - ny * width / 2]);
      }
      painter.polygon(left.concat(right.reverse()), { fill: color });

      // Druppels die van de lijn af spatten, vooral bij het dikke begin.
      f.droplets.forEach(d => {
        const idx = Math.min(f.segments, Math.floor(d.t * f.segments));
        const base = pts[idx];
        const nextP = pts[Math.min(f.segments, idx + 1)];
        let dx = nextP[0] - base[0], dy = nextP[1] - base[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const distPx = d.dist * scale;
        const dr = maxWidthPx * 0.6 * d.size;
        if (dr > 0.35) painter.circle(base[0] + nx * distPx * d.side, base[1] + ny * distPx * d.side, dr, { fill: color });
      });
    });

    // 3) Fijne spetters bovenop, over het hele vlak.
    params.specks.forEach(s => {
      const color = palette.inks[s.colorIdx % palette.inks.length];
      const r = s.r * scale;
      if (r > 0.3) painter.circle(s.x * w, s.y * h, r, { fill: color });
    });
  },
};

const ALGORITHM_LIST = [Algorithms.attractor, Algorithms.phyllotaxis, Algorithms.voronoi, Algorithms.harmonograph, Algorithms.splatter];
