// N°98 Maps: registers translations in Shopify from a JSON file in the N98com/Etsy repo.
// Only reads files from raw.githubusercontent.com/N98com/Etsy/ and only writes
// translations, shop policies, the city list and files of unpublished themes, all from that repo,
// so it is safe without a login. Uses the same app credentials as
// shopify-orders (needs read/write_translations and write_legal_policies).
// POST { url } with a file: [{ id: gid, locale: 'de', t: { key: value } }]
//   An item may name a page by handle instead of id: { page: 'oslo-map-print', locale, t, lede }
//   (lede = translation of the page metafield n98.lede).
// POST { action: 'scopes' } lists the scopes of the app.
// POST { action: 'policies', url } sets shop policies from a file: [{ type: 'REFUND_POLICY', body: html }]
// POST { action: 'policy_ids' } lists the shop policies with their ids.
// POST { action: 'shop_metafield', key: 'cities2', url } sets the shop metafield n98.<key> (json) from a file.
// POST { action: 'theme_upload', theme, url } uploads repo files [{ filename, url }] to an unpublished theme (never MAIN).
// POST { action: 'theme_check', theme, url } compares [{ filename, md5 }] with the theme.
// POST { action: 'city_langs', url } sets "langs" in page metafield n98.city for [{ handle, langs }].
const SHOP = Deno.env.get("SHOPIFY_SHOP") || "f5r3ux-ji.myshopify.com";
const API_VERSION = "2026-10";
const PREFIX = "https://raw.githubusercontent.com/N98com/Etsy/";
let token = "", tokenExp = 0;
async function shopifyToken(fresh = false) {
  if (!fresh && token && Date.now() < tokenExp - 60_000) return token;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: Deno.env.get("SHOPIFY_CLIENT_ID")!, client_secret: Deno.env.get("SHOPIFY_CLIENT_SECRET")! }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  const j = await r.json();
  token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return token;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function gql(query: string, variables: Record<string, unknown> = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await shopifyToken() },
      body: JSON.stringify({ query, variables }),
    });
    const j = await r.json().catch(() => ({ errors: [{ message: "status " + r.status }] }));
    const throttled = r.status === 429 || JSON.stringify(j.errors || "").includes("THROTTLED");
    if (throttled && attempt < 12) { await wait(2000 + attempt * 1500); continue; }
    if (!r.ok || j.errors) throw new Error(JSON.stringify(j.errors || r.status).slice(0, 400));
    const cost = j.extensions?.cost?.throttleStatus;
    if (cost && cost.currentlyAvailable < 300) await wait(Math.ceil((300 - cost.currentlyAvailable) / (cost.restoreRate || 50)) * 1000);
    return j.data;
  }
}
async function resolvePages(items: any[], errors: unknown[]) {
  const handles = [...new Set(items.filter((x) => x.page).map((x) => x.page as string))];
  const map: Record<string, { id: string; lede?: string }> = {};
  for (let i = 0; i < handles.length; i += 20) {
    const hs = handles.slice(i, i + 20);
    const q = `{ ${hs.map((h, k) => `p${k}: pages(first: 1, query: ${JSON.stringify("handle:" + h)}) { nodes { id handle metafield(namespace: "n98", key: "lede") { id } } }`).join(" ")} }`;
    const d = await gql(q);
    hs.forEach((h, k) => { const n = (d[`p${k}`]?.nodes || []).find((x: any) => x.handle === h); if (n) map[h] = { id: n.id, lede: n.metafield?.id }; else errors.push({ page: h, error: "not found" }); });
  }
  const outItems: any[] = [];
  for (const x of items) {
    if (!x.page) { outItems.push(x); continue; }
    const p = map[x.page]; if (!p) continue;
    if (x.t && Object.keys(x.t).length) outItems.push({ id: p.id, locale: x.locale, t: x.t });
    if (x.lede) { if (p.lede) outItems.push({ id: p.lede, locale: x.locale, t: { value: x.lede } }); else errors.push({ page: x.page, error: "no lede metafield" }); }
  }
  return outItems;
}
const POLICY_TYPES = ["REFUND_POLICY", "SHIPPING_POLICY", "TERMS_OF_SERVICE", "TERMS_OF_SALE", "CONTACT_INFORMATION", "LEGAL_NOTICE", "PRIVACY_POLICY"];
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === "scopes") { await shopifyToken(true); return out(await gql(`{ currentAppInstallation { accessScopes { handle } } }`)); }
    if (b.action === "policy_ids") return out(await gql(`{ shop { shopPolicies { id type title url } } }`));
    if (typeof b.url !== "string" || !b.url.startsWith(PREFIX)) return out({ error: "bad url" }, 400);
    if (b.action === "shop_metafield") {
      if (!["cities", "cities2", "cities3", "cities4"].includes(b.key)) return out({ error: "bad key" }, 400);
      const value = await (await fetch(b.url)).text();
      JSON.parse(value);
      const shop = await gql(`{ shop { id } }`);
      const d = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { id key } userErrors { field message } } }`,
        { m: [{ ownerId: shop.shop.id, namespace: "n98", key: b.key, type: "json", value }] });
      return out(d.metafieldsSet);
    }
    if (b.action === "city_langs") {
      // { url: file [{ handle, langs }] } -> sets "langs" in the page metafield n98.city (noindex in other languages)
      const list: any[] = await (await fetch(b.url)).json();
      const res: unknown[] = []; let done = 0;
      for (let i = 0; i < list.length; i += 20) {
        const hs = list.slice(i, i + 20);
        const q = `{ ${hs.map((x, k) => `p${k}: pages(first: 1, query: ${JSON.stringify("handle:" + x.handle)}) { nodes { id handle metafield(namespace: "n98", key: "city") { value } } }`).join(" ")} }`;
        const d = await gql(q);
        const m: unknown[] = [];
        hs.forEach((x, k) => {
          const n = (d[`p${k}`]?.nodes || []).find((y: any) => y.handle === x.handle);
          if (!n || !n.metafield) { res.push({ handle: x.handle, error: "not found" }); return; }
          const v = JSON.parse(n.metafield.value); v.langs = String(x.langs);
          m.push({ ownerId: n.id, namespace: "n98", key: "city", type: "json", value: JSON.stringify(v) });
        });
        if (!m.length) continue;
        const r = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { id } userErrors { field message } } }`, { m });
        done += r.metafieldsSet.metafields?.length || 0;
        if (r.metafieldsSet.userErrors.length) res.push(r.metafieldsSet.userErrors);
      }
      return out({ done, errors: res });
    }
    if (b.action === "theme_upload") {
      // { theme: numeric id, url: file [{ filename, url }] } -> themeFilesUpsert in chunks; never on the live theme
      const tid = `gid://shopify/OnlineStoreTheme/${String(b.theme).replace(/\D/g, "")}`;
      const th = await gql(`query($id: ID!) { theme(id: $id) { id role name } }`, { id: tid });
      if (!th.theme) return out({ error: "no theme" }, 400);
      if (th.theme.role === "MAIN") return out({ error: "refusing to write to the live theme" }, 400);
      const files: any[] = await (await fetch(b.url)).json();
      const res: unknown[] = [];
      for (let i = 0; i < files.length; i += 25) {
        const chunk = files.slice(i, i + 25).filter((f) => typeof f.filename === "string" && typeof f.url === "string" && f.url.startsWith(PREFIX));
        const d = await gql(`mutation($t: ID!, $f: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $t, files: $f) { upsertedThemeFiles { filename } job { id } userErrors { field message } } }`,
          { t: tid, f: chunk.map((f) => ({ filename: f.filename, body: { type: "URL", value: f.url } })) });
        res.push({ from: i, n: chunk.length, job: d.themeFilesUpsert.job?.id, errors: d.themeFilesUpsert.userErrors });
      }
      return out({ theme: th.theme.name, res });
    }
    if (b.action === "theme_check") {
      // { theme, url: file [{ filename, md5 }] } -> which files are missing or differ
      const tid = `gid://shopify/OnlineStoreTheme/${String(b.theme).replace(/\D/g, "")}`;
      const files: any[] = await (await fetch(b.url)).json();
      const bad: unknown[] = []; let ok = 0;
      for (let i = 0; i < files.length; i += 50) {
        const chunk = files.slice(i, i + 50);
        const d = await gql(`query($id: ID!, $f: [String!]) { theme(id: $id) { files(filenames: $f, first: 50) { nodes { filename checksumMd5 } } } }`, { id: tid, f: chunk.map((f) => f.filename) });
        const m: Record<string, string> = {}; for (const n of d.theme.files.nodes) m[n.filename] = n.checksumMd5;
        for (const f of chunk) { if (m[f.filename] && (!f.md5 || m[f.filename] === f.md5)) ok++; else bad.push({ f: f.filename, have: m[f.filename] || null }); }
      }
      return out({ ok, bad: bad.slice(0, 60), nbad: bad.length });
    }
    if (b.action === "policies") {
      const list: any[] = await (await fetch(b.url)).json();
      const res: unknown[] = [];
      for (const p of list) {
        if (!POLICY_TYPES.includes(p.type) || typeof p.body !== "string") { res.push({ type: p.type, error: "bad item" }); continue; }
        const d = await gql(`mutation($p: ShopPolicyInput!) { shopPolicyUpdate(shopPolicy: $p) { shopPolicy { id type url } userErrors { field message } } }`, { p: { type: p.type, body: p.body } });
        res.push(d.shopPolicyUpdate);
      }
      return out(res);
    }
    const errors: unknown[] = []; let done = 0;
    const items: any[] = await resolvePages(await (await fetch(b.url)).json(), errors);
    for (let i = 0; i < items.length; i += 5) {
      const chunk = items.slice(i, i + 5);
      const ids = [...new Set(chunk.map((x) => x.id))];
      const q = `{ ${ids.map((id, k) => `r${k}: translatableResource(resourceId: ${JSON.stringify(id)}) { translatableContent { key digest } }`).join(" ")} }`;
      const d = await gql(q);
      const dig: Record<string, Record<string, string>> = {};
      ids.forEach((id, k) => { dig[id] = {}; for (const c of (d[`r${k}`] || { translatableContent: [] }).translatableContent) dig[id][c.key] = c.digest; });
      const vars: Record<string, unknown> = {}; const parts: string[] = []; const defs: string[] = [];
      chunk.forEach((x, k) => {
        const tr = Object.entries(x.t).filter(([key]) => dig[x.id][key]).map(([key, value]) => ({ locale: x.locale, key, value, translatableContentDigest: dig[x.id][key] }));
        const missing = Object.keys(x.t).filter((key) => !dig[x.id][key]);
        if (missing.length) errors.push({ id: x.id, missing });
        if (!tr.length) return;
        defs.push(`$r${k}: ID!, $t${k}: [TranslationInput!]!`);
        parts.push(`a${k}: translationsRegister(resourceId: $r${k}, translations: $t${k}) { userErrors { field message } }`);
        vars[`r${k}`] = x.id; vars[`t${k}`] = tr;
      });
      if (!parts.length) continue;
      const m = await gql(`mutation(${defs.join(", ")}) { ${parts.join(" ")} }`, vars);
      for (const [k, v] of Object.entries(m)) { const ue = (v as any).userErrors; if (ue.length) errors.push({ k, ue }); else done++; }
    }
    return out({ items: items.length, done, errors });
  } catch (e) {
    return out({ error: (e as Error).message }, 500);
  }
});
