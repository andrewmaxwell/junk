import {containsAt} from './geometry.js';

// Rays are traced on the CPU in CSS pixels; WebGPU adds their segments into a
// float texture at device resolution. Each pass shifts ray origins and
// jitters wavelengths, so the image keeps refining while the scene is still.

// Safety cap for rays trapped by total internal reflection; ordinary
// crossings (two per lens) never come close.
const MAX_SEGMENTS = 64;
const RAY_EPSILON = 0.001;
const INTERSECTION_SLACK = 0.1;
const MIN_WEIGHT = 0.001; // stop following reflections dimmer than this
const WHITE_ORIGINS_PER_PASS = 1000;
const RAINBOW_ORIGINS_PER_PASS = 4000;
const WAVELENGTHS_PER_RAY = 8;
const LASER_POWER = 12; // a laser is as bright as a 12px beam squeezed into one ray
const POINT_POWER = 800;
const BLOOM_THRESHOLD = 0.25;
const BLOOM_DOWNSAMPLE = 4; // CSS px per bloom px
const MAX_PASSES = 250;
const LAMBDA_MIN = 380;
const LAMBDA_MAX = 700;
const LAMBDA_REF = 0.55; // µm; the IOR setting is the index at this wavelength

// --- Spectrum ---
// CIE 1931 colour matching functions, multi-lobe Gaussian fit
// (Wyman, Sloan & Shirley 2013), converted to linear sRGB.
function lobe(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

function wavelengthToRGB(l) {
  const X =
    1.056 * lobe(l, 599.8, 37.9, 31.0) +
    0.362 * lobe(l, 442.0, 16.0, 26.7) -
    0.065 * lobe(l, 501.1, 20.4, 26.2);
  const Y =
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const Z =
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  // Pure spectral colours lie outside sRGB; clip the negative lobes.
  return [
    Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z),
    Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z),
    Math.max(0, 0.0557 * X - 0.204 * Y + 1.057 * Z),
  ];
}

// 1nm table, each channel scaled so the whole spectrum averages to (1,1,1):
// undispersed white light renders neutral.
const SPECTRUM = (() => {
  const n = LAMBDA_MAX - LAMBDA_MIN + 1;
  const table = new Float32Array(n * 3);
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const rgb = wavelengthToRGB(LAMBDA_MIN + i);
    for (let c = 0; c < 3; c++) {
      table[i * 3 + c] = rgb[c];
      sum[c] += rgb[c];
    }
  }
  for (let i = 0; i < n * 3; i++) table[i] *= n / sum[i % 3];
  return table;
})();

