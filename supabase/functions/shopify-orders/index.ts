// N°98 Maps: Shopify orders for the Studio (n98com.github.io/Etsy/).
// The Studio is a public static site, so it can never hold a Shopify key.
// This function holds it (as Supabase secrets) and only answers to the
// logged-in Studio owner.
//
// Secrets: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (Dev Dashboard app,
// client credentials grant), optional SHOPIFY_SHOP and ORDERS_ALLOWED_EMAILS.
//
// GET  ?view=open|all        -> { orders: [...] }
// POST { action: "mark", id } -> adds tag "print-file-ready" (needs write_orders)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHOP = Deno.env.get("SHOPIFY_SHOP") || "f5r3ux-ji.myshopify.com";
const API_VERSION = "2026-10";
const ALLOWED = (Deno.env.get("ORDERS_ALLOWED_EMAILS") || "bramengbers@hotmail.nl")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ORIGINS = ["https://n98com.github.io", "http://127.0.0.1:8765", "http://localhost:8765"];
const READY_TAG = "print-file-ready";

function cors(req: Request) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

let token = "", tokenExp = 0;
async function shopifyToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const id = Deno.env.get("SHOPIFY_CLIENT_ID"), secret = Deno.env.get("SHOPIFY_CLIENT_SECRET");
  if (!id || !secret) throw new Error("Shopify app credentials are not set yet.");
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!r.ok) throw new Error(`Shopify token request failed (${r.status}).`);
  const j = await r.json();
  token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return token;
}
async function gql(query: string, variables: Record<string, unknown> = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await shopifyToken() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("Shopify: " + JSON.stringify(j.errors || r.status).slice(0, 300));
  return j.data;
}

const ADDR_FULL = "shippingAddress { name company address1 address2 zip city province country countryCodeV2 phone }";
const ADDR_MIN = "shippingAddress { city countryCodeV2 }";
const ordersQuery = (addr: string) => `query($q: String) {
  orders(first: 50, reverse: true, sortKey: CREATED_AT, query: $q) {
    nodes {
      id name createdAt tags displayFinancialStatus displayFulfillmentStatus
      ${addr}
      lineItems(first: 25) { nodes { title variantTitle quantity sku customAttributes { key value } } }
    }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  try {
    const auth = req.headers.get("Authorization") || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user || !ALLOWED.includes((user.email || "").toLowerCase())) return json(req, { error: "Not allowed." }, 403);

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.action === "mark" && typeof b.id === "string" && b.id.startsWith("gid://shopify/Order/")) {
        // Per kaart een label "print-file-1", "print-file-2", … en zodra alle
        // kaarten van de bestelling klaar zijn ook "print-file-ready".
        const part = Math.max(1, Math.min(99, parseInt(b.part, 10) || 1));
        const total = Math.max(part, Math.min(99, parseInt(b.total, 10) || 1));
        const cur = await gql(`query($id: ID!) { order(id: $id) { tags } }`, { id: b.id });
        const tags = new Set<string>((cur.order && cur.order.tags) || []);
        tags.add(`print-file-${part}`);
        const add = [`print-file-${part}`];
        let done = true;
        for (let i = 1; i <= total; i++) if (!tags.has(`print-file-${i}`)) done = false;
        if (done) add.push(READY_TAG);
        const d = await gql(`mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`, { id: b.id, tags: add });
        const errs = d.tagsAdd.userErrors;
        if (errs.length) return json(req, { error: errs[0].message }, 400);
        return json(req, { ok: true, ready: done });
      }
      return json(req, { error: "Unknown action." }, 400);
    }

    const view = new URL(req.url).searchParams.get("view") || "open";
    // Alle betaalde orders ophalen en zelf filteren: "unfulfilled" in de
    // zoekfilter mist orders met status IN_PROGRESS / ON_HOLD e.d.
    // Volledig adres vraagt "protected customer data" op de app; zonder die
    // toestemming vallen we terug op stad + land.
    let d: any, addressHidden = false;
    try { d = await gql(ordersQuery(ADDR_FULL), { q: "financial_status:paid" }); }
    catch (_e) { addressHidden = true; d = await gql(ordersQuery(ADDR_MIN), { q: "financial_status:paid" }); }
    const nodes = d.orders.nodes.filter((o: any) => view === "all" || !["FULFILLED", "RESTOCKED"].includes(o.displayFulfillmentStatus));
    const orders: any[] = [];
    for (const o of nodes) {
      const sa = o.shippingAddress || {};
      const address = [
        sa.name, sa.company, sa.address1, sa.address2,
        [sa.zip, sa.city].filter(Boolean).join(" "), sa.province, sa.country || sa.countryCodeV2,
      ].filter((x: any) => x && String(x).trim());
      const tags = new Set<string>(o.tags || []);
      // Elke kaart apart: een regel met aantal 2 wordt (1) en (2).
      const maps: any[] = [];
      for (const li of o.lineItems.nodes) {
        const a: Record<string, string> = {};
        for (const c of li.customAttributes || []) a[c.key] = c.value;
        let design = null;
        try { design = a["_Design JSON"] ? JSON.parse(a["_Design JSON"]) : null; } catch { design = null; }
        if (!(design || a["_Print file"] || /map/i.test(li.title || ""))) continue;
        const [vSize, vFrame] = String(li.variantTitle || "").split(" / ");
        for (let q = 0; q < (li.quantity || 1); q++) {
          maps.push({
            location: a["Location"] || "", coordinates: a["Coordinates"] || "",
            size: a["Size"] || vSize || "", frame: (a["Frame"] || vFrame || "No frame").replace(/\s*\(.*\)$/, ""),
            palette: a["Palette"] || "", text: a["Title"] || "", subtitle: a["Subtitle"] || "", pins: a["Pins"] || "",
            design,
          });
        }
      }
      maps.forEach((m, i) => {
        orders.push({
          id: o.id, name: o.name, part: i + 1, total: maps.length,
          label: maps.length > 1 ? `${o.name} (${i + 1})` : o.name,
          createdAt: o.createdAt, fulfillment: o.displayFulfillmentStatus,
          ready: tags.has(READY_TAG) || tags.has(`print-file-${i + 1}`),
          address, phone: sa.phone || "", addressHidden,
          ...m,
        });
      });
    }
    return json(req, { orders });
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
});
