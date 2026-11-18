/*!
 * N°98 Maps designer. Copyright (c) 2026 N°98. All rights reserved.
 * This code is not licensed for use, copying or embedding outside n98maps.com.
 */
// Runs before everything else in shop.html. The designer only works:
// - embedded in the N°98 Maps shop (n98maps.com, its Shopify domains and the theme editor),
// - as the Studio (?studio=1, behind a login) and for renders (?render=1) on n98com.github.io,
// - locally for development.
// Anyone who embeds or hosts it elsewhere gets a short notice with a link to the shop.
(function () {
  var SHOP = 'https://n98maps.com/products/design-your-map';
  var HOSTS = ['n98com.github.io', 'localhost', '127.0.0.1'];
  var PARENTS = [/^(www\.)?n98maps\.com$/, /^f5r3ux-ji\.myshopify\.com$/, /\.shopifypreview\.com$/, /^admin\.shopify\.com$/, /^(.+\.)?shopify\.com$/, /^localhost$/, /^127\.0\.0\.1$/];
  var q = location.search;
  function stop() {
    document.documentElement.innerHTML = '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>N°98 Maps</title></head>' +
      '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F1EB;color:#141414;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">' +
      '<div><p style="font:600 28px Georgia,serif;margin:0 0 8px">N°98 Maps</p><p style="margin:0 0 18px">This map designer is only available on n98maps.com.</p>' +
      '<a href="' + SHOP + '" target="_top" style="color:#1E3529">Design your map on n98maps.com</a></div></body>';
    throw new Error('N°98 Maps: not allowed here');
  }
  if (HOSTS.indexOf(location.hostname) < 0) stop();
  var framed = window.parent !== window;
  if (framed) {
    var parent = '';
    try { if (location.ancestorOrigins && location.ancestorOrigins.length) parent = new URL(location.ancestorOrigins[location.ancestorOrigins.length - 1]).hostname; } catch (e) {}
    if (!parent) { try { if (document.referrer) parent = new URL(document.referrer).hostname; } catch (e) {} }
    // no origin known (some browsers hide it): allow, so the real shop never breaks
    if (parent && !PARENTS.some(function (r) { return r.test(parent); })) stop();
    return;
  }
  // opened directly: only the Studio, renders and development; everyone else goes to the shop
  if (/[?&](studio|render|dev)=1\b/.test(q) || location.hostname !== 'n98com.github.io') return;
  location.replace(SHOP + (location.hash || ''));
})();
