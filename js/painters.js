// Eén tekeninterface, twee implementaties: dezelfde algoritme-code tekent
// zowel een snelle canvas-thumbnail als een print-klare SVG. Zo blijft het
// contactvel en de export altijd visueel identiek.
function fmt(n) { return Math.round(n * 100) / 100; }
function fillAttr(fill) { return (fill && fill !== 'none') ? `fill="${fill}"` : 'fill="none"'; }
function strokeAttr(stroke, w) { return stroke ? `stroke="${stroke}" stroke-width="${fmt(w || 1)}"` : 'stroke="none"'; }

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

  polyline(points, { stroke, strokeWidth, fill, opacity, closed } = {}) {
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
      ctx.stroke();
    }
    ctx.restore();
  }

  polygon(points, opts = {}) { this.polyline(points, { ...opts, closed: true }); }
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

  polyline(points, { stroke, strokeWidth, fill, opacity, closed } = {}) {
    if (points.length < 2) return;
    const tag = closed ? 'polygon' : 'polyline';
    const ptStr = points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
    const op = opacity != null ? `opacity="${opacity}"` : '';
    this.parts.push(`<${tag} points="${ptStr}" ${fillAttr(fill)} ${strokeAttr(stroke, strokeWidth)} ${op} stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  polygon(points, opts = {}) { this.polyline(points, { ...opts, closed: true }); }

  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">${this.parts.join('')}</svg>`;
  }
}