// Fully saturated hue (h in [0, 1)), averaging (1,1,1) around the wheel.
function hueToRGB(h) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return 2 * (1 - Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

// --- Intersections ---
// The tracer's hot loop works in plain numbers. Each *Hit function tests one
// element and, if it finds a hit nearer than HIT.t, records it in HIT, so no
// objects are allocated per ray.
const HIT = {t: 0, x: 0, y: 0, nx: 0, ny: 0, absorb: false, el: null};
let current = null; // the element being tested, for record()

function record(t, ox, oy, dx, dy, nx, ny, absorb) {
  HIT.t = t;
  HIT.x = ox + dx * t;
  HIT.y = oy + dy * t;
  HIT.nx = nx;
  HIT.ny = ny;
  HIT.absorb = absorb;
  HIT.el = current;
}

// Finds the nearest hit along a ray into HIT; false if it hits nothing.
function nearestHit(elements, ox, oy, dx, dy) {
  HIT.t = Infinity;
  for (const el of elements) {
    current = el;
    if (el.type === 'lens') lensHit(el, ox, oy, dx, dy);
    else if (el.type === 'drop') dropHit(el, ox, oy, dx, dy);
    else polygonHit(el, ox, oy, dx, dy);
  }
  return HIT.t < Infinity;
}

// True if a point satisfies one surface's solid-side constraint.
// Convex (sign > 0): inside the circle. Concave (sign < 0): outside it.
function surfaceOK(x, y, cx, cy, r, sign) {
  const d = (x - cx) ** 2 + (y - cy) ** 2;
  return sign > 0
    ? d <= r * r + INTERSECTION_SLACK
    : d >= r * r - INTERSECTION_SLACK;
}

function lensHit(lens, ox, oy, dx, dy) {
  // Skip lenses whose bounding circle the ray misses.
  const ocX = ox - lens.x;
  const ocY = oy - lens.y;
  const bHalf = ocX * dx + ocY * dy;
  const bC = ocX * ocX + ocY * ocY - lens.boundingRadius * lens.boundingRadius;
  if (bC > 0 && bHalf > 0) return;
  if (bHalf * bHalf - bC < 0) return;

  // Left surface faces −axis; right surface faces +axis.
  // prettier-ignore
  surfaceHit(lens, ox, oy, dx, dy, lens.c1, lens.r1, lens.sign1, lens.c2, lens.r2, lens.sign2, -1);
  // prettier-ignore
  surfaceHit(lens, ox, oy, dx, dy, lens.c2, lens.r2, lens.sign2, lens.c1, lens.r1, lens.sign1, 1);

  // Cylindrical rim segments absorb any ray that enters through the edge.
  segmentHit(ox, oy, dx, dy, lens.rimLT, lens.rimRT, 0, 0, true);
  segmentHit(ox, oy, dx, dy, lens.rimLB, lens.rimRB, 0, 0, true);
}

// Curved-surface intersection. `faceAxial` is +1 if the surface's outward
// normal should point along +axis (right surface) or −1 (left surface).
// prettier-ignore
function surfaceHit(lens, ox, oy, dx, dy, cc, cr, sign, oc, ocr, oSign, faceAxial) {
  const {axis, perp, H} = lens;
  const ex = ox - cc.x;
  const ey = oy - cc.y;
  const b = ex * dx + ey * dy;
  const disc = b * b - (ex * ex + ey * ey - cr * cr);
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  for (let k = 0; k < 2; k++) {
    const t = k ? -b + sq : -b - sq;
    if (t <= RAY_EPSILON || t >= HIT.t) continue;
    const x = ox + dx * t;
    const y = oy + dy * t;
    const v = (x - lens.x) * perp.x + (y - lens.y) * perp.y;
    if (Math.abs(v) > H + INTERSECTION_SLACK) continue;
    if (!surfaceOK(x, y, oc.x, oc.y, ocr, oSign)) continue;
    // Outward normal (away from the glass): for a convex surface that's
    // away from the circle center, for concave it's toward it — hence ·sign.
    const nx = ((x - cc.x) / cr) * sign;
    const ny = ((y - cc.y) / cr) * sign;
    const outwardAxial = nx * axis.x + ny * axis.y;
    // Keep only the branch whose outward normal faces this surface's side.
    if (faceAxial < 0 ? outwardAxial > 0.02 : outwardAxial < -0.02) continue;
    record(t, ox, oy, dx, dy, nx, ny, Math.abs(v) >= H - 3);
  }
}

// Ray vs. the segment a→b, with normal (nx, ny).
function segmentHit(ox, oy, dx, dy, a, b, nx, ny, absorb) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return; // parallel
  const wx = a.x - ox;
  const wy = a.y - oy;
  const t = (wx * ey - wy * ex) / denom;
  const s = (wx * dy - wy * dx) / denom;
  if (t <= RAY_EPSILON || t >= HIT.t || s < 0 || s > 1) return;
  record(t, ox, oy, dx, dy, nx, ny, absorb);
}

// A droplet is a plain circle; its outward normal points away from the center.
function dropHit(drop, ox, oy, dx, dy) {
  const ex = ox - drop.x;
  const ey = oy - drop.y;
  const b = ex * dx + ey * dy;
  const disc = b * b - (ex * ex + ey * ey - drop.r * drop.r);
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  for (let k = 0; k < 2; k++) {
    const t = k ? -b + sq : -b - sq;
    if (t <= RAY_EPSILON || t >= HIT.t) continue;
    const nx = (ex + dx * t) / drop.r;
    const ny = (ey + dy * t) / drop.r;
    record(t, ox, oy, dx, dy, nx, ny, false);
  }
}

// Each edge of a convex polygon (see prepareScene for `edges`).
function polygonHit(poly, ox, oy, dx, dy) {
  for (const {a, b, nx, ny} of poly.edges) {
    segmentHit(ox, oy, dx, dy, a, b, nx, ny, false);
  }
}

