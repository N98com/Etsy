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

  return { clipPolygonByHalfPlane, clipToRect, voronoiCells, polygonCentroid };
})();
