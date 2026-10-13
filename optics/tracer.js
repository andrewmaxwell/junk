// GPU ray tracer: a WebGPU compute shader traces every ray and appends its
// segments to a storage buffer, which the renderer then draws as lines with
// drawIndirect, so segments never pass through JavaScript.
//
// One thread traces one path: a ray origin at one wavelength. Fresnel
// reflections branch onto a small per-thread stack.

export const LAMBDA_MIN = 380;
export const LAMBDA_MAX = 700;
export const WAVELENGTHS_PER_RAY = 8; // in white light
const LAMBDA_REF = 550; // nm; an element's ior is its index here
const LASER_POWER = 12; // a laser is as bright as a 12px beam squeezed into one ray
const POINT_POWER = 800;
const ELEMENT_FLOATS = 40; // matches struct Element
const SOURCE_FLOATS = 8; // matches struct Source
export const SEGMENT_BYTES = 32; // matches struct Segment
const KINDS = {lens: 0, drop: 1, prism: 2};
const SOURCE_KINDS = {beam: 0, laser: 1, point: 2};

const WGSL = /* wgsl */ `
const LAMBDA_MIN = ${LAMBDA_MIN}.;
const LAMBDA_MAX = ${LAMBDA_MAX}.;
const LAMBDA_REF = ${LAMBDA_REF}.;
// Safety cap for rays trapped by total internal reflection; ordinary
// crossings (two per lens) never come close.
const MAX_SEGMENTS = 64u;
const STACK_SIZE = 8; // pending reflections per thread
// Nudge off a surface after a hit. Larger than on the CPU, since f32 has
// only ~0.0002 px of precision at 3000 px.
const RAY_EPSILON = 0.01;
const INTERSECTION_SLACK = 0.1;
// Reflections dimmer than this are followed only sometimes, at this weight
// (Russian roulette): the same light on average, for far fewer lines to draw.
const ROULETTE_WEIGHT = 0.1;
const NO_HIT = 1e30;

// A lens, droplet or prism (kind 0, 1, 2), packed by packElements().
struct Element {
  kind: u32,
  ior: f32,
  dispersion: f32, // Cauchy B, µm²
  area: f32,
  center: vec2f,
  boundingRadius: f32,
  r: f32, // droplet radius; lens half-height H
  axis: vec2f, // lens only, through c2
  perp: vec2f,
  c1: vec2f,
  c2: vec2f,
  r1: f32,
  r2: f32,
  sign1: f32, // +1 convex, -1 concave
  sign2: f32,
  uMin: f32, // axial extent
  uMax: f32,
  _pad1: vec2f, // keeps the layout at the offsets packElements() uses
  p0: vec2f, // lens: rim segments p0→p1 and p2→p3; prism: vertices p0, p1, p2
  p1: vec2f,
  p2: vec2f,
  p3: vec2f,
  n0: vec2f, // prism: outward normals of edges p0→p1, p1→p2, p2→p0
  n1: vec2f,
  n2: vec2f,
  _pad2: vec2f, // 160 bytes = ELEMENT_FLOATS
}

// A light (kind 0 beam, 1 laser, 2 point) and the rays it gets this pass.
struct Source {
  kind: u32,
  count: u32,
  first: u32, // index of its first ray
  angle: f32,
  pos: vec2f,
  width: f32,
  weight: f32, // power per ray
}

struct Params {
  shift: f32, // golden-ratio offset of this pass's evenly spaced rays
  far: f32, // how far a ray that hits nothing is drawn
  seed: u32,
  white: u32, // else colored by where rays start, all at LAMBDA_REF
  reflections: u32,
  elementCount: u32,
  sourceCount: u32,
  threads: u32,
  disjoint: u32, // no bounding circles overlap
  capacity: u32, // segments the buffer holds
  wavelengths: u32, // per ray origin
}

struct Segment {
  ends: vec4f, // x0, y0, x1, y1 in CSS px
  color: vec4f,
}

// Indirect draw arguments; instanceCount doubles as the segment counter.
struct Draw {
  vertexCount: u32,
  instanceCount: atomic<u32>,
  firstVertex: u32,
  firstInstance: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> elements: array<Element>;
@group(0) @binding(2) var<storage, read> sources: array<Source>;
@group(0) @binding(3) var<storage, read> spectrum: array<vec4f>; // 1nm steps
@group(0) @binding(4) var<storage, read_write> segments: array<Segment>;
@group(0) @binding(5) var<storage, read_write> draw: Draw;

// --- Intersections ---
struct Hit {
  t: f32,
  pos: vec2f,
  normal: vec2f, // outward, away from the element
  absorb: bool, // lens rims are ground glass
  el: i32,
}

fn record(hit: ptr<function, Hit>, t: f32, o: vec2f, d: vec2f, n: vec2f, absorb: bool, el: i32) {
  *hit = Hit(t, o + d * t, n, absorb, el);
}

// Curved lens surface. faceAxial is +1 if the surface's outward normal
// should point along +axis (right surface) or -1 (left surface).
fn surfaceHit(hit: ptr<function, Hit>, i: i32, o: vec2f, d: vec2f, cc: vec2f, cr: f32, sign: f32, oc: vec2f, ocr: f32, oSign: f32, faceAxial: f32) {
  let e = elements[i];
  let ex = o - cc;
  let b = dot(ex, d);
  let disc = b * b - (dot(ex, ex) - cr * cr);
  if (disc < 0.) { return; }
  let sq = sqrt(disc);
  for (var k = 0; k < 2; k++) {
    let t = select(-b - sq, -b + sq, k == 1);
    if (t <= RAY_EPSILON || t >= (*hit).t) { continue; }
    let p = o + d * t;
    let v = dot(p - e.center, e.perp);
    if (abs(v) > e.r + INTERSECTION_SLACK) { continue; }
    // The other surface's solid side: inside its circle if convex,
    // outside if concave.
    let dd = dot(p - oc, p - oc);
    if ((oSign > 0. && dd > ocr * ocr + INTERSECTION_SLACK) ||
        (oSign < 0. && dd < ocr * ocr - INTERSECTION_SLACK)) { continue; }
    // Outward normal: away from the circle center if convex, toward it if
    // concave, hence ·sign.
    let n = (p - cc) / cr * sign;
    let outwardAxial = dot(n, e.axis);
    // Keep only the branch whose outward normal faces this surface's side.
    if ((faceAxial < 0. && outwardAxial > 0.02) || (faceAxial > 0. && outwardAxial < -0.02)) { continue; }
    record(hit, t, o, d, n, abs(v) >= e.r - 3., i);
  }
}

// Ray vs. the segment a→b, with normal n.
fn segmentHit(hit: ptr<function, Hit>, i: i32, o: vec2f, d: vec2f, a: vec2f, b: vec2f, n: vec2f, absorb: bool) {
  let e = b - a;
  let denom = d.x * e.y - d.y * e.x;
  if (abs(denom) < 1e-9) { return; } // parallel
  let w = a - o;
  let t = (w.x * e.y - w.y * e.x) / denom;
  let s = (w.x * d.y - w.y * d.x) / denom;
  if (t <= RAY_EPSILON || t >= (*hit).t || s < 0. || s > 1.) { return; }
  record(hit, t, o, d, n, absorb, i);
}

fn lensHit(hit: ptr<function, Hit>, i: i32, o: vec2f, d: vec2f) {
  let e = elements[i];
  // Skip lenses whose bounding circle the ray misses.
  let oc = o - e.center;
  let b = dot(oc, d);
  let c = dot(oc, oc) - e.boundingRadius * e.boundingRadius;
  if ((c > 0. && b > 0.) || b * b - c < 0.) { return; }
  surfaceHit(hit, i, o, d, e.c1, e.r1, e.sign1, e.c2, e.r2, e.sign2, -1.);
  surfaceHit(hit, i, o, d, e.c2, e.r2, e.sign2, e.c1, e.r1, e.sign1, 1.);
  // Cylindrical rim segments absorb any ray that enters through the edge.
  segmentHit(hit, i, o, d, e.p0, e.p1, vec2f(0.), true);
  segmentHit(hit, i, o, d, e.p2, e.p3, vec2f(0.), true);
}

fn dropHit(hit: ptr<function, Hit>, i: i32, o: vec2f, d: vec2f) {
  let e = elements[i];
  let ex = o - e.center;
  let b = dot(ex, d);
  let disc = b * b - (dot(ex, ex) - e.r * e.r);
  if (disc < 0.) { return; }
  let sq = sqrt(disc);
  for (var k = 0; k < 2; k++) {
    let t = select(-b - sq, -b + sq, k == 1);
    if (t <= RAY_EPSILON || t >= (*hit).t) { continue; }
    record(hit, t, o, d, (ex + d * t) / e.r, false, i);
  }
}

fn prismHit(hit: ptr<function, Hit>, i: i32, o: vec2f, d: vec2f) {
  let e = elements[i];
  segmentHit(hit, i, o, d, e.p0, e.p1, e.n0, false);
  segmentHit(hit, i, o, d, e.p1, e.p2, e.n1, false);
  segmentHit(hit, i, o, d, e.p2, e.p0, e.n2, false);
}

fn nearestHit(o: vec2f, d: vec2f) -> Hit {
  var hit = Hit(NO_HIT, vec2f(0.), vec2f(0.), false, -1);
  for (var i = 0; i < i32(params.elementCount); i++) {
    switch (elements[i].kind) {
      case 0u: { lensHit(&hit, i, o, d); }
      case 1u: { dropHit(&hit, i, o, d); }
      default: { prismHit(&hit, i, o, d); }
    }
  }
  return hit;
}

// --- Media ---
// Same tests as geometry.js.
fn containsAt(i: i32, p: vec2f) -> bool {
  let e = elements[i];
  let q = p - e.center;
  if (e.kind == 1u) { return dot(q, q) < e.r * e.r; }
  if (e.kind == 2u) {
    // Convex polygon: inside every edge.
    return dot(p - e.p0, e.n0) <= 0. && dot(p - e.p1, e.n1) <= 0. && dot(p - e.p2, e.n2) <= 0.;
  }
  if (dot(q, q) > e.boundingRadius * e.boundingRadius) { return false; }
  if (abs(dot(q, e.perp)) > e.r) { return false; }
  let u = dot(q, e.axis);
  if (u < e.uMin || u > e.uMax) { return false; }
  let d1 = dot(p - e.c1, p - e.c1);
  if ((e.sign1 > 0. && d1 > e.r1 * e.r1) || (e.sign1 < 0. && d1 < e.r1 * e.r1)) { return false; }
  let d2 = dot(p - e.c2, p - e.c2);
  return select(d2 >= e.r2 * e.r2, d2 <= e.r2 * e.r2, e.sign2 > 0.);
}

// The medium at a point: where elements overlap, the smallest one wins, so
// nested objects resolve the same way in any order. -1 is air.
fn mediumAt(p: vec2f) -> i32 {
  var best = -1;
  for (var i = 0; i < i32(params.elementCount); i++) {
    if ((best < 0 || elements[i].area < elements[best].area) && containsAt(i, p)) {
      best = i;
    }
  }
  return best;
}

// Cauchy dispersion: n(λ) = ior + B·(1/λ² − 1/λref²), λ in µm. Air is 1.
fn iorAt(medium: i32, lambda: f32) -> f32 {
  if (medium < 0) { return 1.; }
  let e = elements[medium];
  let l = lambda / 1000.;
  let l0 = LAMBDA_REF / 1000.;
  return e.ior + e.dispersion * (1. / (l * l) - 1. / (l0 * l0));
}

// --- Fresnel ---
struct Scatter {
  reflected: vec2f,
  refracted: vec2f,
  R: f32, // unpolarised reflectance
  tir: bool, // total internal reflection: no refracted ray
}

// A ray d crossing from index n1 into n2 at a surface with normal n, which
// may face either way.
fn scatter(d: vec2f, normal: vec2f, n1: f32, n2: f32) -> Scatter {
  var cosI = -dot(d, normal);
  var n = normal;
  if (cosI < 0.) {
    // Orient the normal against the ray.
    cosI = -cosI;
    n = -n;
  }
  let reflected = d + 2. * cosI * n;
  let eta = n1 / n2;
  let sinT2 = eta * eta * (1. - cosI * cosI);
  if (sinT2 >= 1.) { return Scatter(reflected, vec2f(0.), 1., true); }
  let cosT = sqrt(1. - sinT2);
  let refracted = eta * d + (eta * cosI - cosT) * n;
  let rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  let rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  return Scatter(reflected, refracted, (rs * rs + rp * rp) / 2., false);
}

// --- Tracing ---
fn addSegment(a: vec2f, b: vec2f, color: vec3f) {
  let i = atomicAdd(&draw.instanceCount, 1u);
  if (i < params.capacity) {
    segments[i] = Segment(vec4f(a, b), vec4f(color, 0.));
  }
}

struct Branch {
  o: vec2f,
  d: vec2f,
  w: f32,
  depth: u32,
  medium: i32,
}

// Traces one ray of a single wavelength, drawing every segment. With
// reflections on, each surface spawns a Fresnel-weighted reflected branch.
// Every wavelength of a white ray shares the path up to the first surface,
// so only one thread draws it, in their combined color (firstColor); the
// rest pass firstColor = 0 and skip it.
fn trace(origin: vec2f, dir: vec2f, lambda: f32, rgb: vec3f, firstColor: vec3f, shareFirst: bool, seed: u32) {
  var drawFirst = true;
  var rng = seed;
  var stack: array<Branch, STACK_SIZE>;
  stack[0] = Branch(origin, dir, 1., 0u, mediumAt(origin));
  var sp = 1;
  while (sp > 0) {
    sp--;
    let branch = stack[sp];
    var o = branch.o;
    var d = branch.d;
    var w = branch.w;
    var medium = branch.medium;
    for (var depth = branch.depth; depth < MAX_SEGMENTS; depth++) {
      let hit = nearestHit(o, d);
      let found = hit.el >= 0;
      let end = select(o + d * params.far, hit.pos, found);
      if (!shareFirst || !drawFirst) {
        addSegment(o, end, rgb * w);
      } else if (any(firstColor > vec3f(0.))) {
        addSegment(o, end, firstColor);
      }
      drawFirst = false;
      if (!found) { break; }

      // The medium just past the hit decides what happens. A surface with
      // the same index on both sides (hidden inside a smaller element, or
      // between matching media) does nothing: it doesn't bend, and a
      // ground rim turns clear, as frosted glass does when wetted with a
      // matching liquid. When nothing overlaps, crossing a boundary just
      // toggles between that element and air.
      var next: i32;
      if (params.disjoint == 1u) {
        next = select(hit.el, -1, medium == hit.el);
      } else {
        next = mediumAt(hit.pos + d * RAY_EPSILON);
      }
      let n1 = iorAt(medium, lambda);
      let n2 = iorAt(next, lambda);
      if (n1 == n2) {
        medium = next;
        o = hit.pos + d * RAY_EPSILON;
        continue;
      }
      if (hit.absorb) { break; }

      let s = scatter(d, hit.normal, n1, n2);
      if (s.tir) {
        d = s.reflected; // stays in this medium
      } else {
        let wr = w * s.R;
        rng++;
        let keep = wr >= ROULETTE_WEIGHT || random(rng) * ROULETTE_WEIGHT < wr;
        if (params.reflections == 1u && keep && sp < STACK_SIZE) {
          let weight = max(wr, ROULETTE_WEIGHT);
          stack[sp] = Branch(hit.pos + s.reflected * RAY_EPSILON, s.reflected, weight, depth + 1u, medium);
          sp++;
        }
        if (params.reflections == 1u) { w *= 1. - s.R; }
        d = s.refracted;
        medium = next;
      }
      o = hit.pos + d * RAY_EPSILON;
    }
  }
}

// Ray t ∈ [0, 1) of a source: its start and direction.
fn emit(src: Source, t: f32) -> array<vec2f, 2> {
  let dir = vec2f(cos(src.angle), sin(src.angle));
  if (src.kind == 2u) {
    let a = t * 6.283185307;
    return array(src.pos, vec2f(cos(a), sin(a)));
  }
  let across = select(0., (t - 0.5) * src.width, src.kind == 0u);
  return array(src.pos + vec2f(-dir.y, dir.x) * across, dir);
}

// Fully saturated hue (h in [0, 1)), averaging (1,1,1) around the wheel.
fn hue(h: f32) -> vec3f {
  let k = (vec3f(5., 3., 1.) + h * 6.) % 6.;
  return 2. * (1. - clamp(min(k, 4. - k), vec3f(0.), vec3f(1.)));
}

fn random(id: u32) -> f32 {
  // PCG hash
  var s = id * 747796405u + params.seed * 2891336453u + 2891336453u;
  s = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  s = (s >> 22u) ^ s;
  return f32(s) / 4294967296.;
}

// Thread id's wavelength, the j-th of its ray: stratified, jittered within
// each stratum.
fn wavelength(id: u32, j: u32) -> f32 {
  return LAMBDA_MIN + (f32(j) + random(id)) / f32(params.wavelengths) * (LAMBDA_MAX - LAMBDA_MIN);
}

fn spectrumColor(id: u32, j: u32) -> vec3f {
  let lambda = wavelength(id, j);
  return spectrum[u32(round(lambda - LAMBDA_MIN))].rgb / f32(params.wavelengths);
}

// Each pass traces evenly spaced rays from each source, shifted by a
// golden-ratio sequence so successive passes fill the gaps evenly. (Random
// jitter leaves streaks along the rays, since parallel rays reuse the same
// pixel rows.)
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= params.threads) { return; }
  let ray = id / params.wavelengths;
  var src = sources[0];
  for (var i = 0u; i < params.sourceCount; i++) {
    src = sources[i];
    if (ray < src.first + src.count) { break; }
  }
  let t = (f32(ray - src.first) + params.shift) / f32(src.count);
  let path = emit(src, t);
  if (params.white == 1u) {
    let j = id % params.wavelengths;
    let rgb = spectrumColor(id, j) * src.weight;
    // The first of the ray's threads draws the shared first segment for all.
    var first = vec3f(0.);
    if (j == 0u) {
      for (var k = 0u; k < params.wavelengths; k++) {
        first += spectrumColor(id + k, k);
      }
      first *= src.weight;
    }
    trace(path[0], path[1], wavelength(id, j), rgb, first, true, id * 977u);
  } else {
    let rgb = hue(t) * src.weight;
    trace(path[0], path[1], LAMBDA_REF, rgb, rgb, false, id * 977u);
  }
}

// Atomics count every segment, even ones past the buffer's end; clamp the
// draw to what was stored.
@compute @workgroup_size(1)
fn clampCount() {
  atomicMin(&draw.instanceCount, params.capacity);
}`;

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

