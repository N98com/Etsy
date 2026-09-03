// Print-resolutie presets. cm -> pixels op basis van dpi (px = cm / 2.54 * dpi).
const EXPORT_SIZES = [
  { id: 'thumb-1000', label: 'Web preview (1000px, lange zijde)', longSidePx: 1000 },
  { id: 'a4-300', label: 'A4 @ 300dpi (2480x3508)', cm: [21, 29.7], dpi: 300 },
  { id: 'a3-300', label: 'A3 @ 300dpi (3508x4961)', cm: [29.7, 42], dpi: 300 },
  { id: 'a2-300', label: 'A2 @ 300dpi (4961x7016)', cm: [42, 59.4], dpi: 300 },
  { id: 'a2-150', label: 'A2 @ 150dpi — sneller, nog prima voor test (2480x3508)', cm: [42, 59.4], dpi: 150 },
  { id: 'a1-300', label: 'A1 @ 300dpi (7016x9933) — kan traag zijn', cm: [59.4, 84.1], dpi: 300 },
  { id: 'square-4000', label: 'Vierkant 4000x4000 (patroon-tegel)', square: 4000 },
];

function resolveExportSize(sizeId, aspect) {
  const preset = EXPORT_SIZES.find(s => s.id === sizeId) || EXPORT_SIZES[0];
  if (preset.square) return { w: preset.square, h: preset.square, preset };
  if (preset.cm) {
    const [wcm, hcm] = preset.cm;
    return { w: Math.round((wcm / 2.54) * preset.dpi), h: Math.round((hcm / 2.54) * preset.dpi), preset };
  }
  // longSidePx: pas aspect ratio van het canvas toe (default vierkant 1:1).
  const a = aspect || 1;
  const w = a >= 1 ? preset.longSidePx : Math.round(preset.longSidePx * a);
  const h = a >= 1 ? Math.round(preset.longSidePx / a) : preset.longSidePx;
  return { w, h, preset };
}

function filenameFor(algId, seed, paletteId, sizeId, ext) {
  const date = new Date().toISOString().slice(0, 10);
  return `${algId}-seed${seed}-${paletteId}-${sizeId}-${date}.${ext}`;
}

// Rendert een algoritme op de gevraagde resolutie en levert het resultaat
// af via callback (svgString voor vectoralgoritmes, canvas voor raster/PNG).
// Async met setTimeout-yield zodat de UI een "bezig..."-status kan tonen
// vlak voordat een zware export (bv. A2 attractor) de main thread blokkeert.
function renderForExport(algo, params, w, h, wantSVG, onDone) {
  setTimeout(() => {
    if (wantSVG && algo.vector) {
      const painter = new SVGPainter(w, h);
      algo.render(painter, params, w, h);
      onDone({ svg: painter.toString() });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (algo.vector) {
      const painter = new CanvasPainter(ctx, w, h);
      algo.render(painter, params, w, h);
    } else {
      algo.renderToCanvas(ctx, params, w, h);
    }
    onDone({ canvas });
  }, 20);
}
