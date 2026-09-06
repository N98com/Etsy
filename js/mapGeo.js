// Alles wat met echte geo-data te maken heeft: het ophalen van straten/water
// via de Overpass API (OpenStreetMap), omgekeerd geocoderen van een punt naar
// plaatsnaam/land via Nominatim, en de projectie van lat/lon naar pixels.
// Draait in de browser van de bezoeker — niet in deze sandbox, dus hier geen
// live netwerktests, wel zorgvuldig gebouwd tegen de gedocumenteerde API's.
const MapGeo = (() => {
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
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
  // 'region' eindigt bewust vroeg (150km i.p.v. voorheen 250km): een "heel
  // eiland" van gemiddelde grootte (Cyprus, Kreta, Sicilië...) valt zo in de
  // veel lichtere 'country'-query i.p.v. de zwaardere 'region'-query die bij
  // zulke oppervlaktes tot een 504 (gateway timeout) bij Overpass leidde.
  function classifyAreaTier(bounds) {
    const span = areaSpanKm(bounds);
    if (span < 8) return 'street';
    if (span < 60) return 'city';
    if (span < 150) return 'region';
    if (span < 1500) return 'country';
    return 'continent';
  }

  function buildStreetsQuery(bounds, tier = 'street', styleHint = null) {
    const bbox = bboxStr(bounds);
    if (tier === 'country') {
      // Hoofdaders t/m secundaire wegen, plus rivieren en grote
      // wateroppervlaktes (met naam, als proxy voor "significant" — anders
      // komt elke naamloze vijver/plas van het hele land erbij, wat op
      // deze schaal alleen maar ruis is). "out geom" levert de coördinaten
      // meteen per way (geen aparte node-verzameling nodig via ">"), wat
      // over zo'n groot gebied veel minder data en rekentijd kost. Bewust
      // GEEN "out geom N" harde bovengrens: Overpass knipt zo'n limiet af
      // op interne ID-volgorde, niet ruimtelijk — een weg bestaat uit
      // meerdere los genummerde stukjes, dus een afkap-limiet levert
      // typisch een onvolledige, kapot ogende kaart op (losse streepjes
      // i.p.v. doorlopende wegen) i.p.v. gewoon een kleinere kaart. Loopt
      // de query alsnog vast, dan geeft Overpass een duidelijke
      // timeout-foutmelding i.p.v. stilletjes een kapotte afbeelding.
      return `[out:json][timeout:40];(
        way["highway"~"^(motorway|trunk|primary|secondary)$"](${bbox});
        way["waterway"="river"](${bbox});
        way["natural"="water"]["name"](${bbox});
      );out geom;`;
    }
    if (tier === 'region') {
      // Geen tertiaire weggetjes en geen kanalen/naamloze plasjes meer — op
      // deze schaal (60-150km) zijn die op een echte kaart toch niet meer
      // als individuele lijntjes te onderscheiden. Zie hierboven waarom er
      // geen "out geom N" afkap-limiet meer op zit.
      return `[out:json][timeout:30];(
        way["highway"~"^(motorway|trunk|primary|secondary)$"](${bbox});
        way["waterway"="river"](${bbox});
        way["natural"="water"]["name"](${bbox});
      );out geom;`;
    }
    // Game Styles (GTA V, RDR2) tekenen nooit parken/bos/gras — MapRender
    // gebruikt voor die stijlen een heel andere achtergrond (terreincontouren
    // resp. procedureel camouflage-terrein). Die data dan toch ophalen is
    // pure verspilling, en juist in dichtbebouwde grote steden (Los Angeles,
    // San Francisco, New York...) is dat verschil merkbaar in queryzwaarte.
    const skipGreenery = styleHint === 'gta' || styleHint === 'rdr2';
    const greenery = skipGreenery ? '' : `
      way["leisure"="park"](${bbox});
      way["landuse"="forest"](${bbox});
      way["landuse"="grass"](${bbox});`;
    if (tier === 'city') {
      // Volledig woonstratennet, tot en met residential/unclassified/
      // living_street — ook bij een ruime (~60km) selectie van een
      // dichtbebouwde stad als Los Angeles. Alleen voetpaden/opritten/
      // servicewegen/fietspaden vallen af: die zijn op posterschaal nooit
      // individueel te onderscheiden en zorgden er eerder voor dat
      // Overpass zulke queries niet op tijd behapte. Bewust geen
      // "out geom N" afkap-limiet (zie toelichting bij country hierboven):
      // dat sneed willekeurig stukken van wegen weg (Overpass knipt op
      // interne ID-volgorde, niet ruimtelijk) en gaf zo een kapot ogende
      // kaart vol losse streepjes i.p.v. een complete kaart.
      return `[out:json][timeout:40];(
        way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](${bbox});
        way["waterway"](${bbox});
        way["natural"="water"](${bbox});${greenery}
      );out geom;`;
    }
    // street: kleine selectie, hier is volledig detail (incl. voetpaden e.d.)
    // prima te behappen voor Overpass.
    return `[out:json][timeout:25];(
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["natural"="water"](${bbox});${greenery}
    );out geom;`;
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
    );out geom;`;
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
  // arrays van [lat, lon]-coördinaten, met de originele tags erbij. Alle
  // queries vragen "out geom" op, dus elke way draagt zijn coördinaten al
  // inline mee (geen aparte node-verzameling meer nodig om te doorzoeken).
  function parseWays(data) {
    return (data.elements || [])
      .filter(el => el.type === 'way' && Array.isArray(el.geometry))
      .map(el => ({ tags: el.tags || {}, coords: el.geometry.map(pt => [pt.lat, pt.lon]) }))
      .filter(w => w.coords.length >= 2);
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

  async function fetchStreets(bounds, tier = 'street', styleHint = null) {
    if (tier === 'continent') return [];
    return parseWays(await runOverpassQuery(buildStreetsQuery(bounds, tier, styleHint)));
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
    fetchStreets, fetchLandmarks, fetchBuildings, reverseGeocode, searchPlace, fetchBoundary,
    makeCoverProjector, makeContainProjector,
  };
})();
