import {buildClasses, EDGES, VPOS} from './buildClasses.js';

const {byK, ks} = buildClasses();
console.log({byK, ks});

// ========= 3D Math & Projection =========
function rotY(v, a) {
  const [x, y, z] = v;
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c * x + s * z, y, -s * x + c * z];
}
function rotX(v, a) {
  const [x, y, z] = v;
  const c = Math.cos(a),
    s = Math.sin(a);
  return [x, c * y - s * z, s * y + c * z];
}
function project(v, camZ, f) {
  const [x, y, z] = v;
  const Z = camZ - z;
  const s = f / Z;
  return [x * s, y * s, Z, s];
}

// ========= Canvas & Layout =========
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // Rounded strokes globally
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
window.addEventListener('resize', resize);
resize();

// Layout (same spacing)
const padding = 8;
const rowGap = 4;
const colGap = 2;
const leftGutter = 32;

// ========= Mouse-driven rotation =========
let mx = 0.5,
  my = 0.5; // normalized mouse (0..1)
function updateMouse(e) {
  const rect = canvas.getBoundingClientRect();
  mx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  my = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
}
canvas.addEventListener('pointermove', updateMouse, {passive: true});
canvas.addEventListener('pointerdown', updateMouse, {passive: true});
canvas.addEventListener('pointerenter', updateMouse, {passive: true});
window.addEventListener('pointerleave', () => {
  mx = 0.5;
  my = 0.5;
});

function getAnglesFromMouse() {
  const yaw = (mx - 0.5) * Math.PI * 2;
  const pitch = (my - 0.5) * Math.PI * 2;
  return {yaw, pitch};
}

// ========= Drawing =========
function drawEdge(p0, p1, w, alpha, color) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.stroke();
}

function drawCell(x, y, w, h, repEdges, yaw, pitch) {
  // **50% bigger than current**: previous sFit was 0.96; now 0.96 * 1.5 = 1.44
  const cx = x + w / 2,
    cy = y + h / 2;
  const sFit = Math.min(w, h) * 2;

  // Camera params
  const camZ = 3.5;
  const f = 1;

  // Transform & project all vertices
  const Vt = VPOS.map((v) => rotX(rotY(v, yaw), pitch));
  const P = Vt.map((v) => project(v, camZ, f));
  const P2 = P.map((p) => [cx + p[0] * sFit, cy - p[1] * sFit, p[2], p[3]]); // [sx, sy, Z, scale]

  // Sort edges by depth (far to near) using midpoint Z
  const repSet = new Set(repEdges);
  const ALL = EDGES.map((e, i) => ({e, i, selected: repSet.has(i)}));
  ALL.sort((A, B) => {
    const za = (P[A.e[0]][2] + P[A.e[1]][2]) * 0.5;
    const zb = (P[B.e[0]][2] + P[B.e[1]][2]) * 0.5;
    return zb - za; // far first
  });

  // First pass: faint full cube wire
  for (const {e} of ALL) {
    const a = P2[e[0]],
      b = P2[e[1]];
    const scaleAvg = (P[e[0]][3] + P[e[1]][3]) * 0.5; // depth cue
    const alpha = Math.min(0.25, 0.12 + 0.6 * scaleAvg);
    const width = Math.max(0.8, 0.8 + 1.5 * scaleAvg);
    drawEdge(a, b, width, alpha, '#6b7ab8');
  }

  // Second pass: selected edges thicker/brighter, on top
  for (const {e, selected} of ALL) {
    if (!selected) continue;
    const a = P2[e[0]],
      b = P2[e[1]];
    const scaleAvg = (P[e[0]][3] + P[e[1]][3]) * 0.5;
    const alpha = Math.min(1, 0.35 + 1.2 * scaleAvg);
    const width = 2.8 + 4.6 * scaleAvg;
    drawEdge(a, b, width, alpha, '#e6f0ff');
  }
}

function render() {
  // background
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
  grad.addColorStop(0, '#0b1020');
  grad.addColorStop(1, '#0d1430');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // Per-row geometry
  const rowCount = ks.length; // 12 rows (k=1..12)
  const rowH =
    (canvas.clientHeight - 2 * padding - (rowCount - 1) * rowGap) / rowCount;

  // Compute angles once per frame from mouse
  const {yaw, pitch} = getAnglesFromMouse();

  // Draw each row / cell
  let y = padding;
  for (const k of ks) {
    const classes = byK.get(k) || [];
    const cols = classes.length;
    const wAvail =
      canvas.clientWidth - leftGutter - 2 * padding - (cols - 1) * colGap;
    const cellW = cols > 0 ? wAvail / cols : wAvail;

    // label for the row
    ctx.save();
    ctx.font =
      '700 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = '#c6d2ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(`k = ${k}`, padding, y + rowH / 2);
    ctx.restore();

    // draw each class (all use same angles; no time-based phase offsets)
    let x = padding + leftGutter;
    for (let i = 0; i < cols; i++) {
      const repEdges = classes[i].rep;
      drawCell(x, y, cellW, rowH, repEdges, yaw, pitch);
      x += cellW + colGap;
    }

    y += rowH + rowGap;
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
