// Canvas rendering, view transform (world meters -> screen), and mouse controls.

import {PALETTE, LOD_PX} from './config.js';

const projX = (mx, v) => mx * v.k + v.ox;
const projY = (my, v) => v.oy - my * v.k;

// Size the canvas to the window and fit the world `span` (meters) centered in it.
export function fitView(canvas, view, span) {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  view.k = Math.min(canvas.width / span.x, canvas.height / span.y) * 0.96;
  view.ox = canvas.width / 2 - (span.x / 2) * view.k;
  view.oy = canvas.height / 2 + (span.y / 2) * view.k;
}

export function draw(ctx, scene) {
  const {edges, colorByEdge, view: v} = scene;
  const W = ctx.canvas.width,
    H = ctx.canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Level of detail: a feature whose on-screen footprint is under ~LOD_PX pixels
  // is invisible, so skip it. Zoomed out (a whole metro on screen) this drops the
  // bulk of short residential streets; zoom in and they reappear as the threshold
  // shrinks in world units. `skip` also folds in the off-screen viewport cull.
  const minExtent = LOD_PX / v.k;
  const skip = (b) =>
    (b[2] - b[0] < minExtent && b[3] - b[1] < minExtent) ||
    offscreen(b, v, W, H);

  // Colored streets: bucket the survivors by neighborhood color, then issue ONE
  // stroke per color instead of one per street (the big win for a metro-sized net).
  // colorByEdge[i] is a palette index, or -1 for the barrier skeleton.
  const buckets = Array.from({length: PALETTE.length}, () => []);
  for (let i = 0; i < edges.length; i++) {
    const c = colorByEdge[i];
    if (c < 0 || skip(edges[i].bbox)) continue;
    buckets[c].push(edges[i].pts);
  }
  ctx.lineWidth = 1.4;
  for (let c = 0; c < buckets.length; c++) {
    if (!buckets[c].length) continue;
    const rgb = PALETTE[c];
    ctx.strokeStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.beginPath();
    for (const pts of buckets[c]) tracePath(ctx, pts, v);
    ctx.stroke();
  }

  // Barrier skeleton (uncolored edges: major roads, or fast roads in slow mode),
  // drawn on top in light gray so the neighborhood colors stay the focus.
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#9a9ea6';
  ctx.beginPath();
  for (let i = 0; i < edges.length; i++) {
    if (colorByEdge[i] >= 0 || skip(edges[i].bbox)) continue;
    tracePath(ctx, edges[i].pts, v);
  }
  ctx.stroke();
}

// Add a polyline to the current path (no begin/stroke — caller batches those).
// Interior vertices within ~LOD_PX of the last drawn point are skipped: when
// zoomed out a curvy street collapses toward a straight pixel-wide line, which
// looks identical but draws far fewer segments. The final vertex is always kept.
function tracePath(ctx, pts, v) {
  let px = projX(pts[0][0], v),
    py = projY(pts[0][1], v);
  ctx.moveTo(px, py);
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const x = projX(pts[i][0], v),
      y = projY(pts[i][1], v);
    if (i < n - 1 && Math.abs(x - px) < LOD_PX && Math.abs(y - py) < LOD_PX)
      continue;
    ctx.lineTo(x, y);
    px = x;
    py = y;
  }
}

function offscreen(b, v, W, H) {
  const x0 = projX(b[0], v),
    x1 = projX(b[2], v);
  const y0 = projY(b[1], v),
    y1 = projY(b[3], v);
  return (
    Math.max(x0, x1) < 0 ||
    Math.min(x0, x1) > W ||
    Math.max(y0, y1) < 0 ||
    Math.min(y0, y1) > H
  );
}

// Mouse-wheel zoom (toward the cursor) + drag pan.
export function installControls(canvas, view, requestDraw) {
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const mx = (e.offsetX - view.ox) / view.k;
      const my = (view.oy - e.offsetY) / view.k;
      view.k *= f;
      view.ox = e.offsetX - mx * view.k;
      view.oy = e.offsetY + my * view.k;
      requestDraw();
    },
    {passive: false},
  );

  let dragging = false,
    lx = 0,
    ly = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
  });
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    view.ox += e.clientX - lx;
    view.oy += e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    requestDraw();
  });
  addEventListener('mouseup', () => {
    dragging = false;
  });
}
