import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {contains, distSq} from './geometry.js';

// --- Constants ---
const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS_SQ = 144; // 12²
const HANDLE_WHITE = '255,255,255';
const HANDLE_GOLD = '255,205,55';
const HANDLE_TEAL = '90,235,220';
const DEFAULT_EXPOSURE = 0.12;
const DEFAULT_DISPERSION = 0.027; // Cauchy B (µm²), ~6× real crown glass

// Lenses
const NUM_LENSES = 5;
const NEW_LENS_HEIGHT = 120;
const NEW_LENS_SAGITTA = 15;

// Glass materials (any lens, prism or droplet)
// A tint is the share of each color light keeps after this far through the
// glass at strength 1 (Beer–Lambert).
const ABSORB_DEPTH = 100; // px
const CLEAR_GLASS = {tint: '#ffffff', strength: 0, coat: 0}; // coat: film nm
const TINTED_SHARE = 0.25; // of the random scene's lenses
const COATED_SHARE = 0.25;
const MIN_SAGITTA = 8; // minimum |sagitta| — surfaces are never perfectly flat
const MAX_SAGITTA_RATIO = 0.44; // max |sagitta| as fraction of lens height
const MAX_EDGE_RATIO = 0.7; // max cylindrical-edge width as fraction of height
const MIN_CENTER_THICKNESS = 6; // glass never pinches to zero in the middle

// Droplets
const NEW_DROP_RADIUS = 80;
const MIN_DROP_RADIUS = 10;
const WATER_IOR = 1.333;
// Water disperses ~0.75× as much as crown glass; the dispersion setting
// scales both.
const WATER_DISPERSION_RATIO = 0.75;

// Prisms (size = circumradius)
const NEW_PRISM_SIZE = 90;
const MIN_PRISM_SIZE = 15;
const PRISM_EXPOSURE = 0.5;

// Ambient motion: each piece of glass sways around where it was put
const DRIFT_DISTANCE = 25; // px
const DRIFT_ANGLE = 0.12; // radians, about 7°
const DRIFT_PERIOD = [18, 40]; // seconds, randomized per piece and axis

// Light sources
const SOURCE_AIM_LENGTH = 40;
const MIN_BEAM_WIDTH = 10;

// --- Settings ---
const settings = {
  ior: 1.5,
  dispersion: DEFAULT_DISPERSION,
  reflections: true,
  exposure: DEFAULT_EXPOSURE,
  dust: 3, // how strongly drifting dust catches the light; 0 for none
  motion: 1, // how fast the glass drifts; 0 holds it still
  hdr: matchMedia('(dynamic-range: high)').matches,
  // In HDR, how many times brighter than white light may get. Browsers don't
  // say how much headroom the screen has; brighter than it just clips.
  headroom: 8,
};
// HDR is remembered per browser, since some (Chrome on macOS, as of 154) say
// the screen is HDR but then show HDR canvases clipped.
try {
  const saved = localStorage.getItem('optics.hdr');
  if (saved) settings.hdr = saved === 'on';
} catch {
  // Storage blocked; use the default
}
const headroom = () => (settings.hdr ? settings.headroom : 0);

const gui = new GUI();
gui.add(settings, 'ior', 1.1, 2.5, 0.01).name('IOR').onChange(render);
gui.add(settings, 'dispersion', 0, 0.1, 0.001).onChange(render);
gui.add(settings, 'reflections').onChange(render);
gui.add(settings, 'exposure', 0.02, 2, 0.01).onChange(() => {
  rayWorker.postMessage({exposure: settings.exposure});
});
gui.add(settings, 'motion', 0, 4, 0.1);
gui
  .add(settings, 'dust', 0, 6, 0.1)
  .onChange(() => rayWorker.postMessage({dust: settings.dust}));
gui
  .add(settings, 'hdr')
  .name('HDR')
  .onChange(() => {
    try {
      localStorage.setItem('optics.hdr', settings.hdr ? 'on' : 'off');
    } catch {
      // Storage blocked; the choice lasts until reload
    }
    rayWorker.postMessage({headroom: headroom()});
  });
