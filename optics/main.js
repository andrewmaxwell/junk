import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

// --- Constants ---
const NUM_LENSES = 5;
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS_SQ = 144; // 12²
const HANDLE_WHITE = '255,255,255';
const HANDLE_GOLD = '255,205,55';
const HANDLE_TEAL = '90,235,220';
const SOURCE_AIM_LENGTH = 40;
const MIN_BEAM_WIDTH = 10;
const DEFAULT_EXPOSURE = 0.12;
const RAINBOW_EXPOSURE = 0.6;
const NEW_LENS_HEIGHT = 120;
const NEW_DROP_RADIUS = 80;
const MIN_DROP_RADIUS = 10;
const WATER_IOR = 1.333;
// Water disperses ~0.75× as much as crown glass; the dispersion setting
// scales both.
const WATER_DISPERSION_RATIO = 0.75;
const NEW_LENS_SAGITTA = 15;
const MIN_SAGITTA = 8; // minimum |sagitta| — surfaces are never perfectly flat
const MAX_SAGITTA_RATIO = 0.44; // max |sagitta| as fraction of lens height
const MAX_EDGE_RATIO = 0.7; // max cylindrical-edge width as fraction of height
const MIN_CENTER_THICKNESS = 6; // glass never pinches to zero in the middle

// --- Settings ---
const settings = {
  light: 'White', // 'White' | 'Rainbow'
  ior: 1.5,
  dispersion: 0.027, // Cauchy B (µm²), ~6× real crown glass
  reflections: true,
  exposure: DEFAULT_EXPOSURE,
};

const gui = new GUI();
gui.add(settings, 'light', ['White', 'Rainbow']).onChange(() => {
  dispersionControl.enable(settings.light === 'White');
  render();
});
gui.add(settings, 'ior', 1.1, 2.5, 0.01).name('IOR').onChange(render);
// Rainbow colors rays by where they start, so every ray uses the base IOR.
const dispersionControl = gui
  .add(settings, 'dispersion', 0, 0.1, 0.001)
  .onChange(render);
gui.add(settings, 'reflections').onChange(render);
gui.add(settings, 'exposure', 0.02, 2, 0.01).onChange(() => {
  rayWorker.postMessage({exposure: settings.exposure});
});
const scenes = gui.addFolder('Scenes');
scenes.add({lenses: () => loadScene(lensScene)}, 'lenses');
scenes.add({rainbow: () => loadScene(rainbowScene)}, 'rainbow');
const addFolder = gui.addFolder('Add (double-click to delete)');
addFolder.add(
  {
    lens: () =>
      addGlass(
        new Lens(
          width / 2,
          height / 2,
          NEW_LENS_HEIGHT,
          NEW_LENS_SAGITTA,
          NEW_LENS_SAGITTA,
          0,
        ),
      ),
  },
  'lens',
);
addFolder.add(
  {
    droplet: () =>
      addGlass(new Droplet(width / 2, height / 2, NEW_DROP_RADIUS)),
  },
  'droplet',
);
for (const type of ['beam', 'laser', 'point']) {
  addFolder.add({[type]: () => addSource(type)}, type);
}

// --- Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height, dpr;

// --- Worker ---
// rayWorker.js traces rays and renders the light with WebGL straight into the
// #gl canvas underneath, refining progressively. This thread only draws the
// lens and handle overlay on #canvas.
const rayWorker = new Worker(new URL('./rayWorker.js', import.meta.url));
const glCanvas = document.getElementById('gl').transferControlToOffscreen();
rayWorker.postMessage({canvas: glCanvas}, [glCanvas]);
let drawPending = false;

// --- Scene state ---
let lenses = []; // Lens and Droplet: everything light refracts through
let sources = [];

