# N°98 Maps: working notes

- The map tool exists once: `shop.html` + `js/shop.js` (+ location.js, mapRender.js, …).
  - Shopify embeds it as `shop.html?embed=1&frames=1…` (step IV: Add to cart).
  - GitHub Studio: `n98com.github.io/Etsy/` → `index.html` redirects to `shop.html?studio=1`
    (login via `js/studio.js`, step IV: Export print file at the exact Gelato size, 300 dpi).
  - Every change to the Shopify tool therefore lands in the Studio automatically. Keep it that way:
    never fork the tool into a second copy; add mode differences behind `STUDIO` / `inIframe` in shop.js.
- Order links `…/Etsy/#order=<base64url>` open the design in the Studio at step IV.
- The old full workbench lives at `workbench.html`.
- Bump the `?v=` query on changed js/css files in shop.html (GitHub Pages caching).
- Copy written for Bram: never use dashes (— or –) as punctuation.
- Languages: English is the source. Theme sections with fixed text live in `shopify/src/`; run
  `python3 tools/i18n/build.py` to build `shopify/sections|snippets` with every language
  (translations in `tools/i18n/<lang>.json`, `--missing` lists gaps). Locale keys for `| t`
  (city pages, header) are in `tools/i18n/locale.<lang>.json`, merged into `shopify/locales/`.
  Text stored in theme settings (announcement bar, 404, cart title, ...) is translated per theme:
  after duplicating a theme run `python3 tools/i18n/theme_content.py <new_theme_id>` and send the
  printed mutation (translationsRegister) via the Shopify connector.
  The designer translates itself at runtime with `js/i18n.js` (`?lang=xx`, set by the configurator).
- City pages: list of all cities = shop metafield `n98.cities` (json), map per page = page metafield `n98.city`.
- Roadmap (Studio button top right): Supabase project `tzhzyprycgpnhxkmexkh`, table `public.roadmap_items`
  (title, done, done_at, position). Read it with `select * from roadmap_items order by done, position`;
  tick an item off with `update roadmap_items set done = true, done_at = now() where id = …` once Bram and
  Claude have actually finished it. Check this list when finishing work.
- Shop policies (refund, shipping, terms) live in `tools/legal/` (English source + nl/de/fr/sv/nb);
  `python3 tools/legal/build.py` checks and writes `tools/legal/out/policies.json` + `shopify-en.json`.
  Push, then POST {action:'policies', url:<raw shopify-en.json>} to the Supabase function shopify-translate
  (the app has write_legal_policies); translations: POST {url:<raw tools/i18n/shopify/policies-tr.json>}
  (items {id: ShopPolicy gid, locale, t:{body}}). Policy ids: POST {action:'policy_ids'}.