gui
  .add(settings, 'headroom', 1, 16, 0.5)
  .name('HDR headroom')
  .onChange(() => rayWorker.postMessage({headroom: headroom()}));
const button = (folder, name, onClick) => folder.add({[name]: onClick}, name);
const scenes = gui.addFolder('Scenes');
button(scenes, 'lenses', () => loadScene(lensScene));
button(scenes, 'prism', () => loadScene(prismScene));
// Shown while a lens, prism or droplet is selected (click it).
const glassFolder = gui.addFolder('Selected glass');
glassFolder.hide();
const addFolder = gui.addFolder('Add (double-click to delete)');
button(addFolder, 'lens', () => addGlass(newLens(width / 2, height / 2)));
button(addFolder, 'prism', () =>
  addGlass(new Prism(width / 2, height / 2, NEW_PRISM_SIZE)),
);
button(addFolder, 'droplet', () =>
  addGlass(new Droplet(width / 2, height / 2, NEW_DROP_RADIUS)),
);
for (const type of ['beam', 'laser', 'point']) {
  button(addFolder, type, () => addSource(type));
}

// --- Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height, dpr;

// --- Worker ---
// rayWorker.js traces rays on the GPU (tracer.js) and renders the light with
// WebGPU straight into the #gl canvas underneath, refining progressively. This thread only draws the
// lens and handle overlay on #canvas.
const rayWorker = new Worker(new URL('./rayWorker.js', import.meta.url), {
  type: 'module',
});
rayWorker.onmessage = ({data}) => data.error && showError(data.error);
rayWorker.onerror = (e) =>
  showError(e.message || 'the renderer failed to load');
try {
  const glCanvas = document.getElementById('gl').transferControlToOffscreen();
  rayWorker.postMessage(
    {canvas: glCanvas, headroom: headroom(), dust: settings.dust},
    [glCanvas],
  );
} catch {
  showError('this browser can’t render from a worker');
}

// Without the renderer the lenses would still drag around with no light, so
// say what's wrong instead.
function showError(reason) {
  const el = document.getElementById('error');
  el.textContent = `Can’t draw the light: ${reason}. Try a recent Chrome, Firefox or Safari.`;
  el.hidden = false;
}
let drawPending = false;

// --- Scene state ---
let lenses = []; // Lens and Droplet: everything light refracts through
let sources = [];

// --- Interaction state ---
// Each is {item, part} or null. `part` is 'body' or a handle name. A drag
// belongs to the pointer that started it; other fingers are ignored.
let hovered = null;
let dragging = null;
let lastPointer = null;

// --- Math utilities ---
// Clamp a value's magnitude to [min, max] while preserving its sign.
// Zero (ambiguous sign) defaults to +min.
function clampSignedMag(v, min, max) {
  const sign = v < 0 ? -1 : 1;
  return sign * Math.max(min, Math.min(max, Math.abs(v)));
}

// Area of a circular segment of radius r and height (sagitta) s.
function segmentArea(r, s) {
  return (
    r * r * Math.acos((r - s) / r) - (r - s) * Math.sqrt(2 * r * s - s * s)
  );
}

// --- Lens ---
// Each lens has two independently controllable surfaces plus a cylindrical edge.
// Signed sagittas s1/s2 set surface curvature: positive = convex (bulges out),
// negative = concave (curves in). The edge width W is the axial thickness of the
// flat cylindrical rim; W = 0 gives the classic pointed biconvex shape, while
// W > 0 is required to give concave lenses a real (non-pinched) body.
//
// Lens-space coordinates: u = axial (along `axis`), v = perpendicular (`perp`).
// Surface vertices sit at u = -(W/2 + s1) and u = +(W/2 + s2); the rim spans
// u ∈ [-W/2, +W/2] at v = ±H. Each surface circle passes through its vertex and
// the two rim points at v = ±H.
class Lens {
  constructor(x, y, height, s1, s2, angle, w = 0) {
    this.type = 'lens';
    Object.assign(this, CLEAR_GLASS);
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
    this.axis = {x: cosA, y: sinA};
    this.perp = {x: -sinA, y: cosA}; // p1 = center + H * perp

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

    // Convex caps add to the rim rectangle, concave ones carve it away.
    this.area =
      this.w * this.h +
      this.sign1 * segmentArea(this.r1, a1) +
      this.sign2 * segmentArea(this.r2, a2);

    const maxAxial = this.w / 2 + Math.max(a1, a2);
    this.boundingRadius = Math.sqrt(maxAxial * maxAxial + H * H) + 2;
  }

