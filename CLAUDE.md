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
