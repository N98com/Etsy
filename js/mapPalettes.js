// Kleurstellingen voor de kaart-kunst (Locatie-tab). Anders dan de simpele
// bg+inks van de generatieve algoritmes heeft een kaart echte semantische
// lagen — achtergrond, water, groen, hoofdwegen, kleinere wegen en tekst —
// dus elk kaartpalet definieert die apart.
const MAP_PALETTES = [
  { id: 'mono', name: 'Mono',
    bg: '#f4f2ee', water: '#d7d4cd', park: '#eae7e1', road: '#333333', roadMinor: '#9a9a9a', text: '#2a2a2a' },
  { id: 'earth', name: 'Earth',
    bg: '#7c8b74', water: '#576752', park: '#8f9c85', road: '#ece9dd', roadMinor: '#b6bea9', text: '#eef0e6' },
  { id: 'old-navy', name: 'Old Navy',
    bg: '#243349', water: '#182236', park: '#2e3e57', road: '#e9c46a', roadMinor: '#48597a', text: '#f2ede1' },
  { id: 'coral', name: 'Coral',
    bg: '#f2c8c1', water: '#e0968a', park: '#f5dbd4', road: '#ffffff', roadMinor: '#f8e4df', text: '#5c2e26' },
  { id: 'mauve', name: 'Mauve',
    bg: '#4a3b4c', water: '#372b39', park: '#5c4a5e', road: '#d9c4da', roadMinor: '#6c5a6e', text: '#f2e9f2' },
  { id: 'electric-midnight-glow', name: 'Electric Midnight Glow',
    bg: '#1c1c1c', water: '#4a4a4a', park: '#242424', road: '#f9ea5c', roadMinor: '#f2c94c', text: '#f9ea5c' },
  // Zwart + goud, met donkergrijs voor het groen en een diep smaragdgroen
  // als vierde (jewel-tone) kleur voor het water — een klassieke,
  // luxueuze art-deco-combinatie: gouden wegen die oplichten tegen een
  // zwarte ondergrond, met smaragd water als accent.
  { id: 'emerald-gold-noir', name: 'Emerald Gold Noir',
    bg: '#0d0d0d', water: '#175c46', park: '#242424', road: '#c9a227', roadMinor: '#7a6636', text: '#c9a227' },
  // De volgende vier zijn met de hand benaderd op basis van referentiebeelden
  // die de gebruiker aanleverde (net als de acht hierboven).
  { id: 'sandstone-lagoon', name: 'Sandstone Lagoon',
    bg: '#d9b98a', water: '#4f9b93', park: '#c9a876', road: '#3d2b1f', roadMinor: '#6b5440', text: '#3d2b1f' },
  { id: 'mint-etching', name: 'Mint Etching',
    bg: '#eef1e7', water: '#8fae8a', park: '#dbe6d2', road: '#5b7d5e', roadMinor: '#9db89a', text: '#3f5b42' },
  { id: 'obsidian-harbor', name: 'Obsidian Harbor',
    bg: '#0d1012', water: '#141a1c', park: '#171b1d', road: '#5b7d80', roadMinor: '#3a4d4f', text: '#8aa3a5' },
  { id: 'glacier-mist', name: 'Glacier Mist',
    bg: '#eef1f3', water: '#cfe0e8', park: '#e3e9ec', road: '#647c8f', roadMinor: '#9db0bd', text: '#5c6b73' },
  // Nog drie, met de hand benaderd op basis van aangeleverde referentie-
  // posters: een roze lijnenkaart op crème, een zwarte kaart met zandkleurige
  // wegen, en een donkere olijf-teal kaart met crème wegen. Water/park
  // krijgen bewust bijna dezelfde tint als de ondergrond (net als
  // sandstone-lagoon/obsidian-harbor hierboven) — de referenties tonen geen
  // apart gekleurd water, puur de wegenstructuur.
  { id: 'rosewater-bloom', name: 'Rosewater Bloom',
    bg: '#f6f1e7', water: '#efe7d8', park: '#f6f1e7', road: '#b23a57', roadMinor: '#e7b4c2', text: '#211c1a' },
  { id: 'coal-dune', name: 'Coal Dune',
    bg: '#0d0d0d', water: '#161616', park: '#0d0d0d', road: '#cbb088', roadMinor: '#8a7454', text: '#f2ede0' },
  { id: 'verdigris-dusk', name: 'Verdigris Dusk',
    bg: '#3b4e48', water: '#2f413c', park: '#3b4e48', road: '#d9c9a8', roadMinor: '#a99872', text: '#f1ead9' },
  // Vier PREVIEW-kandidaten, met de hand benaderd op basis van een
  // aangeleverde referentieafbeelding (4 posters: licht/donker monochroom,
  // elk met en zonder een lichte teal wateraccent). Nog niet definitief —
  // de gebruiker bekijkt ze eerst live op Amsterdam en kiest welke blijven;
  // de rest verwijderen we weer.
  { id: 'chalk-line', name: 'Chalk Line',
    bg: '#f5f3ee', water: '#f5f3ee', park: '#f5f3ee', road: '#1c1c1c', roadMinor: '#6b6b66', text: '#1c1c1c' },
  { id: 'graphite-line', name: 'Graphite Line',
    bg: '#34322e', water: '#34322e', park: '#34322e', road: '#f2f0ea', roadMinor: '#a9a69c', text: '#f2f0ea' },
  { id: 'chalk-harbor', name: 'Chalk Harbor',
    bg: '#f5f3ee', water: '#a8cbc4', park: '#f5f3ee', road: '#1c1c1c', roadMinor: '#6b6b66', text: '#1c1c1c' },
  { id: 'graphite-harbor', name: 'Graphite Harbor',
    bg: '#34322e', water: '#8fc0b7', park: '#34322e', road: '#f2f0ea', roadMinor: '#a9a69c', text: '#f2f0ea' },  // November 2026: gekozen uit 50 voorstellen (zie tools/palette-previews).
  { id: 'parchment-sepia', name: 'Parchment Sepia',
    bg: '#efe4cf', water: '#d8c6a3', park: '#e6d9bd', road: '#5a3e26', roadMinor: '#a88b68', text: '#4a321e' },
  { id: 'terracotta-sun', name: 'Terracotta Sun',
    bg: '#c8673f', water: '#a24f2d', park: '#d07a54', road: '#f6e7d4', roadMinor: '#e1a988', text: '#fbefe1' },
  { id: 'deep-teal', name: 'Deep Teal',
    bg: '#0f3b3e', water: '#0a2b2d', park: '#164a4d', road: '#e8d9b0', roadMinor: '#4f7a74', text: '#f0e6c8' },
  { id: 'bordeaux-gold', name: 'Bordeaux Gold',
    bg: '#3a0f18', water: '#280a10', park: '#4a1620', road: '#d4af6a', roadMinor: '#7d4a3d', text: '#e6c98a' },
  { id: 'midnight-copper', name: 'Midnight Copper',
    bg: '#12161c', water: '#1c242e', park: '#181d24', road: '#c27a45', roadMinor: '#6b4a33', text: '#d98d55' },
  { id: 'forest-brass', name: 'Forest Brass',
    bg: '#1d2b22', water: '#14201a', park: '#24362a', road: '#c8a35a', roadMinor: '#5d6b4c', text: '#d8b670' },
  { id: 'tangerine-dream', name: 'Tangerine Dream',
    bg: '#f4a259', water: '#e07a3a', park: '#f6b273', road: '#2b2d42', roadMinor: '#b8723b', text: '#2b2d42' },
  { id: 'plum-velvet', name: 'Plum Velvet',
    bg: '#3d1e3d', water: '#2c142c', park: '#4a274a', road: '#e9c7d9', roadMinor: '#7e5579', text: '#f1d8e6' },
  { id: 'seafoam', name: 'Seafoam',
    bg: '#dcefe7', water: '#9fd3c7', park: '#cbe6da', road: '#1f5c57', roadMinor: '#7fb3a8', text: '#1f4e4a' },
  { id: 'burnt-sienna-noir', name: 'Burnt Sienna Noir',
    bg: '#1a1410', water: '#2a1d15', park: '#201812', road: '#d2693c', roadMinor: '#7a4026', text: '#e4824f' },
  { id: 'cherry-blossom', name: 'Cherry Blossom',
    bg: '#fbe9ec', water: '#f2c4cc', park: '#f7dbe0', road: '#8c2f45', roadMinor: '#d58a9c', text: '#6e2236' },
  { id: 'sepia-noir', name: 'Sepia Noir',
    bg: '#2a231d', water: '#1e1915', park: '#312922', road: '#e8d6b4', roadMinor: '#8c7a60', text: '#efe0c2' },
  { id: 'flamingo', name: 'Flamingo',
    bg: '#f28d8c', water: '#e06b6e', park: '#f4a3a2', road: '#fff4ef', roadMinor: '#f9cfc9', text: '#fff4ef' },
  { id: 'lagoon', name: 'Lagoon',
    bg: '#0e6e6e', water: '#0a5050', park: '#138080', road: '#f6f0d6', roadMinor: '#6fb3a8', text: '#f6f0d6' },
  { id: 'graphite-gold', name: 'Graphite Gold',
    bg: '#2b2b2b', water: '#1f1f1f', park: '#333333', road: '#d9b56c', roadMinor: '#6e6250', text: '#e3c27e' },
  { id: 'mint-chocolate', name: 'Mint Chocolate',
    bg: '#3a2a22', water: '#2a1e18', park: '#44322a', road: '#b9e3d0', roadMinor: '#6d8f80', text: '#c9eedd' },
  { id: 'royal-velvet', name: 'Royal Velvet',
    bg: '#1f1446', water: '#150d33', park: '#281a56', road: '#e2c66d', roadMinor: '#5c4f8a', text: '#ecd58c' },
  { id: 'clay-pot', name: 'Clay Pot',
    bg: '#b8735a', water: '#9b5c46', park: '#c4846c', road: '#fbeee2', roadMinor: '#ddb3a0', text: '#fdf3ea' },
  { id: 'emerald-city', name: 'Emerald City',
    bg: '#0f4c3a', water: '#0a3a2c', park: '#145a45', road: '#f2e8cf', roadMinor: '#5f9178', text: '#f2e8cf' },
  { id: 'ash-rose', name: 'Ash Rose',
    bg: '#6b5257', water: '#574145', park: '#765d62', road: '#f1dfe0', roadMinor: '#a88a8f', text: '#f6e8e8' },
  { id: 'neon-tokyo', name: 'Neon Tokyo',
    bg: '#14101f', water: '#251a3d', park: '#1b1529', road: '#ff4fa3', roadMinor: '#6a3cc9', text: '#ff7ac0' },
];