// 1nm table of RGBA, each channel scaled so the whole spectrum averages to
// (1,1,1): undispersed white light renders neutral.
function spectrumTable() {
  const n = LAMBDA_MAX - LAMBDA_MIN + 1;
  const table = new Float32Array(n * 4);
  const sum = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const rgb = wavelengthToRGB(LAMBDA_MIN + i);
    for (let c = 0; c < 3; c++) {
      table[i * 4 + c] = rgb[c];
      sum[c] += rgb[c];
    }
  }
  for (let i = 0; i < n * 4; i++) {
    if (i % 4 < 3) table[i] *= n / sum[i % 4];
  }
  return table;
}

// --- Scene packing ---
function packElements(elements) {
  const data = new Float32Array(Math.max(1, elements.length) * ELEMENT_FLOATS);
  const u32 = new Uint32Array(data.buffer);
  const put = (o, ...values) => data.set(values, o);
  const pt = (o, p) => put(o, p.x, p.y);
  elements.forEach((el, i) => {
    const o = i * ELEMENT_FLOATS;
    u32[o] = KINDS[el.type];
    put(o + 1, el.ior, el.dispersion, el.area, el.x, el.y);
    if (el.type === 'drop') {
      put(o + 6, el.r, el.r);
    } else if (el.type === 'prism') {
      put(o + 6, el.boundingRadius);
      const vs = el.vertices;
      vs.forEach((v, k) => {
        pt(o + 24 + k * 2, v);
        // Outward normal of edge k → k+1.
        const w = vs[(k + 1) % vs.length];
        const len = Math.hypot(w.x - v.x, w.y - v.y);
        let nx = (w.y - v.y) / len;
        let ny = -(w.x - v.x) / len;
        if ((v.x - el.x) * nx + (v.y - el.y) * ny < 0) [nx, ny] = [-nx, -ny];
        put(o + 32 + k * 2, nx, ny);
      });
    } else {
      put(o + 6, el.boundingRadius, el.H);
      pt(o + 8, el.axis);
      pt(o + 10, el.perp);
      pt(o + 12, el.c1);
      pt(o + 14, el.c2);
      put(o + 16, el.r1, el.r2, el.sign1, el.sign2, el.uMin, el.uMax);
      pt(o + 24, el.rimLT);
      pt(o + 26, el.rimRT);
      pt(o + 28, el.rimLB);
      pt(o + 30, el.rimRB);
    }
  });
  return data;
}

