// N°98 Maps: hero mode for the homepage (shop.html?hero=1).
//
// The homepage shows this page in a small frame: only the poster, no tool
// around it. It draws a few cities one after another (each one appears as if
// the ink spreads over the paper) and draws whatever place the visitor types
// on the homepage. The homepage talks to it with postMessage:
//   homepage -> here:  { source: 'n98-home', type: 'search', q }
//   here -> homepage:  { source: 'n98-hero', type: 'ready' | 'city' | 'found' | 'notfound' | 'searching', ... }
// "found" carries the full design, so the homepage can open the designer
// with exactly this map (see #design= in shop.js).
(function () {
  if (new URLSearchParams(location.search).get('hero') !== '1') return;
  const root = document.documentElement;
  root.classList.add('is-hero');

  const CITIES = [
    { place: 'Amsterdam', country: 'Netherlands', lat: 52.3702, lon: 4.8952, palette: 'midnight-copper' },
    { place: 'Venice', country: 'Italy', lat: 45.4371, lon: 12.3326, palette: 'parchment-sepia' },
    { place: 'Copenhagen', country: 'Denmark', lat: 55.6786, lon: 12.5753, palette: 'deep-teal' },
    { place: 'New York', country: 'United States', lat: 40.7484, lon: -73.9857, palette: 'bordeaux-gold' },
    { place: 'Paris', country: 'France', lat: 48.8576, lon: 2.3448, palette: 'forest-brass' },
  ];
  const HOLD_MS = 6200;

  const post = m => { try { window.parent.postMessage(Object.assign({ source: 'n98-hero' }, m), '*'); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let canvas, base, timer = null, cycling = true, idx = 0, busy = false;

  async function waitReady(timeout) {
    const t0 = Date.now();
    await sleep(250);
    while (!window.LocationApp.isDataReady()) {
      if (Date.now() - t0 > (timeout || 12000)) break;
      await sleep(120);
    }
    await sleep(260); // laatste render afwachten
  }
  function hide() { canvas.classList.remove('hero-draw'); canvas.classList.add('hero-hide'); }
  function draw() {
    canvas.classList.remove('hero-hide');
    void canvas.offsetWidth;
    canvas.classList.add('hero-draw');
  }
  async function showCity(c) {
    busy = true;
    hide();
    await sleep(450);
    const d = Object.assign({}, base, {
      center: { lat: c.lat, lon: c.lon }, palette: c.palette,
      text: { place: c.place, region: '', country: c.country },
    });
    window.LocationApp.applyDesign(d);
    await waitReady();
    draw();
    post({ type: 'city', place: c.place, country: c.country, lat: c.lat, lon: c.lon, palette: c.palette, design: window.LocationApp.getDesignState() });
    busy = false;
  }
  function schedule() {
    clearTimeout(timer);
    if (!cycling) return;
    timer = setTimeout(async () => {
      if (!cycling) return;
      idx = (idx + 1) % CITIES.length;
      await showCity(CITIES[idx]);
      schedule();
    }, HOLD_MS);
  }

  async function search(q) {
    cycling = false; clearTimeout(timer);
    q = String(q || '').trim().slice(0, 120);
    if (!q) return;
    post({ type: 'searching', q });
    while (busy) await sleep(100);
    busy = true;
    const input = document.getElementById('locationSearchInput');
    const btn = document.getElementById('locationSearchBtn');
    const list = document.getElementById('locationSearchResults');
    input.value = q;
    list.innerHTML = '';
    btn.click();
    // wacht op de zoekresultaten en kies de eerste
    const t0 = Date.now();
    let first = null;
    while (Date.now() - t0 < 10000) {
      first = list.querySelector('button.location-search-result');
      const msg = list.querySelector('div.location-search-result');
      if (first) break;
      if (msg && !/Searching/.test(msg.textContent)) break;
      await sleep(120);
    }
    if (!first) { busy = false; post({ type: 'notfound', q }); return; }
    hide();
    await sleep(380);
    first.click();
    await waitReady(15000);
    draw();
    const design = window.LocationApp.getDesignState();
    post({ type: 'found', q, place: design.text.place || q, country: design.text.country || '', lat: design.center.lat, lon: design.center.lon, design });
    busy = false;
  }

  window.addEventListener('message', e => {
    const d = e.data;
    if (!d || d.source !== 'n98-home') return;
    if (d.type === 'search') search(d.q);
    if (d.type === 'resume') { cycling = true; schedule(); }
  });

  function start() {
    if (!window.LocationApp || !window.LocationApp.getDesignState) { setTimeout(start, 100); return; }
    canvas = document.getElementById('locationCanvas');
    base = window.LocationApp.getDesignState();
    base.ratioId = 'in20x28';
    base.show = { place: true, region: false, country: true, coords: true };
    base.pins = [];
    post({ type: 'ready' });
    showCity(CITIES[0]).then(schedule);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// Design handoff: shop.html#design=<base64url JSON> opens the designer with
// exactly that map (used by the homepage: the place a visitor typed in the
// hero, or a print from the gallery wall).
(function () {
  const m = /^#design=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (!m || new URLSearchParams(location.search).get('hero') === '1') return;
  let design = null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    design = JSON.parse(decodeURIComponent(escape(atob(b64 + '==='.slice((b64.length + 3) % 4)))));
  } catch (e) { return; }
  function apply() {
    if (!window.LocationApp || !window.LocationApp.applyDesign) { setTimeout(apply, 120); return; }
    setTimeout(() => {
      try { window.LocationApp.applyDesign(design); } catch (e) { /* onbekend ontwerp: gewoon de standaardkaart */ }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
