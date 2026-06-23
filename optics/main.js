// --- Constants ---
const NUM_LENSES = 5;
const BLOOM_BLUR = 12;
const BLOOM_ALPHA = 0.35;
const BLOOM_WIDE_BLUR = 55;
const BLOOM_WIDE_ALPHA = 0.12;
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS_SQ = 144; // 12²
const NEW_LENS_HEIGHT = 120;
const NEW_LENS_SAGITTA = 15;
const GLOBAL_IOR = 1.5;
const MIN_SAGITTA = 8; // minimum |sagitta| — surfaces are never perfectly flat
const MAX_SAGITTA_RATIO = 0.44; // max |sagitta| as fraction of lens height
const MAX_EDGE_RATIO = 0.7; // max cylindrical-edge width as fraction of height
const MIN_CENTER_THICKNESS = 6; // glass never pinches to zero in the middle

// Render quality: full quality on idle, draft quality during drag
const FULL_COLORED_RAYS = 2000;
const DRAFT_COLORED_RAYS = 500;
const FULL_WHITE_RAYS = 700;
const DRAFT_WHITE_RAYS = 150;
const FULL_WHITE_WAVELENGTHS = 28;
const DRAFT_WHITE_WAVELENGTHS = 14;
const COLORED_RAY_ALPHA = 0.08;
const WHITE_WAVELENGTH_ALPHA = 0.03;

// --- Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height, dpr;

// --- Worker ---
// Ray tracing and rendering run entirely in rayWorker.js off the main thread.
// The worker returns an ImageBitmap that is composited here.
const rayWorker = new Worker(new URL('./rayWorker.js', import.meta.url));
let lastBitmap = null;
let workerBusy = false;
let drawPending = false;
let needsRender = false;

rayWorker.onmessage = ({data: {bitmap}}) => {
  if (lastBitmap) lastBitmap.close();
  lastBitmap = bitmap;
  workerBusy = false;
  if (needsRender) requestRayRender();
  scheduleDrawScene();
};

// --- Scene state ---
let lenses = [];

// --- Interaction state ---
// 'none' | 'body' | 'p1' | 'p2' | 'apex1' | 'apex2' | 'thickness'
let draggingState = 'none';
let activeLens = null;
let dragOffsetP1 = {x: 0, y: 0};
let dragOffsetP2 = {x: 0, y: 0};

// --- Math utilities ---
const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Clamp a value's magnitude to [min, max] while preserving its sign.
// Zero (ambiguous sign) defaults to +min.
function clampSignedMag(v, min, max) {
  const sign = v < 0 ? -1 : 1;
  return sign * Math.max(min, Math.min(max, Math.abs(v)));
}

// --- Lens ---
// Each lens has two independently controllable surfaces plus a cylindrical edge.
// Signed sagittas s1/s2 set surface curvature: positive = convex (bulges out),
// negative = concave (curves in). The edge width W is the axial thickness of the
// flat cylindrical rim; W = 0 gives the classic pointed biconvex shape, while
// W > 0 is required to give concave lenses a real (non-pinched) body.
//
// Lens-space coordinates: u = axial (along axisDir), v = perpendicular (perpDir).
// Surface vertices sit at u = -(W/2 + s1) and u = +(W/2 + s2); the rim spans
// u ∈ [-W/2, +W/2] at v = ±H. Each surface circle passes through its vertex and
// the two rim points at v = ±H.
class Lens {
  constructor(x, y, height, s1, s2, angle, w = 0) {
    this.ior = GLOBAL_IOR;
    this.s1Ratio = s1 / height;
    this.s2Ratio = s2 / height;
    this.wRatio = w / height;

    const perpCos = Math.cos(angle - Math.PI / 2);
    const perpSin = Math.sin(angle - Math.PI / 2);
    this.p1 = {x: x + (height / 2) * perpCos, y: y + (height / 2) * perpSin};
    this.p2 = {x: x - (height / 2) * perpCos, y: y - (height / 2) * perpSin};

    this.hoveredBody = false;
    this.hoveredP1 = false;
    this.hoveredP2 = false;
    this.hoveredApex1 = false;
    this.hoveredApex2 = false;
    this.hoveredThickness = false;

    this.updateGeometry();
  }

