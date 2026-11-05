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

  function showApp() { authed = true; gate.hidden = true; maybeLoadOrder(); }
  function showGate() { authed = false; gate.hidden = false; mount(); }

  const sbScript = document.createElement('script');
  sbScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
  sbScript.onerror = () => { errEl.textContent = 'Could not load the login module. Check your connection and reload.'; };
  sbScript.onload = () => {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  let order = null, orderDone = false;
  try { order = decodeOrder(window.location.hash); } catch (e) { order = null; }
  function maybeLoadOrder() {
    if (!order || orderDone || !authed) return;
    let tries = 0;
    (function wait() {
      if (!(window.LocationApp && window.N98Shop)) { if (tries++ < 400) setTimeout(wait, 150); return; }
      orderDone = true;
      setTimeout(() => {
        try {
          window.LocationApp.applyDesign(order);
          const st = order.state || order;
          if (st.ratioId) window.N98Shop.selectSize(st.ratioId);
          window.N98Shop.updatePlacard();
          window.N98Shop.goTo(3, false);
          window.N98Shop.toast('Order design loaded. Export the print file as soon as the map has finished drawing.');
        } catch (e) {
          window.N98Shop.toast('Could not load the order design: ' + e.message);
        }
      }, 300);
    })();
  }
})();
