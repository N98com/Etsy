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

  function render(painter, w, h, opts) {
    const {
      bounds, streets = [], landmarks = [], palette,
      showStreetLabels = false, showLandmarks = false,
      caption = {}, matColor = '#f7f4ee',
    } = opts;

    painter.setBackground(matColor);

    const layout = captionLayout(h, caption);
    const mapH = h - layout.total;
    const mapW = w;

    painter.beginClip(0, 0, mapW, mapH);
    const project = MapGeo.makeCoverProjector(bounds, mapW, mapH);
    drawMapBackground(painter, palette, mapW, mapH);

    // Groen/parken eerst (onderlaag), dan water, dan wegen (klein -> groot).
    streets
      .filter(s => s.tags.leisure === 'park' || s.tags.landuse === 'forest' || s.tags.landuse === 'grass')
      .forEach(s => painter.polygon(s.coords.map(([lat, lon]) => project(lat, lon)), { fill: palette.park }));

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

    // Onderschrift.
    if (layout.total > 0) {
      let y = mapH + layout.gap;
      if (caption.showPlace) {
        y += layout.cityH * 0.75;
        painter.text(w / 2, y, (caption.place || '').toUpperCase(), {
          fill: '#2a2620', fontSize: layout.cityH * 0.62, fontFamily: 'Georgia, serif', weight: '600',
          align: 'center', baseline: 'alphabetic', letterSpacing: layout.cityH * 0.06,
        });
        y += layout.cityH * 0.25;
      }
      if (caption.showCountry) {
        y += layout.countryH * 0.75;
        painter.text(w / 2, y, caption.country || '', {
          fill: '#6b6156', fontSize: layout.countryH * 0.62, fontFamily: 'Georgia, serif',
          align: 'center', baseline: 'alphabetic', letterSpacing: layout.countryH * 0.08,
        });
        y += layout.countryH * 0.25;
      }
      if (caption.showCoords) {
        y += layout.coordH * 0.8;
        const lat = caption.lat, lon = caption.lon;
        const label = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} / ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
        painter.text(w / 2, y, label, {
          fill: '#8a8074', fontSize: layout.coordH * 0.58, fontFamily: 'IBM Plex Mono, monospace',
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
