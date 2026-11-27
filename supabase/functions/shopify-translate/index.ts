// N°98 Maps: registers translations in Shopify from a JSON file in the N98com/Etsy repo.
// Only reads files from raw.githubusercontent.com/N98com/Etsy/ and only writes
// translations, shop policies, the city list, new pages and files of unpublished themes, all from that repo,
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
// POST { action: 'city_notes', url, dry? } puts map notes per city into page bodies and translations.
// POST { action: 'pages_create', url } creates the pages of a file [{ title, handle, body, isPublished, templateSuffix, metafields }]
//   that do not exist yet (existing handles are skipped).
// POST { action: 'pages_publish', url, publish? } publishes (or with publish: false hides) the pages [{ handle }] of a file.
// POST { action: 'eu_shipping', type?: "PAGE", after?, dry? } rewrites "free shipping in Europe, the UK ..."
//   to "the EU" (fixed rules, every language) in pages (title, body, SEO title and description) and their translations, 25 per call.
// POST { action: 'no_uk', type?: PAGE|ARTICLE|PRODUCT|COLLECTION|other, after?, dry? } removes the UK from shipping texts
//   (rules of tools/no_uk/rules.json) the same way; other types are only reported (dry) for changing by hand.
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

const EU_RULES: [RegExp, string][] = [
  [/\b(?:the )?Europe(?=, (?:the )?UK)/g, "the EU"],
  [/Europa(?=, (?:het )?(?:VK|Verenigd))/g, "de EU"],
  [/\bin Europa, nach Großbritannien/g, "in der EU, nach Großbritannien"],
  [/innerhalb Europas, nach/g, "innerhalb der EU, nach"],
  [/\bnach Europa, Großbritannien/g, "in die EU, nach Großbritannien"],
  [/\bNach Europa, Großbritannien/g, "In die EU, nach Großbritannien"],
  [/\bin Europa, UK und USA/g, "in der EU, UK und USA"],
  [/\ben Europe, au Royaume/g, "dans l’UE, au Royaume"],
  [/\bEn Europe, au Royaume/g, "Dans l’UE, au Royaume"],
  [/\b(i|inom|till|Till) Europa(?=, Storbritannien)/g, "$1 EU"],
  [/\b(i|innenfor|til|Til) Europa(?=, Storbritannia)/g, "$1 EU"],
];
const UK_RULES: [string, string][] = [[", the UK and the US", " and the US"], [", the UK &amp; the US", " &amp; the US"], [", the UK & the US", " & the US"], [", UK and US", " and US"], [", the United Kingdom and the United States", " and the United States"], [", the United Kingdom, the United States", ", the United States"], ["EU and UK consumer law", "EU consumer law"], [", het VK en de VS", " en de VS"], [", VK en VS", " en VS"], [", het Verenigd Koninkrijk en de Verenigde Staten", " en de Verenigde Staten"], [", het Verenigd Koninkrijk, de Verenigde Staten", ", de Verenigde Staten"], [", nach Großbritannien und in die USA", " und in die USA"], [", nach Großbritannien und in die Vereinigten Staaten", " und in die Vereinigten Staaten"], [", nach Großbritannien, in die Vereinigten Staaten", ", in die Vereinigten Staaten"], [", ins Vereinigte Königreich und in die Vereinigten Staaten", " und in die Vereinigten Staaten"], [", UK und USA", " und USA"], ["der EU und des Vereinigten Königreichs", "der EU"], [", au Royaume-Uni et aux États-Unis", " et aux États-Unis"], [", au Royaume-Uni, aux États-Unis", ", aux États-Unis"], ["de l’UE et du Royaume-Uni", "de l’UE"], [", Storbritannien och USA", " och USA"], [", Storbritannien, USA", ", USA"], ["i EU och Storbritannien", "i EU"], [", Storbritannia og USA", " og USA"], [", Storbritannia, USA", ", USA"], ["i EU og Storbritannia", "i EU"], [", Wielkiej Brytanii i USA", " i USA"], [", Wielkiej Brytanii i Stanów Zjednoczonych", " i Stanów Zjednoczonych"], [", Wielkiej Brytanii, Stanów Zjednoczonych", ", Stanów Zjednoczonych"], ["UE i Wielkiej Brytanii", "UE"], [", Regno Unito e Stati Uniti", " e Stati Uniti"], [", il Regno Unito e gli Stati Uniti", " e gli Stati Uniti"], [", nel Regno Unito e negli Stati Uniti", " e negli Stati Uniti"], [", nel Regno Unito, negli Stati Uniti", ", negli Stati Uniti"], ["dell’UE e del Regno Unito", "dell’UE"], [", het Verenigd Koninkrijk en de VS", " en de VS"], [", in Großbritannien und in den USA", " und in den USA"], [", Großbritannien und in die USA", " und in die USA"], [", Regno Unito e USA", " e USA"], ["Versand in der EU und in die USA", "Versand in die EU und in die USA"], ["Versand innerhalb der EU und in die USA", "Versand in die EU und in die USA"], ["Versand in Europa und in die USA", "Versand nach Europa und in die USA"], ["Versand innerhalb der EU und in die Vereinigten Staaten", "Versand in die EU und in die Vereinigten Staaten"], ["Versand in der EU und in die Vereinigten Staaten", "Versand in die EU und in die Vereinigten Staaten"]];
const ukFix = (v: string) => UK_RULES.reduce((s, [a, b]) => s.split(a).join(b), v);
const euFix = (v: string) => EU_RULES.reduce((s, [a, b]) => s.replace(a, b), v);
const LOCALES = ["nl", "de", "fr", "sv", "nb", "pl", "it"];
async function euShipping(b: any, fix: (v: string) => string = euFix) {
  const type = b.type || "PAGE";
  const tq = LOCALES.map((l) => `${l}: translations(locale: "${l}") { key value }`).join(" ");
  const d = await gql(`query($a: String) { translatableResources(resourceType: ${type}, first: 25, after: $a) { pageInfo { hasNextPage endCursor } nodes { resourceId translatableContent { key value digest } ${tq} } } }`, { a: b.after || null });
  const conn = d.translatableResources; const changes: any[] = []; const errors: unknown[] = [];
  for (const n of conn.nodes) {
    const src: Record<string, any> = {}; for (const c of n.translatableContent) src[c.key] = c;
    const changed = new Set<string>(); const dig: Record<string, string> = {};
    for (const c of n.translatableContent) dig[c.key] = c.digest;
    const pageInput: Record<string, string> = {}; const mfs: any[] = [];
    for (const c of n.translatableContent) {
      if (!c.value || fix(c.value) === c.value) continue;
      const nv = fix(c.value); changes.push({ id: n.resourceId, locale: "en", key: c.key, from: c.value, to: nv }); changed.add(c.key);
      if (!["PAGE", "ARTICLE", "PRODUCT", "COLLECTION"].includes(type)) { errors.push({ id: n.resourceId, key: c.key, error: "source not supported, change it by hand" }); continue; }
      if (c.key === "body_html") pageInput[type === "PRODUCT" || type === "COLLECTION" ? "descriptionHtml" : "body"] = nv;
      else if (c.key === "summary_html" && type === "ARTICLE") pageInput.summary = nv;
      else if (c.key === "title") pageInput.title = nv;
      else if (c.key === "meta_description") mfs.push({ ownerId: n.resourceId, namespace: "global", key: "description_tag", type: "single_line_text_field", value: nv });
      else if (c.key === "meta_title") mfs.push({ ownerId: n.resourceId, namespace: "global", key: "title_tag", type: "single_line_text_field", value: nv });
      else errors.push({ id: n.resourceId, key: c.key, error: "unknown key, not changed" });
    }
    if (!b.dry && (mfs.length || Object.keys(pageInput).length)) {
      if (mfs.length) { const m = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`, { m: mfs }); if (m.metafieldsSet.userErrors.length) errors.push({ id: n.resourceId, ue: m.metafieldsSet.userErrors }); }
      if (Object.keys(pageInput).length) {
        let ue: any[] = [];
        if (type === "PAGE") ue = (await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { userErrors { field message } } }`, { id: n.resourceId, p: pageInput })).pageUpdate.userErrors;
        else if (type === "ARTICLE") ue = (await gql(`mutation($id: ID!, $p: ArticleUpdateInput!) { articleUpdate(id: $id, article: $p) { userErrors { field message } } }`, { id: n.resourceId, p: pageInput })).articleUpdate.userErrors;
        else if (type === "PRODUCT") ue = (await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { field message } } }`, { p: { id: n.resourceId, ...pageInput } })).productUpdate.userErrors;
        else if (type === "COLLECTION") ue = (await gql(`mutation($p: CollectionInput!) { collectionUpdate(input: $p) { userErrors { field message } } }`, { p: { id: n.resourceId, ...pageInput } })).collectionUpdate.userErrors;
        if (ue.length) errors.push({ id: n.resourceId, ue });
      }
      const r = await gql(`query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key digest } } }`, { id: n.resourceId });
      for (const c of r.translatableResource.translatableContent) dig[c.key] = c.digest;
    }
    const tr: any[] = [];
    for (const l of LOCALES) for (const t of (n[l] || [])) {
      if (!t.value || !src[t.key]) continue;
      const nv = fix(t.value);
      if (nv === t.value && !changed.has(t.key)) continue;
      if (nv !== t.value) changes.push({ id: n.resourceId, locale: l, key: t.key, from: t.value, to: nv });
      tr.push({ locale: l, key: t.key, value: nv, translatableContentDigest: dig[t.key] });
    }
    if (tr.length && !b.dry) {
      const m = await gql(`mutation($r: ID!, $t: [TranslationInput!]!) { translationsRegister(resourceId: $r, translations: $t) { userErrors { field message } } }`, { r: n.resourceId, t: tr });
      if (m.translationsRegister.userErrors.length) errors.push({ id: n.resourceId, ue: m.translationsRegister.userErrors });
    }
  }
  return { next: conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null, scanned: conn.nodes.length, changes: changes.length, sample: changes.slice(0, 6), errors };
}
// city_notes: file [{ handle, notes: { en: html, nl: html, ... } }] -> puts the block in a <div class="n98-notes">
// before the last paragraph of the page body (English source and each translation), replacing an earlier block.
const NOTE_RE = /<div class="n98-notes">[\s\S]*?<\/div>\n?/g;
function putNotes(html: string, block: string) {
  const clean = html.replace(NOTE_RE, "");
  const wrapped = `<div class="n98-notes">\n${block}\n</div>\n`;
  const i = clean.lastIndexOf("<p>");
  return i < 0 ? clean + "\n" + wrapped : clean.slice(0, i) + wrapped + clean.slice(i);
}
async function cityNotes(b: any) {
  const from = Number(b.from) || 0;
  const list: any[] = ((await (await fetch(b.url)).json()) as any[]).slice(from, from + (Number(b.n) || 10));
  const tq = LOCALES.map((l) => `${l}: translations(locale: "${l}") { key value }`).join(" ");
  const res: any[] = []; const errors: unknown[] = [];
  for (const it of list) {
    const d = await gql(`query($q: String!) { pages(first: 1, query: $q) { nodes { id handle body } } }`, { q: "handle:" + it.handle });
    const pg = (d.pages.nodes || []).find((x: any) => x.handle === it.handle);
    if (!pg) { errors.push({ handle: it.handle, error: "not found" }); continue; }
    const r0 = await gql(`query($id: ID!) { translatableResource(resourceId: $id) { ${tq} } }`, { id: pg.id });
    const tr0 = r0.translatableResource;
    const n = it.notes || {};
    let enChanged = false;
    if (n.en) {
      const nb = putNotes(pg.body, n.en);
      if (nb !== pg.body) {
        enChanged = true;
        if (!b.dry) { const m = await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { userErrors { field message } } }`, { id: pg.id, p: { body: nb } }); if (m.pageUpdate.userErrors.length) errors.push({ handle: it.handle, ue: m.pageUpdate.userErrors }); }
      }
    }
    let dig = "";
    const r1 = await gql(`query($id: ID!) { translatableResource(resourceId: $id) { translatableContent { key digest } } }`, { id: pg.id });
    for (const c of r1.translatableResource.translatableContent) if (c.key === "body_html") dig = c.digest;
    const tr: any[] = []; const done: string[] = enChanged ? ["en"] : [];
    for (const l of LOCALES) {
      const cur = (tr0[l] || []).find((t: any) => t.key === "body_html");
      if (!cur || !cur.value) { if (n[l]) errors.push({ handle: it.handle, locale: l, error: "no translated body" }); continue; }
      const nv = n[l] ? putNotes(cur.value, n[l]) : cur.value;
      if (nv !== cur.value || enChanged) { tr.push({ locale: l, key: "body_html", value: nv, translatableContentDigest: dig }); if (nv !== cur.value) done.push(l); }
    }
    if (tr.length && !b.dry) {
      const m = await gql(`mutation($r: ID!, $t: [TranslationInput!]!) { translationsRegister(resourceId: $r, translations: $t) { userErrors { field message } } }`, { r: pg.id, t: tr });
      if (m.translationsRegister.userErrors.length) errors.push({ handle: it.handle, ue: m.translationsRegister.userErrors });
    }
    res.push({ h: it.handle, done });
  }
  return { n: res.length, res, errors, sample: b.dry && list[0] ? putNotes("<h2>x</h2>\n<p>a</p>\n<p>last</p>", list[0].notes.en || "") : undefined };
}
const POLICY_TYPES = ["REFUND_POLICY", "SHIPPING_POLICY", "TERMS_OF_SERVICE", "TERMS_OF_SALE", "CONTACT_INFORMATION", "LEGAL_NOTICE", "PRIVACY_POLICY"];
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === "scopes") { await shopifyToken(true); return out(await gql(`{ currentAppInstallation { accessScopes { handle } } }`)); }
    if (b.action === "policy_ids") return out(await gql(`{ shop { shopPolicies { id type title url } } }`));
    if (b.action === "eu_shipping") return out(await euShipping(b));
    if (b.action === "no_uk") return out(await euShipping(b, ukFix));
    if (typeof b.url !== "string" || !b.url.startsWith(PREFIX)) return out({ error: "bad url" }, 400);
    if (b.action === "city_notes") return out(await cityNotes(b));
    if (b.action === "shop_metafield") {
      if (typeof b.key !== "string" || !/^cities\d*$/.test(b.key)) return out({ error: "bad key" }, 400);
      const value = await (await fetch(b.url)).text();
      JSON.parse(value);
      const shop = await gql(`{ shop { id } }`);
      const d = await gql(`mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { metafields { id key } userErrors { field message } } }`,
        { m: [{ ownerId: shop.shop.id, namespace: "n98", key: b.key, type: "json", value }] });
      return out(d.metafieldsSet);
    }
    if (b.action === "pages_create" || b.action === "pages_publish") {
      const list: any[] = await (await fetch(b.url)).json();
      const res: unknown[] = []; let done = 0;
      for (let i = 0; i < list.length; i += 10) {
        const hs = list.slice(i, i + 10);
        const q = `{ ${hs.map((x, k) => `p${k}: pages(first: 1, query: ${JSON.stringify("handle:" + x.handle)}) { nodes { id handle } }`).join(" ")} }`;
        const d = await gql(q);
        for (let k = 0; k < hs.length; k++) {
          const x = hs[k]; const n = (d[`p${k}`]?.nodes || []).find((y: any) => y.handle === x.handle);
          if (b.action === "pages_publish") {
            if (!n) { res.push({ handle: x.handle, error: "not found" }); continue; }
            const m = await gql(`mutation($id: ID!, $p: PageUpdateInput!) { pageUpdate(id: $id, page: $p) { userErrors { field message } } }`, { id: n.id, p: { isPublished: b.publish !== false } });
            if (m.pageUpdate.userErrors.length) res.push({ handle: x.handle, ue: m.pageUpdate.userErrors }); else done++;
            continue;
          }
          if (n) { res.push({ handle: x.handle, skipped: "exists" }); continue; }
          const page = { title: x.title, handle: x.handle, body: x.body, isPublished: !!x.isPublished, templateSuffix: x.templateSuffix, metafields: x.metafields };
          const m = await gql(`mutation($p: PageCreateInput!) { pageCreate(page: $p) { page { id } userErrors { field message } } }`, { p: page });
          if (m.pageCreate.userErrors.length) res.push({ handle: x.handle, ue: m.pageCreate.userErrors }); else done++;
        }
      }
      return out({ n: list.length, done, res });
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
