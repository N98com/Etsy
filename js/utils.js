// Kleine hulpfuncties gedeeld door de rest van de app.
const Utils = (() => {
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  // Interpoleert tussen een lijst hexkleuren op positie t (0..1).
  function mixPaletteColor(hexList, t) {
    if (hexList.length === 1) return hexList[0];
    const clamped = Math.max(0, Math.min(0.9999, t));
    const scaled = clamped * (hexList.length - 1);
    const i = Math.floor(scaled);
    const frac = scaled - i;
    const a = hexToRgb(hexList[i]);
    const b = hexToRgb(hexList[i + 1]);
    return rgbToHex(
      a.r + (b.r - a.r) * frac,
      a.g + (b.g - a.g) * frac,
      a.b + (b.b - a.b) * frac
    );
  }

  // Voert een groot aantal items uit in kleine batches, met een adempauze
  // tussen batches zodat de browser-tab niet vastloopt (nuttig bij het
  // opbouwen van een contactvel met 24+ renders).
  function runChunked(total, batchSize, work, onDone) {
    let i = 0;
    function step() {
      const end = Math.min(total, i + batchSize);
      for (; i < end; i++) work(i);
      if (i < total) {
        setTimeout(step, 0);
      } else if (onDone) {
        onDone();
      }
    }
    step();
  }

  // Activeert de download voor een blob- of data-URL via een onzichtbare
  // <a download>-klik. Eerder probeerde dit op mobiel via window.open() (een
  // nieuw tabblad om via "Bewaar afbeelding" op te slaan), als vermoedelijke
  // fix voor <a download> die daar niets leek te doen — maar dat bleek de
  // browser's downloadmanager juist te laten struikelen over de (zeer lange)
  // data-URL, met een verkeerd bestand (.txt i.p.v. de PNG) tot gevolg. De
  // eigenlijke oorzaak van het oorspronkelijke probleem zat 'm in
  // exportResult() (js/location.js), dat via een setTimeout draaide los van
  // de klik — user-gesture-koppeling die <a download> juist nodig heeft. Nu
  // dat weg is, werkt <a download> hier gewoon overal, zoals vanouds.
  function triggerSave(href, filename, revoke) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(revoke, 4000);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    triggerSave(url, filename, () => URL.revokeObjectURL(url));
  }

  function downloadSVGString(svgStr, filename) {
    downloadBlob(new Blob([svgStr], { type: 'image/svg+xml' }), filename);
  }

  // Zet een data:-URL synchroon om in een Blob (handmatig base64-decoderen
  // i.p.v. de ingebouwde fetch(dataURL).then(r=>r.blob()), want dat laatste
  // is weer async). Nodig omdat een <a href> die de hele PNG als base64-tekst
  // bevat (canvas.toDataURL() rechtstreeks als href) bij een groter exportformaat
  // de URL-lengtelimiet van mobiele browsers kan overschrijden — dat leverde
  // precies dít op: geen foutmelding, maar een leeg (0kb) bestand. Een korte
  // blob:-URL via URL.createObjectURL heeft dat probleem niet, ongeacht de
  // bestandsgrootte.
  function dataURLToBlob(dataURL) {
    const [header, base64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // toDataURL is bewust synchroon gekozen i.p.v. toBlob (dat werkt via een
  // async callback): de <a>-klik in triggerSave moet nog binnen hetzelfde
  // "user gesture"-venster vallen als de klik die 'm triggerde, en een async
  // stap ertussen (zoals toBlob's callback, of een setTimeout) verbreekt die
  // koppeling op strikte mobiele browsers net zo goed als de afwezigheid van
  // een gebruikersactie. dataURLToBlob hierboven zet 'm daarna alsnog
  // (synchroon) om naar een korte blob:-URL, zodat de bestandsgrootte er
  // niet meer toe doet.
  function downloadCanvasPNG(canvas, filename) {
    downloadBlob(dataURLToBlob(canvas.toDataURL('image/png')), filename);
  }

  // Print-formaten (21 t/m 120cm lange zijde @300dpi) voor een gegeven
  // beeldverhouding — gedeeld tussen Locatie en Map Test, die allebei
  // dezelfde exportkeuzes aanbieden. De laatste vier (70/90/100/120) zijn
  // op verzoek toegevoegd als grotere formaten bovenop de oorspronkelijke
  // 21-60cm-reeks.
  function computeExportSizes(ratioW, ratioH) {
    const dpi = 300;
    const longEdgesCm = [21, 30, 40, 50, 60, 70, 90, 100, 120];
    const isPortrait = ratioH >= ratioW;
    return longEdgesCm.map(cm => {
      let wCm, hCm;
      if (isPortrait) { hCm = cm; wCm = (cm * ratioW) / ratioH; }
      else { wCm = cm; hCm = (cm * ratioH) / ratioW; }
      const wPx = Math.round((wCm / 2.54) * dpi), hPx = Math.round((hCm / 2.54) * dpi);
      return { id: `cm${cm}`, label: `${Math.round(wCm)}×${Math.round(hCm)}cm @300dpi (${wPx}×${hPx})`, w: wPx, h: hPx };
    });
  }

  function slugify(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  // Deterministische 2D value-noise: een seeded rooster van willekeurige
  // waarden, glad geïnterpoleerd. Puur — dezelfde (x,y) geeft altijd
  // dezelfde waarde terug, wat nodig is voor reproduceerbare contourlijnen.
  function makeNoise2D(seed, latticeSize = 64) {
    const rnd = RNG.rngFor(seed);
    const lattice = new Float32Array(latticeSize * latticeSize);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
    function latticeVal(xi, yi) {
      const x = ((xi % latticeSize) + latticeSize) % latticeSize;
      const y = ((yi % latticeSize) + latticeSize) % latticeSize;
      return lattice[y * latticeSize + x];
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    return function noise2D(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const v00 = latticeVal(xi, yi), v10 = latticeVal(xi + 1, yi);
      const v01 = latticeVal(xi, yi + 1), v11 = latticeVal(xi + 1, yi + 1);
      const sx = smooth(xf), sy = smooth(yf);
      const top = v00 + (v10 - v00) * sx;
      const bot = v01 + (v11 - v01) * sx;
      return top + (bot - top) * sy;
    };
  }

  // Sommeert een paar octaven van dezelfde noise-functie op oplopende
  // frequentie/afnemende amplitude voor een organischer, "terrein-achtig" reliëf.
  function fractalNoise2D(noise2D, x, y, octaves) {
    let total = 0, amp = 0.5, freq = 1, maxVal = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise2D(x * freq, y * freq) * amp;
      maxVal += amp;
      amp *= 0.5; freq *= 2;
    }
    return total / maxVal;
  }

  return {
    hexToRgb, rgbToHex, mixPaletteColor, runChunked, downloadSVGString, downloadCanvasPNG, slugify,
    makeNoise2D, fractalNoise2D, computeExportSizes,
  };
})();
