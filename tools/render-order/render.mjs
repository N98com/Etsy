// N°98 Maps — automatic print files.
//
// Runs on GitHub Actions (.github/workflows/render-order.yml) when Shopify
// Flow reports a new paid order. For every map in the order it:
//   1. opens the shop's own map engine (shop.html) in headless Chrome,
//   2. loads the customer's exact design (the "_Design JSON" property),
//   3. renders the print file at the exact Gelato size at 300 dpi +50% pixels (PNG),
//   4. uploads it to Cloudflare R2 under an unguessable path,
// and then emails one message with the download link(s) and the shipping
// details. If a render fails, the email still goes out — with the one-tap
// "_Print file" link so the file can be made by hand.
//
// Privacy: the order payload holds customer details. NEVER log them — this
// repository's Action logs are public. Only order numbers and sizes are logged.
//
// Env: ORDER_PAYLOAD (JSON) · SITE_URL (where shop.html is served)
//      R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_BASE
//      GMAIL_USER GMAIL_APP_PASSWORD MAIL_TO
//      DRY_RUN=1 → write files to ./out and print the email instead (local tests)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const env = process.env;
const DRY = env.DRY_RUN === '1';
const SITE_URL = (env.SITE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = path.resolve('out');
fs.mkdirSync(OUT, { recursive: true });

const payload = JSON.parse(env.ORDER_PAYLOAD || '{}');
const orderName = String(payload.order_name || payload.orderName || 'order').trim();
const safeOrder = orderName.replace(/[^A-Za-z0-9-]+/g, '') || 'order';

function attrsOf(item) {
  const out = {};
  for (const a of item.attrs || item.customAttributes || []) out[a.key || a.name] = a.value;
  return out;
}

function slug(s) {
  return String(s || 'map').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
}

function fmtBytes(n) {
  return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB';
}

async function renderOne(browser, design) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('pageerror', e => console.log('  page error:', e.message));
  await page.goto(`${SITE_URL}/shop.html?render=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LocationApp && typeof window.LocationApp.renderPrintFile === 'function', null, { timeout: 60000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.evaluate(d => window.LocationApp.applyDesign(d), design);
  if (env.TEST_FORCE_READY === '1') { // local tests only: map data can't load offline
    await page.evaluate(() => { document.getElementById('locationExportPNGBtn').disabled = false; });
  }
  // map data for exactly this area (streets, water, buildings) must be in
  await page.waitForFunction(() => window.LocationApp.isDataReady(), null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(800);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 900000 }),
    page.evaluate(async () => {
      const r = await window.LocationApp.renderPrintFile();
      window.__printInfo = { w: r.w, h: r.h, sizeId: r.sizeId, dpi: r.dpi || 300 };
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'print.png';
      document.body.appendChild(a); a.click(); a.remove();
    }),
  ]);
  const info = await page.evaluate(() => window.__printInfo);
  const tmp = path.join(OUT, crypto.randomBytes(6).toString('hex') + '.png');
  await download.saveAs(tmp);
  await page.close();
  return { file: tmp, ...info };
}

async function upload(file, key) {
  if (DRY) return `file://${file}`;
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  await s3.send(new PutObjectCommand({
    Bucket: env.R2_BUCKET, Key: key, Body: fs.createReadStream(file),
    ContentLength: fs.statSync(file).size, ContentType: 'image/png',
    ContentDisposition: `attachment; filename="${path.basename(key)}"`,
  }));
  return `${env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function buildEmail(results) {
  const sh = payload.shipping || {};
  const addrLines = [
    sh.name, sh.company, sh.address1, sh.address2,
    [sh.zip, sh.city].filter(Boolean).join(' '), sh.province, sh.country,
  ].filter(x => x && String(x).trim());
  const ok = results.filter(r => r.url).length;
  const subject = `Print ${orderName}: ${ok}/${results.length} file${results.length === 1 ? '' : 's'} ready`
    + (ok < results.length ? ' (action needed)' : '');

  const itemsHtml = results.map((r, i) => `
    <tr><td style="padding:14px 0;border-top:1px solid #DDD6CA">
      <div style="font:600 15px Georgia,serif">${i + 1}. ${esc(r.location || 'Custom map')}${r.quantity > 1 ? ` &times; ${r.quantity}` : ''}</div>
      <div style="color:#47433C;font-size:13px;margin:4px 0 10px">${esc(r.size)}${r.palette ? ' · ' + esc(r.palette) : ''}${r.title ? ' · “' + esc(r.title) + '”' : ''}${r.pins ? ' · pins: ' + esc(r.pins) : ''}</div>
      ${r.url
        ? `<a href="${esc(r.url)}" style="display:inline-block;background:#1F3A2B;color:#F4F1EB;padding:10px 16px;text-decoration:none;font-size:13px;letter-spacing:.08em">DOWNLOAD PRINT FILE</a>
           <div style="color:#47433C;font-size:12px;margin-top:6px">${r.w}×${r.h}px @${r.dpi || 300}dpi · ${fmtBytes(r.bytes)} · PNG</div>`
        : `<div style="color:#9A2E1F;font-size:13px">Automatic render failed (${esc(r.error)}). Make it by hand:
           <a href="${esc(r.printLink)}">open this design in MapGen2.0</a> → Export PNG.</div>`}
    </td></tr>`).join('');

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#141414;max-width:620px">
    <div style="font:12px monospace;letter-spacing:.2em;color:#47433C">N°98 MAPS · NEW ORDER</div>
    <h1 style="font:400 28px Georgia,serif;margin:8px 0 18px">Order ${esc(orderName)}</h1>
    <table style="width:100%;border-collapse:collapse">${itemsHtml}</table>
    <h2 style="font:400 18px Georgia,serif;margin:26px 0 8px">Ship to</h2>
    <div style="font-size:14px;line-height:1.6">${addrLines.map(esc).join('<br>') || 'n/a'}</div>
    <div style="font-size:13px;color:#47433C;margin-top:10px">
      ${payload.email ? 'Email: ' + esc(payload.email) + '<br>' : ''}
      ${(sh.phone || payload.phone) ? 'Phone: ' + esc(sh.phone || payload.phone) + '<br>' : ''}
      ${payload.shipping_method ? 'Shipping: ' + esc(payload.shipping_method) + '<br>' : ''}
      ${payload.note ? 'Note from customer: ' + esc(payload.note) : ''}
    </div>
    <p style="font-size:12px;color:#47433C;margin-top:26px">Download links are private (unguessable), so don't forward them publicly.</p>
  </div>`;

  const text = [
    `Order ${orderName}`, '',
    ...results.map((r, i) => `${i + 1}. ${r.location || 'Custom map'}, ${r.size}${r.quantity > 1 ? ' x' + r.quantity : ''}\n   ${r.url ? r.url : 'Render failed: ' + r.error + '\n   Make by hand: ' + r.printLink}`),
    '', 'Ship to:', ...addrLines,
    payload.email ? 'Email: ' + payload.email : '', (sh.phone || payload.phone) ? 'Phone: ' + (sh.phone || payload.phone) : '',
    payload.note ? 'Note: ' + payload.note : '',
  ].filter(x => x !== '').join('\n');
  return { subject, html, text };
}

async function sendMail(mail) {
  if (DRY) { fs.writeFileSync(path.join(OUT, 'email.html'), mail.html); console.log(mail.subject + '\n' + mail.text); return; }
  const nodemailer = (await import('nodemailer')).default;
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD } });
  await t.sendMail({ from: `N°98 Maps orders <${env.GMAIL_USER}>`, to: env.MAIL_TO || env.GMAIL_USER, subject: mail.subject, text: mail.text, html: mail.html });
}

