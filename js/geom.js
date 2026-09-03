// Voronoi-cellen via halfvlak-clipping: voor elke site begin je met een
// rechthoek en snijd je die steeds kleiner met de loodrechte middelloodlijn
// t.o.v. elke andere site. Geen Fortune's algoritme nodig, en het resultaat
// is direct bruikbaar als SVG-polygon. O(n^2), prima tot enkele honderden punten.
const Geom = (() => {
  // Houdt punten waarvoor a*x + b*y <= c geldt (Sutherland-Hodgman, één halfvlak).
  function clipPolygonByHalfPlane(poly, a, b, c) {
    if (poly.length === 0) return poly;
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i - 1 + poly.length) % poly.length];
      const curIn = a * cur[0] + b * cur[1] <= c;
      const prevIn = a * prev[0] + b * prev[1] <= c;
      if (curIn !== prevIn) {
        const denom = a * (cur[0] - prev[0]) + b * (cur[1] - prev[1]);
        const t = denom !== 0 ? (c - (a * prev[0] + b * prev[1])) / denom : 0;
        result.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
      }
      if (curIn) result.push(cur);
    }
    return result;
  }

  function clipToRect(poly, x0, y0, x1, y1) {
    let p = poly;
    p = clipPolygonByHalfPlane(p, -1, 0, -x0);
    p = clipPolygonByHalfPlane(p, 1, 0, x1);
    p = clipPolygonByHalfPlane(p, 0, -1, -y0);
    p = clipPolygonByHalfPlane(p, 0, 1, y1);
    return p;
  }

  function voronoiCells(sites, bounds) {
    const cells = [];
    for (let i = 0; i < sites.length; i++) {
      let poly = [
        [bounds.minX, bounds.minY], [bounds.maxX, bounds.minY],
        [bounds.maxX, bounds.maxY], [bounds.minX, bounds.maxY],
      ];
      const [px, py] = sites[i];
      for (let j = 0; j < sites.length && poly.length > 0; j++) {
        if (i === j) continue;
        const [qx, qy] = sites[j];
        const mx = (px + qx) / 2, my = (py + qy) / 2;
        const a = qx - px, b = qy - py;
        const c = a * mx + b * my;
        poly = clipPolygonByHalfPlane(poly, a, b, c);
      }
      cells.push(poly);
    }
    return cells;
  }

  function polygonCentroid(poly) {
    let cx = 0, cy = 0;
    poly.forEach(([x, y]) => { cx += x; cy += y; });
    return [cx / poly.length, cy / poly.length];
  }

  // Marching squares voor één rastercel: gegeven de 4 hoekwaarden en een
  // drempelniveau, levert dit 0, 1 of 2 lijnsegmenten op (de isolijn(en)
  // door die cel). Werkt via randkruisingen i.p.v. de klassieke 16-gevallen
  // opzoektabel: elke rand met hoekpunten aan weerszijden van het niveau
  // levert een geïnterpoleerd kruispunt op, en die kruispunten worden
  // paarsgewijs verbonden. Bij 4 kruisingen (zadelpunt) beslist het
  // gemiddelde van de hoekwaarden welke twee paren bij elkaar horen.
  function marchingSquaresCell(tl, tr, br, bl, level, x0, y0, x1, y1) {
    function interp(v0, v1, p0, p1) {
      const t = (level - v0) / (v1 - v0);
      return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    }
    const topPt = (tl < level) !== (tr < level) ? interp(tl, tr, [x0, y0], [x1, y0]) : null;
    const rightPt = (tr < level) !== (br < level) ? interp(tr, br, [x1, y0], [x1, y1]) : null;
    const bottomPt = (bl < level) !== (br < level) ? interp(bl, br, [x0, y1], [x1, y1]) : null;
    const leftPt = (tl < level) !== (bl < level) ? interp(tl, bl, [x0, y0], [x0, y1]) : null;

    const crossed = [topPt, rightPt, bottomPt, leftPt].filter(Boolean);
    if (crossed.length === 2) return [[crossed[0], crossed[1]]];
    if (crossed.length === 4) {
      const avg = (tl + tr + br + bl) / 4;
      return avg >= level
        ? [[topPt, rightPt], [bottomPt, leftPt]]
        : [[topPt, leftPt], [bottomPt, rightPt]];
    }
    return [];
  }

  return { clipPolygonByHalfPlane, clipToRect, voronoiCells, polygonCentroid, marchingSquaresCell };
})();
