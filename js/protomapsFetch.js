// Haalt kaartdata op uit ons zelf-gehoste Protomaps-planeetbestand (PMTiles
// op Cloudflare R2) i.p.v. live Overpass-queries. Zelfde publieke interface
// als MapGeo.fetchStreets/fetchBuildings (bounds, tier[, styleHint] -> array
// in identieke {tags, coords}/{tags, rings}-vorm), zodat location.js zonder
// verdere aanpassingen kan wisselen tussen de twee databronnen.
//
// Kern-aanpak: per tier een passend zoomniveau kiezen (klein gebied = diep
// zoomen voor vol detail, groot gebied = ondiep zoomen zodat het aantal
// benodigde tegels laag blijft — net zoals classifyAreaTier in mapGeo.js al
// per tier de Overpass-querybelasting begrenst), de tegels ophalen/decoderen
// via ProtomapsAdapter, en daarna dezelfde soort wegtype-/waterfilters
// toepassen die buildStreetsQuery voor Overpass al per tier gebruikte —
// zodat het resultaat er per tier hetzelfde uitziet, ongeacht de databron.
const ProtomapsFetch = (() => {
  const PMTILES_URL = 'https://pub-e184090159cf437fbbe48fe58c448cba.r2.dev/planet.pmtiles';
  const MAX_TILES = 400; // defensieve bovengrens — mag nooit overschreden worden bij correcte TIER_ZOOM-waarden

  let archive = null;
  function getArchive() {
    if (!archive) archive = new pmtiles.PMTiles(PMTILES_URL);
    return archive;
  }

  // Standaard slippy-tile voorwaartse projectie: lon/lat -> tegel x/y op zoom z.
  function lonLatToTile(lon, lat, z) {
    const n = Math.pow(2, z);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
  }

  // Zoomniveau per tier: diep genoeg voor voldoende detail, ondiep genoeg om
  // het aantal tegels laag te houden. Nog te verifiëren tegen echte
  // dekkingsdata (welke wegtypes daadwerkelijk aanwezig zijn op elk niveau)
  // zodra dit live getest kan worden.
  const TIER_ZOOM = { street: 15, city: 12, region: 9, country: 5 };

  function tilesForBounds(bounds, z) {
    const nw = lonLatToTile(bounds.west, bounds.north, z);
    const se = lonLatToTile(bounds.east, bounds.south, z);
    const tiles = [];
    // Stopt zodra MAX_TILES bereikt is — bij een (in theorie nooit
    // voorkomende, maar defensief af te vangen) enorm gebied op een hoge
    // zoom zou de volledige x*y-combinatie anders eerst helemaal opgebouwd
    // moeten worden vóór het afkappen, wat de browser kan laten vastlopen.
    outer:
    for (let x = nw.x; x <= se.x; x++) {
      for (let y = nw.y; y <= se.y; y++) {
        if (tiles.length >= MAX_TILES) break outer;
        tiles.push({ z, x, y });
      }
    }
    return tiles;
  }

  async function fetchTileFeatures(z, x, y) {
    try {
      const result = await getArchive().getZxy(z, x, y);
      if (!result || !result.data) return [];
      const pbf = new Pbf(new Uint8Array(result.data));
      const tile = new VectorTile(pbf);
      return ProtomapsAdapter.translateTile(tile, z, x, y);
    } catch (err) {
      // Eén mislukte/ontbrekende tegel (bv. leeg oceaangebied, of een
      // kortstondige netwerkhapering) mag de rest van het gebied niet
      // laten mislukken — gewoon overslaan. Wél loggen: een STELSELMATIGE
      // fout (verkeerd API-gebruik, kapotte archiefstructuur) zou anders
      // altijd stil verdwijnen als "0 elements loaded" zonder enig spoor.
      console.error(`ProtomapsFetch: tegel ${z}/${x}/${y} mislukt —`, err);
      return [];
    }
  }

  async function fetchArea(bounds, tier) {
    if (tier === 'continent') return []; // net als Overpass: geen data, alleen silhouet
    const z = TIER_ZOOM[tier] || TIER_ZOOM.street;
    const tiles = tilesForBounds(bounds, z);
    const perTile = await Promise.all(tiles.map(t => fetchTileFeatures(t.z, t.x, t.y)));
    return perTile.flat();
  }

  // fetchStreets en fetchBuildings halen dezelfde tegels op (alle data zit
  // al samen in één tegel, anders dan bij Overpass' aparte queries) — deze
  // eenvoudige laatste-aanroep-cache voorkomt dat location.js (dat bij MW2
  // Style eerst fetchStreets en vlak daarna fetchBuildings voor hetzelfde
  // gebied aanroept) de tegels twee keer ophaalt/decodeert.
  let lastAreaKey = null, lastAreaPromise = null;
  function fetchAreaCached(bounds, tier) {
    const key = tier + ':' + [bounds.south, bounds.west, bounds.north, bounds.east].map(n => n.toFixed(4)).join(',');
    if (key !== lastAreaKey) { lastAreaKey = key; lastAreaPromise = fetchArea(bounds, tier); }
    return lastAreaPromise;
  }

  // Zelfde wegtype-toelatingslijsten per tier als buildStreetsQuery voor
  // Overpass gebruikte — houdt het resultaat consistent ongeacht databron.
  const HIGHWAY_ALLOW = {
    country: new Set(['motorway', 'trunk', 'primary', 'secondary']),
    region: new Set(['motorway', 'trunk', 'primary', 'secondary']),
    city: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street']),
    // street: geen filter, alles toegestaan.
  };

  function filterStreets(features, tier, styleHint) {
    const allow = HIGHWAY_ALLOW[tier];
    const skipGreenery = styleHint === 'gta' || styleHint === 'rdr2';
    return features.filter(f => {
      if (f.tags.highway) return !allow || allow.has(f.tags.highway);
      if (f.tags.waterway) {
        // Grote schaal (region/country): alleen genoemde waterlopen, net
        // als Overpass' "waterway=river"-filter daar — voorkomt dat elk
        // beekje op landschaal meegenomen wordt.
        if (tier === 'country' || tier === 'region') return !!f.tags.name;
        return true;
      }
      if (f.tags.natural === 'water') {
        if (tier === 'country' || tier === 'region') return !!f.tags.name;
        return true;
      }
      if (f.tags.leisure === 'park' || f.tags.landuse) {
        // Net als Overpass: groen alleen op straat/stad-schaal, en nooit
        // voor Game Styles die toch een eigen achtergrond tekenen.
        return (tier === 'street' || tier === 'city') && !skipGreenery;
      }
      return true;
    });
  }

  async function fetchStreets(bounds, tier = 'street', styleHint = null) {
    const all = await fetchAreaCached(bounds, tier);
    return filterStreets(all.filter(f => !f.tags.building), tier, styleHint);
  }

  async function fetchBuildings(bounds, tier = 'street') {
    if (tier !== 'street' && tier !== 'city') return [];
    const all = await fetchAreaCached(bounds, tier);
    return all.filter(f => f.tags.building);
  }

  return { fetchStreets, fetchBuildings, tilesForBounds, lonLatToTile, PMTILES_URL };
})();
