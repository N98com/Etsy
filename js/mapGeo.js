// Geo-hulpfuncties voor de Locatie-tab: omgekeerd geocoderen van een punt
// naar plaatsnaam/land en het opzoeken van een bestuurlijke grens (beide via
// Nominatim), plus de projectie van lat/lon naar canvaspixels en een paar
// render-constanten (wegdikte/-classificatie, gebiedsschaal-tiers).
//
// Het daadwerkelijke ophalen van straten/water/gebouwen liep hier vroeger via
// live Overpass-queries (met bijbehorende query-opbouw, retry/mirror-
// fallback, kustlijn-naar-watervlak-stitching en Douglas-Peucker-
// vereenvoudiging) — dat hele pad is inmiddels vervangen door ProtomapsFetch
// (zelf-gehoste PMTiles-data op Cloudflare R2, zie protomapsFetch.js) en
// daarom hier verwijderd i.p.v. als ongebruikte dode code te laten staan.
// Draait in de browser van de bezoeker — niet in deze sandbox, dus hier geen
// live netwerktests, wel zorgvuldig gebouwd tegen de gedocumenteerde API's.
const MapGeo = (() => {
  const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org';

  // Sterk niet-lineair oplopend (i.p.v. de vorige, te vlakke reeks) zodat
  // een snelweg duidelijk dikker oogt dan een woonstraat, zoals Google
  // Maps dat ook toont — anders verdrinkt elke hoofdader in het woonwijk-
  // rasterwerk zodra een gebied genoeg straten bevat.
  const ROAD_WEIGHT = {
    motorway: 5.5, motorway_link: 3.6, trunk: 5, trunk_link: 3.2, primary: 3.8, primary_link: 2.6,
    secondary: 2.6, tertiary: 1.6, residential: 0.85, unclassified: 0.75, service: 0.5,
    footway: 0.35, path: 0.35, cycleway: 0.35, pedestrian: 0.55, living_street: 0.75, track: 0.35,
  };
  const MAJOR_ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary'];

  function roadWeight(tags) { return ROAD_WEIGHT[tags.highway] || 1; }
  function isMajorRoad(tags) { return MAJOR_ROAD_TYPES.includes(tags.highway); }

  // Classificeert de grootte van het gekozen gebied — dit bepaalt hoeveel
  // wegdetail getoond wordt (zie ProtomapsFetch's TIER_ZOOM/HIGHWAY_ALLOW):
  // straat/buurt (<8km) toont alles, stad (<60km) het volle woonstratennet,
  // regio/land/continent steeds sobere hoofdaders — puur een visuele/
  // esthetische keuze (te veel wegjes op landschaal oogt als ruis), niet
  // langer een technische beperking van de databron zoals toen dit nog
  // Overpass' queryzwaarte moest begrenzen.
  function areaSpanKm(bounds) {
    const { south, west, north, east } = bounds;
    const midLatRad = ((south + north) / 2) * Math.PI / 180;
    const latSpanKm = (north - south) * 111;
    const lonSpanKm = (east - west) * 111 * Math.cos(midLatRad);
    return Math.max(latSpanKm, Math.abs(lonSpanKm));
  }

  function classifyAreaTier(bounds) {
    const span = areaSpanKm(bounds);
    if (span < 8) return 'street';
    if (span < 60) return 'city';
    if (span < 150) return 'region';
    if (span < 1500) return 'country';
    return 'continent';
  }

  // `lang` (optioneel, bv. "ar") forceert Nominatim's `accept-language`-
  // parameter, zodat plaatsnaam/land in die taal terugkomen i.p.v. in de
  // taal die de browser standaard meestuurt — nodig voor Arabische
  // zoekopdrachten (zie location.js' isArabicText/state.captionLang),
  // zonder dat gewoon zoeken hierdoor ooit iets anders krijgt dan voorheen.
  async function reverseGeocode(lat, lon, lang) {
    const url = `${NOMINATIM_ENDPOINT}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1${lang ? `&accept-language=${lang}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim responded with status ${res.status}`);
    const data = await res.json();
    const addr = data.address || {};
    const place = addr.city || addr.town || addr.village || addr.municipality || addr.county || data.name || '';
    const country = addr.country || '';
    return { place, country, raw: data };
  }

  async function searchPlace(query, lang) {
    const url = `${NOMINATIM_ENDPOINT}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=6${lang ? `&accept-language=${lang}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim responded with status ${res.status}`);
    return res.json();
  }

  // Grovere vereenvoudiging (minder coördinaten) naarmate het gebied groter
  // is — een landsgrens of continent hoeft niet elke bocht exact te volgen
  // om als silhouet te werken, en dat scheelt enorm in downloadgrootte.
  function thresholdForSpan(spanKm) {
    if (spanKm < 60) return 0.0001;
    if (spanKm < 250) return 0.001;
    if (spanKm < 1500) return 0.01;
    return 0.05;
  }

  function spanFromBoundingBox(bbox) {
    // Nominatim geeft [south, north, west, east] als strings.
    const south = parseFloat(bbox[0]), north = parseFloat(bbox[1]);
    const west = parseFloat(bbox[2]), east = parseFloat(bbox[3]);
    return areaSpanKm({ south, north, west, east });
  }

  // Haalt de echte bestuurlijke grens op van een specifiek zoekresultaat
  // (stad, wijk, land, werelddeel...) zodat "isoleer gebied" precies dat
  // gebied kan uitsnijden i.p.v. wat er toevallig in het kader staat.
  // Niet elk resultaat heeft een grens (bv. een los adres) — dan is
  // geometry leeg en blijft isoleren voor die keuze uitgeschakeld.
  async function fetchBoundary(searchResult) {
    const typeChar = { relation: 'R', way: 'W', node: 'N' }[searchResult.osm_type];
    if (!typeChar) return null;
    const threshold = thresholdForSpan(spanFromBoundingBox(searchResult.boundingbox));
    const url = `${NOMINATIM_ENDPOINT}/lookup?format=jsonv2&osm_ids=${typeChar}${searchResult.osm_id}&polygon_geojson=1&polygon_threshold=${threshold}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim responded with status ${res.status}`);
    const data = await res.json();
    const found = data[0];
    if (!found || !found.geojson) return null;
    const polygons = geojsonToPolygons(found.geojson);
    if (polygons.length === 0) return null;
    // Alleen de grootste aaneengesloten landmassa gebruiken — een land als
    // Mauritius bestaat bestuurlijk ook uit verafgelegen eilandjes
    // (Rodrigues, Agalega...) honderden kilometers verderop; die in de
    // isolatie meenemen zou het hoofdeiland verdrinken in een enorme lege
    // oceaan i.p.v. "zoals het op de kaart staat" gerenderd te worden.
    let rings = polygons[0], bestArea = ringArea(polygons[0][0]);
    for (let i = 1; i < polygons.length; i++) {
      const area = ringArea(polygons[i][0]);
      if (area > bestArea) { bestArea = area; rings = polygons[i]; }
    }
    return { rings, bounds: boundsFromRings(rings) };
  }

  // Polygon -> [ [ [lat,lon], ... ] ], MultiPolygon -> meerdere van die
  // polygonen — elk polygoon een array van ringen (eerste ring de
  // buitenrand, de rest gaten). GeoJSON is [lon,lat]; hier omgezet naar ons
  // interne [lat,lon].
  function geojsonToPolygons(geojson) {
    const polygons = geojson.type === 'MultiPolygon' ? geojson.coordinates
      : geojson.type === 'Polygon' ? [geojson.coordinates]
      : null;
    if (!polygons) return [];
    return polygons.map(poly => poly.map(ring => ring.map(([lon, lat]) => [lat, lon])));
  }

  // Shoelace-formule — geen echte oppervlakte in km² (lengtegraden wegen
  // niet overal even zwaar), maar ruim voldoende nauwkeurig om simpelweg
  // "welk polygoon is duidelijk het grootst" te bepalen.
  function ringArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lat1, lon1] = ring[i];
      const [lat2, lon2] = ring[(i + 1) % ring.length];
      area += lon1 * lat2 - lon2 * lat1;
    }
    return Math.abs(area) / 2;
  }

  function boundsFromRings(rings) {
    let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
    rings.forEach(ring => ring.forEach(([lat, lon]) => {
      if (lat < south) south = lat; if (lat > north) north = lat;
      if (lon < west) west = lon; if (lon > east) east = lon;
    }));
    return { south, north, west, east };
  }

  // "Cover"-projectie: schaalt zodat de bounding box het volledige doelvlak
  // vult (net als background-size:cover), zodat een iets afwijkende
  // verhouding nooit tot een vervormde kaart leidt — het beeld wordt eerder
  // lichtjes bijgesneden dan uitgerekt.
  function makeCoverProjector(bounds, mapW, mapH) {
    const { south, west, north, east } = bounds;
    const midLatRad = ((south + north) / 2) * Math.PI / 180;
    const lonScale = Math.cos(midLatRad) || 0.0001;
    const spanX = (east - west) * lonScale;
    const spanY = (north - south) || 0.0001;
    const scale = Math.max(mapW / (spanX || 0.0001), mapH / spanY);
    const drawW = spanX * scale, drawH = spanY * scale;
    const offsetX = (mapW - drawW) / 2, offsetY = (mapH - drawH) / 2;
    return function project(lat, lon) {
      const x = offsetX + (lon - west) * lonScale * scale;
      const y = offsetY + (north - lat) * scale;
      return [x, y];
    };
  }

  // "Contain"-projectie: schaalt zodat de hele bounding box binnen het
  // doelvlak past (net als background-size:contain) — gebruikt voor
  // "isoleer gebied", waar je per definitie de HELE vorm wilt zien, niet
  // een bijgesneden stuk ervan.
  function makeContainProjector(bounds, mapW, mapH) {
    const { south, west, north, east } = bounds;
    const midLatRad = ((south + north) / 2) * Math.PI / 180;
    const lonScale = Math.cos(midLatRad) || 0.0001;
    const spanX = (east - west) * lonScale;
    const spanY = (north - south) || 0.0001;
    const scale = Math.min(mapW / (spanX || 0.0001), mapH / spanY);
    const drawW = spanX * scale, drawH = spanY * scale;
    const offsetX = (mapW - drawW) / 2, offsetY = (mapH - drawH) / 2;
    return function project(lat, lon) {
      const x = offsetX + (lon - west) * lonScale * scale;
      const y = offsetY + (north - lat) * scale;
      return [x, y];
    };
  }

  return {
    roadWeight, isMajorRoad, classifyAreaTier,
    reverseGeocode, searchPlace, fetchBoundary,
    makeCoverProjector, makeContainProjector,
  };
})();
