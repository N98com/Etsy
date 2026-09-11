// Vertaalt Protomaps' basiskaart-vector-tegels (MVT, laag-schema bevestigd via
// pmtiles.io tegen build.protomaps.com) naar de interne vorm die de renderer
// verwacht (voorheen uit Overpass afkomstig, inmiddels volledig vervangen) —
// {tags, coords} voor lijnen/wegen, {tags, rings} voor vlakken — zodat
// mapRender.js/painters.js, de paletten, masks en Game Styles ONGEWIJZIGD
// blijven werken ongeacht de databron.
//
// Bevestigd schema (Hengelo, tegel 15/17003/10782, zie sessie-onderzoek):
//   roads   (LineString): kind="minor_road", kind_detail="residential", ...
//   water   (LineString): kind="stream"  -> lijnvormige rivier/beek
//   water   (Polygon):    kind="water"   -> meer/oceaan/brede rivier
//   landuse (Polygon):    kind="residential", (park/forest/grass nog te
//                          bevestigen tegen echte data — zie LANDUSE_KIND_MAP)
//   buildings, earth, landcover, places, pois, boundaries: layers bestaan,
//   niet allemaal gebruikt door onze huidige renderer.
const ProtomapsAdapter = (() => {
  // Standaard slippy-tile inverse-projectie: tegel-lokale pixelcoördinaat
  // (0..extent) op tegel z/x/y terug naar lengte-/breedtegraad.
  function tilePixelToLatLon(z, x, y, px, py, extent) {
    const n = Math.pow(2, z);
    const gx = x + px / extent;
    const gy = y + py / extent;
    const lon = (gx / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * gy) / n)));
    const lat = (latRad * 180) / Math.PI;
    return [lat, lon];
  }

  // Eén MVT-feature (zoals @mapbox/vector-tile 'm decodeert: .type, .extent,
  // .properties, .loadGeometry()) kan uit meerdere losse delen bestaan
  // (bv. een MultiLineString) — die zetten we om in losse entries met
  // dezelfde tags, want onze renderer verwacht één doorlopende lijn per
  // entry, net als een enkele Overpass-way.
  function geometryToLatLonParts(feature, z, x, y) {
    const extent = feature.extent || 4096;
    const rings = feature.loadGeometry();
    return rings.map(ring => ring.map(pt => tilePixelToLatLon(z, x, y, pt.x, pt.y, extent)));
  }

  const LANDUSE_KIND_MAP = {
    // Bevestigd: 'residential' bestaat in de data maar is voor ons niet
    // relevant (geen render-doel). De onderstaande drie zijn de OSM-
    // equivalenten die we nu via Overpass ophalen (leisure=park,
    // landuse=forest/grass) — namen nog te verifiëren tegen een tegel met
    // een echt park/bos in beeld voordat dit in productie gaat.
    park: { leisure: 'park' },
    forest: { landuse: 'forest' },
    wood: { landuse: 'forest' },
    grass: { landuse: 'grass' },
  };

  // Zet één gedecodeerde MVT-feature om in 0+ entries in onze interne vorm.
  // Geeft een lege array terug voor lagen/features die we niet gebruiken
  // (earth, places, pois, boundaries, landuse-kinds buiten LANDUSE_KIND_MAP).
  function translateFeature(layerName, feature, z, x, y) {
    const GEOM_LINESTRING = 2, GEOM_POLYGON = 3;
    const props = feature.properties || {};
    const parts = geometryToLatLonParts(feature, z, x, y);

    if (layerName === 'roads') {
      if (feature.type !== GEOM_LINESTRING) return [];
      const highway = props.kind_detail || props.kind;
      if (!highway) return [];
      return parts.map(coords => ({ tags: { highway, name: props.name || undefined }, coords }));
    }

    if (layerName === 'water') {
      if (feature.type === GEOM_LINESTRING) {
        return parts.map(coords => ({ tags: { waterway: props.kind || 'stream', name: props.name || undefined }, coords }));
      }
      if (feature.type === GEOM_POLYGON) {
        // name moet hier ook mee, anders filtert ProtomapsFetch's
        // "alleen genoemd water" op region/country/continent-schaal ELK
        // meer/zee weg (zelfs een oceaan) — dat viel niet op zolang alleen
        // straat/stad-schaal (geen naamfilter) getest werd.
        return [{ tags: { natural: 'water', name: props.name || undefined }, rings: parts }];
      }
      return [];
    }

    if (layerName === 'landuse') {
      if (feature.type !== GEOM_POLYGON || parts.length === 0) return [];
      const mapped = LANDUSE_KIND_MAP[props.kind];
      if (!mapped) return [];
      // mapRender.js tekent park/bos/gras als simpele `.coords` (net als een
      // enkele Overpass-way) i.p.v. `.rings` (dat is alleen voor de
      // multipolygon-vlakken van water gereserveerd) — buitenring volstaat,
      // net als bij gebouwen hieronder.
      return [{ tags: { ...mapped }, coords: parts[0] }];
    }

    if (layerName === 'buildings') {
      if (feature.type !== GEOM_POLYGON || parts.length === 0) return [];
      // Net als parseWays voor Overpass-gebouwen: alleen de buitenring,
      // consistent met hoe trimBuildingsForStorage/render dit al gebruikt.
      return [{ tags: { building: 'yes' }, coords: parts[0] }];
    }

    // earth/landcover/places/pois/boundaries: (nog) geen renderdoel.
    return [];
  }

  // Doorloopt alle features in alle relevante lagen van één gedecodeerde
  // tegel (een vector-tile.js VectorTile-object) en levert één platte lijst
  // in de vorm die location.js verwacht ({tags, coords}/{tags, rings}) —
  // direct te mengen met state.streets/state.buildings.
  function translateTile(vectorTile, z, x, y) {
    const out = [];
    for (const layerName of Object.keys(vectorTile.layers)) {
      const layer = vectorTile.layers[layerName];
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i);
        translateFeature(layerName, feature, z, x, y).forEach(entry => out.push(entry));
      }
    }
    return out;
  }

  return { tilePixelToLatLon, translateFeature, translateTile, LANDUSE_KIND_MAP };
})();
