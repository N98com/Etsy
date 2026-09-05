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

  function buildStreetsQuery(bounds) {
    const bbox = bboxStr(bounds);
    return `[out:json][timeout:25];(
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["natural"="water"](${bbox});
      way["leisure"="park"](${bbox});
      way["landuse"="forest"](${bbox});
      way["landuse"="grass"](${bbox});
    );out body;>;out skel qt;`;
  }

  function buildLandmarksQuery(bounds) {
    const bbox = bboxStr(bounds);
    return `[out:json][timeout:25];(
      node["tourism"~"^(attraction|museum|viewpoint|artwork)$"]["wikidata"](${bbox});
      node["historic"~"^(monument|castle|memorial|ruins)$"]["wikidata"](${bbox});
      way["tourism"~"^(attraction|museum)$"]["wikidata"](${bbox});
      way["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"](${bbox});
      relation["building"~"^(cathedral|church|mosque|synagogue|temple)$"]["wikidata"](${bbox});
    );out center;`;
  }

  async function runOverpassQuery(query) {
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`Overpass antwoordde met status ${res.status}`);
    return res.json();
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

  async function fetchStreets(bounds) {
    return parseWays(await runOverpassQuery(buildStreetsQuery(bounds)));
  }

  async function fetchLandmarks(bounds) {
    return parseLandmarks(await runOverpassQuery(buildLandmarksQuery(bounds)));
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

  return {
    roadWeight, isMajorRoad,
    fetchStreets, fetchLandmarks, reverseGeocode, searchPlace,
    makeCoverProjector,
  };
})();
