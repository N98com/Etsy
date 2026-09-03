// Deterministische, reproduceerbare randomness: dezelfde seed geeft altijd
// exact hetzelfde ontwerp terug. Dat is de kern van de hele werkbank.
const RNG = (() => {
  // mulberry32: snel, goed genoeg voor generatieve kunst (geen crypto-doel).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // xmur3: hasht een willekeurige string (naam, datum, coördinaten) naar
  // een 32-bit seed, zodat "trouwdatum als attractor" letterlijk werkt.
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  function seedFromString(str) {
    return xmur3(String(str))() % 1000000000;
  }

  function rngFor(seed) {
    return mulberry32(seed >>> 0);
  }

  function randomSeed() {
    return Math.floor(Math.random() * 1000000000);
  }

  return { rngFor, seedFromString, randomSeed };
})();
