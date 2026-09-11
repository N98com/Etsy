// Alles wat met echte geo-data te maken heeft: het ophalen van straten/water
// via de Overpass API (OpenStreetMap), omgekeerd geocoderen van een punt naar
// plaatsnaam/land via Nominatim, en de projectie van lat/lon naar pixels.
// Draait in de browser van de bezoeker — niet in deze sandbox, dus hier geen
// live netwerktests, wel zorgvuldig gebouwd tegen de gedocumenteerde API's.
const MapGeo = (() => {
  // Twee onafhankelijke publieke Overpass-instanties: als de eerste
  // volledig onbereikbaar is (een echte storing, niet even druk — zie
  // runOverpassQuery), valt de tool terug op de tweede i.p.v. helemaal
  // stil te vallen. Twee losse organisaties, dus een storing bij de één
  // treft de ander normaal gesproken niet.
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
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

  // 'continent' fetcht via deze (ongebruikte, want vervangen door
  // ProtomapsFetch) Overpass-query helemaal geen data meer — dat was destijds
  // nodig omdat zelfs alleen hoofdwegen voor een heel continent te zwaar was
  // voor de gedeelde publieke Overpass-servers. ProtomapsFetch (de databron
  // die location.js daadwerkelijk gebruikt) heeft die beperking niet meer —
  // zie daar pickZoomForBounds, die deze tier juist wél van (grof gezoomde)
  // echte data voorziet, tot en met een heel land/continent.
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
        way["natural"~"^(water|bay)$"]["name"](${bbox});
        relation["natural"~"^(water|bay)$"]["name"](${bbox});
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
        way["natural"~"^(water|bay)$"]["name"](${bbox});
        relation["natural"~"^(water|bay)$"]["name"](${bbox});
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
        way["natural"~"^(water|bay)$"](${bbox});
        relation["natural"~"^(water|bay)$"](${bbox});
        way["natural"="coastline"](${bbox});${greenery}
      );out geom;`;
    }
    // street: kleine selectie, hier is volledig detail (incl. voetpaden e.d.)
    // prima te behappen voor Overpass.
    return `[out:json][timeout:25];(
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["natural"~"^(water|bay)$"](${bbox});
      relation["natural"~"^(water|bay)$"](${bbox});
      way["natural"="coastline"](${bbox});${greenery}
    );out geom;`;
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

  // Bovenop de query's eigen server-side "[timeout:N]" (die alleen bepaalt
  // hoe lang OVERPASS zelf mag rekenen) staat hier een client-side limiet
  // op de hele aanvraag — zonder die grens kan fetch() onbeperkt blijven
  // hangen als een server de verbinding stilletjes laat hangen (accepteert
  // maar nooit antwoordt) i.p.v. actief te weigeren, en zou onze mirror-
  // fallback hieronder dus nooit in actie komen.
  const FETCH_TIMEOUT_MS = 45000;
  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // Overpass' publieke instantie geeft af en toe kortstondig 429 terug, ook
  // voor een op zich redelijke query (drukte op de server) — dat is de
  // moeite van een nieuwe poging op DEZELFDE server waard. Een echte
  // netwerkfout (fetch() die zelf faalt, bv. Safari's "Load failed", of een
  // afgebroken hang via fetchWithTimeout) is een ander verhaal: dat
  // betekent meestal dat de server niet even druk maar écht onbereikbaar
  // is (storing), en dan heeft nogmaals dezelfde dode server proberen geen
  // zin — daarvoor gaan we direct door naar de volgende, onafhankelijke
  // mirror uit OVERPASS_ENDPOINTS.
  async function runOverpassQuery(query, { retries = 1 } = {}) {
    let lastErr;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        let res;
        try {
          res = await fetchWithTimeout(endpoint, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
          });
        } catch (err) {
          lastErr = err;
          break; // naar de volgende mirror, niet nogmaals dezelfde
        }
        if (res.ok) return res.json();
        if (res.status === 429 && attempt < retries) {
          await wait(1500 * (attempt + 1));
          continue;
        }
        lastErr = new Error(`Overpass responded with status ${res.status}`);
        break; // ook een niet-429 HTTP-fout: volgende mirror proberen
      }
    }
    throw lastErr;
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

  // Grote wateroppervlaktes (baaien/sonten/zeearmen) staan in OSM vaak niet
  // als één simpele gesloten way, maar als multipolygon-relatie: meerdere
  // los genummerde way-segmenten samen vormen de buitenrand (rol "outer"),
  // met eventueel een los eiland erin als gat (rol "inner"). Zonder dit
  // apart te verwerken blijft zo'n water helemaal ongetekend — precies het
  // "de zee is verdwenen"-probleem. Deze functie plakt de segmenten van elke
  // rol aan elkaar tot zo min mogelijk gesloten ringen door telkens het
  // segment te zoeken waarvan een eindpunt exact overeenkomt met het huidige
  // eindpunt (gedeelde OSM-knooppunten hebben identieke coördinaten).
  // Segmenten die niet meer aansluiten (bijv. afgekapt op de rand van de
  // bbox) worden gewoon zelf gesloten — een nette rechte afsluiting op de
  // rand van de kaart, zoals elke kaart-renderer de zichtbare rand behandelt.
  function ringKey([lat, lon]) { return `${lat.toFixed(7)},${lon.toFixed(7)}`; }

  // Kernlogica: plakt segmenten aan elkaar op gedeelde eindpunten, zo lang
  // als er nog een match is. Laat een ketting die niet vanzelf sluit gewoon
  // open — de aanroeper beslist wat daarmee te doen (stitchRings hieronder
  // sluit 'm recht af; de kustlijn-afsluiting verderop wandelt in plaats
  // daarvan langs de rand van de bbox, zie buildCoastlineWaterRings).
  function stitchChains(segments) {
    const remaining = segments.filter(s => s.length >= 2).map(s => s.slice());
    const chains = [];
    while (remaining.length) {
      let chain = remaining.shift();
      let extended = true;
      while (extended && ringKey(chain[0]) !== ringKey(chain[chain.length - 1])) {
        extended = false;
        for (let i = 0; i < remaining.length; i++) {
          const seg = remaining[i];
          if (ringKey(seg[0]) === ringKey(chain[chain.length - 1])) {
            chain = chain.concat(seg.slice(1));
          } else if (ringKey(seg[seg.length - 1]) === ringKey(chain[chain.length - 1])) {
            chain = chain.concat(seg.slice(0, -1).reverse());
          } else if (ringKey(seg[seg.length - 1]) === ringKey(chain[0])) {
            chain = seg.slice(0, -1).concat(chain);
          } else if (ringKey(seg[0]) === ringKey(chain[0])) {
            chain = seg.slice(1).reverse().concat(chain);
          } else {
            continue;
          }
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
      chains.push(chain);
    }
    return chains;
  }

  function stitchRings(segments) {
    return stitchChains(segments).map(ring => {
      if (ringKey(ring[0]) !== ringKey(ring[ring.length - 1])) return ring.concat([ring[0]]);
      return ring;
    });
  }

  // Zet multipolygon-relaties (bijv. natural=water/bay) om in vorm-objecten
  // met meerdere ringen — outer- en inner-rollen worden samengevoegd tot één
  // platte ringenlijst; de evenodd-vulregel (zie painters.js:multiPolygon)
  // snijdt gaten er vanzelf uit, ongeacht welke ring "outer" was.
  function parseAreaRelations(data) {
    return (data.elements || [])
      .filter(el => el.type === 'relation' && Array.isArray(el.members))
      .map(el => {
        const outerSegs = [], innerSegs = [];
        el.members.forEach(m => {
          if (m.type !== 'way' || !Array.isArray(m.geometry) || m.geometry.length < 2) return;
          const coords = m.geometry.map(pt => [pt.lat, pt.lon]);
          (m.role === 'inner' ? innerSegs : outerSegs).push(coords);
        });
        const rings = [...stitchRings(outerSegs), ...stitchRings(innerSegs)].filter(r => r.length >= 4);
        if (rings.length === 0) return null;
        return { tags: el.tags || {}, rings };
      })
      .filter(Boolean);
  }

  // ---- kustlijn -> watervlak ----
  //
  // De open zee heeft in OSM meestal GEEN eigen vlak (geen natural=water/bay):
  // alleen een `natural=coastline`-lijn markeert de grens tussen land en zee.
  // Zonder die lijn om te zetten in een gevuld vlak, blijft de open oceaan de
  // achtergrondkleur (landkleur) tonen i.p.v. water — precies waarom een
  // rivier/baai er "voller" water uitzag dan de zee ernaast: alleen de baai
  // (via natural=water/bay, zie hierboven) en de losse waterway-lijnen kregen
  // echt de waterkleur.
  //
  // Dit lost dat op met de standaardaanpak voor zo'n lokale (bbox-begrensde)
  // kustlijn-selectie: knip elke kustlijn-way af op de rand van het gekozen
  // kader, plak de afgeknipte stukken aan elkaar op gedeelde knooppunten, en
  // sluit de overgebleven open uiteinden af door met de klok mee langs de
  // rand van het kader te "wandelen" naar het volgkomende open uiteinde. Een
  // OSM-kustlijn is altijd zo getekend dat water aan de RECHTERkant ligt als
  // je 'm in zijn eigen richting volgt (harde OSM-conventie, geen aanname) —
  // met de klok mee wandelen vanaf een uittredepunt geeft daardoor altijd
  // precies de waterkant van de rand terug. Kleine eilanden die zelf al
  // gesloten zijn (nergens de rand raken) worden gewoon als extra ring
  // meegegeven: de evenodd-vulregel ponst er vanzelf een gat voor, ongeacht
  // in welke richting zo'n eiland-lus getekend is.
  function pointInBounds(lat, lon, b) {
    return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
  }

  // Liang-Barsky parametrische lijnclip tegen een lat/lon-rechthoek. Geeft
  // null als het segment de rechthoek helemaal mist, anders het (mogelijk
  // verkorte) stuk binnen de rechthoek plus de t-waarden (0..1 t.o.v. het
  // originele segment) zodat de aanroeper weet of er geknipt is.
  function clipSegment(p0, p1, b) {
    let t0 = 0, t1 = 1;
    const dLat = p1[0] - p0[0], dLon = p1[1] - p0[1];
    const checks = [
      [-dLat, p0[0] - b.south],
      [dLat, b.north - p0[0]],
      [-dLon, p0[1] - b.west],
      [dLon, b.east - p0[1]],
    ];
    for (const [p, q] of checks) {
      if (p === 0) {
        if (q < 0) return null;
      } else {
        const r = q / p;
        if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
    }
    if (t0 > t1) return null;
    return {
      a: [p0[0] + t0 * dLat, p0[1] + t0 * dLon],
      b: [p0[0] + t1 * dLat, p0[1] + t1 * dLon],
      t0, t1,
    };
  }

  // Knipt een hele polylijn tegen de rechthoek en levert de (mogelijk
  // meerdere) stukjes op die binnen liggen — een way kan het kader meerdere
  // keren in- en uitgaan.
  function clipPolylineToBounds(coords, bounds) {
    const runs = [];
    let current = null;
    for (let i = 0; i < coords.length - 1; i++) {
      const clip = clipSegment(coords[i], coords[i + 1], bounds);
      if (!clip) { current = null; continue; }
      if (!current || clip.t0 > 1e-9) {
        if (current && current.length >= 2) runs.push(current);
        current = [clip.a];
      }
      current.push(clip.b);
      if (clip.t1 < 1 - 1e-9) {
        runs.push(current);
        current = null;
      }
    }
    if (current && current.length >= 2) runs.push(current);
    return runs;
  }

  // Positie van een punt op de rand van de rechthoek, als één doorlopende
  // waarde 0..4 met de klok mee (0=NW, 1=NE, 2=SE, 3=SW, terug naar 0=NW) —
  // zodat "verder met de klok mee" simpelweg "grotere waarde" betekent.
  // Geeft null als het punt niet (nagenoeg) op de rand ligt.
  function perimeterPosition(pt, b) {
    const [lat, lon] = pt;
    const w = b.east - b.west, h = b.north - b.south;
    const tolLat = Math.max(1e-9, h * 1e-7), tolLon = Math.max(1e-9, w * 1e-7);
    if (Math.abs(lat - b.north) < tolLat) return (lon - b.west) / w;
    if (Math.abs(lon - b.east) < tolLon) return 1 + (b.north - lat) / h;
    if (Math.abs(lat - b.south) < tolLat) return 2 + (b.east - lon) / w;
    if (Math.abs(lon - b.west) < tolLon) return 3 + (lat - b.south) / h;
    return null;
  }

  // De hoekpunten van het kader die je passeert als je met de klok mee van
  // positie `fromPos` naar `toPos` wandelt (beide 0..4, zie perimeterPosition).
  function boundaryCornersBetween(fromPos, toPos, b) {
    const corners = [[b.north, b.west], [b.north, b.east], [b.south, b.east], [b.south, b.west]];
    const span = ((toPos - fromPos) % 4 + 4) % 4;
    return corners
      .map((c, k) => ({ c, rel: ((k - fromPos) % 4 + 4) % 4 }))
      .filter(x => x.rel > 1e-9 && x.rel < span - 1e-9)
      .sort((a, b2) => a.rel - b2.rel)
      .map(x => x.c);
  }

  // Sluit de open kustlijn-kettingen (elk met beide uiteinden op de rand van
  // het kader) tot complete watervlak-ringen, door telkens vanaf het
  // eindpunt van een ketting met de klok mee te wandelen naar het
  // eerstvolgende nog niet gebruikte beginpunt (van een andere ketting, of —
  // als er geen andere meer over zijn — terug naar het eigen beginpunt).
  function closeChainsAlongBoundary(chains, bounds) {
    const entries = chains.map((points, idx) => ({
      idx, points,
      startPos: perimeterPosition(points[0], bounds),
      endPos: perimeterPosition(points[points.length - 1], bounds),
    })).filter(e => e.startPos != null && e.endPos != null);
    const used = new Set();
    const rings = [];
    for (let startIdx = 0; startIdx < entries.length; startIdx++) {
      if (used.has(startIdx)) continue;
      used.add(startIdx);
      let current = entries[startIdx];
      const ring = [...current.points];
      const originStartPos = current.startPos;
      let guard = 0;
      while (guard++ <= entries.length + 1) {
        let best = null, bestRel = Infinity;
        for (let i = 0; i < entries.length; i++) {
          if (used.has(i)) continue;
          const rel = ((entries[i].startPos - current.endPos) % 4 + 4) % 4;
          if (rel < bestRel) { bestRel = rel; best = i; }
        }
        const relToOrigin = ((originStartPos - current.endPos) % 4 + 4) % 4;
        if (best === null || relToOrigin <= bestRel + 1e-9) {
          ring.push(...boundaryCornersBetween(current.endPos, originStartPos, bounds));
          break;
        }
        ring.push(...boundaryCornersBetween(current.endPos, entries[best].startPos, bounds));
        ring.push(...entries[best].points);
        used.add(best);
        current = entries[best];
      }
      ring.push(ring[0]);
      rings.push(ring);
    }
    return rings;
  }

  // Bouwt het complete watervlak (met eventuele eilanden als gat) uit een
  // lijst kustlijn-ways binnen het gekozen kader. Geeft een lege lijst terug
  // als er geen kustlijn is (heel gewone binnenlandse selectie) OF als er
  // wel losse eiland-lussen zijn maar geen enkele kustlijn de rand van het
  // kader raakt — in dat zeldzame geval is niet met zekerheid te bepalen wat
  // land en wat zee is, en is niets tekenen veiliger dan een gok die het
  // verkeerd om zou kunnen hebben.
  function buildCoastlineWaterRings(coastlineCoordsList, bounds) {
    const allRuns = [];
    coastlineCoordsList.forEach(coords => {
      clipPolylineToBounds(coords, bounds).forEach(run => allRuns.push(run));
    });
    if (allRuns.length === 0) return [];
    const chains = stitchChains(allRuns);
    const closedRings = [], openChains = [];
    chains.forEach(chain => {
      if (chain.length >= 4 && ringKey(chain[0]) === ringKey(chain[chain.length - 1])) closedRings.push(chain);
      else if (chain.length >= 2) openChains.push(chain);
    });
    if (openChains.length === 0) return [];
    const waterRings = closeChainsAlongBoundary(openChains, bounds);
    if (waterRings.length === 0) return [];
    return [...waterRings, ...closedRings];
  }

  // Douglas-Peucker: verwijdert punten uit een lijn die nauwelijks bijdragen
  // aan de vorm (minder dan `toleranceMeters` van de rechte lijn tussen hun
  // buren afliggen). OSM-ways bevatten vaak veel meer punten dan op
  // posterschaal ooit zichtbaar is; minder punten = minder werk voor zowel
  // het tekenen als het cachen/opslaan, met een tolerantie ver onder wat
  // zelfs op een grote print zichtbaar zou zijn.
  function distToSegSq([px, py], [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) { const ddx = px - ax, ddy = py - ay; return ddx * ddx + ddy * ddy; }
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const cx = ax + t * dx, cy = ay + t * dy;
    const ddx = px - cx, ddy = py - cy;
    return ddx * ddx + ddy * ddy;
  }
  const M_PER_DEG_LAT = 111320; // ruwe, op deze schaal ruim voldoende benadering
  function simplifyLatLon(points, toleranceMeters, midLatRad) {
    if (points.length < 3 || toleranceMeters <= 0) return points;
    // Naar lokale meters vertaald (lengtegraad gewogen met cos(breedtegraad))
    // zodat de tolerantie in elke richting evenveel voorstelt — puur voor de
    // afstandsberekening, de teruggegeven punten blijven de originele
    // lat/lon-paren (Douglas-Peucker verwijdert punten, verzint er geen).
    const lonScale = Math.cos(midLatRad);
    const xy = points.map(([lat, lon]) => [lon * lonScale * M_PER_DEG_LAT, lat * M_PER_DEG_LAT]);
    const tolSq = toleranceMeters * toleranceMeters;
    function rdp(lo, hi) {
      let maxDist = 0, idx = -1;
      for (let i = lo + 1; i < hi; i++) {
        const d = distToSegSq(xy[i], xy[lo], xy[hi]);
        if (d > maxDist) { maxDist = d; idx = i; }
      }
      if (idx === -1 || maxDist <= tolSq) return [points[lo], points[hi]];
      return rdp(lo, idx).slice(0, -1).concat(rdp(idx, hi));
    }
    return rdp(0, points.length - 1);
  }
  // Grovere tolerantie naarmate het gebied groter is — bij region/country
  // is er toch al veel minder (of geen) detail te zien, dus daar mag
  // agressiever vereenvoudigd worden dan bij een straatniveau-selectie.
  const SIMPLIFY_TOLERANCE_M = { street: 3, city: 8, region: 20, country: 60 };
  function simplifyWays(ways, tier, midLatRad) {
    const toleranceMeters = SIMPLIFY_TOLERANCE_M[tier] || 0;
    if (!toleranceMeters) return ways;
    return ways.map(w => w.rings
      ? { ...w, rings: w.rings.map(r => simplifyLatLon(r, toleranceMeters, midLatRad)) }
      : { ...w, coords: simplifyLatLon(w.coords, toleranceMeters, midLatRad) });
  }

  async function fetchStreets(bounds, tier = 'street', styleHint = null) {
    if (tier === 'continent') return [];
    const data = await runOverpassQuery(buildStreetsQuery(bounds, tier, styleHint));
    const ways = parseWays(data);
    // Kustlijn-ways zijn puur invoer voor het afgeleide watervlak hieronder —
    // ze matchen zelf geen enkel render-filter (niet highway/waterway/
    // natural=water/bay), dus zonder ze eruit te filteren zouden ze alleen
    // maar nutteloos meegesleept worden in de opgeslagen geometrie.
    const coastlineWays = ways.filter(w => w.tags.natural === 'coastline');
    const otherWays = ways.filter(w => w.tags.natural !== 'coastline');
    const result = [...otherWays, ...parseAreaRelations(data)];
    // De ongesimplificeerde kustlijn-coördinaten blijven nodig voor het
    // stitchen hierboven (dat matcht op exacte gedeelde eindpunten) —
    // simplificeren gebeurt pas op het uiteindelijke, samengevoegde resultaat.
    const coastlineRings = buildCoastlineWaterRings(coastlineWays.map(w => w.coords), bounds);
    if (coastlineRings.length > 0) result.push({ tags: { natural: 'water' }, rings: coastlineRings });
    const midLatRad = ((bounds.south + bounds.north) / 2) * Math.PI / 180;
    return simplifyWays(result, tier, midLatRad);
  }

  async function fetchBuildings(bounds, tier = 'street') {
    if (tier !== 'street' && tier !== 'city') return [];
    const ways = parseWays(await runOverpassQuery(buildBuildingsQuery(bounds)));
    const midLatRad = ((bounds.south + bounds.north) / 2) * Math.PI / 180;
    return simplifyWays(ways, tier, midLatRad);
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
    fetchStreets, fetchBuildings, reverseGeocode, searchPlace, fetchBoundary,
    makeCoverProjector, makeContainProjector,
    stitchRings, parseAreaRelations,
    clipSegment, clipPolylineToBounds, perimeterPosition, boundaryCornersBetween,
    closeChainsAlongBoundary, buildCoastlineWaterRings,
    simplifyLatLon,
  };
})();
