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

  // canvas.toBlob() gebruikt de native, geoptimaliseerde PNG-encoder van de
  // browser en levert direct een Blob — geen omweg via een base64-tekst
  // (canvas.toDataURL()) die daarna weer met de hand (JS-lus, teken voor
  // teken) teruggezet moest worden naar bytes. Die handmatige omweg loste
  // wel het "0kb-bestand bij een groot exportformaat"-probleem op (een
  // <a href> met de hele PNG als base64-tekst kan de URL-lengtelimiet van
  // mobiele browsers overschrijden), maar was zelf traag genoeg om
  // downloaden op de computer merkbaar te vertragen, zeker bij de grootste
  // formaten — dat is nu weer weg, want toBlob→downloadBlob geeft toch al
  // een korte blob:-URL, zonder ooit een megabytes-lange data-URL te maken.
  // Enige kanttekening: toBlob werkt via een async callback i.p.v. synchroon
  // (vandaar de onDone/onError-parameters hieronder) — callers die downloaden
  // moeten opvolgen met een status-update doen dat dus pas ná deze callback,
  // niet er meteen achteraan.
  function downloadCanvasPNG(canvas, filename, onDone, onError) {
    canvas.toBlob(blob => {
      if (!blob) {
        if (onError) onError(new Error('canvas.toBlob gaf geen blob terug'));
        return;
      }
      downloadBlob(blob, filename);
      if (onDone) onDone();
    }, 'image/png');
  }

  // ---- Streaming PNG-encoder voor zeer grote exportformaten -------------
  // Bij de grootste printformaten (bv. 96×120cm@300dpi, ruim 160 miljoen
  // pixels) heeft één enkele canvas al ~640MB nodig voor de ruwe pixels
  // alleen — dat overschrijdt op mobiel (vooral iOS Safari) al snel het
  // geheugenbudget, met een mislukte export tot gevolg. Deze encoder bouwt
  // de PNG zelf, in horizontale stroken: elke strook wordt apart (in een
  // kleine canvas) getekend, direct als PNG-scanlines de compressie in
  // gestuurd, en daarna weggegooid — op elk moment zit dus maar één strook
  // (niet de hele afbeelding) in het geheugen. Gebruikt de standaard
  // CompressionStream('deflate')-API voor de zlib-compressie die een PNG
  // IDAT-chunk sowieso al moet bevatten (RFC 1950 — exact het 'deflate'-
  // formaat van de Compression Streams API, dus geen aparte zlib-library
  // nodig). Alle scanlines gebruiken filtertype 0 ("None") — iets minder
  // compact dan adaptieve filtering, maar veel eenvoudiger en nog steeds
  // een volledig geldige PNG.
  function supportsStreamingPNG() {
    return typeof CompressionStream === 'function';
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u32be(n, out, offset) {
    out[offset] = (n >>> 24) & 255; out[offset + 1] = (n >>> 16) & 255;
    out[offset + 2] = (n >>> 8) & 255; out[offset + 3] = n & 255;
  }
  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    u32be(data.length, out, 0);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    u32be(crc32(out.subarray(4, 8 + data.length)), out, 8 + data.length);
    return out;
  }

  // renderTile(y0, tileH) => een ImageData (breedte×tileH, RGBA8) met exact
  // de rijen [y0, y0+tileH) van de volledige afbeelding — synchroon, want
  // de aanroeper tekent die strook zelf in een kleine canvas. onProgress
  // (optioneel) krijgt {tile, tileCount} na elke verwerkte strook, handig
  // om tussentijds een statusregel bij te werken (dit hele proces is async
  // en kan bij de grootste formaten tientallen seconden duren).
  async function encodeStreamingPNG(width, height, tileHeight, renderTile, onProgress) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader();
    const compressedParts = [];
    let compressedLen = 0;
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        compressedParts.push(value);
        compressedLen += value.length;
      }
    })();

    const rowBytes = width * 4;
    const tileCount = Math.ceil(height / tileHeight);
    for (let tile = 0, y0 = 0; y0 < height; tile++, y0 += tileHeight) {
      const h = Math.min(tileHeight, height - y0);
      const imgData = renderTile(y0, h);
      const buf = new Uint8Array(h * (rowBytes + 1));
      for (let row = 0; row < h; row++) {
        const dst = row * (rowBytes + 1);
        buf[dst] = 0; // filtertype "None"
        buf.set(imgData.data.subarray(row * rowBytes, row * rowBytes + rowBytes), dst + 1);
      }
      await writer.write(buf);
      if (onProgress) onProgress({ tile: tile + 1, tileCount });
    }
    await writer.close();
    await pump;

    const idatData = new Uint8Array(compressedLen);
    let off = 0;
    for (const part of compressedParts) { idatData.set(part, off); off += part.length; }

    const ihdrData = new Uint8Array(13);
    u32be(width, ihdrData, 0);
    u32be(height, ihdrData, 4);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 6; // kleurtype: RGBA
    ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0; // compressie/filter/interlace: standaard

    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = pngChunk('IHDR', ihdrData);
    const idat = pngChunk('IDAT', idatData);
    const iend = pngChunk('IEND', new Uint8Array(0));

    const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
    let p = 0;
    [sig, ihdr, idat, iend].forEach(part => { out.set(part, p); p += part.length; });
    return new Blob([out], { type: 'image/png' });
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
    hexToRgb, rgbToHex, mixPaletteColor, runChunked, downloadSVGString, downloadCanvasPNG, downloadBlob, slugify,
    makeNoise2D, fractalNoise2D, computeExportSizes, supportsStreamingPNG, encodeStreamingPNG,
  };
})();
