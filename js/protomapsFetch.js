// Haalt kaartdata op uit ons zelf-gehoste Protomaps-planeetbestand (PMTiles
// op Cloudflare R2) — de databron die location.js voor straten/water/
// gebouwen gebruikt (voorheen live Overpass-queries via mapGeo.js, zie
// diens headercomment voor waarom dat pad verwijderd is). Publieke interface
// (bounds, tier[, styleHint] -> array in {tags, coords}/{tags, rings}-vorm)
// bleef gelijk, zodat location.js verder ongewijzigd bleef.
//
// Kern-aanpak: per tier een passend zoomniveau kiezen (klein gebied = diep
// zoomen voor vol detail, groot gebied = ondiep zoomen zodat het aantal
// benodigde tegels laag blijft — zie pickZoomForBounds hieronder voor
// land/continent-schaal), de tegels ophalen/decoderen via ProtomapsAdapter,
// en daarna wegtype-/waterfilters per tier toepassen zodat het resultaat er
// per schaal even opgeruimd uitziet (minder relevant voor een backend-limiet
// nu, meer voor leesbaarheid: te veel wegjes op landschaal oogt als ruis).
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

  // Zoomniveau per tier. Belangrijk inzicht (na live testen op landniveau):
  // Protomaps' geometrie op erg grove zoomniveaus (z5 e.d.) is voorvereenvoudigd
  // met de aanname dat hij als dun lijntje op een kleine kaart-tegel getoond
  // wordt — diezelfde vorm uitvergroot als hoofdmotief op een poster oogt dan
  // "wild"/rafelig i.p.v. een nette hoofdwegenkaart. Vandaar land/regio nu
  // een stuk dieper (minder voorvereenvoudigde brongeometrie), met het
  // tegelaantal nog steeds ruim onder MAX_TILES voor een normaal land/regio.
  const TIER_ZOOM = { street: 15, city: 12, region: 11, country: 8 };

  // Ruwe tegeltelling op een zoomniveau, zonder MAX_TILES-afkap — gebruikt om
  // vooraf het diepste zoomniveau te vinden dat het gekozen gebied nog
  // VOLLEDIG dekt (geen afgeknipte rand doordat tilesForBounds bij MAX_TILES
  // stopt).
  function tileCountAtZoom(bounds, z) {
    const nw = lonLatToTile(bounds.west, bounds.north, z);
    const se = lonLatToTile(bounds.east, bounds.south, z);
    return (se.x - nw.x + 1) * (se.y - nw.y + 1);
  }

  // Voor land/continent-schaal (waar de oppervlakte enorm kan variëren, van
  // een klein land tot een heel continent) is één vast zoomniveau zoals bij
  // street/city/region niet veilig — dus zoeken we hier het diepste
  // zoomniveau dat het HELE gekozen gebied nog compleet dekt binnen het
  // tegelbudget. Nu de data van ons eigen R2-gehoste PMTiles-bestand komt
  // (geen Overpass-rate-limit meer zoals vroeger), is er geen reden meer om
  // grote gebieden helemaal geen data te geven — dat leverde voorheen bij
  // een hele (grote) staat of land alleen een nep-textuur op i.p.v. een
  // echte kaart.
  function pickZoomForBounds(bounds, maxZoom) {
    for (let z = maxZoom; z >= 2; z--) {
      if (tileCountAtZoom(bounds, z) <= MAX_TILES) return z;
    }
    return 2;
  }

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
      if (!result || !result.data) return { features: [], error: null };
      const pbf = new Pbf(new Uint8Array(result.data));
      const tile = new VectorTile(pbf);
      return { features: ProtomapsAdapter.translateTile(tile, z, x, y), error: null };
    } catch (err) {
      // Loggen (zichtbaar voor wie wél DevTools bij de hand heeft) — maar
      // nog belangrijker: dit geven we terug aan fetchArea hieronder, die
      // beslist of dit een op zichzelf staand hikje was (mag genegeerd
      // worden) of een stelselmatig probleem (moet zichtbaar worden op de
      // pagina zelf, ook zonder DevTools — bv. op een telefoon).
      console.error(`ProtomapsFetch: tegel ${z}/${x}/${y} mislukt —`, err);
      return { features: [], error: err };
    }
  }

  async function fetchArea(bounds, tier) {
    // street/city/region: vast zoomniveau (oppervlakte-spreiding binnen die
    // tiers is klein genoeg om altijd veilig te zijn). country/continent:
    // dynamisch bepaald — zie pickZoomForBounds hierboven.
    const z = (tier === 'street' || tier === 'city' || tier === 'region')
      ? TIER_ZOOM[tier]
      : pickZoomForBounds(bounds, TIER_ZOOM.country);
    const tiles = tilesForBounds(bounds, z);
    const perTile = await Promise.all(tiles.map(t => fetchTileFeatures(t.z, t.x, t.y)));
    const errorCount = perTile.reduce((n, r) => n + (r.error ? 1 : 0), 0);
    // Eén of een paar mislukte tegels tussen verder geslaagde (bv. een
    // kortstondige netwerkhapering) mogen genegeerd worden — maar als
    // ELKE tegel dezelfde fout geeft, is dit geen toeval meer (verkeerd
    // library-gebruik, kapot archief, CORS) en moet dat zichtbaar worden
    // i.p.v. stil te verdwijnen als "0 elements loaded". Deze fout komt
    // via fetchStreets/fetchBuildings terecht bij location.js' bestaande
    // "Fetch failed: ..."-statustekst — dus rechtstreeks op de pagina
    // zichtbaar, geen DevTools/console nodig.
    if (tiles.length > 0 && errorCount === tiles.length) {
      throw new Error(perTile[0].error.message || String(perTile[0].error));
    }
    const all = perTile.flatMap(r => r.features);
    // Geen enkele fout, maar ook geen enkel feature in ALLE opgehaalde
    // tegels samen — voor een normale, bewoonde plek is dat vrijwel zeker
    // een bug (verkeerde tegel-coördinaten, verkeerd zoomniveau) en geen
    // toeval. Ook dit zichtbaar maken i.p.v. stil "0 elements loaded".
    if (tiles.length > 0 && errorCount === 0 && all.length === 0) {
      throw new Error(`${tiles.length} tegel(s) opgehaald op zoom ${z} (tier ${tier}), maar 0 features erin — mogelijk verkeerd zoomniveau/coördinaten. Gebied: ${bounds.south.toFixed(3)},${bounds.west.toFixed(3)} – ${bounds.north.toFixed(3)},${bounds.east.toFixed(3)}`);
    }
    return all;
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

  // Land/regio begonnen bij exact dezelfde lijst als Overpass' oude
  // country-query (motorway t/m secondary) — op verzoek iets gedetailleerder
  // gemaakt met tertiary erbij, dat geeft op landschaal net dat beetje meer
  // wegennet zonder meteen naar de volle woonstraten-dichtheid te gaan.
  const HIGHWAY_ALLOW = {
    country: new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']),
    region: new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']),
    // Continent-schaal dekt nu ook een enkel groot land (zie pickZoomForBounds
    // hierboven) — nog soberder dan country, anders verzuipt het weinige
    // resterende detail op zo'n grove zoom in te veel wegklassen.
    continent: new Set(['motorway', 'trunk', 'primary']),
    city: new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street']),
    // street: geen filter, alles toegestaan.
  };

  // Water (lijnen én vlakken) altijd tonen, op elke schaal, ongefilterd op
  // naam. Dat "alleen genoemd water"-filter komt oorspronkelijk van
  // Overpass' ["name"]-tag-filter (nodig omdat een Overpass-query LETTERLIJK
  // ELK water in het gekozen gebied teruggaf, ongeacht schaal) — maar
  // Protomaps' tegels bevatten van zichzelf al alleen het water dat op dat
  // zoomniveau significant genoeg is (net als bij wegen, zie HIGHWAY_ALLOW-
  // commentaar). Het naamfilter bleek zelfs actief schadelijk: een oceaan/
  // zee-vlak is in deze data een samengestelde vulling zonder eigen naam-tag,
  // dus "alleen genoemd water" filterde op land/continent-schaal de HELE zee
  // weg — precies het element dat een kaart op die schaal herkenbaar maakt.
  function filterStreets(features, tier, styleHint) {
    const allow = HIGHWAY_ALLOW[tier];
    const skipGreenery = styleHint === 'gta' || styleHint === 'rdr2';
    return features.filter(f => {
      if (f.tags.highway) return !allow || allow.has(f.tags.highway);
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
