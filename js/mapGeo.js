// Alles wat met echte geo-data te maken heeft: het ophalen van straten/water
// via de Overpass API (OpenStreetMap), omgekeerd geocoderen van een punt naar
// plaatsnaam/land via Nominatim, en de projectie van lat/lon naar pixels.
// Draait in de browser van de bezoeker — niet in deze sandbox, dus hier geen
// live netwerktests, wel zorgvuldig gebouwd tegen de gedocumenteerde API's.
const MapGeo = (() => {
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org';

  const ROAD_WEIGHT = {
    motorway: 3.2, motorway_link: 2.4, trunk: 3, trunk_link: 2.2, primary: 2.6, primary_link: 2,
    secondary: 2.2, tertiary: 1.8, residential: 1.2, unclassified: 1.1, service: 0.7,
    footway: 0.5, path: 0.5, cycleway: 0.5, pedestrian: 0.9, living_street: 1, track: 0.5,
  };
  const MAJOR_ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary'];

  function roadWeight(tags) { return ROAD_WEIGHT[tags.highway] || 1; }
  function isMajorRoad(tags) { return MAJOR_ROAD_TYPES.includes(tags.highway); }

  function bboxStr(bounds) { return `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`; }

  // Classificeert de grootte van het gekozen gebied, zodat we bij grote
  // selecties (een regio of heel land) veel minder data opvragen — anders
  // wijst Overpass de query af met "429 Too Many Requests" (te duur/te groot).
  // Grofweg: straat/buurt (<8km), stad (<60km), regio (<250km), land (rest).
  function areaSpanKm(bounds) {
    const { south, west, north, east } = bounds;
    const midLatRad = ((south + north) / 2) * Math.PI / 180;
    const latSpanKm = (north - south) * 111;
    const lonSpanKm = (east - west) * 111 * Math.cos(midLatRad);
    return Math.max(latSpanKm, Math.abs(lonSpanKm));
  }

  // 'continent' fetcht helemaal geen Overpass-data meer (zelfs alleen
  // hoofdwegen zou voor een heel continent nog veel te zwaar zijn) — daar
  // rendert MapRender alleen de silhouet + gegenereerde textuur.
  function classifyAreaTier(bounds) {
    const span = areaSpanKm(bounds);
    if (span < 8) return 'street';
    if (span < 60) return 'city';
    if (span < 250) return 'region';
    if (span < 1500) return 'country';
    return 'continent';
  }

  function buildStreetsQuery(bounds, tier = 'street') {
    const bbox = bboxStr(bounds);
    if (tier === 'country') {
      // Alleen de hoofdaders en grote wateroppervlaktes (met naam, als proxy
      // voor "significant") — geen kleine weggetjes, geen parken/bos, geen
      // rivierlijnen: bij deze schaal onzichtbaar maar wel zwaar qua data.
      return `[out:json][timeout:25];(
        way["highway"~"^(motorway|trunk|primary)$"](${bbox});
        way["natural"="water"]["name"](${bbox});
      );out body;>;out skel qt;`;
    }
    if (tier === 'region') {
      return `[out:json][timeout:25];(
        way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox});
        way["waterway"~"^(river|canal)$"](${bbox});
        way["natural"="water"](${bbox});
      );out body;>;out skel qt;`;
    }
    // street / city: volledig detail, zoals bij een straat of stad prima te
    // behappen is voor Overpass.
    return `[out:json][timeout:25];(
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["natural"="water"](${bbox});
      way["leisure"="park"](${bbox});
      way["landuse"="forest"](${bbox});
      way["landuse"="grass"](${bbox});
    );out body;>;out skel qt;`;
  }

  function buildLandmarksQuery(bounds, tier = 'street') {
    const bbox = bboxStr(bounds);
    if (tier === 'country' || tier === 'region') {
      // Strenger: alleen plekken die zowel een wikidata- als wikipedia-tag
      // hebben (dus écht bekend), en beperkt tot de belangrijkste categorieën
      // — met een harde cap op het aantal resultaten zodat de respons klein
      // blijft ongeacht hoeveel er in het gebied liggen.
      const cap = tier === 'country' ? 40 : 60;
      return `[out:json][timeout:25];(
        node["tourism"~"^(attraction|museum)$"]["wikidata"]["wikipedia"](${bbox});
        node["historic"~"^(monument|castle)$"]["wikidata"]["wikipedia"](${bbox});
        way["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"]["wikipedia"](${bbox});
        relation["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"]["wikipedia"](${bbox});
      );out center ${cap};`;
    }
    return `[out:json][timeout:25];(
      node["tourism"~"^(attraction|museum|viewpoint|artwork)$"]["wikidata"](${bbox});
      node["historic"~"^(monument|castle|memorial|ruins)$"]["wikidata"](${bbox});
      way["tourism"~"^(attraction|museum)$"]["wikidata"](${bbox});
      way["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"](${bbox});
      relation["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"](${bbox});
    );out center;`;
  }

  // Alle gebouwvoetafdrukken (niet alleen bekende landmarks) — alleen
  // zinvol/betaalbaar op straat- en stadschaal, gebruikt voor de OG MW2
  // Game Style die gebouwomtrekken tekent zoals de originele minimap dat deed.
  function buildBuildingsQuery(bounds) {
    const bbox = bboxStr(bounds);
    return `[out:json][timeout:25];(
      way["building"](${bbox});
    );out body;>;out skel qt;`;
  }

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // Overpass' publieke instantie geeft af en toe kortstondig 429 terug, ook
  // voor een op zich redelijke query (drukte op de server). Eén keer
  // opnieuw proberen na een korte pauze lost dat meestal op; blijft het
  // fout gaan dan is de query zelf te zwaar en geven we dat door.
  async function runOverpassQuery(query, { retries = 1 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
      });
      if (res.ok) return res.json();
      if (res.status === 429 && attempt < retries) {
        await wait(1500 * (attempt + 1));
        continue;
      }
      throw new Error(`Overpass antwoordde met status ${res.status}`);
    }
  }

  // Zet de platte elements-lijst van Overpass om in wegen/water/groen als
  // arrays van [lat, lon]-coördinaten, met de originele tags erbij.
  function parseWays(data) {
    const nodes = new Map();
    (data.elements || []).forEach(el => {
      if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    });
    const ways = [];
    (data.elements || []).forEach(el => {
      if (el.type === 'way' && Array.isArray(el.nodes)) {
        const coords = el.nodes.map(id => nodes.get(id)).filter(Boolean);
        if (coords.length >= 2) ways.push({ tags: el.tags || {}, coords });
      }
    });
    return ways;
  }

  function parseLandmarks(data) {
    return (data.elements || [])
      .map(el => {
        const tags = el.tags || {};
        const name = tags.name;
        if (!name) return null;
        const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null || lon == null) return null;
        return { name, lat, lon };
      })
      .filter(Boolean);
  }

  async function fetchStreets(bounds, tier = 'street') {
    if (tier === 'continent') return [];
    return parseWays(await runOverpassQuery(buildStreetsQuery(bounds, tier)));
  }

  async function fetchLandmarks(bounds, tier = 'street') {
    if (tier === 'continent') return [];
    return parseLandmarks(await runOverpassQuery(buildLandmarksQuery(bounds, tier)));
  }

  async function fetchBuildings(bounds, tier = 'street') {
    if (tier !== 'street' && tier !== 'city') return [];
    return parseWays(await runOverpassQuery(buildBuildingsQuery(bounds)));
  }

  async function reverseGeocode(lat, lon) {
    const url = `${NOMINATIM_ENDPOINT}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim antwoordde met status ${res.status}`);
    const data = await res.json();
    const addr = data.address || {};
    const place = addr.city || addr.town || addr.village || addr.municipality || addr.county || data.name || '';
    const country = addr.country || '';
    return { place, country, raw: data };
  }

  async function searchPlace(query) {
    const url = `${NOMINATIM_ENDPOINT}/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=6`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Nominatim antwoordde met status ${res.status}`);
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
    if (!res.ok) throw new Error(`Nominatim antwoordde met status ${res.status}`);
    const data = await res.json();
    const found = data[0];
    if (!found || !found.geojson) return null;
    const rings = geojsonToRings(found.geojson);
    if (rings.length === 0) return null;
    return { rings, bounds: boundsFromRings(rings) };
  }

  // Polygon -> [ [ [lat,lon], ... ] ], MultiPolygon -> meerdere van die
  // ringen-lijsten — plat geslagen tot één lijst van ringen (elke ring een
  // array van [lat,lon]-punten, eerste ring van elk polygoon is de
  // buitenrand, de rest zijn gaten). GeoJSON is [lon,lat]; hier omgezet naar
  // ons interne [lat,lon].
  function geojsonToRings(geojson) {
    const polygons = geojson.type === 'MultiPolygon' ? geojson.coordinates
      : geojson.type === 'Polygon' ? [geojson.coordinates]
      : null;
    if (!polygons) return [];
    const rings = [];
    polygons.forEach(poly => poly.forEach(ring => {
      rings.push(ring.map(([lon, lat]) => [lat, lon]));
    }));
    return rings;
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
    fetchStreets, fetchLandmarks, fetchBuildings, reverseGeocode, searchPlace, fetchBoundary,
    makeCoverProjector, makeContainProjector,
  };
})();