// Once per scene: polygon edges with outward normals, and whether any two
// elements' bounding circles overlap (if not, tracing can skip mediumAt).
function prepareScene(scene) {
  for (const el of scene.lenses) {
    if (el.type !== 'prism') continue;
    el.edges = el.vertices.map((a, i) => {
      const b = el.vertices[(i + 1) % el.vertices.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      let nx = (b.y - a.y) / len;
      let ny = -(b.x - a.x) / len;
      if ((a.x - el.x) * nx + (a.y - el.y) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      return {a, b, nx, ny};
    });
  }
  const radius = (el) => (el.type === 'drop' ? el.r : el.boundingRadius);
  scene.disjoint = scene.lenses.every((a, i) =>
    scene.lenses
      .slice(i + 1)
      .every((b) => Math.hypot(a.x - b.x, a.y - b.y) > radius(a) + radius(b)),
  );
}

// --- Fresnel ---
// scatter() fills OUT: the reflected direction (rx, ry), the refracted one
// (tx, ty) unless it returns false for total internal reflection, and the
// unpolarised reflectance R.
const OUT = {rx: 0, ry: 0, tx: 0, ty: 0, R: 0};

// A ray (dx, dy) crossing from index n1 into n2 at a surface with normal
// (nx, ny), which may face either way.
function scatter(dx, dy, nx, ny, n1, n2) {
  let cosI = -(dx * nx + dy * ny);
  if (cosI < 0) {
    // Orient the normal against the ray.
    cosI = -cosI;
    nx = -nx;
    ny = -ny;
  }
  OUT.rx = dx + 2 * cosI * nx;
  OUT.ry = dy + 2 * cosI * ny;
  const eta = n1 / n2;
  const sinT2 = eta * eta * (1 - cosI * cosI);
  if (sinT2 >= 1) {
    OUT.R = 1;
    return false;
  }
  const cosT = Math.sqrt(1 - sinT2);
  OUT.tx = eta * dx + (eta * cosI - cosT) * nx;
  OUT.ty = eta * dy + (eta * cosI - cosT) * ny;
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  OUT.R = (rs * rs + rp * rp) / 2;
  return true;
}

// --- Segments ---
// Each pass collects its ray segments (CSS px) here, 7 floats apiece:
// x0, y0, x1, y1, r, g, b. The GPU then draws them all in one call.
const SEG_FLOATS = 7;
let segs = new Float32Array(SEG_FLOATS * 65536);
let segCount = 0;

function addLine(x0, y0, x1, y1, r, g, b) {
  if (segCount * SEG_FLOATS === segs.length) {
    const bigger = new Float32Array(segs.length * 2);
    bigger.set(segs);
    segs = bigger;
  }
  const i = segCount++ * SEG_FLOATS;
  segs[i] = x0;
  segs[i + 1] = y0;
  segs[i + 2] = x1;
  segs[i + 3] = y1;
  segs[i + 4] = r;
  segs[i + 5] = g;
  segs[i + 6] = b;
}

// --- Tracing ---
// The medium at a point: where elements overlap, the smallest one wins, so
// nested objects (a lens in a droplet in a lens) resolve the same way in any
// order. null is air.
function mediumAt(elements, x, y) {
  let best = null;
  for (const el of elements) {
    if ((!best || el.area < best.area) && containsAt(el, x, y)) best = el;
  }
  return best;
}

// Cauchy dispersion: n(λ) = ior + B·(1/λ² − 1/λref²), λ in µm. Each element
// carries its own material's ior and B. Air (null) is 1.
function iorAt(material, lambdaNm) {
  if (!material) return 1;
  const l = lambdaNm / 1000;
  return (
    material.ior + material.dispersion * (1 / (l * l) - 1 / LAMBDA_REF ** 2)
  );
}

// Traces one ray of a single wavelength, drawing every segment. With
// reflections on, each surface spawns a Fresnel-weighted reflected branch.
// `first`, if given, is the first hit, already found and drawn by the caller.
// prettier-ignore
function traceRay(scene, ox, oy, dx, dy, lambda, r, g, b, far, first = null) {
  const elements = scene.lenses;
  const e = RAY_EPSILON;
  // Pending reflected branches, flattened: x, y, dx, dy, weight, depth, plus
  // the medium each travels through.
  const stack = [ox, oy, dx, dy, 1, 0];
  const media = [mediumAt(elements, ox, oy)];
  while (stack.length) {
    let medium = media.pop();
    let depth = stack.pop();
    let w = stack.pop();
    dy = stack.pop();
    dx = stack.pop();
    oy = stack.pop();
    ox = stack.pop();
    for (; depth < MAX_SEGMENTS; depth++) {
      let found = true;
      if (first) {
        Object.assign(HIT, first);
        first = null;
      } else {
        found = nearestHit(elements, ox, oy, dx, dy);
        const ex = found ? HIT.x : ox + dx * far;
        const ey = found ? HIT.y : oy + dy * far;
        addLine(ox, oy, ex, ey, r * w, g * w, b * w);
      }
      if (!found) break;
      const {x: hx, y: hy, nx, ny, absorb} = HIT;

      // The medium just past the hit decides what happens. A surface with
      // the same index on both sides (hidden inside a smaller element, or
      // between matching media) does nothing: it doesn't bend, and a ground
      // rim turns clear, just as frosted glass does when wetted with a
      // matching liquid.
      // When nothing overlaps, crossing a boundary just toggles between that
      // element and air.
      const next = scene.disjoint
        ? medium === HIT.el
          ? null
          : HIT.el
        : mediumAt(elements, hx + dx * e, hy + dy * e);
      const n1 = iorAt(medium, lambda);
      const n2 = iorAt(next, lambda);
      if (n1 === n2) {
        medium = next;
      } else {
        if (absorb) break;
        if (!scatter(dx, dy, nx, ny, n1, n2)) {
          dx = OUT.rx; // total internal reflection: stays in this medium
          dy = OUT.ry;
        } else {
          if (scene.reflections && w * OUT.R > MIN_WEIGHT) {
            stack.push(hx + OUT.rx * e, hy + OUT.ry * e, OUT.rx, OUT.ry, w * OUT.R, depth + 1);
            media.push(medium);
          }
          if (scene.reflections) w *= 1 - OUT.R;
          dx = OUT.tx;
          dy = OUT.ty;
          medium = next;
        }
      }
      ox = hx + dx * e;
      oy = hy + dy * e;
    }
  }
}

// Light each source emits, in "CSS px of beam": a beam of width w has power w,
// so every unobstructed beam renders at the same brightness.
function sourcePower(src) {
  if (src.type === 'beam') return src.width;
  return src.type === 'laser' ? LASER_POWER : POINT_POWER;
}

// Ray `t` ∈ [0, 1) of a source: its start and direction.
function emit(src, t) {
  const c = Math.cos(src.angle);
  const s = Math.sin(src.angle);
  if (src.type === 'point') {
    const a = t * 2 * Math.PI;
    return {ox: src.x, oy: src.y, dx: Math.cos(a), dy: Math.sin(a)};
  }
  const across = src.type === 'beam' ? (t - 0.5) * src.width : 0;
  return {ox: src.x - across * s, oy: src.y + across * c, dx: c, dy: s};
}

// Every pass traces evenly spaced rays from each source, shifted by a
// golden-ratio sequence so successive passes fill the gaps evenly. (Random
// jitter leaves streaks along the rays, since parallel rays reuse the same
// pixel rows.) Each source gets a share of the ray budget by power.
function renderPass(scene, pass) {
  const shift = (pass * 0.6180339887) % 1;
  const far = Math.max(scene.width, scene.height) * 2;
  const budget =
    scene.light === 'White' ? WHITE_ORIGINS_PER_PASS : RAINBOW_ORIGINS_PER_PASS;
  const totalPower = scene.sources.reduce((sum, s) => sum + sourcePower(s), 0);

  for (const src of scene.sources) {
    const power = sourcePower(src);
    const n = Math.max(1, Math.round((budget * power) / totalPower));
    for (let i = 0; i < n; i++) {
      const t = (i + shift) / n;
      traceOrigin(scene, emit(src, t), t, power / n, far);
    }
  }
}

const lambdas = new Float64Array(WAVELENGTHS_PER_RAY);
const spectrumIndex = (lambda) => Math.round(lambda - LAMBDA_MIN) * 3;

function traceOrigin(scene, {ox, oy, dx, dy}, t, weight, far) {
  if (scene.light !== 'White') {
    const [r, g, b] = hueToRGB(t);
    // prettier-ignore
    traceRay(scene, ox, oy, dx, dy, LAMBDA_REF * 1000, r * weight, g * weight, b * weight, far);
    return;
  }
  // Stratified wavelengths, jittered within each stratum.
  const k = weight / WAVELENGTHS_PER_RAY;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let j = 0; j < WAVELENGTHS_PER_RAY; j++) {
    const lambda =
      LAMBDA_MIN +
      ((j + Math.random()) / WAVELENGTHS_PER_RAY) * (LAMBDA_MAX - LAMBDA_MIN);
    lambdas[j] = lambda;
    const i = spectrumIndex(lambda);
    sr += SPECTRUM[i];
    sg += SPECTRUM[i + 1];
    sb += SPECTRUM[i + 2];
  }
  // Every wavelength shares the path up to the first surface, so draw
  // that segment once (the costly part for rays that miss every lens).
  const found = nearestHit(scene.lenses, ox, oy, dx, dy);
  const ex = found ? HIT.x : ox + dx * far;
  const ey = found ? HIT.y : oy + dy * far;
  addLine(ox, oy, ex, ey, sr * k, sg * k, sb * k);
  if (!found) return;
  const first = {...HIT};
  for (const lambda of lambdas) {
    const i = spectrumIndex(lambda);
    // prettier-ignore
    traceRay(scene, ox, oy, dx, dy, lambda, SPECTRUM[i] * k, SPECTRUM[i + 1] * k, SPECTRUM[i + 2] * k, far, first);
  }
}

// --- GPU ---
// WebGPU. Segments are drawn as thin quads with a tent profile across them,
// added into a float texture (`accum`). Presenting runs a few full-screen
// passes: bright parts → quarter-res bloom → blur → an even blurrier wide
// bloom, then a composite that adds bloom, tone maps and vignettes.
//
// The canvas is always rgba16float. In HDR its tone mapping is 'extended', so
// values over 1 show brighter than white (see anotherRaytracer).

const LINE_WGSL = /* wgsl */ `
struct Uniforms { res: vec2f, halfWidth: f32 } // res in CSS px
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32, @location(0) seg: vec4f, @location(1) color: vec3f) -> Out {
  // Triangle-strip corners: along 0..1, across -1..1.
  let corner = vec2f(f32(i & 1u), f32(i >> 1u) * 2. - 1.);
  let d = seg.zw - seg.xy;
  let len = length(d);
  let dir = select(vec2f(1., 0.), d / max(len, 1e-9), len > 0.);
  let p = mix(seg.xy, seg.zw, corner.x) + vec2f(-dir.y, dir.x) * corner.y * u.halfWidth;
  var o: Out;
  o.pos = vec4f(p.x / u.res.x * 2. - 1., 1. - p.y / u.res.y * 2., 0., 1.);
  o.across = corner.y;
  o.color = color;
  return o;
}

// The tent integrates to 1 per CSS px across the line, so a beam of evenly
// spaced rays with weight = spacing accumulates to exactly 1.
@fragment
fn fs(i: Out) -> @location(0) vec4f {
  return vec4f(i.color * (1. - abs(i.across)) / u.halfWidth, 0.);
}`;

// One triangle covering the screen.
const FULLSCREEN_WGSL = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2. - 1., 0., 1.);
}`;

// Averages each factor×factor block of light above the threshold.
const BRIGHT_WGSL = /* wgsl */ `
struct Uniforms { scale: f32, threshold: f32, factor: i32 }
@group(0) @binding(0) var accum: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let base = vec2i(pos.xy) * u.factor;
  let last = vec2i(textureDimensions(accum)) - 1;
  var sum = vec3f(0.);
  for (var y = 0; y < u.factor; y++) {
    for (var x = 0; x < u.factor; x++) {
      let v = textureLoad(accum, min(base + vec2i(x, y), last), 0).rgb * u.scale;
      sum += max(v - u.threshold, vec3f(0.));
    }
  }
  return vec4f(sum / f32(u.factor * u.factor), 1.);
}`;

// Separable Gaussian, σ = 3 texels along dir.
const BLUR_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> dir: vec2f;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let texel = 1. / vec2f(textureDimensions(src));
  let uv = pos.xy * texel;
  var sum = vec3f(0.);
  var total = 0.;
  for (var i = -9; i <= 9; i++) {
    let w = exp(-f32(i * i) / 18.);
    sum += textureSampleLevel(src, linearSampler, uv + dir * texel * f32(i), 0.).rgb * w;
    total += w;
  }
  return vec4f(sum / total, 1.);
}`;