  // Lens-space (u along axis, v along perp) → world point.
  corner(u, v) {
    return {
      x: this.x + u * this.axis.x + v * this.perp.x,
      y: this.y + u * this.axis.y + v * this.perp.y,
    };
  }

  contains(pt) {
    return contains(this, pt);
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
    return (pt.x - this.x) * this.axis.x + (pt.y - this.y) * this.axis.y;
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

  // Turns the lens about its center.
  rotate(da) {
    const turn = (p) => {
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const c = Math.cos(da);
      const s = Math.sin(da);
      return {x: this.x + dx * c - dy * s, y: this.y + dx * s + dy * c};
    };
    this.p1 = turn(this.p1);
    this.p2 = turn(this.p2);
    this.updateGeometry();
  }

  draw(activePart) {
    drawGlass(this, this.boundingRadius, activePart !== null, () => {
      const pts = this.outlinePath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.closePath();
    });
    for (const h of this.handles()) {
      drawHandle(h, h.part === activePart, this.angle);
    }
  }

  // The geometry and material the worker traces against.
  serialize() {
    // prettier-ignore
    const {type, x, y, H, axis, perp, r1, r2, c1, c2, sign1, sign2, uMin, uMax,
      rimLT, rimLB, rimRT, rimRB, boundingRadius, area} = this;
    // prettier-ignore
    return {type, x, y, H, axis, perp, r1, r2, c1, c2, sign1, sign2, uMin, uMax,
      rimLT, rimLB, rimRT, rimRB, boundingRadius, area,
      ior: settings.ior, dispersion: settings.dispersion, ...material(this)};
  }
}

// --- Overlay drawing ---
// Lenses, droplets and prisms share one look, lit from the nearest light: a
// faint tint brightening toward it, a soft sheen on that side, a glow just
// inside the rim, and a crisp edge. `tracePath` adds the outline of an
// element centered on `center` within radius r.
// A tinted piece shows its tint; a coated one gets an iridescent edge.
function drawGlass(center, r, isActive, tracePath) {
  const {x, y} = center;
  const [tr, tg, tb] = hexToRGB(center.tint).map((v) => Math.round(v * 255));
  // Fade the tint in with its strength (white glass stays bluish clear).
  const k = Math.min(1, center.strength);
  const mix = (a, b) => Math.round(a + (b - a) * k);
  const near0 = `${mix(190, tr)},${mix(225, tg)},${mix(255, tb)}`;
  const far0 = `${mix(110, tr)},${mix(150, tg)},${mix(255, tb)}`;
  const fill = (alpha) => alpha * (1 + 2 * k); // tinted glass is denser
  const light = towardNearestLight(center);
  const lit = (k) => ({x: x + light.x * r * k, y: y + light.y * r * k});

  ctx.save();
  ctx.beginPath();
  tracePath();
  const near = lit(1);
  const far = lit(-1);
  const body = ctx.createLinearGradient(near.x, near.y, far.x, far.y);
  body.addColorStop(0, `rgba(${near0},${fill(isActive ? 0.16 : 0.08)})`);
  body.addColorStop(1, `rgba(${far0},${fill(isActive ? 0.06 : 0.02)})`);
  ctx.fillStyle = body;
  ctx.fill();

  ctx.clip(); // the sheen and rim glow stay inside the glass
  const s = lit(0.45);
  const sheen = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 0.6);
  sheen.addColorStop(0, `rgba(255,255,255,${isActive ? 0.14 : 0.08})`);
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.lineWidth = 6; // half of it falls inside the clip
  ctx.strokeStyle = `rgba(200,230,255,${isActive ? 0.14 : 0.07})`;
  ctx.stroke();
  ctx.restore();

