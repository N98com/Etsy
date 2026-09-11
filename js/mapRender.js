// Tekent de daadwerkelijke kaart-kunst: een geo-bounding-box + opgehaalde
// OSM-data + een kleurstelling wordt één samenhangende afbeelding, inclusief
// het onderschrift (plaatsnaam/land/coördinaten) als onderdeel van dezelfde
// tekening — dus het staat mee in de geëxporteerde SVG/PNG, niet als losse
// HTML-laag erbovenop.
const MapRender = (() => {
  // Arabische tekst herkennen in de daadwerkelijke onderschrift-tekst (i.p.v.
  // te vertrouwen op hoe hij ooit is opgehaald) — dekt zowel een Arabische
  // zoekopdracht (location.js) als een handmatig ingetypte Arabische
  // plaats-/landnaam-override. Nodig omdat: (1) letter-spacing de
  // verbonden Arabische lettervormen stuk maakt, en (2) links uitgelijnde
  // layouts (Stamp/Ledger) voor Arabisch beter vanaf rechts lezen.
  const RTL_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  function isRTLText(s) { return RTL_RE.test(s || ''); }
  // Single quotes rond de familienaam (i.p.v. dubbele) — SVGPainter.text zet
  // fontFamily binnen een dubbel-aangehaald font-family="..."-attribuut;
  // dubbele quotes zouden dat attribuut voortijdig afsluiten.
  function captionFontFamily(rtl) { return rtl ? "'Amiri', Georgia, serif" : 'Georgia, serif'; }

  // Hoeveel van de canvas-hoogte het onderschrift in beslag neemt, puur
  // gebaseerd op welke regels aan staan — staat alles uit, dan vult de kaart
  // het hele vlak.
  function captionLayout(h, caption) {
    const { showPlace, showCountry, showCoords } = caption;
    const cityH = showPlace ? h * 0.075 : 0;
    const countryH = showCountry ? h * 0.032 : 0;
    const coordH = showCoords ? h * 0.026 : 0;
    const anyShown = showPlace || showCountry || showCoords;
    const gap = anyShown ? h * 0.03 : 0;
    const padBottom = anyShown ? h * 0.035 : 0;
    const total = gap + cityH + countryH + coordH + padBottom;
    return { total, cityH, countryH, coordH, gap, padBottom };
  }

  // Nagebootste terreinlijnen voor "GTA V" — dezelfde marching-squares-
  // over-ruis-techniek als de Contourlijnen-algoritme in Playground, maar
  // hier puur decoratief (geen echte hoogtedata; GTA V's eigen kaart is ook
  // artistiek getekend, niet een letterlijke hoogtekaart). Seed komt uit de
  // bounding box, dus dezelfde locatie geeft altijd hetzelfde "reliëf".
  function drawTerrainContours(painter, w, h, bounds, color) {
    const seed = RNG.seedFromString(`${bounds.south},${bounds.west},${bounds.north},${bounds.east}`);
    const noise2D = Utils.makeNoise2D(seed, 48);
    const n = 46;
    const grid = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        grid[j * (n + 1) + i] = Utils.fractalNoise2D(noise2D, (i / n) * 3.2, (j / n) * 3.2, 3);
      }
    }
    const cellW = w / n, cellH = h / n;
    const strokeWidth = Math.max(w, h) * 0.0012;
    const levels = 9;
    for (let lvl = 0; lvl < levels; lvl++) {
      const level = (lvl + 1) / (levels + 1);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const tl = grid[j * (n + 1) + i], tr = grid[j * (n + 1) + i + 1];
          const br = grid[(j + 1) * (n + 1) + i + 1], bl = grid[(j + 1) * (n + 1) + i];
          const x0 = i * cellW, y0 = j * cellH, x1 = x0 + cellW, y1 = y0 + cellH;
          Geom.marchingSquaresCell(tl, tr, br, bl, level, x0, y0, x1, y1)
            .forEach(seg => painter.polyline(seg, { stroke: color, strokeWidth, fill: 'none' }));
        }
      }
    }
  }

  // Vlakgevulde, blokkerige ruistextuur in twee groentinten voor de omgeving
  // van "OG MW2" — een gegenereerd, legaal alternatief voor de getinte
  // luchtfoto-achtergrond van de originele minimap (zie ook de toelichting
  // bij MW2_STYLE_PALETTE: geen echte satellietbeelden, wel hetzelfde gevoel).
  function drawCamoTerrain(painter, w, h, bounds, colorLight, colorDark) {
    const seed = RNG.seedFromString(`mw2-${bounds.south},${bounds.west},${bounds.north},${bounds.east}`);
    const noise2D = Utils.makeNoise2D(seed, 40);
    const cols = 30, rows = Math.max(1, Math.round(cols * (h / w)));
    const cellW = w / cols, cellH = h / rows;
    const light = Utils.hexToRgb(colorLight), dark = Utils.hexToRgb(colorDark);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const t = Math.max(0, Math.min(1, Utils.fractalNoise2D(noise2D, (i / cols) * 4.5, (j / rows) * 4.5, 3)));
        const r = Math.round(dark.r + (light.r - dark.r) * t);
        const g = Math.round(dark.g + (light.g - dark.g) * t);
        const b = Math.round(dark.b + (light.b - dark.b) * t);
        const x0 = i * cellW, y0 = j * cellH;
        painter.polygon([[x0, y0], [x0 + cellW, y0], [x0 + cellW, y0 + cellH], [x0, y0 + cellH]], { fill: `rgb(${r},${g},${b})` });
      }
    }
  }

  function lightenColor(hex, amount) {
    const { r, g, b } = Utils.hexToRgb(hex);
    const mix = c => Math.round(c + (255 - c) * amount);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  }

  // Zachte gloed rond een geïsoleerde vorm: een paar steeds transparantere,
  // steeds bredere lijnen in de kleur van het gebied zelf, getekend VOOR de
  // clip (dus zichtbaar buiten de rand) — geeft de kust/grens een licht
  // "oplichtend" randje op de effen achtergrond, zoals bij een uitgesneden
  // sticker.
  function drawIsolateHalo(painter, rings, color, baseWidth) {
    const steps = [{ w: baseWidth * 7, o: 0.05 }, { w: baseWidth * 4.5, o: 0.09 }, { w: baseWidth * 2.5, o: 0.14 }, { w: baseWidth * 1.2, o: 0.22 }];
    rings.forEach(ring => {
      steps.forEach(({ w: sw, o }) => {
        painter.polygon(ring, { stroke: color, strokeWidth: sw, fill: 'none', opacity: o });
      });
    });
  }

  // "Masks" — knipt de kaart binnen zijn eigen kader (mapW x mapH) tot een
  // vaste vorm i.p.v. de volle rechthoek, met de matkleur zichtbaar
  // eromheen — puur decoratief, los van isoleren/uitlichten (die knippen op
  // een echte geo-grens, niet op een vaste vorm). Elke vorm staat als een
  // lijst punten in een neutrale eenheidsruimte en wordt daarna uniform
  // geschaald + gecentreerd, zodat hij nooit uitgerekt raakt op een
  // niet-vierkant formaat.
  function fitAndCenterRing(basePoints, mapW, mapH, marginFactor) {
    const xs = basePoints.map(p => p[0]), ys = basePoints.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const bboxW = maxX - minX, bboxH = maxY - minY;
    const scale = Math.min((mapW * marginFactor) / bboxW, (mapH * marginFactor) / bboxH);
    const cx = mapW / 2, cy = mapH / 2;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    return basePoints.map(([x, y]) => [cx + (x - midX) * scale, cy + (y - midY) * scale]);
  }

  function circleBasePoints() {
    return Array.from({ length: 80 }, (_, i) => {
      const a = (i / 80) * Math.PI * 2;
      return [Math.cos(a), Math.sin(a)];
    });
  }

  // Standaard parametrische hartkromme (x = 16 sin^3 t) — y omgekeerd zodat
  // de punt van het hart onderaan komt te staan, zoals gebruikelijk.
  function heartBasePoints() {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push([x, y]);
    }
    return pts;
  }

  function diamondBasePoints() {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]];
  }

  function hexagonBasePoints() {
    return Array.from({ length: 6 }, (_, i) => {
      const a = ((-90 + i * 60) * Math.PI) / 180;
      return [Math.cos(a), Math.sin(a)];
    });
  }

  // Rechthoek met een halfronde bovenkant — een deuropening/grafsteenvorm.
  function archBasePoints() {
    const pts = [[-1, 1], [-1, -0.2]];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - (i / 24) * Math.PI;
      pts.push([Math.cos(a), -0.2 - Math.sin(a)]);
    }
    pts.push([1, 1]);
    return pts;
  }

  // Organisch "wolk"-silhouet — een cirkel licht vervormd met een paar
  // samengestelde sinusgolven, met een deterministische fase op basis van
  // de bounding box, zodat elke locatie een net iets andere, maar
  // reproduceerbare, vorm krijgt.
  function bloomBasePoints(seedStr) {
    const rand = RNG.rngFor(RNG.seedFromString(seedStr || 'bloom'));
    const phase1 = rand() * Math.PI * 2, phase2 = rand() * Math.PI * 2, phase3 = rand() * Math.PI * 2;
    return Array.from({ length: 100 }, (_, i) => {
      const a = (i / 100) * Math.PI * 2;
      const r = 1 + 0.14 * Math.sin(a * 3 + phase1) + 0.09 * Math.sin(a * 5 + phase2) + 0.05 * Math.sin(a * 7 + phase3);
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
  }

  const MASK_SHAPE_BUILDERS = {
    circle: circleBasePoints,
    heart: heartBasePoints,
    diamond: diamondBasePoints,
    hexagon: hexagonBasePoints,
    arch: archBasePoints,
    bloom: bloomBasePoints,
  };

  function buildMaskRing(maskId, mapW, mapH, seedStr) {
    const builder = MASK_SHAPE_BUILDERS[maskId];
    if (!builder) return null;
    const margin = maskId === 'heart' ? 0.82 : maskId === 'diamond' ? 0.92 : 0.86;
    return fitAndCenterRing(builder(seedStr), mapW, mapH, margin);
  }

  // Klassieke "kaart-pin" contour — een rond kopje op een punt, zoals bij
  // Google Maps. (x, y) is de punt zelf (de exacte locatie); r is de straal
  // van het ronde kopje. De twee raaklijnen van de punt naar de cirkel
  // bepalen waar de rechte zijkanten overgaan in de boog: driehoeksmeetkunde
  // op de rechthoekige driehoek punt-middelpunt-raakpunt (de raaklijn staat
  // loodrecht op de straal in het raakpunt).
  function pinOutlinePoints(x, y, r) {
    const centerDist = r * 1.7;
    const alpha = Math.acos(r / centerDist);
    const centerX = x, centerY = y - centerDist;
    const tipAngle = Math.PI / 2; // richting middelpunt -> punt (recht naar beneden)
    const a1 = tipAngle - alpha;
    const sweep = Math.PI * 2 - 2 * alpha; // de lange boog, niet de kant die naar de punt wijst
    const steps = 28;
    const pts = [[x, y]];
    for (let i = 0; i <= steps; i++) {
      const a = a1 - (i / steps) * sweep;
      pts.push([centerX + r * Math.cos(a), centerY + r * Math.sin(a)]);
    }
    return { pts, centerX, centerY };
  }

  function drawPin(painter, x, y, r, color, holeColor) {
    const { pts, centerX, centerY } = pinOutlinePoints(x, y, r);
    painter.polygon(pts, { fill: color });
    painter.circle(centerX, centerY, r * 0.38, { fill: holeColor });
  }

  function render(painter, w, h, opts) {
    const {
      bounds, streets = [], buildings = [],
      caption = {}, gtaStyle = false, mw2Style = false, rdr2Style = false, tier = null, isolate = null, highlight = null,
      layout: layoutId = 'default', mask: maskId = null, pins = [], pinColor = null,
    } = opts;
    const palette = gtaStyle ? GTA_STYLE_PALETTE : mw2Style ? MW2_STYLE_PALETTE : rdr2Style ? RDR2_STYLE_PALETTE : opts.palette;
    const matColor = gtaStyle ? '#0a0a0a' : mw2Style ? '#0d100a' : rdr2Style ? '#c7b688' : (opts.matColor || '#f7f4ee');
    const captionInk = gtaStyle ? '#ececec' : mw2Style ? '#ddd6bd' : rdr2Style ? '#3a2f22' : '#2a2620';
    const captionSub = gtaStyle ? '#a8a8a8' : mw2Style ? '#a39c81' : rdr2Style ? '#5c4d38' : '#6b6156';
    const captionFaint = gtaStyle ? '#828282' : mw2Style ? '#847d66' : rdr2Style ? '#6b5c45' : '#8a8074';

    painter.setBackground(matColor);

    // "Default" en "Gallery" reserveren onderin een effen mat voor het
    // onderschrift (de kaart wordt er dus kleiner voor). De andere layouts
    // laten de kaart de hele afbeelding vullen ("full bleed") en tekenen het
    // onderschrift er als losse laag overheen — zie de tekencode helemaal
    // onderaan render().
    const fullBleed = layoutId === 'fade' || layoutId === 'stamp' || layoutId === 'ledger'
      || layoutId === 'seal' || layoutId === 'headline' || layoutId === 'quiet';
    const layout = captionLayout(h, caption);
    const mapH = fullBleed ? h : h - layout.total;
    const mapW = w;
    // "Crown" is Default op zijn kop: de mat staat BOVEN de kaart i.p.v.
    // eronder. Alle kaart-tekencode hieronder gaat uit van een kaart die bij
    // y=0 begint — in plaats van dat overal handmatig te verleggen, wordt dat
    // hele blok zo meteen in een translate(0, mapY) gewrapt (zie
    // beginTranslate/endTranslate in painters.js), zodat pins/isoleren/
    // uitlichten/masks/terreinlagen ongewijzigd kunnen blijven en gewoon
    // "denken" dat de kaart bij (0,0) begint.
    const mapY = layoutId === 'crown' ? layout.total : 0;

    const project = isolate
      ? MapGeo.makeContainProjector(bounds, mapW, mapH)
      : MapGeo.makeCoverProjector(bounds, mapW, mapH);

    // "Highlight area" tekent de kaart één keer als een losse laag, en
    // componeert die daarna twee keer overheen (scherp binnen de ring,
    // écht wazig — een Gaussian blur, geen doorzichtige waslaag — erbuiten).
    // Zie MapPainter.beginLayer/drawLayer. Isoleren gaat hier altijd voor.
    const highlighting = !!(highlight && !isolate);
    // "Masks" knippen tot een vaste vorm i.p.v. de volle rechthoek — ook
    // hier gaat isoleren (een echte geo-grens) altijd voor.
    const masking = !!(maskId && maskId !== 'none' && !isolate);

    // Alles tot en met de uitlicht-compositie hieronder tekent in "lokale"
    // kaart-coördinaten (0,0 = linkerbovenhoek van de kaart) — deze translate
    // verlegt dat blok als geheel naar (0, mapY), zonder dat elke afzonderlijke
    // tekenfunctie (pins, isoleren, masks, terreinlagen, drawLayer-compositie)
    // daar zelf iets van hoeft te weten. Bij mapY=0 (alle bestaande layouts)
    // is dit een no-op.
    painter.beginTranslate(0, mapY);
    let projectedRings = null;
    if (isolate) {
      projectedRings = isolate.rings.map(ring => ring.map(([lat, lon]) => project(lat, lon)));
      if (mw2Style) {
        // De "getinte luchtfoto"-omgeving van de originele minimap, hier
        // procedureel gegenereerd (zie drawCamoTerrain) i.p.v. echte
        // satellietbeelden.
        drawCamoTerrain(painter, mapW, mapH, bounds, palette.outer, palette.outerDark);
        drawIsolateHalo(painter, projectedRings, palette.bg, Math.max(w, h) * 0.0015);
      } else {
        // Een geïsoleerd stuk land ligt in het echt in water — de omgeving
        // met de eigen waterkleur van het palet vullen (i.p.v. een neutrale
        // vlakke kleur) laat het als een echte kust/oceaan-overgang ogen,
        // met een lichte "ondiep water"-gloed vlak langs de kust.
        painter.polygon([[0, 0], [mapW, 0], [mapW, mapH], [0, mapH]], { fill: palette.water });
        drawIsolateHalo(painter, projectedRings, lightenColor(palette.water, 0.4), Math.max(w, h) * 0.0018);
      }
      painter.beginClipPath(projectedRings);
    } else {
      if (highlighting) painter.beginLayer();
      if (masking) {
        const seedStr = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
        painter.beginClipPath([buildMaskRing(maskId, mapW, mapH, seedStr)]);
      } else {
        painter.beginClip(0, 0, mapW, mapH);
      }
    }
    drawMapBackground(painter, palette, mapW, mapH);

    if (gtaStyle) {
      drawTerrainContours(painter, mapW, mapH, bounds, '#242424');
    } else if (rdr2Style) {
      // RDR2 tekent altijd een zacht reliëf/hillshade-gevoel, ongeacht
      // schaal, zoals de originele perkament-kaart — geen echte hoogtedata,
      // puur decoratief. (Continent-schaal kreeg deze textuur vroeger ook,
      // toen daar nog geen echte data voor was — zie ProtomapsFetch's
      // pickZoomForBounds, dat inmiddels ook een heel land/continent van
      // echte (grof gezoomde) straten/water voorziet.)
      drawTerrainContours(painter, mapW, mapH, bounds, palette.roadMinor);
    } else if (!mw2Style) {
      // Groen/parken (alleen in het gewone kleurenschema — Game Styles houden
      // het bij land/water/wegen/gebouwen, net als hun games zelf).
      streets
        .filter(s => s.tags.leisure === 'park' || s.tags.landuse === 'forest' || s.tags.landuse === 'grass')
        .forEach(s => painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), { fill: palette.park }));
    }

    // Een dunne "coastline"-rand (waar het palet er een opgeeft) houdt land
    // en water altijd duidelijk gescheiden, ook bij kleine/smalle meren.
    // Grote wateroppervlaktes (baaien/sonten/zeearmen) staan in OSM vaak als
    // multipolygon-relatie i.p.v. één simpele way — die komen hier binnen
    // als "rings" (meerdere ringen, evenodd) i.p.v. "coords" (één ring) en
    // worden met de multi-ring tekenprimitief getekend, anders blijven ze
    // onzichtbaar en lijkt de zee simpelweg te ontbreken.
    const coastlineWidth = palette.coastline ? Math.max(1.5, Math.min(mapW, mapH) * 0.005) : undefined;
    streets
      .filter(s => s.tags.natural === 'water' || s.tags.natural === 'bay')
      .forEach(s => {
        const waterOpts = { fill: palette.water, stroke: palette.coastline, strokeWidth: coastlineWidth };
        if (s.rings) {
          painter.multiPolygon(s.rings.map(ring => ring.map(([lat, lon]) => project(lat, lon))), waterOpts);
        } else {
          painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), waterOpts);
        }
      });

    // Alleen de waterlopen die op een echte kaart ook als lijn zichtbaar
    // zijn (rivier/kanaal/beek) — sloten en drainagegreppels zijn op elke
    // schaal te onbeduidend en zorgden er vooral voor dat het geheel dichtslibde
    // tot dikke, vlekkerige banen. Dun en accuraat, niet dik.
    streets
      .filter(s => s.tags.waterway === 'river' || s.tags.waterway === 'canal' || s.tags.waterway === 'stream')
      .forEach(s => {
        const riverWidth = s.tags.waterway === 'river' ? Math.max(w, h) * 0.0035 : Math.max(w, h) * 0.0015;
        painter.polyline(s.coords.map(([lat, lon]) => project(lat, lon)), { stroke: palette.water, strokeWidth: riverWidth, fill: 'none' });
      });

    // Landsgrenzen — vooral op land/continent-schaal belangrijk voor
    // geografische herkenbaarheid (zonder een grenslijn is bv. "VS + Mexico"
    // niet van elkaar te onderscheiden, anders dan bij een kustlijn). Dun en
    // onderbroken, zodat het nooit met een echte weg te verwarren is. Game
    // Styles slaan dit over — die tekenen toch hun eigen wereld.
    if (!gtaStyle && !mw2Style && !rdr2Style) {
      const borderWidth = Math.max(0.6, Math.min(mapW, mapH) * 0.0012);
      const dash = Math.min(mapW, mapH) * 0.006;
      streets
        .filter(s => s.tags.boundary === 'administrative')
        .forEach(s => painter.polyline(s.coords.map(([lat, lon]) => project(lat, lon)), {
          stroke: palette.text, strokeWidth: borderWidth, fill: 'none', opacity: 0.55, dash: [dash, dash * 0.7],
        }));
    }

    if (mw2Style) {
      // Gebouwomtrekken zoals de originele minimap: dezelfde donkere vulling
      // als de grond, alleen zichtbaar door hun lichte rand.
      const buildingStroke = Math.max(1, Math.min(mapW, mapH) * 0.0018);
      buildings.forEach(b => {
        painter.polygon(b.coords.map(([lat, lon]) => project(lat, lon)), {
          fill: palette.bg, stroke: palette.building, strokeWidth: buildingStroke,
        });
      });
    }

    const roads = streets.filter(s => s.tags.highway).sort((a, b) => MapGeo.roadWeight(a.tags) - MapGeo.roadWeight(b.tags));
    // Afgestemd op de nieuwe, veel bredere ROAD_WEIGHT-reeks (mapGeo.js) —
    // deze deler houdt een snelweg ongeveer even dik als voorheen, terwijl
    // een woonstraat nu duidelijk dunner wordt i.p.v. bijna even dik.
    const baseRoadWidth = Math.min(mapW, mapH) / 1100;
    roads.forEach(r => {
      const pts = r.coords.map(([lat, lon]) => project(lat, lon));
      const major = MapGeo.isMajorRoad(r.tags);
      // Ondergrens zodat een dunne woonstraat/voetpad nog zichtbaar blijft
      // i.p.v. weg te vallen door anti-aliasing bij een kleinere preview.
      const roadW = Math.max(0.5, baseRoadWidth * MapGeo.roadWeight(r.tags));
      painter.polyline(pts, {
        stroke: major ? palette.road : palette.roadMinor,
        strokeWidth: roadW,
        fill: 'none',
        dash: mw2Style ? [roadW * 2.4, roadW * 1.8] : undefined,
      });
    });

    // Pins — kleine kaart-pins (kopje + punt, zoals Google Maps) op door de
    // gebruiker gekozen plekken; de punt van de vorm valt exact op de
    // locatie. Getekend vóór endClip(), net als de wegen, zodat ze hetzelfde
    // meedoen aan isoleren/masken/uitlichten als de rest van de kaart (een
    // pin buiten het zichtbare gebied hoort ook daar te verdwijnen/vervagen
    // — het was toch geen navigeerbaar punt binnen de uitgesneden weergave).
    if (pins.length > 0) {
      const pinR = Math.min(mapW, mapH) * 0.016;
      pins.forEach(p => {
        const [x, y] = project(p.lat, p.lon);
        drawPin(painter, x, y, pinR, pinColor || '#e63946', matColor);
      });
    }

    painter.endClip();
    const mapLayer = highlighting ? painter.endLayer() : null;

    if (isolate) {
      // Scherpe contourlijn boven op de gevulde vorm, buiten de clip
      // getekend zodat hij niet zelf wordt weg geknipt — de coastline-kleur
      // (waar het palet er een heeft) geeft een net zo scherpe land/water-
      // overgang als bij losse meren.
      projectedRings.forEach(ring => {
        painter.polygon(ring, { stroke: palette.coastline || palette.text, strokeWidth: Math.max(1, Math.max(w, h) * 0.0015), fill: 'none' });
      });
    }

    if (highlighting) {
      // In tegenstelling tot isoleren blijft de omgeving hier gewoon intact
      // (dezelfde bounds/projectie als een normale render) — alleen wordt
      // de al getekende kaart-laag BUITEN de opgezochte grens echt wazig
      // gemaakt (een Gaussian blur, zie Painter.drawLayer), zodat het
      // geselecteerde gebied als een soort spotlight blijft uitgelicht.
      // Eén evenodd-vorm van het volledige kaartvlak mét de ring als "gat"
      // erin zorgt dat precies het gebied bùiten de ring vervaagd wordt.
      const projectedHighlightRings = highlight.rings.map(ring => ring.map(([lat, lon]) => project(lat, lon)));
      const frame = [[0, 0], [mapW, 0], [mapW, mapH], [0, mapH], [0, 0]];
      const blurPx = Math.max(6, Math.min(mapW, mapH) * 0.025);
      painter.drawLayer(mapLayer, { clipRings: projectedHighlightRings });
      painter.drawLayer(mapLayer, { clipRings: [frame, ...projectedHighlightRings], blur: blurPx });
      // Zelfde soort scherpe rand als bij isoleren, zodat de grens van het
      // uitgelichte gebied duidelijk afgetekend blijft t.o.v. de vervaagde
      // omgeving.
      projectedHighlightRings.forEach(ring => {
        painter.polygon(ring, { stroke: palette.coastline || palette.text, strokeWidth: Math.max(1, Math.max(w, h) * 0.0015), fill: 'none' });
      });
    }
    painter.endTranslate();

    // Onderschrift — de vijf layouts uit de UI ("Layouts"-sectie) delen
    // allemaal dezelfde onderliggende tekstblok-tekencode (drawCaptionBlock)
    // waar mogelijk, en verschillen alleen in hoe/waar die geplaatst wordt.
    if (layout.total > 0) {
      if (layoutId === 'fade') {
        // Kaart vult de hele afbeelding; het onderschrift staat er middenin
        // bovenop, met een donkere waas eronder (van doorzichtig naar
        // ondoorzichtig) zodat de tekst leesbaar blijft ongeacht de
        // onderliggende kaartkleuren — vaste lichte inkt i.p.v. de
        // paletafhankelijke captionInk/Sub/Faint, om diezelfde reden.
        const fadeH = layout.total * 1.9;
        painter.verticalGradientRect(0, h - fadeH, w, fadeH, [
          { offset: 0, color: '#000000', opacity: 0 },
          { offset: 0.55, color: '#000000', opacity: 0.32 },
          { offset: 1, color: '#000000', opacity: 0.8 },
        ]);
        drawCaptionBlock(painter, w, h - layout.total, layout, caption, { ink: '#faf7ef', sub: '#e3ddcd', faint: '#c3bca8' });
      } else if (layoutId === 'stamp') {
        // Kaart vult de hele afbeelding; het onderschrift staat in een klein
        // ondoorzichtig "label"-vlak in de linkerbenedenhoek, links
        // uitgelijnd — als een postzegel/sticker op een ansichtkaart.
        drawStampCaption(painter, w, h, layout, caption, matColor, captionInk, captionSub, captionFaint);
      } else if (layoutId === 'ledger') {
        // Kaart vult de hele afbeelding; een smalle volledige-breedte band
        // onderin, links uitgelijnd, met land en coördinaten samengevoegd
        // tot één regel — compact en architectonisch, geen brede mat.
        drawLedgerCaption(painter, w, h, layout, caption, matColor, captionInk, captionSub, captionFaint);
      } else if (layoutId === 'seal') {
        // Kaart vult de hele afbeelding; een rond medaillon onderin het
        // midden draagt plaats/land/coördinaten, als een wassen zegel op
        // een oude kaart.
        drawSealCaption(painter, w, h, layout, caption, matColor, captionInk, captionSub, captionFaint);
      } else if (layoutId === 'headline') {
        // Kaart vult de hele afbeelding met een donkere waas onderin (zoals
        // Fade); de plaatsnaam staat gecentreerd tussen twee dunne lijntjes,
        // als een tijdschrift-kop.
        const fadeH = layout.total * 1.5;
        painter.verticalGradientRect(0, h - fadeH, w, fadeH, [
          { offset: 0, color: '#000000', opacity: 0 },
          { offset: 0.6, color: '#000000', opacity: 0.28 },
          { offset: 1, color: '#000000', opacity: 0.62 },
        ]);
        drawHeadlineCaption(painter, w, h, layout, caption, '#faf7ef', '#e3ddcd', '#c3bca8');
      } else if (layoutId === 'quiet') {
        // Kaart vult de hele afbeelding; een klein, ingetogen onderschrift
        // onderin met veel lege ruimte eromheen — een korte, zachte waas
        // erachter houdt de tekst leesbaar ongeacht het onderliggende
        // kleurpalet, zonder een zichtbaar vlak/plaat te tonen.
        const fadeH = layout.total * 1.1;
        painter.verticalGradientRect(0, h - fadeH, w, fadeH, [
          { offset: 0, color: '#000000', opacity: 0 },
          { offset: 1, color: '#000000', opacity: 0.4 },
        ]);
        drawQuietCaption(painter, w, h, layout, caption, '#f2ede1', '#c9c2b3');
      } else {
        // "Default", "Crown" en "Gallery" reserveren een effen mat (Crown
        // erboven, de andere twee eronder); Gallery voegt daar bovenop een
        // dunne ingesneden lijstrand en twee liniaaltjes rond het
        // onderschrift aan toe, als een museumlabel.
        if (layoutId === 'gallery') drawGalleryFrame(painter, w, h, mapH, layout, captionFaint);
        const captionTopY = layoutId === 'crown' ? 0 : mapH;
        drawCaptionBlock(painter, w, captionTopY, layout, caption, { ink: captionInk, sub: captionSub, faint: captionFaint });
      }
    }
  }

  // Het gecentreerde drieregelige onderschrift (plaatsnaam/land/coördinaten)
  // — gedeeld door de layouts "Default", "Gallery" en "Fade", die alleen
  // verschillen in de startpositie (topY) en de inktkleuren.
  function drawCaptionBlock(painter, w, topY, layout, caption, ink) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    let y = topY + layout.gap;
    if (caption.showPlace) {
      y += layout.cityH * 0.75;
      painter.text(w / 2, y, (caption.place || '').toUpperCase(), {
        fill: ink.ink, fontSize: layout.cityH * 0.62, fontFamily, weight: '600',
        align: 'center', baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.cityH * 0.06,
      });
      y += layout.cityH * 0.25;
    }
    if (caption.showCountry) {
      y += layout.countryH * 0.75;
      painter.text(w / 2, y, caption.country || '', {
        fill: ink.sub, fontSize: layout.countryH * 0.62, fontFamily,
        align: 'center', baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.countryH * 0.08,
      });
      y += layout.countryH * 0.25;
    }
    if (caption.showCoords) {
      y += layout.coordH * 0.8;
      const lat = caption.lat, lon = caption.lon;
      const label = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
      painter.text(w / 2, y, label, {
        fill: ink.faint, fontSize: layout.coordH * 0.58, fontFamily: 'IBM Plex Mono, monospace',
        align: 'center', baseline: 'alphabetic',
      });
    }
  }

  // "Gallery": een dunne ingesneden lijstrand rond de hele afbeelding, plus
  // twee korte liniaaltjes boven en onder het onderschrift-blok — geeft het
  // een formeel "museumlabel"-gevoel bovenop de gewone Default-opmaak.
  function drawGalleryFrame(painter, w, h, mapH, layout, ruleColor) {
    const inset = Math.min(w, h) * 0.025;
    const frameWidth = Math.max(1, Math.min(w, h) * 0.0015);
    painter.polygon([[inset, inset], [w - inset, inset], [w - inset, h - inset], [inset, h - inset]], {
      stroke: ruleColor, strokeWidth: frameWidth, fill: 'none', opacity: 0.45,
    });
    const ruleW = w * 0.2;
    const ruleY1 = mapH + layout.gap * 0.45;
    const ruleY2 = h - layout.padBottom * 0.5;
    [ruleY1, ruleY2].forEach(ry => {
      painter.polyline([[w / 2 - ruleW / 2, ry], [w / 2 + ruleW / 2, ry]], {
        stroke: ruleColor, strokeWidth: frameWidth, opacity: 0.5,
      });
    });
  }

  // "Stamp": een klein ondoorzichtig label-vlak linksonder op de
  // full-bleed kaart, met links uitgelijnde tekst — als een sticker/
  // postzegel op een ansichtkaart, in plaats van een volle onderrand.
  function drawStampCaption(painter, w, h, layout, caption, matColor, ink, sub, faint) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    const pad = Math.min(w, h) * 0.045;
    const plateW = Math.min(w * 0.52, w - pad * 2);
    const plateH = layout.total * 0.9;
    const x0 = pad, y1 = h - pad, y0 = y1 - plateH;
    painter.polygon([[x0, y0], [x0 + plateW, y0], [x0 + plateW, y1], [x0, y1]], {
      fill: matColor, stroke: ink, strokeWidth: Math.max(1, Math.min(w, h) * 0.0018), opacity: 0.97,
    });
    // Arabisch leest van rechts naar links — het label spiegelt mee (tekst
    // vanaf de rechterkant van het plaatje uitgelijnd) i.p.v. de vaste
    // links uitgelijnde opmaak die voor Latijnse tekst bedoeld is.
    const textX = rtl ? x0 + plateW * 0.91 : x0 + plateW * 0.09;
    const align = rtl ? 'right' : 'left';
    let y = y0 + layout.gap * 0.5;
    if (caption.showPlace) {
      y += layout.cityH * 0.68;
      painter.text(textX, y, (caption.place || '').toUpperCase(), {
        fill: ink, fontSize: layout.cityH * 0.48, fontFamily, weight: '600',
        align, baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.cityH * 0.03,
      });
      y += layout.cityH * 0.2;
    }
    if (caption.showCountry) {
      y += layout.countryH * 0.68;
      painter.text(textX, y, caption.country || '', {
        fill: sub, fontSize: layout.countryH * 0.52, fontFamily,
        align, baseline: 'alphabetic',
      });
      y += layout.countryH * 0.2;
    }
    if (caption.showCoords) {
      y += layout.coordH * 0.72;
      const lat = caption.lat, lon = caption.lon;
      const label = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
      painter.text(textX, y, label, {
        fill: faint, fontSize: layout.coordH * 0.48, fontFamily: 'IBM Plex Mono, monospace',
        align, baseline: 'alphabetic',
      });
    }
  }

  // "Ledger": een smalle band over de hele breedte, links uitgelijnd, met
  // land en coördinaten samengevoegd tot één regel — compacter en
  // strakker dan Default/Gallery's brede, gecentreerde mat.
  function drawLedgerCaption(painter, w, h, layout, caption, matColor, ink, sub, faint) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    const bandH = layout.total * 0.62;
    const y0 = h - bandH;
    painter.polygon([[0, y0], [w, y0], [w, h], [0, h]], { fill: matColor });
    painter.polyline([[0, y0], [w, y0]], {
      stroke: ink, strokeWidth: Math.max(1, Math.min(w, h) * 0.0015), opacity: 0.35,
    });
    const textX = rtl ? w * 0.945 : w * 0.055;
    const align = rtl ? 'right' : 'left';
    let y = y0 + bandH * 0.18;
    if (caption.showPlace) {
      y += layout.cityH * 0.55;
      painter.text(textX, y, (caption.place || '').toUpperCase(), {
        fill: ink, fontSize: layout.cityH * 0.5, fontFamily, weight: '600',
        align, baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.cityH * 0.05,
      });
      y += layout.cityH * 0.14;
    }
    if (caption.showCountry || caption.showCoords) {
      const parts = [];
      if (caption.showCountry) parts.push(caption.country || '');
      if (caption.showCoords) {
        const lat = caption.lat, lon = caption.lon;
        parts.push(`${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`);
      }
      y += layout.countryH * 0.55;
      painter.text(textX, y, parts.filter(Boolean).join('   ·   '), {
        fill: sub, fontSize: layout.countryH * 0.48, fontFamily,
        align, baseline: 'alphabetic',
      });
    }
  }

  // "Seal": kaart vult de hele afbeelding; een rond medaillon onderin het
  // midden draagt plaats/land/coördinaten, als een wassen zegel op een oude
  // kaart — ruim gemaat (grotere straal dan strikt nodig) zodat drie regels
  // tekst er comfortabel in passen.
  function drawSealCaption(painter, w, h, layout, caption, matColor, ink, sub, faint) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    const r = layout.total * 0.95;
    const margin = Math.min(w, h) * 0.06;
    const cx = w / 2, cy = h - margin - r;
    painter.circle(cx, cy, r, { fill: matColor, stroke: ink, strokeWidth: Math.max(1, Math.min(w, h) * 0.0022) });
    let y = cy - r * 0.28;
    if (caption.showPlace) {
      y += layout.cityH * 0.5;
      painter.text(cx, y, (caption.place || '').toUpperCase(), {
        fill: ink, fontSize: layout.cityH * 0.46, fontFamily, weight: '600',
        align: 'center', baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.cityH * 0.04,
      });
      y += layout.cityH * 0.42;
    }
    if (caption.showCountry) {
      y += layout.countryH * 0.55;
      painter.text(cx, y, (caption.country || '').toUpperCase(), {
        fill: sub, fontSize: layout.countryH * 0.42, fontFamily,
        align: 'center', baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.countryH * 0.12,
      });
      y += layout.countryH * 0.38;
    }
    if (caption.showCoords) {
      y += layout.coordH * 0.65;
      const lat = caption.lat, lon = caption.lon;
      const label = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
      painter.text(cx, y, label, {
        fill: faint, fontSize: layout.coordH * 0.42, fontFamily: 'IBM Plex Mono, monospace',
        align: 'center', baseline: 'alphabetic',
      });
    }
  }

  // "Headline": kaart vult de hele afbeelding (met een donkere waas onderin,
  // zie de aanroep in render()); de plaatsnaam staat gecentreerd tussen twee
  // dunne liniaaltjes, als een tijdschrift-kop, met land+coördinaten als één
  // compacte regel eronder.
  function drawHeadlineCaption(painter, w, h, layout, caption, ink, sub, faint) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    const ruleW = Math.min(w * 0.34, w - Math.min(w, h) * 0.12);
    const ruleWidth = Math.max(0.6, Math.min(w, h) * 0.0012);
    let y = h - layout.total + layout.gap;
    if (caption.showPlace) {
      painter.polyline([[w / 2 - ruleW / 2, y], [w / 2 + ruleW / 2, y]], { stroke: ink, strokeWidth: ruleWidth, opacity: 0.6 });
      y += layout.cityH * 0.72;
      painter.text(w / 2, y, (caption.place || '').toUpperCase(), {
        fill: ink, fontSize: layout.cityH * 0.56, fontFamily, weight: '600',
        align: 'center', baseline: 'alphabetic', letterSpacing: rtl ? 0 : layout.cityH * 0.06,
      });
      y += layout.cityH * 0.3;
      painter.polyline([[w / 2 - ruleW / 2, y], [w / 2 + ruleW / 2, y]], { stroke: ink, strokeWidth: ruleWidth, opacity: 0.6 });
    }
    if (caption.showCountry || caption.showCoords) {
      const parts = [];
      if (caption.showCountry) parts.push(caption.country || '');
      if (caption.showCoords) {
        const lat = caption.lat, lon = caption.lon;
        parts.push(`${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`);
      }
      y += layout.countryH * 0.75;
      painter.text(w / 2, y, parts.filter(Boolean).join('   ·   '), {
        fill: sub, fontSize: layout.countryH * 0.5, fontFamily: 'IBM Plex Mono, monospace',
        align: 'center', baseline: 'alphabetic',
      });
    }
  }

  // "Quiet": kaart vult de hele afbeelding (met een korte, zachte waas
  // onderin, zie render()); een klein onderschrift met veel lege ruimte
  // eromheen — bewust GEEN hoofdletters/brede letter-spacing zoals de
  // andere layouts, dat is precies wat "Quiet" onderscheidt.
  function drawQuietCaption(painter, w, h, layout, caption, ink, faint) {
    const rtl = isRTLText(caption.place) || isRTLText(caption.country);
    const fontFamily = captionFontFamily(rtl);
    let y = h - layout.total + layout.gap;
    if (caption.showPlace) {
      const ruleW = Math.min(w, h) * 0.09;
      y += layout.cityH * 0.4;
      painter.polyline([[w / 2 - ruleW / 2, y], [w / 2 + ruleW / 2, y]], {
        stroke: ink, strokeWidth: Math.max(0.4, Math.min(w, h) * 0.0008), opacity: 0.55,
      });
      y += layout.cityH * 0.5;
      painter.text(w / 2, y, caption.place || '', {
        fill: ink, fontSize: layout.cityH * 0.4, fontFamily,
        align: 'center', baseline: 'alphabetic',
      });
      y += layout.cityH * 0.15;
    }
    if (caption.showCountry || caption.showCoords) {
      const parts = [];
      if (caption.showCountry) parts.push(caption.country || '');
      if (caption.showCoords) {
        const lat = caption.lat, lon = caption.lon;
        parts.push(`${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`);
      }
      y += layout.countryH * 0.7 + layout.coordH * 0.5;
      painter.text(w / 2, y, parts.filter(Boolean).join('   —   '), {
        fill: faint, fontSize: layout.countryH * 0.4, fontFamily: 'IBM Plex Mono, monospace',
        align: 'center', baseline: 'alphabetic',
      });
    }
  }

  function drawMapBackground(painter, palette, w, h) {
    painter.polygon([[0, 0], [w, 0], [w, h], [0, h]], { fill: palette.bg });
  }

  return { render, captionLayout };
})();