  updateGeometry() {
    this.x = (this.p1.x + this.p2.x) / 2;
    this.y = (this.p1.y + this.p2.y) / 2;
    this.h = Math.max(Math.sqrt(distSq(this.p1, this.p2)), 10);
    const H = this.h / 2;
    this.H = H;

    const sMin = Math.min(MIN_SAGITTA, this.h * 0.1);
    const sMax = this.h * MAX_SAGITTA_RATIO;
    this.s1 = clampSignedMag(this.h * this.s1Ratio, sMin, sMax);
    this.s2 = clampSignedMag(this.h * this.s2Ratio, sMin, sMax);

    // Edge width must be wide enough that the center thickness
    // T = W + s1 + s2 stays above MIN_CENTER_THICKNESS (matters for concave).
    const minW = Math.max(0, MIN_CENTER_THICKNESS - (this.s1 + this.s2));
    const maxW = this.h * MAX_EDGE_RATIO;
    this.w = Math.max(minW, Math.min(maxW, this.h * this.wRatio));

    this.angle =
      Math.atan2(this.p1.y - this.p2.y, this.p1.x - this.p2.x) + Math.PI / 2;

    const cosA = Math.cos(this.angle);
    const sinA = Math.sin(this.angle);
    this.axisDir = {x: cosA, y: sinA};
    this.perpDir = {x: -sinA, y: cosA}; // p1 = center + H * perpDir

    this.sign1 = this.s1 < 0 ? -1 : 1;
    this.sign2 = this.s2 < 0 ? -1 : 1;
    const a1 = Math.abs(this.s1);
    const a2 = Math.abs(this.s2);

    // Sagitta formula (magnitude): r = (s² + H²) / (2|s|)
    this.r1 = (a1 * a1 + H * H) / (2 * a1);
    this.r2 = (a2 * a2 + H * H) / (2 * a2);

    // Surface vertices and circle centers along the optical axis.
    const v1u = -(this.w / 2 + this.s1); // left vertex axial offset
    const v2u = this.w / 2 + this.s2; // right vertex axial offset
    const c1u = v1u + this.sign1 * this.r1;
    const c2u = v2u - this.sign2 * this.r2;

    this.c1 = {x: this.x + c1u * cosA, y: this.y + c1u * sinA};
    this.c2 = {x: this.x + c2u * cosA, y: this.y + c2u * sinA};

    // Apex handles sit at the surface vertices.
    this.apex1 = {x: this.x + v1u * cosA, y: this.y + v1u * sinA};
    this.apex2 = {x: this.x + v2u * cosA, y: this.y + v2u * sinA};

    // Cylindrical-rim corner points (collapse to p1/p2 when w = 0).
    const hw = this.w / 2;
    this.rimLT = this.corner(-hw, H);
    this.rimLB = this.corner(-hw, -H);
    this.rimRT = this.corner(hw, H);
    this.rimRB = this.corner(hw, -H);

    // Thickness handle: midway up the rim, at the right edge.
    this.thicknessHandle = this.corner(hw, H * 0.5);

    const maxAxial = this.w / 2 + Math.max(a1, a2);
    this.boundingRadius = Math.sqrt(maxAxial * maxAxial + H * H) + 2;
  }

  // Lens-space (u along axis, v along perp) → world point.
  corner(u, v) {
    return {
      x: this.x + u * this.axisDir.x + v * this.perpDir.x,
      y: this.y + u * this.axisDir.y + v * this.perpDir.y,
    };
  }