// --- Interaction state ---
// Each is {item, part} or null. `part` is 'body' or a handle name.
let hovered = null;
let dragging = null;
let lastMouse = null;

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
    this.s1Ratio = s1 / height;
    this.s2Ratio = s2 / height;
    this.wRatio = w / height;

    const perpCos = Math.cos(angle - Math.PI / 2);
    const perpSin = Math.sin(angle - Math.PI / 2);
    this.p1 = {x: x + (height / 2) * perpCos, y: y + (height / 2) * perpSin};
    this.p2 = {x: x - (height / 2) * perpCos, y: y - (height / 2) * perpSin};

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

    // Axial extent: a convex surface reaches its vertex, a concave one only
    // the rim.
    this.uMin = -(hw + Math.max(0, this.s1));
    this.uMax = hw + Math.max(0, this.s2);

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

  contains(pt) {
    const dx = pt.x - this.x;
    const dy = pt.y - this.y;
    const v = dx * this.perpDir.x + dy * this.perpDir.y;
    if (Math.abs(v) > this.H) return false;
    // "Outside the circle" alone would accept points far beyond a concave
    // surface, so also bound the axial extent.
    const u = dx * this.axisDir.x + dy * this.axisDir.y;
    if (u < this.uMin || u > this.uMax) return false;
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

  handles() {
    return [
      {part: 'p1', pt: this.p1, color: HANDLE_WHITE},
      {part: 'p2', pt: this.p2, color: HANDLE_WHITE},
      {part: 'apex1', pt: this.apex1, color: HANDLE_GOLD},
      {part: 'apex2', pt: this.apex2, color: HANDLE_GOLD},
      // Diamond on the rim: controls the cylindrical-edge width.
      {
        part: 'thickness',
        pt: this.thicknessHandle,
        color: HANDLE_TEAL,
        diamond: true,
      },
    ];
  }

  drag(part, mouse, delta) {
    if (part === 'p1') {
      this.p1 = {...mouse};
    } else if (part === 'p2') {
      this.p2 = {...mouse};
    } else if (part === 'body') {
      this.p1 = {x: this.p1.x + delta.x, y: this.p1.y + delta.y};
      this.p2 = {x: this.p2.x + delta.x, y: this.p2.y + delta.y};
    } else {
      // Project the mouse onto the optical axis. The vertices sit at
      // u = -(w/2 + s1) and u = +(w/2 + s2); the thickness handle at u = w/2.
      // Dragging an apex past its rim flips that surface convex ↔ concave.
      const proj = this.relAxis(mouse);
      if (part === 'apex1') this.s1Ratio = (-proj - this.w / 2) / this.h;
      else if (part === 'apex2') this.s2Ratio = (proj - this.w / 2) / this.h;
      else this.wRatio = (2 * proj) / this.h;
    }
    this.updateGeometry();
  }

  draw(activePart) {
    const isActive = activePart !== null;

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

    for (const h of this.handles()) {
      drawHandle(h, h.part === activePart, this.angle);
    }
  }

  // Returns a plain-object snapshot of the geometry needed by the worker.
  serialize() {
    return {
      type: 'lens',
      ior: settings.ior,
      dispersion: settings.dispersion,
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
      uMin: this.uMin,
      uMax: this.uMax,
      boundingRadius: this.boundingRadius,
    };
  }
}

