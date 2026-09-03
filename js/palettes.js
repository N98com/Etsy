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

function getPalette(id) {
  return PALETTES.find(p => p.id === id) || PALETTES[0];
}
