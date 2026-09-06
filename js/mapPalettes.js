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
];

function getMapPalette(id) {
  return MAP_PALETTES.find(p => p.id === id) || MAP_PALETTES[0];
}

// Game Styles — een vast, niet-kiesbaar kleurenschema (los van MAP_PALETTES,
// verschijnt dus niet in het gewone palet-rooster). Wordt in mapRender.js
// gebruikt in plaats van het gekozen palet zodra "GTA5 Style" aanstaat.
const GTA_STYLE_PALETTE = {
  id: 'gta5', name: 'GTA5 Style',
  bg: '#111111', water: '#7c8791', park: '#111111', road: '#ececec', roadMinor: '#4a4a4a', text: '#ececec',
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