// --- Handles ---
// Faint ring when idle, solid when hovered or dragged.
function drawHandle({pt, color, diamond}, active, angle = 0) {
  const r = HANDLE_RADIUS;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${color},${active ? 0.9 : 0.25})`;
  ctx.fillStyle = active ? `rgba(${color},0.85)` : 'transparent';
  ctx.beginPath();
  if (diamond) {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(angle);
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.restore();
  } else {
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

// --- Droplet ---
// A circle of water. Light entering it reflects once inside to form the
// primary rainbow (~42° from straight back) and twice for the fainter,
// color-reversed secondary (~51°).
class Droplet {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
  }

  handles() {
    const pt = {x: this.x + this.r, y: this.y};
    return [{part: 'radius', pt, color: HANDLE_TEAL, diamond: true}];
  }

  contains(pt) {
    return distSq(pt, this) < this.r * this.r;
  }

  drag(part, mouse, delta) {
    if (part === 'body') {
      this.x += delta.x;
      this.y += delta.y;
    } else {
      this.r = Math.max(MIN_DROP_RADIUS, Math.sqrt(distSq(mouse, this)));
    }
  }

  draw(activePart) {
    const isActive = activePart !== null;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = isActive
      ? 'rgba(100,180,255,0.13)'
      : 'rgba(100,150,255,0.05)';
    ctx.fill();
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.strokeStyle = isActive
      ? 'rgba(200,230,255,0.6)'
      : 'rgba(160,210,255,0.28)';
    ctx.stroke();
    for (const h of this.handles()) drawHandle(h, h.part === activePart);
  }

  serialize() {
    const {x, y, r} = this;
    return {
      type: 'drop',
      ior: WATER_IOR,
      dispersion: settings.dispersion * WATER_DISPERSION_RATIO,
      x,
      y,
      r,
    };
  }
}

// --- Light sources ---
// 'beam': parallel rays across `width`, perpendicular to `angle`.
// 'laser': a single pencil ray. 'point': rays in every direction.
class Source {
  constructor(type, x, y, angle = 0, width = 200) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.width = width;
  }

  get dir() {
    return {x: Math.cos(this.angle), y: Math.sin(this.angle)};
  }

  // Offset `along` the aim direction and `across` it.
  at(along, across) {
    const {x: dx, y: dy} = this.dir;
    return {
      x: this.x + along * dx - across * dy,
      y: this.y + along * dy + across * dx,
    };
  }

  handles() {
    const hs = [];
    if (this.type !== 'point') {
      hs.push({
        part: 'aim',
        pt: this.at(SOURCE_AIM_LENGTH, 0),
        color: HANDLE_GOLD,
      });
    }
    if (this.type === 'beam') {
      hs.push({
        part: 'width',
        pt: this.at(0, this.width / 2),
        color: HANDLE_TEAL,
        diamond: true,
      });
    }
    return hs;
  }

  contains(pt) {
    return distSq(pt, this) < HANDLE_HIT_RADIUS_SQ;
  }

  drag(part, mouse, delta) {
    if (part === 'body') {
      this.x += delta.x;
      this.y += delta.y;
    } else if (part === 'aim') {
      this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
    } else {
      const {x: dx, y: dy} = this.dir;
      const across = -(mouse.x - this.x) * dy + (mouse.y - this.y) * dx;
      this.width = Math.max(MIN_BEAM_WIDTH, 2 * Math.abs(across));
    }
  }

  draw(activePart) {
    const alpha = activePart !== null ? 0.7 : 0.35;
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${HANDLE_GOLD},${alpha})`;
    ctx.beginPath();
    if (this.type === 'beam') {
      const a = this.at(0, -this.width / 2);
      const b = this.at(0, this.width / 2);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    if (this.type !== 'point') {
      const aim = this.at(SOURCE_AIM_LENGTH - HANDLE_RADIUS, 0);
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(aim.x, aim.y);
    }
    ctx.stroke();

    // The emitter itself: always solid so lights are easy to find.
    ctx.fillStyle = `rgba(${HANDLE_GOLD},${activePart !== null ? 1 : 0.8})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, HANDLE_RADIUS - 1, 0, Math.PI * 2);
    ctx.fill();

    for (const h of this.handles())
      drawHandle(h, h.part === activePart, this.angle);
  }

  serialize() {
    const {type, x, y, angle, width} = this;
    return {type, x, y, angle, width};
  }
}

// --- Rendering ---
function requestRayRender() {
  rayWorker.postMessage({
    scene: {
      lenses: lenses.map((l) => l.serialize()),
      sources: sources.map((l) => l.serialize()),
      light: settings.light,
      reflections: settings.reflections,
      width,
      height,
      dpr,
    },
    exposure: settings.exposure,
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

  ctx.clearRect(0, 0, width, height);

  const active = dragging ?? hovered;
  for (const item of [...lenses, ...sources]) {
    item.draw(active?.item === item ? active.part : null);
  }
}

function render() {
  scheduleDrawScene();
  requestRayRender();
}

// --- Resize ---
function resize() {
  const [oldWidth, oldHeight] = [width, height];
  dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  // Keep every lens and light at the same relative position on screen.
  for (const item of [...lenses, ...sources]) {
    const delta = {
      x: item.x * (width / oldWidth - 1),
      y: item.y * (height / oldHeight - 1),
    };
    item.drag('body', null, delta);
  }
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// --- Scenes ---
function loadScene(scene) {
  scene();
  hovered = null;
  dragging = null;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  rayWorker.postMessage({exposure: settings.exposure});
  render();
}

function lensScene() {
  settings.exposure = DEFAULT_EXPOSURE;
  generateSources();
  generateLenses();
}

// One big droplet lit by a beam exactly its width. Both bows head back
// toward the light at 42° and 51°, so they clear the beam and fan out into
// the dark above and below it. Only a few percent of the light ends up in
// them, hence the higher exposure.
function rainbowScene() {
  settings.exposure = RAINBOW_EXPOSURE;
  const r = Math.min(height * 0.15, width * 0.12);
  const drop = new Droplet(width * 0.6, height / 2, r);
  lenses = [drop];
  sources = [new Source('beam', width * 0.6 - r * 1.5, height / 2, 0, 2 * r)];
}

// --- Scene generation ---
// A beam across the middle and a laser rising from the lower left, leaving
// most of the screen dark so the light has something to contrast with.
function generateSources() {
  sources = [
    new Source('beam', 40, height * 0.42, 0, height * 0.45),
    new Source('laser', 40, height * 0.85, -0.12),
  ];
}

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
    // Leave room on the left for the lights, but never push a lens off a
    // narrow screen.
    const minX = Math.min(Math.min(200, width * 0.25) + margin, width / 2);
    const maxX = Math.max(minX, width - margin);

    const x = Math.random() * (maxX - minX) + minX;
    // Keep lenses in the band the default lights pass through.
    const y = height * (0.2 + Math.random() * 0.55);
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

// Topmost handle or body under the mouse. Sources sit above lenses.
function pick(mouse) {
  const items = [...lenses, ...sources];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    for (const h of item.handles()) {
      if (distSq(mouse, h.pt) < HANDLE_HIT_RADIUS_SQ)
        return {item, part: h.part};
    }
    if (item.contains(mouse)) return {item, part: 'body'};
  }
  return null;
}

function handlePointerDown(e) {
  if (e.target !== canvas) return;
  if (e.detail >= 2) return; // dblclick will handle double-clicks
  lastMouse = getMousePos(e);
  dragging = pick(lastMouse);
}

function handlePointerMove(e) {
  const mouse = getMousePos(e);

  if (dragging) {
    const delta = {x: mouse.x - lastMouse.x, y: mouse.y - lastMouse.y};
    dragging.item.drag(dragging.part, mouse, delta);
    lastMouse = mouse;
    canvas.style.cursor = 'grabbing';
    render();
    return;
  }

  const prev = hovered;
  hovered = pick(mouse);
  const cursor = !hovered
    ? 'default'
    : hovered.part === 'body'
      ? 'grab'
      : 'crosshair';
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  if (prev?.item !== hovered?.item || prev?.part !== hovered?.part) {
    scheduleDrawScene();
  }
}

function handlePointerUp() {
  if (!dragging) return;
  dragging = null;
  render();
}

function handleDoubleClick(e) {
  e.preventDefault();
  const mouse = getMousePos(e);

  // Double-click on a lens or light: delete it
  const hit = pick(mouse);
  if (hit) {
    lenses = lenses.filter((l) => l !== hit.item);
    sources = sources.filter((l) => l !== hit.item);
    hovered = null;
    render();
    return;
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

function addGlass(item) {
  lenses.push(item);
  render();
}

function addSource(type) {
  sources.push(new Source(type, width / 2, height / 2));
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

// --- Init ---
resize();
loadScene(lensScene);