  // The path survives restore(), so the edge reuses it.
  ctx.lineWidth = isActive ? 1.5 : 1;
  ctx.strokeStyle = `rgba(215,238,255,${isActive ? 0.65 : 0.32})`;
  if (center.coat) {
    ctx.lineWidth = isActive ? 2.5 : 2;
    const sheen = ctx.createConicGradient(center.coat / 100, x, y);
    for (let i = 0; i <= 6; i++) {
      sheen.addColorStop(
        i / 6,
        `hsla(${i * 60},90%,70%,${isActive ? 0.8 : 0.5})`,
      );
    }
    ctx.strokeStyle = sheen;
  }
  ctx.stroke();
}

// HSL (hue in degrees, s and l in 0..1) → '#rrggbb'.
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c =
      l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// '#rrggbb' → [r, g, b] in 0..1 (sRGB).
const hexToRGB = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// What the tracer needs to know about a piece's glass: its tint in linear
// light, absorption per px, and coating.
function material({tint, strength, coat}) {
  return {
    tint: hexToRGB(tint).map((v) => v ** 2.2),
    density: strength / ABSORB_DEPTH,
    coat,
  };
}

// Unit vector from `pt` toward the nearest light (up and left if none).
function towardNearestLight(pt) {
  let nearest = null;
  for (const s of sources) {
    if (!nearest || distSq(s, pt) < distSq(nearest, pt)) nearest = s;
  }
  const dx = nearest ? nearest.x - pt.x : -1;
  const dy = nearest ? nearest.y - pt.y : -1;
  const len = Math.hypot(dx, dy) || 1;
  return {x: dx / len, y: dy / len};
}

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
    this.type = 'drop';
    Object.assign(this, CLEAR_GLASS);
    this.x = x;
    this.y = y;
    this.r = r;
  }

  handles() {
    const pt = {x: this.x + this.r, y: this.y};
    return [{part: 'radius', pt, color: HANDLE_TEAL, diamond: true}];
  }

  contains(pt) {
    return contains(this, pt);
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
    drawGlass(this, this.r, activePart !== null, () =>
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2),
    );
    for (const h of this.handles()) drawHandle(h, h.part === activePart);
  }

  serialize() {
    const {type, x, y, r} = this;
    return {
      type,
      area: Math.PI * r * r,
      ior: WATER_IOR,
      dispersion: settings.dispersion * WATER_DISPERSION_RATIO,
      ...material(this),
      x,
      y,
      r,
    };
  }
}

// --- Prism ---
// An equilateral glass triangle. The gold handle on its apex rotates and
// resizes it.
class Prism {
  constructor(x, y, size, angle = 0) {
    this.type = 'prism';
    Object.assign(this, CLEAR_GLASS);
    this.x = x;
    this.y = y;
    this.size = size;
    this.angle = angle; // 0: apex straight up
  }

  // Apex first, then clockwise on screen.
  get vertices() {
    return [0, 1, 2].map((k) => {
      const a = this.angle - Math.PI / 2 + (k * 2 * Math.PI) / 3;
      return {
        x: this.x + this.size * Math.cos(a),
        y: this.y + this.size * Math.sin(a),
      };
    });
  }

  handles() {
    return [{part: 'apex', pt: this.vertices[0], color: HANDLE_GOLD}];
  }

  contains(pt) {
    return contains(this, pt);
  }