// Effen kleurenreeks: elke kaart is één vlakke ondergrondkleur met puur witte
// wegen/tekst erover — geen apart water/groen (net als bij een aantal
// donkere kaarten hierboven wordt water/park bewust gelijk aan de
// achtergrond gehouden). Met de hand benaderd op basis van een aangeleverd
// referentiebeeld van 5 posters (Merlot/Forest/Blueprint/Charcoal/Noir);
// hier onder eigen namen gevoerd, los van de originele fotolabels.
// Water ligt bij elke Solid ~22% donkerder dan de ondergrond (park blijft
// wél gelijk aan bg) — op verzoek, zodat water zich onderscheidt van het
// land i.p.v. volledig wegvalt. Bij Onyx (al bijna zwart) is 22% donkerder
// nauwelijks zichtbaar, dus daar is water simpelweg zuiver zwart — de
// donkerst mogelijke stap vanaf #0a0a0a.
const SOLID_PALETTES = [
  { id: 'claret', name: 'Claret',
    bg: '#5c1a24', water: '#48141c', park: '#5c1a24', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  { id: 'woodland', name: 'Woodland',
    bg: '#1f3324', water: '#18281c', park: '#1f3324', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  { id: 'cobalt', name: 'Cobalt',
    bg: '#152238', water: '#101b2c', park: '#152238', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  { id: 'slate', name: 'Slate',
    bg: '#3b4552', water: '#2e3640', park: '#3b4552', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  { id: 'onyx', name: 'Onyx',
    bg: '#0a0a0a', water: '#000000', park: '#0a0a0a', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  { id: 'bronze', name: 'Bronze',
    bg: '#5c4620', water: '#483719', park: '#5c4620', road: '#ffffff', roadMinor: '#c9c9c9', text: '#ffffff' },
  // November 2026: uit de voorstellen, op verzoek bij de effen kleuren.
  { id: 'steel-blue', name: 'Steel Blue',
    bg: '#4a6274', water: '#384c5b', park: '#546d80', road: '#f3f1ea', roadMinor: '#9fb0bc', text: '#f3f1ea' },
];

function getMapPalette(id) {
  return MAP_PALETTES.find(p => p.id === id) || SOLID_PALETTES.find(p => p.id === id) || MAP_PALETTES[0];
}

// Game Styles — een vast, niet-kiesbaar kleurenschema (los van MAP_PALETTES,
// verschijnt dus niet in het gewone palet-rooster). Wordt in mapRender.js
// gebruikt in plaats van het gekozen palet zodra "GTA V" aanstaat.
// `coastline` is optioneel: als een palet dat meegeeft, tekent mapRender.js
// een dunne rand om elk wateroppervlak zodat land/water nooit door elkaar
// lopen — hier ingezet omdat vlakke kleur alleen bij kleine meren soms niet
// genoeg contrast gaf.
const GTA_STYLE_PALETTE = {
  id: 'gta5', name: 'GTA V',
  bg: '#111111', water: '#8b99a3', park: '#111111', road: '#ececec', roadMinor: '#4a4a4a', text: '#ececec',
  coastline: '#c3ccd2',
};

// Gebaseerd op de minimap-stijl van Call of Duty: Modern Warfare 2 (2009):
// het geïsoleerde gebied bijna zwart met lichte gebouwomtrekken en gestippelde
// paden, de omgeving een gedempt kaki/legergroen. Kleuren met de hand
// benaderd op basis van referentiebeelden — laat het weten als een tint moet
// worden bijgesteld.
const MW2_STYLE_PALETTE = {
  id: 'mw2', name: 'OG MW2',
  bg: '#12160f', water: '#c3d6ce', park: '#12160f', road: '#ddd6bd', roadMinor: '#a7a186', text: '#ddd6bd',
  outer: '#8a9c78', outerDark: '#6d7f5e', building: '#ddd6bd',
};

// Gebaseerd op de kaart van Red Dead Redemption 2: een perkament/sepia
// ondergrond met een duidelijk afwijkende, koelere blauw-grijze kleur voor
// water (plus een donkere coastline-rand, zie hierboven) en dunne donkere
// paden. Ook hier: kleuren met de hand benaderd, laat het weten als een
// tint moet worden bijgesteld.
const RDR2_STYLE_PALETTE = {
  id: 'rdr2', name: 'RDR2',
  bg: '#d9c9a0', water: '#7d8f8d', park: '#d9c9a0', road: '#4a3c28', roadMinor: '#8a7452', text: '#3a2f22',
  coastline: '#4a3c28',
};

// Een grijswaarden-"heightmap": land loopt van bijna zwart (laag) tot bijna
// wit (hoog) via een gevulde ruistextuur (drawHeightmapFill in mapRender.js),
// met de zee als vast, diep zwart ("zeeniveau") eronder — en wegen er
// gewoon overheen getekend, wit met een donkere casing zodat ze ook op de
// lichtste bergtoppen leesbaar blijven. (Een eerdere versie had geen reliëf
// en geen wegen, puur een kustlijn-graveerposter — op verzoek vervangen.)
const EXPERIMENTAL_STYLE_PALETTE = {
  id: 'experimental', name: 'Experimental',
  bg: '#0d0d0d', water: '#000000', park: '#0d0d0d', road: '#ffffff', roadMinor: '#c9c9c9', text: '#f2ede0',
  coastline: '#e8e8e8',
};

// Gebaseerd op nachtfoto's van steden vanuit de ruimte (ISS/satelliet):
// een vrijwel zwart canvas — land en water zijn 's nachts allebei gewoon
// onzichtbaar, alleen de verlichte wegen/bebouwing gloeien op, in het
// karakteristieke warme oranje van straatverlichting. Water krijgt daarom
// bewust dezelfde kleur als de achtergrond i.p.v. een eigen tint (er is
// vanuit de ruimte geen zichtbaar verschil, alleen de afwezigheid van
// licht) — de "gloed" zelf (bredere, transparantere lagen onder de scherpe
// kernlijn) zit in mapRender.js's road-tekencode, niet in dit palet.
const NIGHTLIGHT_STYLE_PALETTE = {
  id: 'nightlight', name: 'Nightlight',
  bg: '#060504', water: '#020202', park: '#060504', road: '#ffb454', roadMinor: '#8f5322', text: '#ffe8c9',
};

// Indeling in sfeergroepen voor de ontwerper (stap II): knopjes boven de
// paletten filteren hierop. Elk palet uit MAP_PALETTES staat in precies één groep.
const PALETTE_CATEGORIES = [
  { id: 'light', label: 'Light', ids: ['mono', 'chalk-line', 'chalk-harbor', 'mint-etching', 'glacier-mist', 'rosewater-bloom', 'parchment-sepia', 'seafoam', 'cherry-blossom'] },
  { id: 'earth', label: 'Earth', ids: ['earth', 'sandstone-lagoon', 'terracotta-sun', 'clay-pot', 'verdigris-dusk', 'lagoon', 'deep-teal', 'emerald-city'] },
  { id: 'colourful', label: 'Colourful', ids: ['coral', 'flamingo', 'tangerine-dream', 'mauve', 'ash-rose', 'plum-velvet', 'mint-chocolate'] },
  { id: 'dark-gold', label: 'Dark & Gold', ids: ['emerald-gold-noir', 'bordeaux-gold', 'forest-brass', 'graphite-gold', 'royal-velvet', 'midnight-copper', 'burnt-sienna-noir', 'coal-dune', 'sepia-noir', 'old-navy'] },
  { id: 'night', label: 'Night', ids: ['graphite-line', 'graphite-harbor', 'obsidian-harbor', 'electric-midnight-glow', 'neon-tokyo'] },
];
