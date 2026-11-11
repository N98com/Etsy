// N°98 Maps: renders the images of the homepage (gallery wall, mark the spot,
// craftsmanship detail) with the real map engine. Runs on GitHub Actions
// (.github/workflows/home-renders.yml) because the map data is downloaded.
// Reads designs.json, writes out/<id>.jpg and out/designs.json (the design
// state of every print, so the homepage can open it in the designer).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const SITE_URL = (process.env.SITE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });
const designs = JSON.parse(fs.readFileSync('designs.json', 'utf8'));

const browser = await chromium.launch({ channel: process.env.CHROME_PATH ? undefined : 'chrome', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('page error:', e.message));
await page.goto(`${SITE_URL}/shop.html?render=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.LocationApp && window.LocationApp.applyDesign, null, { timeout: 60000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(1500);
const base = await page.evaluate(() => window.LocationApp.getDesignState());
const states = {};

for (const d of designs) {
  const state = Object.assign({}, base, {
    center: { lat: d.lat, lon: d.lon },
    scale: base.scale * (d.zoom || 1),
    ratioId: 'in20x28',
    palette: d.palette,
    text: { place: d.place, region: '', country: d.country },
    show: { place: true, region: false, country: true, coords: true },
    pins: d.pins || [],
  });
  if (d.pinColor) state.pinColor = d.pinColor;
  if (d.mask) state.mask = d.mask;
  if (d.layout) state.layout = d.layout;
  if (d.pinScale) state.pinScale = d.pinScale;
  await page.evaluate(s => window.LocationApp.applyDesign(s), state);
  await page.waitForTimeout(400);
  if (process.env.TEST_SKIP_DATA !== '1') await page.waitForFunction(() => window.LocationApp.isDataReady(), null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(900);
  const b64 = await page.evaluate(({ w, h, crop }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    window.LocationApp.renderInto(c);
    let out = c;
    if (crop) {
      out = document.createElement('canvas');
      out.width = crop[2]; out.height = crop[3];
      out.getContext('2d').drawImage(c, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
    }
    return out.toDataURL('image/jpeg', 0.86).split(',')[1];
  }, { w: d.w, h: d.h, crop: d.crop || null });
  fs.writeFileSync(path.join(OUT, d.id + '.jpg'), Buffer.from(b64, 'base64'));
  if (d.trace) {
    // Potloodversie voor de homepagina: neem elke lijn en elk vlak op dat de
    // kaartmotor tekent (vereenvoudigd en afgerond), zodat de homepagina de
    // kaart zonder kaartmotor lijntje voor lijntje kan natekenen.
    const trace = await page.evaluate(({ w, h }) => {
      const P = CanvasPainter.prototype, origLine = P.polyline, origPoly = P.multiPolygon;
      const lines = [], areas = [];
      let bg = null;
      const origBg = P.setBackground;
      P.setBackground = function (c) { if (!bg) bg = c; return origBg.apply(this, arguments); };
      P.polyline = function (pts, o) {
        o = o || {};
        if (o.stroke && (!o.fill || o.fill === 'none') && pts.length >= 2) lines.push({ c: o.stroke, w: o.strokeWidth || 1, a: o.opacity == null ? 1 : o.opacity, p: pts });
        return origLine.apply(this, arguments);
      };
      P.multiPolygon = function (rings, o) {
        o = o || {};
        if (o.fill && o.fill !== 'none') areas.push({ c: o.fill, r: rings });
        return origPoly.apply(this, arguments);
      };
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      try { window.LocationApp.renderInto(c); } finally { P.polyline = origLine; P.multiPolygon = origPoly; P.setBackground = origBg; }
      function rdp(pts, eps) {
        if (pts.length < 3) return pts;
        const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
        const st = [[0, pts.length - 1]];
        while (st.length) {
          const [i, j] = st.pop(); let dm = 0, k = -1;
          const [x1, y1] = pts[i], [x2, y2] = pts[j], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
          for (let m = i + 1; m < j; m++) { const d = Math.abs(dy * pts[m][0] - dx * pts[m][1] + x2 * y1 - y2 * x1) / L; if (d > dm) { dm = d; k = m; } }
          if (dm > eps && k > 0) { keep[k] = 1; st.push([i, k], [k, j]); }
        }
        return pts.filter((_, m) => keep[m]);
      }
      const inView = p => p[0] > -20 && p[0] < w + 20 && p[1] > -20 && p[1] < h + 20;
      const styles = [], sKey = {};
      const sid = (c, w, a) => { const k = c + '|' + w.toFixed(2) + '|' + a; if (!(k in sKey)) { sKey[k] = styles.length; styles.push([c, +w.toFixed(2), a]); } return sKey[k]; };
      const outLines = [];
      for (const l of lines) {
        const pts = rdp(l.p, 0.7);
        if (!pts.some(inView)) continue;
        let len = 0; for (let m = 1; m < pts.length; m++) len += Math.hypot(pts[m][0] - pts[m - 1][0], pts[m][1] - pts[m - 1][1]);
        if (len < 3) continue;
        const flat = []; pts.forEach(q => flat.push(Math.round(q[0] * 2), Math.round(q[1] * 2)));
        outLines.push([sid(l.c, l.w, l.a), flat]);
      }
      const outAreas = [];
      for (const ar of areas) {
        const rings = ar.r.map(r => rdp(r, 1.2)).filter(r => r.length >= 3 && r.some(inView));
        if (!rings.length) continue;
        outAreas.push([ar.c, rings.map(r => { const f = []; r.forEach(q => f.push(Math.round(q[0] * 2), Math.round(q[1] * 2))); return f; })]);
      }
      return JSON.stringify({ w, h, q: 2, bg, styles, lines: outLines, areas: outAreas });
    }, { w: d.w, h: d.h });
    fs.writeFileSync(path.join(OUT, d.id + '.trace.json'), trace);
    console.log('traced', d.id, (trace.length / 1024).toFixed(0) + ' KB');
  }
  states[d.id] = await page.evaluate(() => window.LocationApp.getDesignState());
  console.log('rendered', d.id);
}
fs.writeFileSync(path.join(OUT, 'designs.json'), JSON.stringify(states));
await browser.close();
