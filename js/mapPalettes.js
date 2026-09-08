// Kleurstellingen voor de kaart-kunst (Locatie-tab). Anders dan de simpele
// bg+inks van de generatieve algoritmes heeft een kaart echte semantische
// lagen — achtergrond, water, groen, hoofdwegen, kleinere wegen en tekst —
// dus elk kaartpalet definieert die apart.
const MAP_PALETTES = [
  { id: 'mono', name: 'Mono',
    bg: '#f4f2ee', water: '#d7d4cd', park: '#eae7e1', road: '#333333', roadMinor: '#9a9a9a', text: '#2a2a2a' },
  { id: 'natural', name: 'Natural',
    bg: '#e7e6c6', water: '#c9d49f', park: '#d8dcae', road: '#ffffff', roadMinor: '#f1efdc', text: '#3c3b28' },
  { id: 'earth', name: 'Earth',
    bg: '#7c8b74', water: '#576752', park: '#8f9c85', road: '#ece9dd', roadMinor: '#b6bea9', text: '#eef0e6' },
  { id: 'old-navy', name: 'Old Navy',
    bg: '#243349', water: '#182236', park: '#2e3e57', road: '#e9c46a', roadMinor: '#48597a', text: '#f2ede1' },
  { id: 'coral', name: 'Coral',
    bg: '#f2c8c1', water: '#e0968a', park: '#f5dbd4', road: '#ffffff', roadMinor: '#f8e4df', text: '#5c2e26' },
  { id: 'cobalt', name: 'Cobalt',
    bg: '#e3e8ef', water: '#3454d1', park: '#c9d4e3', road: '#f3a340', roadMinor: '#aabbd0', text: '#1c2b45' },
  { id: 'marron', name: 'Marron',
    bg: '#5a4436', water: '#392b23', park: '#6c5646', road: '#c9a876', roadMinor: '#7a6552', text: '#f2e9dc' },
  { id: 'burnt', name: 'Burnt',
    bg: '#7a2e26', water: '#a13a2a', park: '#8c3d33', road: '#f2e4d8', roadMinor: '#9c554a', text: '#f7ede4' },
  { id: 'seaside', name: 'Seaside',
    bg: '#dbe8eb', water: '#4f93a8', park: '#c3d9d4', road: '#ffffff', roadMinor: '#edf4f3', text: '#264653' },
  { id: 'mauve', name: 'Mauve',
    bg: '#4a3b4c', water: '#372b39', park: '#5c4a5e', road: '#d9c4da', roadMinor: '#6c5a6e', text: '#f2e9f2' },
  { id: 'peachy-coral-glow', name: 'Peachy Coral Glow',
    bg: '#ebb57a', water: '#d8735c', park: '#e4a177', road: '#fff8f0', roadMinor: '#f0d2b3', text: '#4a2c1e' },
  { id: 'dark-slate-whisper', name: 'Dark Slate Whisper',
    bg: '#343849', water: '#2a2d39', park: '#3e4356', road: '#d8c9a3', roadMinor: '#4a5068', text: '#e8e4dc' },
  { id: 'vintage-rose-garden', name: 'Vintage Rose Garden',
    bg: '#f3e8e1', water: '#c4ac9c', park: '#edd3be', road: '#8a5a4a', roadMinor: '#c9a292', text: '#5c4438' },
  { id: 'electric-midnight-glow', name: 'Electric Midnight Glow',
    bg: '#1c1c1c', water: '#4a4a4a', park: '#242424', road: '#f9ea5c', roadMinor: '#f2c94c', text: '#f9ea5c' },
  { id: 'soft-peachy-dreams', name: 'Soft Peachy Dreams',
    bg: '#f5d2b8', water: '#a97c8d', park: '#efb49c', road: '#ffffff', roadMinor: '#e8c4b8', text: '#5c3e42' },
  { id: 'candy-floss-dreams', name: 'Candy Floss Dreams',
    bg: '#f5edda', water: '#afd4de', park: '#c8ede1', road: '#f0a99c', roadMinor: '#f3c4ba', text: '#6b4a42' },
  { id: 'fiery-ice-cream-delight', name: 'Fiery Ice Cream Delight',
    bg: '#efbb53', water: '#16324a', park: '#f2ce7e', road: '#c7362e', roadMinor: '#e8862a', text: '#16324a' },
  { id: 'golden-autumn-twilight', name: 'Golden Autumn Twilight',
    bg: '#f0bb4c', water: '#143349', park: '#e8862a', road: '#4a93b0', roadMinor: '#7db6cc', text: '#143349' },
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
];

function getMapPalette(id) {
  return MAP_PALETTES.find(p => p.id === id) || MAP_PALETTES[0];
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
