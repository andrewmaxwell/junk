// Canvas rendering. World coordinates are y-up; the canvas is y-down, so every
// draw flips y. The view is scaled so the container fills most of the canvas.

import { worldVerts } from './geometry.js';
import { containerRadius } from './shapes.js';

const COLOR_KEYS = { ok: '--ok', bad: '--bad', loose: '--loose', border: '--text-dim' };
const FALLBACKS = { ok: '#2f7d5c', bad: '#b1492f', loose: '#2f6f9d', border: '#888888' };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.colors = { ...FALLBACKS };
    this.refreshColors();
    // Theme can flip while the page is open; re-read the palette when it does.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.refreshColors();
    });
  }

  refreshColors() {
    const styles = getComputedStyle(document.documentElement);
    for (const [name, prop] of Object.entries(COLOR_KEYS)) {
      this.colors[name] = styles.getPropertyValue(prop).trim() || FALLBACKS[name];
    }
  }

  // Match the backing store to the CSS size so the drawing stays crisp on
  // high-DPI displays and after a resize.
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      return true;
    }
    return false;
  }

  draw(snapshot) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!snapshot) return;
    const { container, items, settled, loose } = snapshot;
    const cx = w / 2;
    const cy = h / 2;
    const s = (Math.min(w, h) / 2) * 0.92 / containerRadius(container);

    this.drawContainer(container, cx, cy, s);
    for (let i = 0; i < items.length; i++) {
      this.drawItem(items[i], cx, cy, s, this.itemColor(i, settled, loose));
    }
  }

  // Overlapping outranks loose: a piece that is not yet placed says nothing
  // useful about whether it would rattle once it is.
  itemColor(i, settled, loose) {
    if (settled && !settled[i]) return this.colors.bad;
    if (loose && loose[i]) return this.colors.loose;
    return this.colors.ok;
  }

  drawContainer(container, cx, cy, s) {
    const { ctx } = this;
    ctx.strokeStyle = this.colors.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (container.type === 'circle') {
      ctx.arc(cx, cy, container.R * s, 0, Math.PI * 2);
    } else {
      traceVerts(ctx, container.verts, cx, cy, s);
    }
    ctx.stroke();
  }

  drawItem(item, cx, cy, s, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    if (item.shape.type === 'circle') {
      ctx.arc(cx + item.x * s, cy - item.y * s, item.shape.radius * s, 0, Math.PI * 2);
    } else {
      traceVerts(ctx, worldVerts(item), cx, cy, s);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
}

function traceVerts(ctx, verts, cx, cy, s) {
  ctx.moveTo(cx + verts[0][0] * s, cy - verts[0][1] * s);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(cx + verts[i][0] * s, cy - verts[i][1] * s);
  }
  ctx.closePath();
}