  containsPoint(pt) {
    const dx = pt.x - this.x;
    const dy = pt.y - this.y;
    const v = dx * this.perpDir.x + dy * this.perpDir.y;
    if (Math.abs(v) > this.H) return false;
    const d1 = distSq(pt, this.c1);
    if (this.sign1 > 0 ? d1 > this.r1 * this.r1 : d1 < this.r1 * this.r1) {
      return false;
    }
    const d2 = distSq(pt, this.c2);
    if (this.sign2 > 0 ? d2 > this.r2 * this.r2 : d2 < this.r2 * this.r2) {
      return false;
    }
    return true;
  }

  // Builds the closed lens outline as a polyline of world points by sampling
  // each surface as u(v) = cu ∓ sign·√(r² − v²) across v ∈ [−H, H].
  outlinePath() {
    const SEG = 28;
    const H = this.H;
    const c1u = this.relAxis(this.c1);
    const c2u = this.relAxis(this.c2);
    const pts = [];

    // Left surface: bottom (v = −H) up to top (v = +H)
    for (let i = 0; i <= SEG; i++) {
      const v = -H + (2 * H * i) / SEG;
      const u =
        c1u - this.sign1 * Math.sqrt(Math.max(0, this.r1 * this.r1 - v * v));
      pts.push(this.corner(u, v));
    }
    // Right surface: top down to bottom
    for (let i = 0; i <= SEG; i++) {
      const v = H - (2 * H * i) / SEG;
      const u =
        c2u + this.sign2 * Math.sqrt(Math.max(0, this.r2 * this.r2 - v * v));
      pts.push(this.corner(u, v));
    }
    return pts;
  }

  // Axial (u) coordinate of a world point relative to the lens center.
  relAxis(pt) {
    return (pt.x - this.x) * this.axisDir.x + (pt.y - this.y) * this.axisDir.y;
  }