async function main() {
  const items = (payload.items || []).map(it => ({ it, a: attrsOf(it) })).filter(x => x.a['_Design JSON'] || x.a['_Print file']);
  console.log(`Order ${orderName}: ${items.length} map(s) to render`);
  const results = [];
  let browser = null;
  try {
    browser = await chromium.launch({ channel: env.CHROME_PATH ? undefined : 'chrome', executablePath: env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [i, { it, a }] of items.entries()) {
      const base = {
        location: a.Location, size: [a.Size || it.variant || it.variantTitle || it.sku, a.Frame && a.Frame !== 'No frame' ? 'Frame: ' + a.Frame : ''].filter(Boolean).join(' · '), palette: a.Palette,
        title: a.Title, pins: a.Pins, quantity: it.quantity || 1, printLink: a['_Print file'] || '',
      };
      try {
        const design = JSON.parse(a['_Design JSON']);
        const t0 = Date.now();
        const r = await renderOne(browser, design);
        const bytes = fs.statSync(r.file).size;
        const key = `orders/${safeOrder}-${crypto.randomBytes(12).toString('hex')}/N98-${safeOrder}-${i + 1}-${slug(a.Location || a.Title)}-${r.sizeId.replace(/@.*/, '')}.png`;
        const url = await upload(r.file, key);
        console.log(`  map ${i + 1}: ${r.w}x${r.h}px, ${fmtBytes(bytes)}, ${((Date.now() - t0) / 1000).toFixed(0)}s — uploaded`);
        results.push({ ...base, url, w: r.w, h: r.h, dpi: r.dpi, bytes });
      } catch (e) {
        console.log(`  map ${i + 1}: FAILED — ${e.message.split('\n')[0]}`);
        results.push({ ...base, error: e.message.split('\n')[0].slice(0, 160) });
      }
    }
  } catch (e) {
    console.log('Browser failed:', e.message.split('\n')[0]);
    for (const { it, a } of items.slice(results.length)) {
      results.push({ location: a.Location, size: a.Size || it.sku, quantity: it.quantity || 1, printLink: a['_Print file'] || '', error: 'browser could not start' });
    }
  } finally {
    if (browser) await browser.close();
  }
  if (!items.length) { console.log('No custom maps in this order — no email.'); return; }
  await sendMail(buildEmail(results));
  console.log('Email sent.');
  if (results.some(r => !r.url)) process.exitCode = 1; // marks the run red, so GitHub also warns you
}

main().catch(e => { console.log('Fatal:', e.message); process.exit(1); });