const boundingRadius = (el) => (el.type === 'drop' ? el.r : el.boundingRadius);

// Whether no two elements' bounding circles overlap, letting the tracer skip
// medium lookups.
const disjoint = (elements) =>
  elements.every((a, i) =>
    elements
      .slice(i + 1)
      .every(
        (b) =>
          Math.hypot(a.x - b.x, a.y - b.y) >
          boundingRadius(a) + boundingRadius(b),
      ),
  );

// Light each source emits, in "CSS px of beam": a beam of width w has power w,
// so every unobstructed beam renders at the same brightness.
function sourcePower(src) {
  if (src.type === 'beam') return src.width;
  return src.type === 'laser' ? LASER_POWER : POINT_POWER;
}

export class Tracer {
  constructor(device, capacity) {
    this.device = device;
    this.capacity = capacity;
    const module = device.createShaderModule({code: WGSL});
    const pipeline = (entryPoint) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: {module, entryPoint},
      });
    this.tracePipeline = pipeline('main');
    this.clampPipeline = pipeline('clampCount');

    // COPY_SRC lets tests read the segments back.
    const {STORAGE, UNIFORM, COPY_SRC, COPY_DST, VERTEX, INDIRECT} =
      GPUBufferUsage;
    const buffer = (size, usage) => device.createBuffer({size, usage});
    this.params = buffer(48, UNIFORM | COPY_DST);
    const table = spectrumTable();
    this.spectrum = buffer(table.byteLength, STORAGE | COPY_DST);
    device.queue.writeBuffer(this.spectrum, 0, table);
    /** Segments, read by the line pass as instanced vertex data */
    this.segments = buffer(
      capacity * SEGMENT_BYTES,
      STORAGE | VERTEX | COPY_SRC,
    );
    /** drawIndirect arguments; the instance count is the segment count */
    this.draw = buffer(16, STORAGE | INDIRECT | COPY_DST | COPY_SRC);
    this.elements = null;
    this.sources = null;
  }

  setScene(scene) {
    this.scene = scene;
    const data = packElements(scene.lenses);
    if (!this.elements || this.elements.size < data.byteLength) {
      this.elements?.destroy();
      this.elements = this.device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.bindGroups = null;
    }
    this.device.queue.writeBuffer(this.elements, 0, data);
    this.disjoint = disjoint(scene.lenses);
  }

  // Records one pass of `origins` ray origins (shared among the sources by
  // power) into the encoder: tracing, then clamping the draw count.
  // Returns how many paths it traces.
  encode(encoder, pass, origins) {
    const {device, scene} = this;
    const white = scene.light === 'White';
    const wavelengths = white ? WAVELENGTHS_PER_RAY : 1;

    const totalPower = scene.sources.reduce(
      (s, src) => s + sourcePower(src),
      0,
    );
    const srcData = new Float32Array(
      Math.max(1, scene.sources.length) * SOURCE_FLOATS,
    );
    const srcU32 = new Uint32Array(srcData.buffer);
    let rays = 0;
    scene.sources.forEach((src, i) => {
      const power = sourcePower(src);
      const count = Math.max(1, Math.round((origins * power) / totalPower));
      const o = i * SOURCE_FLOATS;
      srcU32[o] = SOURCE_KINDS[src.type];
      srcU32[o + 1] = count;
      srcU32[o + 2] = rays;
      srcData.set([src.angle, src.x, src.y, src.width, power / count], o + 3);
      rays += count;
    });
    if (!this.sources || this.sources.size < srcData.byteLength) {
      this.sources?.destroy();
      this.sources = device.createBuffer({
        size: srcData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.bindGroups = null;
    }
    device.queue.writeBuffer(this.sources, 0, srcData);

    const threads = rays * wavelengths;
    const params = new ArrayBuffer(48);
    const f32 = new Float32Array(params);
    const u32 = new Uint32Array(params);
    f32[0] = (pass * 0.6180339887) % 1;
    f32[1] = Math.max(scene.width, scene.height) * 2;
    u32[2] = (pass * 2654435761) >>> 0;
    u32[3] = +white;
    u32[4] = +scene.reflections;
    u32[5] = scene.lenses.length;
    u32[6] = scene.sources.length;
    u32[7] = threads;
    u32[8] = +this.disjoint;
    u32[9] = this.capacity;
    u32[10] = wavelengths;
    device.queue.writeBuffer(this.params, 0, params);
    // 4 vertices per segment quad, instance count reset to 0.
    device.queue.writeBuffer(this.draw, 0, new Uint32Array([4, 0, 0, 0]));

    this.bindGroups ??= [this.tracePipeline, this.clampPipeline].map((p) =>
      device.createBindGroup({
        layout: p.getBindGroupLayout(0),
        entries: [
          this.params,
          this.elements,
          this.sources,
          this.spectrum,
          this.segments,
          this.draw,
        ]
          .map((buffer, binding) => ({binding, resource: {buffer}}))
          // The clamp entry point only uses params and draw.
          .filter(
            ({binding}) => p === this.tracePipeline || [0, 5].includes(binding),
          ),
      }),
    );

    const pass_ = encoder.beginComputePass();
    if (threads && scene.sources.length) {
      pass_.setPipeline(this.tracePipeline);
      pass_.setBindGroup(0, this.bindGroups[0]);
      pass_.dispatchWorkgroups(Math.ceil(threads / 64));
    }
    pass_.setPipeline(this.clampPipeline);
    pass_.setBindGroup(0, this.bindGroups[1]);
    pass_.dispatchWorkgroups(1);
    pass_.end();
    return threads;
  }
}
