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

  // Nagebootste terreinlijnen voor "GTA5 Style" — dezelfde marching-squares-
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

  function relLuminance(hex) {
    const { r, g, b } = Utils.hexToRgb(hex);
    return 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
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
      bounds, streets = [], landmarks = [],
      showStreetLabels = false, showLandmarks = false,
      caption = {}, gtaStyle = false, tier = null, isolate = null,
    } = opts;
    const palette = gtaStyle ? GTA_STYLE_PALETTE : opts.palette;
    const matColor = gtaStyle ? '#0a0a0a' : (opts.matColor || '#f7f4ee');
    const captionInk = gtaStyle ? '#ececec' : '#2a2620';
    const captionSub = gtaStyle ? '#a8a8a8' : '#6b6156';
    const captionFaint = gtaStyle ? '#828282' : '#8a8074';

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
      const outsideColor = relLuminance(palette.bg) > 0.5 ? '#26221c' : '#f2ede4';
      painter.polygon([[0, 0], [mapW, 0], [mapW, mapH], [0, mapH]], { fill: outsideColor });
      drawIsolateHalo(painter, projectedRings, palette.bg, Math.max(w, h) * 0.0015);
      painter.beginClipPath(projectedRings);
    } else {
      painter.beginClip(0, 0, mapW, mapH);
    }
    drawMapBackground(painter, palette, mapW, mapH);

    if (gtaStyle) {
      drawTerrainContours(painter, mapW, mapH, bounds, '#242424');
    } else if (tier === 'continent') {
      // Op continent-schaal is er geen Overpass-data (zie MapGeo.fetchStreets)
      // — vul de silhouet met dezelfde gegenereerde textuur als GTA5 Style,
      // in de kleur van het gekozen palet, zodat het geen kaal vlak wordt.
      drawTerrainContours(painter, mapW, mapH, bounds, palette.roadMinor);
    } else {
      // Groen/parken (alleen in het gewone kleurenschema — GTA-stijl houdt
      // het bij land/water/wegen, net als het spel zelf).
      streets
        .filter(s => s.tags.leisure === 'park' || s.tags.landuse === 'forest' || s.tags.landuse === 'grass')
        .forEach(s => painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), { fill: palette.park }));
    }

    streets
      .filter(s => s.tags.natural === 'water')
      .forEach(s => painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), { fill: palette.water }));

    streets
      .filter(s => s.tags.waterway)
      .forEach(s => {
        const riverWidth = s.tags.waterway === 'river' ? Math.max(w, h) * 0.01 : Math.max(w, h) * 0.005;
        painter.polyline(s.coords.map(([lat, lon]) => project(lat, lon)), { stroke: palette.water, strokeWidth: riverWidth, fill: 'none' });
      });

    const roads = streets.filter(s => s.tags.highway).sort((a, b) => MapGeo.roadWeight(a.tags) - MapGeo.roadWeight(b.tags));
    const baseRoadWidth = Math.min(mapW, mapH) / 650;
    roads.forEach(r => {
      const pts = r.coords.map(([lat, lon]) => project(lat, lon));
      const major = MapGeo.isMajorRoad(r.tags);
      painter.polyline(pts, {
        stroke: major ? palette.road : palette.roadMinor,
        strokeWidth: baseRoadWidth * MapGeo.roadWeight(r.tags),
        fill: 'none',
      });
    });

    if (showStreetLabels) {
      const seenNames = new Set();
      roads
        .filter(r => MapGeo.isMajorRoad(r.tags) && r.tags.name && !seenNames.has(r.tags.name) && seenNames.add(r.tags.name))
        .forEach(r => {
          const pts = r.coords.map(([lat, lon]) => project(lat, lon));
          const midIdx = Math.floor(pts.length / 2);
          const a = pts[Math.max(0, midIdx - 1)];
          const b = pts[Math.min(pts.length - 1, midIdx + 1)];
          const mid = pts[midIdx];
          if (mid[0] < 0 || mid[0] > mapW || mid[1] < 0 || mid[1] > mapH) return;
          let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;
          painter.text(mid[0], mid[1] - 3, r.tags.name, {
            fill: palette.text, fontSize: Math.min(mapW, mapH) * 0.014, fontFamily: 'Georgia, serif',
            align: 'center', baseline: 'alphabetic', rotate: angle,
          });
        });
    }

    if (showLandmarks) {
      landmarks.forEach(lm => {
        const [x, y] = project(lm.lat, lm.lon);
        if (x < 0 || x > mapW || y < 0 || y > mapH) return;
        const r = Math.min(mapW, mapH) * 0.012;
        painter.polygon(starPoints(x, y, r, r * 0.45, 5), { fill: palette.text });
        painter.text(x, y + r * 2.2, lm.name, {
          fill: palette.text, fontSize: Math.min(mapW, mapH) * 0.015, fontFamily: 'Georgia, serif', weight: '700',
          align: 'center', baseline: 'hanging',
        });
      });
    }

    painter.endClip();

    if (isolate) {
      // Scherpe contourlijn boven op de gevulde vorm, buiten de clip
      // getekend zodat hij niet zelf wordt weg geknipt.
      projectedRings.forEach(ring => {
        painter.polygon(ring, { stroke: palette.text, strokeWidth: Math.max(1, Math.max(w, h) * 0.0015), fill: 'none' });
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
