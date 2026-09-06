// Tekent de daadwerkelijke kaart-kunst: een geo-bounding-box + opgehaalde
// OSM-data + een kleurstelling wordt één samenhangende afbeelding, inclusief
// het onderschrift (plaatsnaam/land/coördinaten) als onderdeel van dezelfde
// tekening — dus het staat mee in de geëxporteerde SVG/PNG, niet als losse
// HTML-laag erbovenop.
const MapRender = (() => {
  function starPoints(cx, cy, rOuter, rInner, points) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    return pts;
  }

  // Landmark-icoon — meerdere vormen naast de standaard ster, kiesbaar in de
  // UI. (x,y) is het middelpunt, r de "straal" (halve breedte/hoogte).
  function drawLandmarkIcon(painter, icon, x, y, r, color) {
    if (icon === 'dot') {
      painter.circle(x, y, r * 0.7, { fill: color });
    } else if (icon === 'pin') {
      const pinR = r * 0.7;
      painter.circle(x, y - pinR * 0.35, pinR, { fill: color });
      painter.polygon([[x - pinR * 0.55, y + pinR * 0.1], [x + pinR * 0.55, y + pinR * 0.1], [x, y + pinR * 1.5]], { fill: color });
    } else if (icon === 'diamond') {
      painter.polygon([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], { fill: color });
    } else {
      painter.polygon(starPoints(x, y, r, r * 0.45, 5), { fill: color });
    }
  }

  // Grove schatting van tekstbreedte (geen echte metrics — die zijn niet
  // hetzelfde beschikbaar voor canvas en SVG) puur om overlappende labels te
  // kunnen detecteren, niet om exact te positioneren.
  function estimateTextWidth(text, fontSize) {
    return text.length * fontSize * 0.54;
  }

  // Axis-aligned bounding box van een gedraaide tekstlabel, voor eenvoudige
  // overlap-detectie tussen straatnaam-labels onderling.
  function rotatedTextBBox(cx, cy, angleDeg, textW, textH) {
    const rad = (angleDeg * Math.PI) / 180;
    const hw = textW / 2, hh = textH / 2;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const xs = [], ys = [];
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([x, y]) => {
      xs.push(cx + x * cos - y * sin);
      ys.push(cy + x * sin + y * cos);
    });
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  function bboxOverlaps(a, b, pad) {
    return !(a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY);
  }

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

  function render(painter, w, h, opts) {
    const {
      bounds, streets = [], landmarks = [], buildings = [],
      showStreetLabels = false, showLandmarks = false,
      streetLabelColor = null, landmarkColor = null, landmarkIcon = 'star',
      caption = {}, gtaStyle = false, mw2Style = false, rdr2Style = false, tier = null, isolate = null,
    } = opts;
    const palette = gtaStyle ? GTA_STYLE_PALETTE : mw2Style ? MW2_STYLE_PALETTE : rdr2Style ? RDR2_STYLE_PALETTE : opts.palette;
    const matColor = gtaStyle ? '#0a0a0a' : mw2Style ? '#0d100a' : rdr2Style ? '#c7b688' : (opts.matColor || '#f7f4ee');
    const captionInk = gtaStyle ? '#ececec' : mw2Style ? '#ddd6bd' : rdr2Style ? '#3a2f22' : '#2a2620';
    const captionSub = gtaStyle ? '#a8a8a8' : mw2Style ? '#a39c81' : rdr2Style ? '#5c4d38' : '#6b6156';
    const captionFaint = gtaStyle ? '#828282' : mw2Style ? '#847d66' : rdr2Style ? '#6b5c45' : '#8a8074';

    painter.setBackground(matColor);

    const layout = captionLayout(h, caption);
    const mapH = h - layout.total;
    const mapW = w;

    const project = isolate
      ? MapGeo.makeContainProjector(bounds, mapW, mapH)
      : MapGeo.makeCoverProjector(bounds, mapW, mapH);

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
      painter.beginClip(0, 0, mapW, mapH);
    }
    drawMapBackground(painter, palette, mapW, mapH);

    if (gtaStyle) {
      drawTerrainContours(painter, mapW, mapH, bounds, '#242424');
    } else if (rdr2Style || tier === 'continent') {
      // Op continent-schaal is er geen Overpass-data (zie MapGeo.fetchStreets)
      // — vul de silhouet met gegenereerde textuur i.p.v. een kaal vlak. Voor
      // RDR2 is dit ook gewoon de bedoeling: een zacht reliëf/hillshade-
      // gevoel zoals de originele perkament-kaart, ongeacht schaal.
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
    const coastlineWidth = palette.coastline ? Math.max(1.5, Math.min(mapW, mapH) * 0.005) : undefined;
    streets
      .filter(s => s.tags.natural === 'water')
      .forEach(s => painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), {
        fill: palette.water, stroke: palette.coastline, strokeWidth: coastlineWidth,
      }));

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

    if (showStreetLabels) {
      // Eén label per straatnaam, op het langste segment met die naam (het
      // meest representatieve stuk) — en daarna een simpele hebzuchtige
      // plaatsing: straten met het langste (dus belangrijkste) segment
      // krijgen voorrang, en een label dat een al geplaatst label zou
      // overlappen wordt overgeslagen. Liever een paar straten zonder naam
      // dan een onleesbare kluwen tekst over elkaar.
      const byName = new Map();
      roads.forEach(r => {
        if (!MapGeo.isMajorRoad(r.tags) || !r.tags.name) return;
        const pts = r.coords.map(([lat, lon]) => project(lat, lon));
        let length = 0;
        for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const existing = byName.get(r.tags.name);
        if (!existing || length > existing.length) byName.set(r.tags.name, { pts, length, name: r.tags.name });
      });

      const labelColor = streetLabelColor || palette.text;
      const fontSize = Math.min(mapW, mapH) * 0.014;
      const placedBoxes = [];
      [...byName.values()]
        .sort((a, b) => b.length - a.length)
        .forEach(({ pts, name }) => {
          const midIdx = Math.floor(pts.length / 2);
          const a = pts[Math.max(0, midIdx - 1)];
          const b = pts[Math.min(pts.length - 1, midIdx + 1)];
          const mid = pts[midIdx];
          if (mid[0] < 0 || mid[0] > mapW || mid[1] < 0 || mid[1] > mapH) return;
          let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;
          const textW = estimateTextWidth(name, fontSize);
          const box = rotatedTextBBox(mid[0], mid[1] - fontSize * 0.4, angle, textW, fontSize * 1.3);
          if (placedBoxes.some(p => bboxOverlaps(box, p, fontSize * 0.35))) return;
          placedBoxes.push(box);
          painter.text(mid[0], mid[1] - 3, name, {
            fill: labelColor, fontSize, fontFamily: 'Georgia, serif',
            align: 'center', baseline: 'alphabetic', rotate: angle,
          });
        });
    }

    if (showLandmarks) {
      const markColor = landmarkColor || palette.text;
      landmarks.forEach(lm => {
        const [x, y] = project(lm.lat, lm.lon);
        if (x < 0 || x > mapW || y < 0 || y > mapH) return;
        const r = Math.min(mapW, mapH) * 0.012;
        drawLandmarkIcon(painter, landmarkIcon, x, y, r, markColor);
        painter.text(x, y + r * 2.2, lm.name, {
          fill: markColor, fontSize: Math.min(mapW, mapH) * 0.015, fontFamily: 'Georgia, serif', weight: '700',
          align: 'center', baseline: 'hanging',
        });
      });
    }

    painter.endClip();

    if (isolate) {
      // Scherpe contourlijn boven op de gevulde vorm, buiten de clip
      // getekend zodat hij niet zelf wordt weg geknipt — de coastline-kleur
      // (waar het palet er een heeft) geeft een net zo scherpe land/water-
      // overgang als bij losse meren.
      projectedRings.forEach(ring => {
        painter.polygon(ring, { stroke: palette.coastline || palette.text, strokeWidth: Math.max(1, Math.max(w, h) * 0.0015), fill: 'none' });
      });
    }

    // Onderschrift.
    if (layout.total > 0) {
      let y = mapH + layout.gap;
      if (caption.showPlace) {
        y += layout.cityH * 0.75;
        painter.text(w / 2, y, (caption.place || '').toUpperCase(), {
          fill: captionInk, fontSize: layout.cityH * 0.62, fontFamily: 'Georgia, serif', weight: '600',
          align: 'center', baseline: 'alphabetic', letterSpacing: layout.cityH * 0.06,
        });
        y += layout.cityH * 0.25;
      }
      if (caption.showCountry) {
        y += layout.countryH * 0.75;
        painter.text(w / 2, y, caption.country || '', {
          fill: captionSub, fontSize: layout.countryH * 0.62, fontFamily: 'Georgia, serif',
          align: 'center', baseline: 'alphabetic', letterSpacing: layout.countryH * 0.08,
        });
        y += layout.countryH * 0.25;
      }
      if (caption.showCoords) {
        y += layout.coordH * 0.8;
        const lat = caption.lat, lon = caption.lon;
        const label = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
        painter.text(w / 2, y, label, {
          fill: captionFaint, fontSize: layout.coordH * 0.58, fontFamily: 'IBM Plex Mono, monospace',
          align: 'center', baseline: 'alphabetic',
        });
      }
    }
  }

  function drawMapBackground(painter, palette, w, h) {
    painter.polygon([[0, 0], [w, 0], [w, h], [0, h]], { fill: palette.bg });
  }

  return { render, captionLayout };
})();
