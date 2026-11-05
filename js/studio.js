// N°98 Maps Studio: shop.html?studio=1 (n98com.github.io/Etsy/ stuurt hierheen).
// Zelfde tool als in Shopify, maar achter de Supabase-login van de werkbank,
// met "Export print file" in stap IV (zie STUDIO in shop.js). Opent ook
// ontwerpen uit een Shopify-bestelling: …/Etsy/#order=<base64url>.
(() => {
  const qs = new URLSearchParams(window.location.search);
  if (window.parent !== window || qs.get('studio') !== '1') return;

  const SUPABASE_URL = 'https://tzhzyprycgpnhxkmexkh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aHp5cHJ5Y2dwbmh4a21leGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjU4MzEsImV4cCI6MjEwNDA0MTgzMX0.mSwdD5jAq87upgzMMvCmaf194yClDkStuNNlGe0Vm6E';

  document.title = 'Workbench · N°98 Maps';
  function brand() {
    const sub = document.querySelector('.shop-logo-sub');
    if (sub) sub.textContent = 'WORKBENCH';
    const logo = document.querySelector('.shop-logo');
    if (logo) logo.setAttribute('aria-label', 'N°98 Workbench');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brand); else brand();
  let authed = false;
  let sbClient = null;

  // ---- login-scherm ----
  const gate = document.createElement('div');
  gate.className = 'studio-gate';
  gate.innerHTML = `
    <form class="studio-card" autocomplete="on">
      <p class="studio-eyebrow">N°98 Maps</p>
      <h1>Workbench</h1>
      <p class="studio-hint">Log in to design and export print files.</p>
      <label>Email<input type="email" name="email" required autocomplete="username"></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
      <p class="studio-error" role="alert"></p>
      <button type="submit">Log in</button>
    </form>`;
  const css = document.createElement('style');
  css.textContent = `
    .studio-gate { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 20px; background: #F4F1EB; }
    .studio-gate[hidden] { display: none; }
    .studio-card { width: min(100%, 360px); display: flex; flex-direction: column; gap: 14px; }
    .studio-eyebrow { margin: 0; font: 400 11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .28em; text-transform: uppercase; color: #5E594F; }
    .studio-card h1 { margin: 0; font: 300 56px/1 'Cormorant Garamond', Georgia, serif; color: #141414; }
    .studio-hint { margin: 0 0 8px; color: #47433C; font-size: 15px; }
    .studio-card label { display: flex; flex-direction: column; gap: 6px; font: 400 10.5px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .22em; text-transform: uppercase; color: #5E594F; }
    .studio-card input { font: 16px system-ui, sans-serif; padding: 12px 14px; border: 1px solid #B9B0A1; background: #FBFAF7; color: #141414; border-radius: 0; letter-spacing: 0; text-transform: none; }
    .studio-card input:focus { outline: 1px solid #141414; outline-offset: 0; }
    .studio-error { margin: 0; min-height: 1.2em; color: #9A2E1F; font-size: 14px; }
    .studio-card button { min-height: 52px; border: 0; background: #1E3529; color: #F4F1EB; font: 500 11px system-ui, sans-serif; letter-spacing: .26em; text-transform: uppercase; cursor: pointer; }
    .studio-card button:disabled { opacity: .6; }
    .studio-logout { position: fixed; left: 12px; bottom: 12px; z-index: 50; border: 1px solid #DDD6CA; background: #F4F1EB; color: #47433C; font: 400 10px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; padding: 8px 10px; cursor: pointer; }
    html.is-studio .buy-amount { font-size: clamp(22px, 2.4vw, 28px); white-space: nowrap; }`;
  document.head.appendChild(css);
  function mount() { if (!gate.isConnected) document.body.appendChild(gate); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  const form = gate.querySelector('form');
  const errEl = gate.querySelector('.studio-error');
  const submit = gate.querySelector('button');

  function showApp() { authed = true; gate.hidden = true; maybeLoadOrder(); ordersBtn.hidden = false; refreshOrders(false); }
  function showGate() { authed = false; gate.hidden = false; ordersBtn.hidden = true; ordersPanel.hidden = true; mount(); }

  const sbScript = document.createElement('script');
  sbScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  sbScript.onerror = () => { errEl.textContent = 'Could not load the login module. Check your connection and reload.'; };
  sbScript.onload = () => {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sbClient = sb;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.textContent = '';
      submit.disabled = true; submit.textContent = 'Working…';
      const { error } = await sb.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
      submit.disabled = false; submit.textContent = 'Log in';
      if (error) { errEl.textContent = error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : 'Login failed: ' + error.message; return; }
      form.password.value = '';
    });
    const out = document.createElement('button');
    out.type = 'button'; out.className = 'studio-logout'; out.textContent = 'Log out';
    out.addEventListener('click', () => sb.auth.signOut());
    (document.body ? Promise.resolve() : new Promise(r => document.addEventListener('DOMContentLoaded', r))).then(() => document.body.appendChild(out));
    sb.auth.onAuthStateChange((_e, session) => { session ? showApp() : showGate(); });
    sb.auth.getSession().then(({ data }) => { (data && data.session) ? showApp() : showGate(); });
  };
  document.head.appendChild(sbScript);

  // ---- ontwerp uit een bestel-link ----
  function decodeOrder(text) {
    const m = /#order=([A-Za-z0-9_-]+)/.exec(text || '');
    if (!m) return null;
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const FRAME_IDS = { 'black': 'black', 'white': 'white', 'natural oak': 'natural', 'dark wood': 'darkwood' };
  function whenShopReady(fn) {
    let tries = 0;
    (function wait() {
      if (!(window.LocationApp && window.N98Shop)) { if (tries++ < 400) setTimeout(wait, 150); return; }
      setTimeout(fn, 300);
    })();
  }
  function loadDesign(design, frameLabel, note) {
    whenShopReady(() => {
      try {
        window.LocationApp.applyDesign(design);
        const st = design.state || design;
        if (st.ratioId) window.N98Shop.selectSize(st.ratioId);
        const fl = String(frameLabel || '').replace(/\s*\(.*\)$/, '').trim().toLowerCase();
        window.N98Shop.selectFrame(FRAME_IDS[fl] || 'none');
        window.N98Shop.updatePlacard();
        window.N98Shop.goTo(3, false);
        window.N98Shop.toast(note || 'Order design loaded. Export the print file as soon as the map has finished drawing.');
      } catch (e) {
        window.N98Shop.toast('Could not load the order design: ' + e.message);
      }
    });
  }

  // ---- ontwerp uit een bestel-link ----
  let order = null, orderDone = false;
  try { order = decodeOrder(window.location.hash); } catch (e) { order = null; }
  function maybeLoadOrder() {
    if (!order || orderDone || !authed) return;
    orderDone = true;
    loadDesign(order);
  }

  // ---- Orders uit Shopify (via de Supabase-functie shopify-orders) ----
  const FN_URL = SUPABASE_URL + '/functions/v1/shopify-orders';
  let current = null; // { orderId, name } van het geladen ontwerp
  let orders = [];
  const ordersBtn = document.createElement('button');
  ordersBtn.type = 'button'; ordersBtn.className = 'studio-orders-btn'; ordersBtn.hidden = true;
  ordersBtn.innerHTML = 'Orders <span class="studio-badge" hidden></span>';
  const ordersPanel = document.createElement('aside');
  ordersPanel.className = 'studio-orders'; ordersPanel.hidden = true;
  ordersPanel.setAttribute('aria-label', 'Orders');
  ordersPanel.innerHTML = `
    <div class="studio-orders__head">
      <div><p class="studio-eyebrow">N°98 Workbench</p><h2>Orders</h2></div>
      <button type="button" class="studio-x" aria-label="Close">×</button>
    </div>
    <div class="studio-orders__tabs" role="tablist">
      <button type="button" data-view="open" aria-pressed="true">To print</button>
      <button type="button" data-view="all" aria-pressed="false">All paid</button>
      <button type="button" class="studio-refresh">Refresh</button>
    </div>
    <div class="studio-orders__list" aria-live="polite"></div>`;
  let view = 'open';
  function mountOrders() { document.body.append(ordersBtn, ordersPanel); }
  if (document.body) mountOrders(); else document.addEventListener('DOMContentLoaded', mountOrders);
  ordersBtn.addEventListener('click', () => { ordersPanel.hidden = !ordersPanel.hidden; if (!ordersPanel.hidden) refreshOrders(true); });
  ordersPanel.querySelector('.studio-x').addEventListener('click', () => { ordersPanel.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') ordersPanel.hidden = true; });
  ordersPanel.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    view = b.dataset.view;
    ordersPanel.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    refreshOrders(true);
  }));
  ordersPanel.querySelector('.studio-refresh').addEventListener('click', () => refreshOrders(true));
  const listEl = ordersPanel.querySelector('.studio-orders__list');

  async function api(path, opts) {
    const { data } = await sbClient.auth.getSession();
    const tok = data && data.session && data.session.access_token;
    if (!tok) throw new Error('Please log in again.');
    const r = await fetch(FN_URL + (path || ''), Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + tok, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, (opts && opts.headers) || {}),
    }));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || j.message || ('Request failed (' + r.status + ')'));
    return j;
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function setBadge() {
    const n = orders.filter(o => !o.ready).length;
    const b = ordersBtn.querySelector('.studio-badge');
    b.hidden = !(view === 'open' && n); b.textContent = n;
  }
  function render() {
    if (!orders.length) {
      listEl.innerHTML = `<p class="studio-empty">${view === 'open' ? 'Nothing to print right now.' : 'No paid orders yet.'}</p>`;
      return;
    }
    listEl.innerHTML = orders.map((o, oi) => `
      <article class="studio-order${o.ready ? ' is-ready' : ''}">
        <header><b>${esc(o.name)}</b><span>${esc(fmtDate(o.createdAt))}</span></header>
        <p class="studio-ship">${esc(o.shipTo)}${o.ready ? ' · <em>print file made</em>' : ''}</p>
        ${o.items.map((it, ii) => `
          <div class="studio-item">
            <div class="studio-item__txt">
              <strong>${esc(it.text || it.location || 'Custom map')}</strong>
              <span>${esc([it.size, it.frame, it.palette].filter(Boolean).join(' · ') || it.variant || '')}</span>
              ${it.pins && it.pins !== 'None' ? `<span>Pins: ${esc(it.pins)}</span>` : ''}
              ${it.quantity > 1 ? `<span>Quantity: ${it.quantity}</span>` : ''}
            </div>
            ${it.design ? `<button type="button" data-o="${oi}" data-i="${ii}">Load</button>` : '<span class="studio-nodesign">No design attached</span>'}
          </div>`).join('')}
      </article>`).join('');
  }
  listEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-o]');
    if (!b) return;
    const o = orders[+b.dataset.o], it = o.items[+b.dataset.i];
    current = { orderId: o.id, name: o.name };
    ordersPanel.hidden = true;
    loadDesign(it.design, it.frame, o.name + ' loaded' + (it.frame && it.frame !== 'No frame' ? ' (' + it.frame.replace(/\s*\(.*\)$/, '') + ' frame in Gelato)' : '') + '. Export as soon as the map has finished drawing.');
  });
  async function refreshOrders(showLoading) {
    if (!sbClient || !authed) return;
    if (showLoading) listEl.innerHTML = '<p class="studio-empty">Loading orders…</p>';
    try {
      const j = await api('?view=' + view);
      orders = j.orders || [];
      render(); setBadge();
    } catch (e) {
      listEl.innerHTML = `<p class="studio-empty">Could not load orders: ${esc(e.message)}</p>`;
    }
  }
  window.addEventListener('n98:exported', async () => {
    if (!current) return;
    const c = current;
    try {
      await api('', { method: 'POST', body: JSON.stringify({ action: 'mark', id: c.orderId }) });
      const o = orders.find(x => x.id === c.orderId); if (o) o.ready = true;
      render(); setBadge();
    } catch (e) { /* tag is optional (needs write_orders) */ }
  });

  css.textContent += `
    .studio-orders-btn { position: fixed; left: 12px; bottom: 52px; z-index: 50; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #141414; background: #141414; color: #F4F1EB; font: 400 10.5px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; padding: 10px 12px; cursor: pointer; }
    .studio-orders-btn[hidden] { display: none; }
    .studio-badge { min-width: 18px; height: 18px; border-radius: 9px; background: #C9A96E; color: #141414; font-size: 10px; letter-spacing: 0; display: inline-grid; place-items: center; padding: 0 5px; }
    .studio-badge[hidden] { display: none; }
    .studio-orders { position: fixed; top: 0; left: 0; bottom: 0; z-index: 9000; width: min(92vw, 420px); background: #F4F1EB; border-right: 1px solid #DDD6CA; box-shadow: 30px 0 60px -30px rgba(20,20,20,.35); display: flex; flex-direction: column; }
    .studio-orders[hidden] { display: none; }
    .studio-orders__head { display: flex; justify-content: space-between; align-items: flex-start; padding: 22px 22px 14px; border-bottom: 1px solid #DDD6CA; }
    .studio-orders__head h2 { margin: 6px 0 0; font: 300 40px/1 'Cormorant Garamond', Georgia, serif; color: #141414; }
    .studio-x { border: 0; background: none; font-size: 28px; line-height: 1; cursor: pointer; color: #141414; }
    .studio-orders__tabs { display: flex; gap: 6px; padding: 12px 22px; border-bottom: 1px solid #DDD6CA; }
    .studio-orders__tabs button { border: 1px solid #DDD6CA; background: transparent; color: #47433C; font: 400 10px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; padding: 8px 10px; cursor: pointer; }
    .studio-orders__tabs button[aria-pressed="true"] { background: #141414; border-color: #141414; color: #F4F1EB; }
    .studio-orders__tabs .studio-refresh { margin-left: auto; }
    .studio-orders__list { overflow-y: auto; padding: 8px 22px 30px; }
    .studio-empty { color: #5E594F; font-size: 15px; padding: 18px 0; }
    .studio-order { padding: 16px 0; border-bottom: 1px solid #DDD6CA; }
    .studio-order header { display: flex; justify-content: space-between; align-items: baseline; }
    .studio-order header b { font: 400 22px 'Cormorant Garamond', Georgia, serif; color: #141414; }
    .studio-order header span, .studio-ship { font: 400 10.5px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .08em; color: #5E594F; }
    .studio-ship { margin: 4px 0 8px; }
    .studio-ship em { color: #1E3529; font-style: normal; }
    .studio-order.is-ready header b { color: #5E594F; }
    .studio-item { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 8px 0; }
    .studio-item__txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .studio-item__txt strong { font: 400 17px 'Cormorant Garamond', Georgia, serif; color: #141414; }
    .studio-item__txt span { font-size: 13px; color: #47433C; }
    .studio-item button { flex: none; border: 0; background: #1E3529; color: #F4F1EB; font: 500 10px system-ui, sans-serif; letter-spacing: .22em; text-transform: uppercase; padding: 11px 14px; cursor: pointer; }
    .studio-item button:disabled { opacity: .4; cursor: default; }
    .studio-nodesign { flex: none; max-width: 110px; text-align: right; font: 400 10px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: .08em; color: #9A2E1F; }`;
})();