  drag(part, mouse, delta) {
    if (part === 'body') {
      this.x += delta.x;
      this.y += delta.y;
    } else {
      this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x) + Math.PI / 2;
      this.size = Math.max(MIN_PRISM_SIZE, Math.sqrt(distSq(mouse, this)));
    }
  }

  rotate(da) {
    this.angle += da;
  }

  draw(activePart) {
    drawGlass(this, this.size, activePart !== null, () => {
      for (const v of this.vertices) ctx.lineTo(v.x, v.y);
      ctx.closePath();
    });
    for (const h of this.handles()) drawHandle(h, h.part === activePart);
  }

  serialize() {
    const {type, x, y, vertices} = this;
    return {
      type,
      ior: settings.ior,
      dispersion: settings.dispersion,
      ...material(this),
      x,
      y,
      vertices,
      area: ((3 * Math.sqrt(3)) / 4) * this.size ** 2,
      boundingRadius: this.size,
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
// `ambient`: the change is just the glass drifting, so the worker can blend
// it into the current image instead of starting over.
function requestRayRender(ambient = false) {
  rayWorker.postMessage({
    ambient,
    scene: {
      lenses: lenses.map((l) => l.serialize()),
      sources: sources.map((s) => s.serialize()),
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
    let part = active?.item === item ? active.part : null;
    if (item === selected) part ??= 'selected';
    item.draw(part);
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
  // (Nothing exists yet on the first call.)
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
// Puts a piece of glass's material in the "Selected glass" folder.
let selected = null;
function select(item) {
  if (item === selected) return;
  selected = item;
  for (const c of [...glassFolder.controllers]) c.destroy();
  scheduleDrawScene();
  if (!item) {
    glassFolder.hide();
    return;
  }
  glassFolder.addColor(item, 'tint').onChange(render);
  glassFolder
    .add(item, 'strength', 0, 3, 0.01)
    .name('tint strength')
    .onChange(render);
  glassFolder
    .add(item, 'coat', 0, 1000, 10)
    .name('coating (nm)')
    .onChange(render);
  glassFolder.show();
}

function loadScene(scene) {
  select(null);
  scene();
  hovered = null;
  dragging = null;
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  render(); // also sends the scene's settings and exposure
}

function lensScene() {
  settings.exposure = DEFAULT_EXPOSURE;
  generateSources();
  generateLenses();
}

// A narrow white beam meeting a prism at minimum deviation, where light
// passes through symmetrically: incidence asin(n·sin 30°) on a 60° prism.
// The spectrum fans out into the dark on the far side.
function prismScene() {
  settings.dispersion = DEFAULT_DISPERSION;
  settings.reflections = true;
  settings.exposure = PRISM_EXPOSURE;
  const prism = new Prism(
    width * 0.45,
    height * 0.55,
    Math.min(height * 0.22, width * 0.18),
  );
  lenses = [prism];

  const [apex, , left] = prism.vertices;
  const target = {x: (apex.x + left.x) / 2, y: (apex.y + left.y) / 2};
  // The left face's inward normal points 30° below horizontal; tilt the
  // beam up from it by the incidence angle.
  const angle = Math.PI / 6 - Math.asin(Math.min(1, settings.ior / 2));
  const back = width * 0.3;
  sources = [
    new Source(
      'beam',
      target.x - Math.cos(angle) * back,
      target.y - Math.sin(angle) * back,
      angle,
      prism.size * 0.25,
    ),
  ];
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
    if (overlaps) continue;
    // Some colored glass and some coated, for variety.
    if (Math.random() < TINTED_SHARE) {
      const hue = Math.random() * 360;
      candidate.tint = hslToHex(hue, 0.8, 0.6);
      candidate.strength = 1;
    }
    if (Math.random() < COATED_SHARE)
      candidate.coat = 200 + Math.random() * 250;
    lenses.push(candidate);
  }
}

// --- Interaction ---
// Pointer events cover mouse, touch and pen alike.
const pointerPos = (e) => ({x: e.clientX, y: e.clientY}); // canvas fills the page

// Topmost handle or body under the pointer. Sources sit above lenses.
function pick(pt) {
  const items = [...lenses, ...sources];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    for (const h of item.handles()) {
      if (distSq(pt, h.pt) < HANDLE_HIT_RADIUS_SQ) {
        return {item, part: h.part};
      }
    }
    if (item.contains(pt)) return {item, part: 'body'};
  }
  return null;
}

function setHovered(next) {
  if (hovered?.item !== next?.item || hovered?.part !== next?.part) {
    hovered = next;
    scheduleDrawScene();
  }
  const cursor = !next
    ? 'default'
    : next.part === 'body'
      ? 'grab'
      : 'crosshair';
  canvas.style.cursor = cursor;
}

function handlePointerDown(e) {
  if (dragging) return; // a second finger while dragging
  lastPointer = pointerPos(e);
  dragging = pick(lastPointer);
  // Clicking glass selects it; clicking anything else lets go.
  select(lenses.includes(dragging?.item) ? dragging.item : null);
  if (!dragging) return;
  dragging.pointerId = e.pointerId;
  // Keep receiving moves even if the pointer leaves the canvas mid-drag.
  canvas.setPointerCapture(e.pointerId);
}

function handlePointerMove(e) {
  const pt = pointerPos(e);
  if (!dragging) {
    setHovered(pick(pt));
    return;
  }
  if (e.pointerId !== dragging.pointerId) return;
  const delta = {x: pt.x - lastPointer.x, y: pt.y - lastPointer.y};
  dragging.item.drag(dragging.part, pt, delta);
  lastPointer = pt;
  canvas.style.cursor = 'grabbing';
  render();
}

function handlePointerUp(e) {
  if (e.pointerId !== dragging?.pointerId) return;
  dragging = null;
  setHovered(pick(pointerPos(e)));
  render();
}

function handleDoubleClick(e) {
  e.preventDefault();
  const pt = pointerPos(e);

  // Double-click on a lens or light: delete it
  const hit = pick(pt);
  if (hit) {
    lenses = lenses.filter((l) => l !== hit.item);
    if (hit.item === selected) select(null);
    sources = sources.filter((s) => s !== hit.item);
    setHovered(null);
    render();
    return;
  }

  // Double-click on empty space: create a new lens
  addGlass(newLens(pt.x, pt.y));
}

const newLens = (x, y) =>
  new Lens(x, y, NEW_LENS_HEIGHT, NEW_LENS_SAGITTA, NEW_LENS_SAGITTA, 0);

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

canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);
canvas.addEventListener('pointerleave', () => {
  if (!dragging) setHovered(null);
});
canvas.addEventListener('dblclick', handleDoubleClick);

// --- Ambient motion ---
// Each piece of glass sways on its own slow sines. The offsets are applied
// as per-frame deltas, so dragging a piece simply moves what it sways
// around. The clock only runs while moving, so pausing doesn't jump.
let driftClock = 0;
let lastFrame = 0;

function driftOffset(item, t) {
  item.drift ??= Array.from({length: 3}, () => ({
    period:
      DRIFT_PERIOD[0] + Math.random() * (DRIFT_PERIOD[1] - DRIFT_PERIOD[0]),
    phase: Math.random() * 2 * Math.PI,
  }));
  const [x, y, a] = item.drift.map(({period, phase}) =>
    Math.sin((2 * Math.PI * t) / period + phase),
  );
  return {x: x * DRIFT_DISTANCE, y: y * DRIFT_DISTANCE, angle: a * DRIFT_ANGLE};
}

function drift(now) {
  const dt = Math.min(now - lastFrame, 50) / 1000; // seconds; skip long gaps
  lastFrame = now;
  if (settings.motion && !dragging && lenses.length) {
    const t0 = driftClock;
    driftClock += dt * settings.motion;
    for (const item of lenses) {
      const before = driftOffset(item, t0);
      const after = driftOffset(item, driftClock);
      item.drag('body', null, {x: after.x - before.x, y: after.y - before.y});
      item.rotate?.(after.angle - before.angle);
    }
    scheduleDrawScene();
    requestRayRender(true);
  }
  requestAnimationFrame(drift);
}

// --- Init ---
resize();
loadScene(lensScene);
requestAnimationFrame(drift);
