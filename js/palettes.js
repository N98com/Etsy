// Kleurstellingen afgestemd op interieurstijlen met bewezen Etsy-zoekvolume,
// niet op wiskundige aantrekkelijkheid. De 'keywords' zijn ter referentie
// voor je listing-titel/tags, niet functioneel gebruikt door de renderer.
const PALETTES = [
  { id: 'boho-sand', name: 'Boho Zand & Klei', bg: '#f4ede4',
    inks: ['#b08968', '#7f5539', '#9c6644', '#3d2b1f'],
    keywords: 'beige boho line art, terracotta wall art, neutral abstract print' },
  { id: 'japandi-rust', name: 'Japandi Rust', bg: '#eee7db',
    inks: ['#8a7f6a', '#c46b4f', '#4a4238', '#2f2a24'],
    keywords: 'japandi wall art, wabi-sabi print, warm minimalist decor' },
  { id: 'scandi-mono', name: 'Scandi Mono Ink', bg: '#f7f5f2',
    inks: ['#1c1c1c'],
    keywords: 'minimalist black line art, scandinavian poster, single line print' },
  { id: 'clay-stone', name: 'Klei & Steen', bg: '#efe6da',
    inks: ['#a4785b', '#6b6156', '#3a3530'],
    keywords: 'earth tone abstract art, neutral wall decor, stone wall print' },
  { id: 'sage-cream', name: 'Salie & Room', bg: '#f2f1e9',
    inks: ['#7c8a6d', '#c9c2a8', '#4f5a44'],
    keywords: 'sage green wall art, botanical minimalist print, soft green decor' },
  { id: 'midnight-gold', name: 'Middernacht & Goud', bg: '#1b1d24',
    inks: ['#d8b975', '#f2e9d8', '#8f7a4e'],
    keywords: 'moody dark academia print, gold line art, black gold wall decor' },
  { id: 'blush-clay', name: 'Blush & Terracotta', bg: '#f6ece6',
    inks: ['#c98a72', '#e0b8a8', '#7a4a3a'],
    keywords: 'blush pink wall art, terracotta print, feminine minimalist decor' },
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

// Registreert (of hergebruikt) een eigen kleurstelling en geeft het id terug.
function registerCustomPalette(bg, inks) {
  const id = customPaletteId(bg, inks);
  if (!CUSTOM_PALETTES[id]) {
    CUSTOM_PALETTES[id] = { id, name: 'Eigen kleuren', bg, inks, keywords: 'custom colorway', custom: true };
    saveCustomPalettes();
  }
  return id;
}

function getPalette(id) {
  return PALETTES.find(p => p.id === id) || CUSTOM_PALETTES[id] || PALETTES[0];
}