// 4× smaller: four bilinear taps cover a 4×4 block.
const DOWN_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let texel = 1. / vec2f(textureDimensions(src));
  let uv = pos.xy * 4. * texel;
  var sum = vec3f(0.);
  for (var k = 0; k < 4; k++) {
    let o = vec2f(f32(k & 1) * 2. - 1., f32(k >> 1) * 2. - 1.);
    sum += textureSampleLevel(src, linearSampler, uv + texel * o, 0.).rgb;
  }
  return vec4f(sum / 4., 1.);
}`;

const COMPOSITE_WGSL = /* wgsl */ `
struct Uniforms {
  scale: f32,
  bloomNarrow: f32,
  bloomWide: f32,
  headroom: f32, // 0 in SDR
}
@group(0) @binding(0) var accum: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var wide: texture_2d<f32>;
@group(0) @binding(3) var linearSampler: sampler;
@group(0) @binding(4) var<uniform> u: Uniforms;

// AgX (Troy Sobotka; polynomial fit by Benjamin Wrensch). Unlike per-channel
// curves it keeps hues steady as they brighten and lets saturated highlights
// fade gracefully to white. Input is linear sRGB; output is display-encoded.
fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

fn agx(color: vec3f) -> vec3f {
  let inset = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let outset = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  let minEv = -12.47393;
  let maxEv = 4.026069;
  var c = clamp(log2(max(inset * color, vec3f(1e-10))), vec3f(minEv), vec3f(maxEv));
  c = agxContrast((c - minEv) / (maxEv - minEv));
  return clamp(outset * c, vec3f(0.), vec3f(1.));
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let res = vec2f(textureDimensions(accum));
  let uv = pos.xy / res;
  var hdr = textureLoad(accum, vec2i(pos.xy), 0).rgb * u.scale;
  hdr += textureSampleLevel(bloom, linearSampler, uv, 0.).rgb * u.bloomNarrow;
  hdr += textureSampleLevel(wide, linearSampler, uv, 0.).rgb * u.bloomWide;

  // Vignette: darken toward the corners.
  let r = length((uv - 0.5) * res) / (0.6 * length(res));
  let vignette = 1. - 0.52 * pow(smoothstep(0.42, 1., r), 1.5);

  if (u.headroom > 0.) {
    // HDR: no tone curve. Anything brighter than the screen can show is
    // scaled down as a whole, rather than clipped per channel into white.
    var c = hdr * vignette;
    let peak = max(c.r, max(c.g, c.b));
    if (peak > u.headroom) {
      c *= u.headroom / peak;
    }
    // The canvas takes sRGB-encoded values; over 1 is brighter than white.
    return vec4f(pow(c, vec3f(1. / 2.2)), 1.);
  }
  // SDR: AgX, then dither away 8-bit banding in the smooth gradients.
  let c = agx(hdr) * vignette + (hash(pos.xy) - 0.5) / 255.;
  return vec4f(c, 1.);
}`;

const BLOOM_NARROW = 0.8;
const BLOOM_WIDE = 0.5;
const ACCUM_FALLBACK = 'rgba16float'; // when 32-bit floats can't be blended
const BLOOM_FORMAT = 'rgba16float';
const CANVAS_FORMAT = 'rgba16float';

let device = null;
let context = null;
let accumFormat = 'rgba32float';
let pipelines = null;
let linearSampler = null;
let uniforms = null; // name → GPUBuffer
let segBuffer = null;
let targets = null; // name → {texture, view}
let bindGroups = null;
let bloomFactor = 1; // device px per bloom px
let headroom = 0; // HDR headroom, 0 in SDR
let W = 0; // device pixels
let H = 0;
let dpr = 1;

async function initGPU(canvas, hdrHeadroom) {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU isn’t available');
  const blend32 = adapter.features.has('float32-blendable');
  device = await adapter.requestDevice({
    requiredFeatures: blend32 ? ['float32-blendable'] : [],
  });
  accumFormat = blend32 ? 'rgba32float' : ACCUM_FALLBACK;
  device.lost.then((info) => {
    if (info.reason !== 'destroyed') {
      self.postMessage({error: `the GPU was lost (${info.message})`});
    }
  });
  device.addEventListener('uncapturederror', (e) =>
    self.postMessage({error: e.error.message}),
  );

  context = canvas.getContext('webgpu');
  setHeadroom(hdrHeadroom);

  const fullscreen = device.createShaderModule({code: FULLSCREEN_WGSL});
  const pipeline = (code, format, blend) => {
    const module = device.createShaderModule({code});
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {module: fullscreen},
      fragment: {module, targets: [{format, blend}]},
    });
  };
  const lineModule = device.createShaderModule({code: LINE_WGSL});
  const add = {srcFactor: 'one', dstFactor: 'one', operation: 'add'};
  pipelines = {
    line: device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: lineModule,
        buffers: [
          {
            arrayStride: SEG_FLOATS * 4,
            stepMode: 'instance',
            attributes: [
              {shaderLocation: 0, offset: 0, format: 'float32x4'},
              {shaderLocation: 1, offset: 16, format: 'float32x3'},
            ],
          },
        ],
      },
      fragment: {
        module: lineModule,
        targets: [{format: accumFormat, blend: {color: add, alpha: add}}],
      },
      primitive: {topology: 'triangle-strip'},
    }),
    bright: pipeline(BRIGHT_WGSL, BLOOM_FORMAT),
    blur: pipeline(BLUR_WGSL, BLOOM_FORMAT),
    down: pipeline(DOWN_WGSL, BLOOM_FORMAT),
    composite: pipeline(COMPOSITE_WGSL, CANVAS_FORMAT),
  };

  linearSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });
  const buffer = (bytes) =>
    device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  uniforms = {
    line: buffer(16),
    bright: buffer(16),
    blurX: buffer(16),
    blurY: buffer(16),
    composite: buffer(16),
  };
  device.queue.writeBuffer(uniforms.blurX, 0, new Float32Array([1, 0, 0, 0]));
  device.queue.writeBuffer(uniforms.blurY, 0, new Float32Array([0, 1, 0, 0]));
}

// 0 for SDR, else how many times brighter than white the screen may go.
function setHeadroom(h) {
  headroom = h;
  context.configure({
    device,
    // Float, so values over 1 survive to the screen
    format: CANVAS_FORMAT,
    alphaMode: 'opaque',
    // 'extended' shows values over 1 as brighter than white
    toneMapping: {mode: headroom ? 'extended' : 'standard'},
  });
}

function resizeTargets() {
  if (targets) for (const t of Object.values(targets)) t.texture.destroy();
  context.canvas.width = W;
  context.canvas.height = H;
  const target = (w, h, format) => {
    const texture = device.createTexture({
      size: [w, h],
      format,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return {texture, view: texture.createView()};
  };
  bloomFactor = Math.max(1, Math.round(BLOOM_DOWNSAMPLE * dpr));
  const bw = Math.ceil(W / bloomFactor);
  const bh = Math.ceil(H / bloomFactor);
  const ww = Math.ceil(bw / 4);
  const wh = Math.ceil(bh / 4);
  targets = {
    accum: target(W, H, accumFormat),
    bloomA: target(bw, bh, BLOOM_FORMAT),
    bloomB: target(bw, bh, BLOOM_FORMAT),
    wideA: target(ww, wh, BLOOM_FORMAT),
    wideB: target(ww, wh, BLOOM_FORMAT),
  };

  // Bind groups follow the textures, so rebuild them with them.
  const group = (name, entries) =>
    device.createBindGroup({
      layout: pipelines[name].getBindGroupLayout(0),
      entries: entries.map((resource, binding) => ({
        binding,
        resource: resource instanceof GPUBuffer ? {buffer: resource} : resource,
      })),
    });
  const t = targets;
  bindGroups = {
    line: group('line', [uniforms.line]),
    bright: group('bright', [t.accum.view, uniforms.bright]),
    blurAX: group('blur', [t.bloomA.view, linearSampler, uniforms.blurX]),
    blurBY: group('blur', [t.bloomB.view, linearSampler, uniforms.blurY]),
    down: group('down', [t.bloomA.view, linearSampler]),
    blurWideX: group('blur', [t.wideA.view, linearSampler, uniforms.blurX]),
    blurWideY: group('blur', [t.wideB.view, linearSampler, uniforms.blurY]),
    composite: group('composite', [
      t.accum.view,
      t.bloomA.view,
      t.wideA.view,
      linearSampler,
      uniforms.composite,
    ]),
  };
}

// Runs one render pass into `view`; `draw` records its commands.
function renderTo(encoder, view, load, draw) {
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {view, loadOp: load, storeOp: 'store', clearValue: [0, 0, 0, 0]},
    ],
  });
  draw?.(pass);
  pass.end();
}

function fullscreen(encoder, name, group, view) {
  renderTo(encoder, view, 'clear', (pass) => {
    pass.setPipeline(pipelines[name]);
    pass.setBindGroup(0, bindGroups[group]);
    pass.draw(3);
  });
}

// Adds this pass's segments into `accum`, clearing it first if `clear`.
function drawSegments(scene, clear) {
  const bytes = segCount * SEG_FLOATS * 4;
  if (!segBuffer || segBuffer.size < bytes) {
    segBuffer?.destroy();
    segBuffer = device.createBuffer({
      size: Math.max(bytes, 1 << 20) * 2,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
  device.queue.writeBuffer(segBuffer, 0, segs, 0, segCount * SEG_FLOATS);
  // prettier-ignore
  device.queue.writeBuffer(uniforms.line, 0, new Float32Array([scene.width, scene.height, 1 / dpr, 0]));
  const encoder = device.createCommandEncoder();
  renderTo(encoder, targets.accum.view, clear ? 'clear' : 'load', (pass) => {
    if (!segCount) return;
    pass.setPipeline(pipelines.line);
    pass.setBindGroup(0, bindGroups.line); // half width: one device px
    pass.setVertexBuffer(0, segBuffer);
    pass.draw(4, segCount);
  });
  device.queue.submit([encoder.finish()]);
  segCount = 0;
}

// An unobstructed beam accumulates 1 per pass; `scale` averages the passes
// and applies exposure.
function present(passes, exposure) {
  const scale = exposure / passes;
  const brightU = new ArrayBuffer(16);
  new Float32Array(brightU, 0, 2).set([scale, BLOOM_THRESHOLD]);
  new Int32Array(brightU, 8, 1)[0] = bloomFactor;
  device.queue.writeBuffer(uniforms.bright, 0, brightU);
  // prettier-ignore
  device.queue.writeBuffer(uniforms.composite, 0, new Float32Array([scale, BLOOM_NARROW, BLOOM_WIDE, headroom]));

  const encoder = device.createCommandEncoder();
  const t = targets;
  fullscreen(encoder, 'bright', 'bright', t.bloomA.view);
  fullscreen(encoder, 'blur', 'blurAX', t.bloomB.view);
  fullscreen(encoder, 'blur', 'blurBY', t.bloomA.view);
  fullscreen(encoder, 'down', 'down', t.wideA.view);
  fullscreen(encoder, 'blur', 'blurWideX', t.wideB.view);
  fullscreen(encoder, 'blur', 'blurWideY', t.wideA.view);
  const screen = context.getCurrentTexture().createView();
  fullscreen(encoder, 'composite', 'composite', screen);
  device.queue.submit([encoder.finish()]);
}

// --- Progressive loop ---
// Messages only record the latest scene; the loop resets the buffer when it
// next runs, so a burst of drag events costs one reset.
let scene = null;
let exposure = 1;
let dirty = false;
let passes = 0;
let timer = 0;

function step() {
  timer = 0;
  if (!device || !scene) return; // the GPU is still starting up
  let clear = false;
  if (dirty) {
    dpr = scene.dpr;
    const w = Math.round(scene.width * dpr);
    const h = Math.round(scene.height * dpr);
    if (w !== W || h !== H) {
      W = w;
      H = h;
      resizeTargets();
    }
    clear = true;
    passes = 0;
    dirty = false;
  }
  renderPass(scene, passes);
  drawSegments(scene, clear);
  passes++;
  present(passes, exposure);
  if (passes < MAX_PASSES) schedule();
}

function schedule() {
  if (!timer) timer = setTimeout(step, 0);
}

let failed = false;

self.onmessage = async ({data}) => {
  if (failed) return; // no renderer; the page already shows why
  if (data.canvas) {
    try {
      await initGPU(data.canvas, data.headroom);
      schedule(); // a scene may have arrived while starting up
    } catch (e) {
      failed = true;
      self.postMessage({error: e.message});
    }
    return;
  }
  if ('headroom' in data && device) {
    setHeadroom(data.headroom);
    if (passes) present(passes, exposure);
  }
  if ('exposure' in data) exposure = data.exposure;
  if (data.scene) {
    scene = data.scene;
    prepareScene(scene);
    dirty = true;
    schedule();
  } else if (passes) {
    present(passes, exposure); // exposure-only change: no re-trace
  }
};
