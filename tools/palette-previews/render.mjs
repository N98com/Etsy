// N°98 Maps: render palette candidates on an Amsterdam example map.
// Runs on GitHub Actions (.github/workflows/palette-previews.yml), because the
// map data has to be downloaded. Reads palettes.json, writes out/<id>.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const SITE_URL = (process.env.SITE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });
const palettes = JSON.parse(fs.readFileSync('palettes.json', 'utf8'));

const browser = await chromium.launch({ channel: process.env.CHROME_PATH ? undefined : 'chrome', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('page error:', e.message));
await page.goto(`${SITE_URL}/shop.html?render=1`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.LocationApp && window.LocationApp.applyDesign, null, { timeout: 60000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
await page.waitForTimeout(1500);

await page.evaluate(list => {
  MAP_PALETTES.push(...list);
  const s = window.LocationApp.getDesignState();
  s.center = { lat: 52.3676, lon: 4.9041 };
  s.ratioId = 'in20x28';
  s.palette = list[0].id;
  s.text = { place: 'Amsterdam', region: '', country: 'Netherlands' };
  s.show = Object.assign({}, s.show, { place: true, country: true, coords: true });
  window.__base = s;
  window.LocationApp.applyDesign(s);
}, palettes);
if (process.env.TEST_SKIP_DATA !== '1') await page.waitForFunction(() => window.LocationApp.isDataReady(), null, { timeout: 240000, polling: 500 });
await page.waitForTimeout(1500);

for (const p of palettes) {
  const b64 = await page.evaluate(id => {
    window.LocationApp.applyDesign(Object.assign({}, window.__base, { palette: id }));
    const c = document.createElement('canvas');
    c.width = 1000; c.height = 1400;
    window.LocationApp.renderInto(c);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  }, p.id);
  fs.writeFileSync(path.join(OUT, p.id + '.jpg'), Buffer.from(b64, 'base64'));
  console.log('rendered', p.id);
}
await browser.close();
