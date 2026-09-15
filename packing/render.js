// Canvas rendering. World coordinates are y-up; the canvas is y-down, so every
// draw flips y. The view is scaled so the container fills most of the canvas.

import { worldVerts } from './geometry.js';
import { containerRadius } from './shapes.js';
import { sphereGeometry, itemOutline } from './sphere.js';

// The sphere's surface is drawn as a cylindrical equal-area map: longitude
// across, sine of latitude down. Every cap is visible at once, nothing hides
// behind a horizon, and because the projection preserves area the fraction of
// the rectangle covered by caps *is* the efficiency the stats report.
//
// Any aspect ratio stays equal-area -- scaling x and y differently multiplies
// every area by the same constant -- so 2:1 is chosen purely for looks. It puts
// the least shape distortion around 37 degrees; caps near a pole smear sideways
// and caps near the date line wrap around the edge, both of which are honest
// consequences of flattening a sphere rather than artefacts.
const MAP_ASPECT = 2;
const MAP_SEGMENTS = 96;
const MERIDIANS = [-0.5, 0, 0.5]; // as a fraction of a half-turn
const PARALLELS = [-0.5, 0, 0.5]; // in sine-of-latitude, so equal-area bands

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
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  draw(snapshot) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!snapshot) return;
    const { container, items, settled, loose } = snapshot;
    if (container.type === 'sphere') {
      this.drawSphereMap(snapshot, w, h);
      return;
    }

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

  // Equal-area map of a packing that lives on a sphere's surface.
  drawSphereMap(snapshot, w, h) {
    const { ctx } = this;
    const { container, items, settled, loose } = snapshot;
    if (!items.length) return;
    const g = sphereGeometry(items[0].shape, container.R);

    // Largest 2:1 rectangle that fits, centred.
    const pad = Math.min(w, h) * 0.04;
    let mw = w - pad * 2;
    let mh = mw / MAP_ASPECT;
    if (mh > h - pad * 2) {
      mh = h - pad * 2;
      mw = mh * MAP_ASPECT;
    }
    const x0 = (w - mw) / 2;
    const y0 = (h - mh) / 2;
    // Longitude in [-pi, pi] across; sine of latitude in [-1, 1] down.
    const sx = (lon) => x0 + (lon / (2 * Math.PI) + 0.5) * mw;
    const sy = (z) => y0 + (0.5 - z / 2) * mh;

    this.drawGraticule(x0, y0, mw, mh, sx, sy);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, mw, mh);
    ctx.clip();
    items.forEach((item, i) => {
      this.drawPieceOnMap(item, g, sx, sy, this.itemColor(i, settled, loose));
    });
    ctx.restore();

    ctx.strokeStyle = this.colors.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, mw, mh);
  }

  drawGraticule(x0, y0, mw, mh, sx, sy) {
    const { ctx } = this;
    ctx.strokeStyle = this.colors.border;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const m of MERIDIANS) {
      const x = sx(m * Math.PI);
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + mh);
    }
    for (const p of PARALLELS) {
      const y = sy(p);
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + mw, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // A piece on the sphere becomes whatever its outline projects to -- including,
  // near a pole, a band that reaches the top edge.
  drawPieceOnMap(item, g, sx, sy, color) {
    const { ctx } = this;
    const outline = pieceOutline(item, g);
    // The outline lives in unwrapped longitude, which can sit outside
    // [-pi, pi]. Shifting it by a whole turn each way puts the piece that
    // belongs on the far edge back on the map.
    const shifts = [-2 * Math.PI, 0, 2 * Math.PI].filter(
      (shift) => outline.min + shift <= Math.PI && outline.max + shift >= -Math.PI,
    );
    if (!shifts.length) return;

    // Every copy goes into one path and is filled once. Filling them separately
    // would composite the alpha twice wherever two copies meet, which is what
    // otherwise leaves a seam down a cap that wraps a pole.
    ctx.beginPath();
    for (const shift of shifts) trace(ctx, outline.points, shift, sx, sy, true);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Stroke the cap's own boundary only: the edges added to close it along a
    // pole are not edges of anything and should not be drawn.
    ctx.beginPath();
    for (const shift of shifts) trace(ctx, outline.boundary, shift, sx, sy, !outline.encirclesPole);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Project a piece's boundary into unwrapped (longitude, sine-latitude) space.
//
// Unwrapping keeps the outline one connected curve instead of having it jump
// the full width of the map each time it crosses the date line. A cap that
// contains a pole is the case that needs care: its outline then winds a whole
// turn in longitude and never closes on the map, so the filled region is closed
// along the pole edge instead -- which is exactly the ground the cap covers
// there. `boundary` keeps the real edge on its own for stroking.
function pieceOutline(item, g) {
  const boundary = [];
  let previous = null;
  let winding = 0;
  for (const p of itemOutline(item, g, MAP_SEGMENTS)) {
    let lon = Math.atan2(p.y, p.x);
    if (previous !== null) {
      while (lon - previous > Math.PI) lon -= 2 * Math.PI;
      while (lon - previous < -Math.PI) lon += 2 * Math.PI;
      winding += lon - previous;
    }
    previous = lon;
    boundary.push({ lon, z: p.z });
  }

  const encirclesPole = Math.abs(winding) > Math.PI;
  let edge = boundary;
  let points = boundary;
  if (encirclesPole) {
    // The samples stop one step short of a whole turn, so repeat the first one
    // a turn along. Without it the span is 2*pi minus a step and the two tiled
    // copies leave a gap at the seam.
    const turn = winding > 0 ? 2 * Math.PI : -2 * Math.PI;
    edge = [...boundary, { lon: boundary[0].lon + turn, z: boundary[0].z }];
    const pole = item.z > 0 ? 1 : -1;
    points = [...edge, { lon: boundary[0].lon + turn, z: pole }, { lon: boundary[0].lon, z: pole }];
  }

  let min = Infinity;
  let max = -Infinity;
  for (const { lon } of points) {
    if (lon < min) min = lon;
    if (lon > max) max = lon;
  }
  return { points, boundary: edge, encirclesPole, min, max };
}

function trace(ctx, points, shift, sx, sy, close) {
  points.forEach(({ lon, z }, k) => {
    const x = sx(lon + shift);
    const y = sy(z);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

function traceVerts(ctx, verts, cx, cy, s) {
  ctx.moveTo(cx + verts[0][0] * s, cy - verts[0][1] * s);
  for (let i = 1; i < verts.length; i++) {
    ctx.lineTo(cx + verts[i][0] * s, cy - verts[i][1] * s);
  }
  ctx.closePath();
}
