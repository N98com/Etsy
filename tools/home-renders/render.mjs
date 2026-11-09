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
  states[d.id] = await page.evaluate(() => window.LocationApp.getDesignState());
  console.log('rendered', d.id);
}
fs.writeFileSync(path.join(OUT, 'designs.json'), JSON.stringify(states));
await browser.close();
