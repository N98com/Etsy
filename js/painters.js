// Eén tekeninterface, twee implementaties: dezelfde algoritme-code tekent
// zowel een snelle canvas-thumbnail als een print-klare SVG. Zo blijft het
// contactvel en de export altijd visueel identiek.
function fmt(n) { return Math.round(n * 100) / 100; }
function fillAttr(fill) { return (fill && fill !== 'none') ? `fill="${fill}"` : 'fill="none"'; }
function strokeAttr(stroke, w) { return stroke ? `stroke="${stroke}" stroke-width="${fmt(w || 1)}"` : 'stroke="none"'; }
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

class CanvasPainter {
  constructor(ctx, w, h) { this.ctx = ctx; this.w = w; this.h = h; }

  setBackground(color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  circle(x, y, r, { fill, stroke, strokeWidth } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 0.01), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth || 1; ctx.stroke(); }
  }

  ellipse(x, y, rx, ry, rot, { fill, stroke, strokeWidth } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), rot, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth || 1; ctx.stroke(); }
  }

  polyline(points, { stroke, strokeWidth, fill, opacity, closed, dash } = {}) {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    if (opacity != null) ctx.globalAlpha = opacity;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (closed) ctx.closePath();
    if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth || 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
    }
    ctx.restore();
  }

  polygon(points, opts = {}) { this.polyline(points, { ...opts, closed: true }); }

  // Tekst — nodig voor kaart-onderschriften, straatnamen en landmark-labels.
  text(x, y, str, { fill, fontSize = 16, fontFamily = 'sans-serif', weight = '400', align = 'center', baseline = 'alphabetic', letterSpacing, rotate } = {}) {
    const ctx = this.ctx;
    ctx.save();
    if (rotate) { ctx.translate(x, y); ctx.rotate(rotate * Math.PI / 180); x = 0; y = 0; }
    ctx.fillStyle = fill || '#000';
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  // Rechthoekige clip — gebruikt om de kaart binnen zijn kader af te snijden
  // wanneer de geselecteerde geo-bounding-box net iets groter is dan het
  // kader (een "cover"-fit, zoals background-size:cover).
  beginClip(x, y, w, h) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }

  // Clip op een willekeurige vorm (voor "isoleer gebied") — rings is een
  // lijst van ringen, elk een array van [x,y]-punten. Eén ring per polygoon
  // is de buitenrand; een polygoon met een gat (een enclave) geeft je
  // gewoon een extra ring — de evenodd-regel snijdt gaten er vanzelf uit.
  beginClipPath(rings) {
    this.ctx.save();
    this.ctx.beginPath();
    rings.forEach(ring => {
      ring.forEach(([x, y], i) => (i === 0 ? this.ctx.moveTo(x, y) : this.ctx.lineTo(x, y)));
      this.ctx.closePath();
    });
    this.ctx.clip('evenodd');
  }

  endClip() { this.ctx.restore(); }
}

class SVGPainter {
  constructor(w, h) { this.w = w; this.h = h; this.parts = []; }

  setBackground(color) {
    this.parts.push(`<rect x="0" y="0" width="${this.w}" height="${this.h}" fill="${color}"/>`);
  }

  circle(x, y, r, { fill, stroke, strokeWidth } = {}) {
    this.parts.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(Math.max(r, 0.01))}" ${fillAttr(fill)} ${strokeAttr(stroke, strokeWidth)}/>`);
  }

  ellipse(x, y, rx, ry, rot, { fill, stroke, strokeWidth } = {}) {
    const deg = fmt(rot * 180 / Math.PI);
    this.parts.push(`<ellipse cx="${fmt(x)}" cy="${fmt(y)}" rx="${fmt(Math.max(rx, 0.01))}" ry="${fmt(Math.max(ry, 0.01))}" transform="rotate(${deg} ${fmt(x)} ${fmt(y)})" ${fillAttr(fill)} ${strokeAttr(stroke, strokeWidth)}/>`);
  }

  polyline(points, { stroke, strokeWidth, fill, opacity, closed, dash } = {}) {
    if (points.length < 2) return;
    const tag = closed ? 'polygon' : 'polyline';
    const ptStr = points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
    const op = opacity != null ? `opacity="${opacity}"` : '';
    const dashAttr = dash ? `stroke-dasharray="${dash.map(fmt).join(',')}"` : '';
    this.parts.push(`<${tag} points="${ptStr}" ${fillAttr(fill)} ${strokeAttr(stroke, strokeWidth)} ${op} ${dashAttr} stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  polygon(points, opts = {}) { this.polyline(points, { ...opts, closed: true }); }

  text(x, y, str, { fill, fontSize = 16, fontFamily = 'sans-serif', weight = '400', align = 'center', baseline = 'alphabetic', letterSpacing, rotate } = {}) {
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const dominant = baseline === 'middle' ? 'middle' : baseline === 'hanging' ? 'hanging' : 'auto';
    const transform = rotate ? ` transform="rotate(${fmt(rotate)} ${fmt(x)} ${fmt(y)})"` : '';
    const ls = letterSpacing ? ` letter-spacing="${fmt(letterSpacing)}"` : '';
    this.parts.push(`<text x="${fmt(x)}" y="${fmt(y)}" fill="${fill || '#000'}" font-size="${fmt(fontSize)}" font-family="${fontFamily}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="${dominant}"${ls}${transform}>${escapeXml(str)}</text>`);
  }

  beginClip(x, y, w, h) {
    this._clipCounter = (this._clipCounter || 0) + 1;
    const id = `clip${this._clipCounter}`;
    this.parts.push(`<clipPath id="${id}"><rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"/></clipPath><g clip-path="url(#${id})">`);
  }

  beginClipPath(rings) {
    this._clipCounter = (this._clipCounter || 0) + 1;
    const id = `clip${this._clipCounter}`;
    const d = rings.map(ring => 'M' + ring.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join('L') + 'Z').join(' ');
    this.parts.push(`<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${id})">`);
  }

  endClip() { this.parts.push('</g>'); }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">${this.parts.join('')}</svg>`;
  }
}
