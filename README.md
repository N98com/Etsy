# Art Generator

Een lokale, standalone tool (geen server, geen build-stap, geen dependencies)
om generatieve kunst te produceren voor digitale/print-Etsy-listings.

## Gebruiken

Open `index.html` direct in de browser, of serveer de map lokaal:

```
python3 -m http.server 8000
```

en ga naar `http://localhost:8000`.

## Workflow

1. **Kies een algoritme** — Strange Attractor, Phyllotaxis, Voronoi of
   Harmonograaf — en een kleurstelling die aansluit bij een interieurstijl
   met zoekvolume (boho, japandi, scandi mono, etc.).
2. **Nieuwe variant** genereert een contactvel van N ontwerpen (standaard 24),
   elk met een eigen seed. Dezelfde seed geeft altijd exact hetzelfde
   ontwerp terug — dat is de kern van reproduceerbaarheid en personalisatie.
3. **Markeer favorieten** met de ster op een tegel. Ruwweg 95% is lelijk of
   saai (bij de strange attractor soms letterlijk leeg — sommige
   parametercombinaties vallen terug op een simpele baan). Dat filteren is
   het eigenlijke werk.
4. **Klik een tegel** voor een groot voorbeeld, kies een exportformaat
   (A4/A3/A2/A1 op 300dpi, of een vierkante patroontegel) en exporteer als
   SVG (aanbevolen voor phyllotaxis/voronoi/harmonograaf — oneindig
   schaalbaar) of PNG (nodig voor de attractor, en handig voor mockups).
5. **Triptiek-bouwer**: verzamel drie favorieten uit dezelfde
   algoritme/palet-familie en exporteer ze als set — verkoopt beter dan
   losse prints.
6. **Personaliseren op seed**: vul een datum, naam en/of coördinaten in en
   krijg een deterministische seed terug. "Jouw trouwdatum als attractor" —
   volledig reproduceerbaar, en dus geschikt voor made-to-order.

## Na de export

Doe de laatste 20% (kleurfinetuning, subtiele texturen, mockup-compositie)
in Photoshop/Affinity. De SVG's zijn oneindig schaalbaar; de PNG's van de
attractor zijn al op de gekozen printresolutie gerenderd.

## Techniek in het kort

- `js/rng.js` — deterministische seeded RNG (mulberry32) + string→seed hash
  voor personalisatie.
- `js/painters.js` — één tekeninterface (`CanvasPainter`/`SVGPainter`) zodat
  contactvel-thumbnails en print-SVG's exact dezelfde tekencode gebruiken.
- `js/geom.js` — Voronoi-cellen via halfvlak-clipping (geen Fortune's
  algoritme nodig), met optionele toroidale 3×3-tiling voor naadloos
  betegelbare patronen (licentieerbaar aan andere makers).
- `js/algorithms.js` — de vier generatoren; elk is een pure
  `seed → params → tekening`-pijplijn.
- `js/export.js` — printformaat-presets (cm → px op basis van dpi) en de
  export-pijplijn.

Alles draait clientside; favorieten worden in `localStorage` bewaard.
