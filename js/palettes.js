// Kleurstellingen afgestemd op interieurstijlen met bewezen Etsy-zoekvolume,
// niet op wiskundige aantrekkelijkheid. De 'keywords' zijn ter referentie
// voor je listing-titel/tags, niet functioneel gebruikt door de renderer.
const PALETTES = [
  { id: 'boho-sand', name: 'Boho Sand & Clay', bg: '#f4ede4',
    inks: ['#b08968', '#7f5539', '#9c6644', '#3d2b1f'],
    keywords: 'beige boho line art, terracotta wall art, neutral abstract print' },
  { id: 'japandi-rust', name: 'Japandi Rust', bg: '#eee7db',
    inks: ['#8a7f6a', '#c46b4f', '#4a4238', '#2f2a24'],
    keywords: 'japandi wall art, wabi-sabi print, warm minimalist decor' },
  { id: 'scandi-mono', name: 'Scandi Mono Ink', bg: '#f7f5f2',
    inks: ['#1c1c1c'],
    keywords: 'minimalist black line art, scandinavian poster, single line print' },
  { id: 'clay-stone', name: 'Clay & Stone', bg: '#efe6da',
    inks: ['#a4785b', '#6b6156', '#3a3530'],
    keywords: 'earth tone abstract art, neutral wall decor, stone wall print' },
  { id: 'sage-cream', name: 'Sage & Cream', bg: '#f2f1e9',
    inks: ['#7c8a6d', '#c9c2a8', '#4f5a44'],
    keywords: 'sage green wall art, botanical minimalist print, soft green decor' },
  { id: 'midnight-gold', name: 'Midnight & Gold', bg: '#1b1d24',
    inks: ['#d8b975', '#f2e9d8', '#8f7a4e'],
    keywords: 'moody dark academia print, gold line art, black gold wall decor' },
  { id: 'blush-clay', name: 'Blush & Terracotta', bg: '#f6ece6',
    inks: ['#c98a72', '#e0b8a8', '#7a4a3a'],
    keywords: 'blush pink wall art, terracotta print, feminine minimalist decor' },
  { id: 'coastal-blue', name: 'Coast & Sand', bg: '#f0ede3',
    inks: ['#4a6670', '#7fa1a3', '#8c7b65', '#26343a'],
    keywords: 'coastal wall art, nautical blue print, beach house decor' },
  { id: 'rust-ochre', name: 'Ochre & Rust', bg: '#f6ede0',
    inks: ['#c8752f', '#e0a94a', '#8a3d1f'],
    keywords: 'retro 70s wall art, mustard ochre print, burnt orange decor' },
  { id: 'charcoal-bone', name: 'Charcoal & Bone', bg: '#efece6',
    inks: ['#2b2b2b', '#5c5c5c', '#9c9488'],
    keywords: 'modern minimalist black print, charcoal wall art, monochrome decor' },
  { id: 'lavender-sage', name: 'Lavender & Sage', bg: '#f4f1ee',
    inks: ['#9a8fae', '#c9bfd6', '#7c8a6d'],
    keywords: 'soft pastel wall art, lavender botanical print, calming nursery decor' },
  { id: 'forest-moss', name: 'Forest & Moss', bg: '#eef0e4',
    inks: ['#3f5c3f', '#6b7a4f', '#233524'],
    keywords: 'dark green wall art, forest botanical print, moody woodland decor' },
  { id: 'copper-teal', name: 'Copper & Teal', bg: '#101820',
    inks: ['#c9812f', '#e0b877', '#2f7a7a'],
    keywords: 'art deco wall art, copper teal print, jewel tone decor' },
];

// Eigen kleurstellingen die de gebruiker zelf samenstelt via de kleurenkiezer.
// Het id wordt afgeleid van de gekozen kleuren zelf, zodat eenzelfde
// combinatie altijd hetzelfde palet-id oplevert (reproduceerbaar, net als
// een seed) en favorieten/triptieken na een herlaad blijven kloppen.
const CUSTOM_PALETTES_KEY = 'genart-custom-palettes-v1';
const CUSTOM_PALETTES = loadCustomPalettes();

function loadCustomPalettes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PALETTES_KEY)) || {}; } catch { return {}; }
}
function saveCustomPalettes() {
  localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(CUSTOM_PALETTES));
}

function customPaletteId(bg, inks) {
  return 'custom-' + [bg, ...inks].map(c => c.replace('#', '')).join('-');
}

// Hoeveel eigen kleurstellingen de snelkoppelingenlijst maximaal onthoudt.
// Ouder dan dit wordt automatisch verwijderd — de volledige geschiedenis van
// wat daadwerkelijk geëxporteerd is, staat los hiervan en blijft altijd staan
// (zie EXPORT_HISTORY in main.js, die een eigen kopie van de kleuren bewaart).
const MAX_CUSTOM_PALETTES = 10;

// Registreert (of hergebruikt) een eigen kleurstelling als preset en geeft
// het id terug. Een optionele naam wordt ook op een bestaand preset gezet
// (zo kun je een eerder opgeslagen combinatie alsnog een naam geven).
// Verwijderen-en-opnieuw-toevoegen zet de preset achteraan de lijst (meest
// recent), ook als hij al bestond, zodat hergebruik 'm beschermt tegen de cap.
function registerCustomPalette(bg, inks, name) {
  const id = customPaletteId(bg, inks);
  const label = name && name.trim() ? name.trim() : null;
  const existing = CUSTOM_PALETTES[id];
  const entry = existing
    ? { ...existing, name: label || existing.name }
    : { id, name: label || 'Custom colors', bg, inks, keywords: 'custom colorway', custom: true };
  delete CUSTOM_PALETTES[id];
  CUSTOM_PALETTES[id] = entry;
  const keys = Object.keys(CUSTOM_PALETTES);
  while (keys.length > MAX_CUSTOM_PALETTES) {
    delete CUSTOM_PALETTES[keys.shift()];
  }
  saveCustomPalettes();
  return id;
}

function deleteCustomPalette(id) {
  delete CUSTOM_PALETTES[id];
  saveCustomPalettes();
}

function getPalette(id) {
  return PALETTES.find(p => p.id === id) || CUSTOM_PALETTES[id] || PALETTES[0];
}