  draw() {
    const isActive = this === activeLens || this.hoveredBody;

    const pts = this.outlinePath();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();

    ctx.fillStyle = isActive
      ? 'rgba(100,180,255,0.13)'
      : 'rgba(100,150,255,0.05)';
    ctx.fill();

    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.strokeStyle = isActive
      ? 'rgba(200,230,255,0.6)'
      : 'rgba(160,210,255,0.28)';
    ctx.stroke();

    // Endpoint handles (white) — faint ring idle, solid on hover/drag
    for (const [pt, hovered, handleState] of [
      [this.p1, this.hoveredP1, 'p1'],
      [this.p2, this.hoveredP2, 'p2'],
    ]) {
      const isHandleActive =
        hovered || (activeLens === this && draggingState === handleState);
      ctx.lineWidth = 1;
      ctx.strokeStyle = isHandleActive
        ? 'rgba(255,255,255,0.9)'
        : 'rgba(255,255,255,0.25)';
      ctx.fillStyle = isHandleActive ? 'rgba(255,255,255,0.85)' : 'transparent';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Apex handles (gold) — faint ring idle, solid on hover/drag
    for (const [pt, hovered, handleState] of [
      [this.apex1, this.hoveredApex1, 'apex1'],
      [this.apex2, this.hoveredApex2, 'apex2'],
    ]) {
      const isHandleActive =
        hovered || (activeLens === this && draggingState === handleState);
      ctx.lineWidth = 1;
      ctx.strokeStyle = isHandleActive
        ? 'rgba(255,205,55,0.9)'
        : 'rgba(255,200,50,0.22)';
      ctx.fillStyle = isHandleActive ? 'rgba(255,210,60,0.85)' : 'transparent';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Thickness handle (teal diamond) — controls cylindrical-edge width
    {
      const isHandleActive =
        this.hoveredThickness ||
        (activeLens === this && draggingState === 'thickness');
      const p = this.thicknessHandle;
      const r = HANDLE_RADIUS;
      ctx.lineWidth = 1;
      ctx.strokeStyle = isHandleActive
        ? 'rgba(90,235,220,0.9)'
        : 'rgba(90,225,210,0.22)';
      ctx.fillStyle = isHandleActive ? 'rgba(90,235,220,0.85)' : 'transparent';
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // Returns a plain-object snapshot of the geometry needed by the worker.
  serialize() {
    return {
      x: this.x,
      y: this.y,
      H: this.H,
      axis: {x: this.axisDir.x, y: this.axisDir.y},
      perp: {x: this.perpDir.x, y: this.perpDir.y},
      r1: this.r1,
      r2: this.r2,
      c1: {x: this.c1.x, y: this.c1.y},
      c2: {x: this.c2.x, y: this.c2.y},
      sign1: this.sign1,
      sign2: this.sign2,
      rimLT: {x: this.rimLT.x, y: this.rimLT.y},
      rimLB: {x: this.rimLB.x, y: this.rimLB.y},
      rimRT: {x: this.rimRT.x, y: this.rimRT.y},
      rimRB: {x: this.rimRB.x, y: this.rimRB.y},
      ior: this.ior,
      boundingRadius: this.boundingRadius,
    };
  }
}

// --- Light mode ---
let lightMode = 'white'; // 'white' | 'colored'

// --- Rendering ---
function requestRayRender() {
  const isDraft = draggingState !== 'none';
  const isWhite = lightMode === 'white';
  workerBusy = true;
  needsRender = false;
  rayWorker.postMessage({
    lenses: lenses.map((l) => l.serialize()),
    lightMode,
    width,
    height,
    dpr,
    numRays: isDraft
      ? isWhite
        ? DRAFT_WHITE_RAYS
        : DRAFT_COLORED_RAYS
      : isWhite
        ? FULL_WHITE_RAYS
        : FULL_COLORED_RAYS,
    numWavelengths: isDraft ? DRAFT_WHITE_WAVELENGTHS : FULL_WHITE_WAVELENGTHS,
    rayAlpha: COLORED_RAY_ALPHA,
    wavelengthAlpha: WHITE_WAVELENGTH_ALPHA,
  });
}

function scheduleDrawScene() {
  if (!drawPending) {
    drawPending = true;
    requestAnimationFrame(drawScene);
  }
}

function drawScene() {
  drawPending = false;

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);

  if (lastBitmap) {
    ctx.drawImage(lastBitmap, 0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = BLOOM_ALPHA;
    ctx.filter = `blur(${BLOOM_BLUR}px)`;
    ctx.drawImage(lastBitmap, 0, 0, width, height);
    ctx.globalAlpha = BLOOM_WIDE_ALPHA;
    ctx.filter = `blur(${BLOOM_WIDE_BLUR}px)`;
    ctx.drawImage(lastBitmap, 0, 0, width, height);
    ctx.restore();
  }

  // Vignette: multi-stop gradient to keep the falloff smooth and banding-free
  {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.sqrt(width * width + height * height) * 0.6;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.42, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.05)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.15)');
    grad.addColorStop(0.88, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  for (const lens of lenses) lens.draw();
}

function render() {
  scheduleDrawScene();
  if (workerBusy) {
    needsRender = true;
  } else {
    requestRayRender();
  }
}

// --- Resize ---
function resize() {
  dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- Scene generation ---
function generateLenses() {
  lenses = [];
  const padding = 20;

  for (
    let attempts = 0;
    attempts < 50 && lenses.length < NUM_LENSES;
    attempts++
  ) {
    const h = Math.random() * 150 + 80;
    const margin = h / 2 + 40;
    const minX = 200 + margin;
    const maxX = Math.max(minX, width - margin);

    const x = Math.random() * (maxX - minX) + minX;
    const y = Math.random() * (height - 2 * margin) + margin;
    const angle = (Math.random() - 0.5) * Math.PI * 0.5;

    // Mostly convex, occasionally a concave (diverging) lens for variety.
    const concave = Math.random() < 0.35;
    const mag = Math.random() * (h * 0.18) + 10;
    const s = concave ? -mag : mag;
    const w = concave ? mag * 2 + 10 : 0;

    const candidate = new Lens(x, y, h, s, s, angle, w);
    const overlaps = lenses.some(
      (existing) =>
        distSq(candidate, existing) <
        (candidate.boundingRadius + existing.boundingRadius + padding) ** 2,
    );
    if (!overlaps) lenses.push(candidate);
  }
}

// --- Interaction ---
function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const source = e.touches ? e.touches[0] : e;
  return {x: source.clientX - rect.left, y: source.clientY - rect.top};
}

function handlePointerDown(e) {
  if (e.target !== canvas) return;
  if (e.detail >= 2) return; // dblclick will handle double-clicks

  const mouse = getMousePos(e);

  for (let i = lenses.length - 1; i >= 0; i--) {
    const lens = lenses[i];

    if (distSq(mouse, lens.p1) < HANDLE_HIT_RADIUS_SQ) {
      draggingState = 'p1';
      activeLens = lens;
      return;
    }
    if (distSq(mouse, lens.p2) < HANDLE_HIT_RADIUS_SQ) {
      draggingState = 'p2';
      activeLens = lens;
      return;
    }
    if (distSq(mouse, lens.apex1) < HANDLE_HIT_RADIUS_SQ) {
      draggingState = 'apex1';
      activeLens = lens;
      return;
    }
    if (distSq(mouse, lens.apex2) < HANDLE_HIT_RADIUS_SQ) {
      draggingState = 'apex2';
      activeLens = lens;
      return;
    }
    if (distSq(mouse, lens.thicknessHandle) < HANDLE_HIT_RADIUS_SQ) {
      draggingState = 'thickness';
      activeLens = lens;
      return;
    }
    if (lens.containsPoint(mouse)) {
      draggingState = 'body';
      activeLens = lens;
      dragOffsetP1 = {x: lens.p1.x - mouse.x, y: lens.p1.y - mouse.y};
      dragOffsetP2 = {x: lens.p2.x - mouse.x, y: lens.p2.y - mouse.y};
      return;
    }
  }
}

function handlePointerMove(e) {
  const mouse = getMousePos(e);
  let geometryChanged = false; // lens actually moved → reset ray accumulation
  let hoverChanged = false; // only hover state changed → redraw lenses only

  if (activeLens && draggingState !== 'none') {
    if (draggingState === 'p1') {
      activeLens.p1 = {x: mouse.x, y: mouse.y};
    } else if (draggingState === 'p2') {
      activeLens.p2 = {x: mouse.x, y: mouse.y};
    } else if (
      draggingState === 'apex1' ||
      draggingState === 'apex2' ||
      draggingState === 'thickness'
    ) {
      // Project the mouse onto the optical axis. The vertices sit at
      // u = -(w/2 + s1) and u = +(w/2 + s2); the thickness handle at u = w/2.
      // Dragging an apex past its rim flips that surface convex ↔ concave.
      const dx = mouse.x - activeLens.x;
      const dy = mouse.y - activeLens.y;
      const proj = dx * activeLens.axisDir.x + dy * activeLens.axisDir.y;
      if (draggingState === 'apex1') {
        activeLens.s1Ratio = (-proj - activeLens.w / 2) / activeLens.h;
      } else if (draggingState === 'apex2') {
        activeLens.s2Ratio = (proj - activeLens.w / 2) / activeLens.h;
      } else {
        activeLens.wRatio = (2 * proj) / activeLens.h;
      }
    } else {
      activeLens.p1 = {
        x: mouse.x + dragOffsetP1.x,
        y: mouse.y + dragOffsetP1.y,
      };
      activeLens.p2 = {
        x: mouse.x + dragOffsetP2.x,
        y: mouse.y + dragOffsetP2.y,
      };
    }
    activeLens.updateGeometry();
    canvas.style.cursor = 'grabbing';
    geometryChanged = true;
  } else {
    let cursor = 'default';
    let foundHover = false;

    for (let i = lenses.length - 1; i >= 0; i--) {
      const lens = lenses[i];
      const prevP1 = lens.hoveredP1;
      const prevP2 = lens.hoveredP2;
      const prevBody = lens.hoveredBody;
      const prevApex1 = lens.hoveredApex1;
      const prevApex2 = lens.hoveredApex2;
      const prevThickness = lens.hoveredThickness;

      lens.hoveredP1 = false;
      lens.hoveredP2 = false;
      lens.hoveredBody = false;
      lens.hoveredApex1 = false;
      lens.hoveredApex2 = false;
      lens.hoveredThickness = false;

      if (!foundHover) {
        if (distSq(mouse, lens.p1) < HANDLE_HIT_RADIUS_SQ) {
          lens.hoveredP1 = true;
          cursor = 'crosshair';
          foundHover = true;
        } else if (distSq(mouse, lens.p2) < HANDLE_HIT_RADIUS_SQ) {
          lens.hoveredP2 = true;
          cursor = 'crosshair';
          foundHover = true;
        } else if (distSq(mouse, lens.apex1) < HANDLE_HIT_RADIUS_SQ) {
          lens.hoveredApex1 = true;
          cursor = 'crosshair';
          foundHover = true;
        } else if (distSq(mouse, lens.apex2) < HANDLE_HIT_RADIUS_SQ) {
          lens.hoveredApex2 = true;
          cursor = 'crosshair';
          foundHover = true;
        } else if (distSq(mouse, lens.thicknessHandle) < HANDLE_HIT_RADIUS_SQ) {
          lens.hoveredThickness = true;
          cursor = 'crosshair';
          foundHover = true;
        } else if (lens.containsPoint(mouse)) {
          lens.hoveredBody = true;
          cursor = 'grab';
          foundHover = true;
        }
      }

      if (
        prevP1 !== lens.hoveredP1 ||
        prevP2 !== lens.hoveredP2 ||
        prevBody !== lens.hoveredBody ||
        prevApex1 !== lens.hoveredApex1 ||
        prevApex2 !== lens.hoveredApex2 ||
        prevThickness !== lens.hoveredThickness
      ) {
        hoverChanged = true;
      }
    }

    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }

  if (geometryChanged) render();
  else if (hoverChanged) scheduleDrawScene();
}

function handlePointerUp() {
  const wasDragging = draggingState !== 'none';
  draggingState = 'none';
  activeLens = null;
  if (wasDragging) render();
}

function handleDoubleClick(e) {
  e.preventDefault();
  const mouse = getMousePos(e);

  // Double-click on a lens: delete it
  for (let i = lenses.length - 1; i >= 0; i--) {
    if (lenses[i].containsPoint(mouse)) {
      lenses.splice(i, 1);
      render();
      return;
    }
  }

  // Double-click on empty space: create a new lens
  lenses.push(
    new Lens(
      mouse.x,
      mouse.y,
      NEW_LENS_HEIGHT,
      NEW_LENS_SAGITTA,
      NEW_LENS_SAGITTA,
      0,
    ),
  );
  render();
}

// --- Event listeners ---
window.addEventListener('resize', () => {
  resize();
  render();
});

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('dblclick', handleDoubleClick);
window.addEventListener('mouseup', handlePointerUp);

canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    handlePointerDown(e);
  },
  {passive: false},
);
canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    handlePointerMove(e);
  },
  {passive: false},
);
window.addEventListener('touchend', handlePointerUp);

// --- Light mode toggle ---
document.getElementById('btn-white').addEventListener('click', () => {
  lightMode = 'white';
  document.getElementById('btn-white').classList.add('active');
  document.getElementById('btn-rainbow').classList.remove('active');
  render();
});
document.getElementById('btn-rainbow').addEventListener('click', () => {
  lightMode = 'colored';
  document.getElementById('btn-rainbow').classList.add('active');
  document.getElementById('btn-white').classList.remove('active');
  render();
});

// --- Init ---
resize();
generateLenses();
render();
