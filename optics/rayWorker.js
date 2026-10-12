import {contains, distSq} from './geometry.js';

// Rays are traced on the CPU in CSS pixels; the GPU adds their segments into a
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

// --- Math helpers ---
const dot = (a, b) => a.x * b.x + a.y * b.y;

// True if a point satisfies one surface's solid-side constraint.
// Convex (sign > 0): inside the circle. Concave (sign < 0): outside it.
function surfaceOK(pt, center, r, sign) {
  const d = distSq(pt, center);
  return sign > 0
    ? d <= r * r + INTERSECTION_SLACK
    : d >= r * r - INTERSECTION_SLACK;
}

function getIntersections(lens, ray) {
  if (lens.type === 'drop') return dropHits(lens, ray);
  const ocX = ray.o.x - lens.x;
  const ocY = ray.o.y - lens.y;
  const bHalf = ocX * ray.d.x + ocY * ray.d.y;
  const bC = ocX * ocX + ocY * ocY - lens.boundingRadius * lens.boundingRadius;
  if (bC > 0 && bHalf > 0) return [];
  if (bHalf * bHalf - bC < 0) return [];

  const hits = [];

  // Left surface faces −axis; right surface faces +axis.
  // prettier-ignore
  checkSurface(lens, ray, hits, lens.c1, lens.r1, lens.sign1, lens.c2, lens.r2, lens.sign2, -1);
  // prettier-ignore
  checkSurface(lens, ray, hits, lens.c2, lens.r2, lens.sign2, lens.c1, lens.r1, lens.sign1, 1);

  // Cylindrical rim segments absorb any ray that enters through the edge.
  rimHit(ray, lens.rimLT, lens.rimRT, hits);
  rimHit(ray, lens.rimLB, lens.rimRB, hits);

  return hits;
}

// A droplet is a plain circle; its outward normal points away from the center.
function dropHits(drop, ray) {
  const dx = ray.o.x - drop.x;
  const dy = ray.o.y - drop.y;
  const b = dx * ray.d.x + dy * ray.d.y;
  const disc = b * b - (dx * dx + dy * dy - drop.r * drop.r);
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const hits = [];
  for (const t of [-b - sq, -b + sq]) {
    if (t <= RAY_EPSILON) continue;
    const pt = {x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t};
    const normal = {x: (pt.x - drop.x) / drop.r, y: (pt.y - drop.y) / drop.r};
    hits.push({t, pt, normal, absorb: false});
  }
  return hits;
}

// Curved-surface intersection. `faceAxial` is +1 if the surface's outward
// normal should point along +axis (right surface) or −1 (left surface).
// prettier-ignore
function checkSurface(lens, ray, hits, cc, cr, sign, oc, ocr, oSign, faceAxial) {
  const {axis, perp, H} = lens;
  const dx = ray.o.x - cc.x;
  const dy = ray.o.y - cc.y;
  const b = 2 * (dx * ray.d.x + dy * ray.d.y);
  const c = dx * dx + dy * dy - cr * cr;
  const disc = b * b - 4 * c;
  if (disc < 0) return;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / 2, (-b + sq) / 2]) {
    if (t <= RAY_EPSILON) continue;
    const pt = {x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t};
    const v = (pt.x - lens.x) * perp.x + (pt.y - lens.y) * perp.y;
    if (Math.abs(v) > H + INTERSECTION_SLACK) continue;
    if (!surfaceOK(pt, oc, ocr, oSign)) continue;
    // Outward normal (away from the glass): for a convex surface that's
    // away from the circle center, for concave it's toward it — hence ·sign.
    const n = {x: ((pt.x - cc.x) / cr) * sign, y: ((pt.y - cc.y) / cr) * sign};
    const outwardAxial = n.x * axis.x + n.y * axis.y;
    // Keep only the branch whose outward normal faces this surface's side.
    if (faceAxial < 0 ? outwardAxial > 0.02 : outwardAxial < -0.02) continue;
    const absorb = Math.abs(v) >= H - 3;
    hits.push({t, pt, normal: n, absorb});
  }
}

// Ray vs. a rim line segment (a→b). Any hit absorbs the ray.
function rimHit(ray, a, b, hits) {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = ray.d.x * ey - ray.d.y * ex;
  if (Math.abs(denom) < 1e-9) return; // parallel
  const wx = a.x - ray.o.x;
  const wy = a.y - ray.o.y;
  const t = (wx * ey - wy * ex) / denom;
  const s = (wx * ray.d.y - wy * ray.d.x) / denom;
  if (t <= RAY_EPSILON || s < 0 || s > 1) return;
  const pt = {x: ray.o.x + ray.d.x * t, y: ray.o.y + ray.d.y * t};
  hits.push({t, pt, normal: {x: 0, y: 0}, absorb: true});
}

// Splits a ray crossing from index n1 into n2 into reflected and refracted
// directions, with the unpolarised Fresnel reflectance R. `normal` may face
// either way. Total internal reflection has no refracted ray and R = 1.
function scatter(d, normal, n1, n2) {
  // Orient the normal against the ray.
  let cosI = -dot(d, normal);
  let N = normal;
  if (cosI < 0) {
    cosI = -cosI;
    N = {x: -normal.x, y: -normal.y};
  }
  const reflected = {x: d.x + 2 * cosI * N.x, y: d.y + 2 * cosI * N.y};
  const eta = n1 / n2;
  const sinT2 = eta * eta * (1 - cosI * cosI);
  if (sinT2 >= 1) return {reflected, refracted: null, R: 1};

  const cosT = Math.sqrt(1 - sinT2);
  const refracted = {
    x: eta * d.x + (eta * cosI - cosT) * N.x,
    y: eta * d.y + (eta * cosI - cosT) * N.y,
  };
  const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rp = (n1 * cosT - n2 * cosI) / (n1 * cosT + n2 * cosI);
  return {reflected, refracted, R: (rs * rs + rp * rp) / 2};
}

// --- Segments ---
// Each pass collects its ray segments (CSS px) here, 7 floats apiece:
// x0, y0, x1, y1, r, g, b. The GPU then draws them all in one call.
const SEG_FLOATS = 7;
let segs = new Float32Array(SEG_FLOATS * 65536);
let segCount = 0;

function addLine(a, b, r, g, bl) {
  if (segCount * SEG_FLOATS === segs.length) {
    const bigger = new Float32Array(segs.length * 2);
    bigger.set(segs);
    segs = bigger;
  }
  const i = segCount++ * SEG_FLOATS;
  segs[i] = a.x;
  segs[i + 1] = a.y;
  segs[i + 2] = b.x;
  segs[i + 3] = b.y;
  segs[i + 4] = r;
  segs[i + 5] = g;
  segs[i + 6] = bl;
}

// --- Tracing ---
function nearestHit(lenses, ray) {
  let best = null;
  for (const lens of lenses) {
    for (const hit of getIntersections(lens, ray)) {
      if (!best || hit.t < best.t) best = hit;
    }
  }
  return best;
}

// The medium at a point: where elements overlap, the smallest one wins, so
// nested objects (a lens in a droplet in a lens) resolve the same way in any
// order. null is air.
function mediumAt(lenses, pt) {
  let best = null;
  for (const l of lenses) {
    if ((!best || l.area < best.area) && contains(l, pt)) best = l;
  }
  return best;
}

const nAt = (medium, lambda) => (medium ? iorAt(medium, lambda) : 1);

// A point just past `pt` along d (or just before it, with sign -1).
const offset = (pt, d, sign = 1) => ({
  x: pt.x + sign * d.x * RAY_EPSILON,
  y: pt.y + sign * d.y * RAY_EPSILON,
});

// Where a ray that hits nothing is drawn to: well past the screen edge.
const farPoint = (o, d, far) => ({x: o.x + d.x * far, y: o.y + d.y * far});

// Traces one ray of a single wavelength, drawing every segment. With
// reflections on, each surface spawns a Fresnel-weighted reflected branch.
// `firstHit` means the caller already found and drew the first segment.
function traceRay(scene, origin, dir, lambda, rgb, far, firstHit = null) {
  const stack = [{o: origin, d: dir, w: 1, depth: 0}];
  let known = firstHit;
  while (stack.length) {
    let {o, d, w, depth} = stack.pop();
    for (; depth < MAX_SEGMENTS; depth++) {
      const hit = known ?? nearestHit(scene.lenses, {o, d});
      if (!known) {
        const end = hit ? hit.pt : farPoint(o, d, far);
        addLine(o, end, rgb[0] * w, rgb[1] * w, rgb[2] * w);
      }
      known = null;
      if (!hit) break;
      // Look just before and after the hit. A surface with the same index
      // on both sides (hidden inside a smaller element, or between matching
      // media) does nothing: it doesn't bend, and a ground rim turns clear,
      // just as frosted glass does when wetted with a matching liquid.
      const n1 = nAt(mediumAt(scene.lenses, offset(hit.pt, d, -1)), lambda);
      const n2 = nAt(mediumAt(scene.lenses, offset(hit.pt, d)), lambda);
      if (n1 === n2) {
        o = offset(hit.pt, d);
        continue;
      }
      if (hit.absorb) break;

      const {reflected, refracted, R} = scatter(d, hit.normal, n1, n2);
      if (!refracted) {
        d = reflected;
      } else {
        if (scene.reflections && w * R > MIN_WEIGHT) {
          const branch = {o: offset(hit.pt, reflected), d: reflected};
          stack.push({...branch, w: w * R, depth: depth + 1});
        }
        if (scene.reflections) w *= 1 - R;
        d = refracted;
      }
      o = offset(hit.pt, d);
    }
  }
}

// Cauchy dispersion: n(λ) = ior + B·(1/λ² − 1/λref²), λ in µm. Each element
// carries its own material's ior and B.
function iorAt(material, lambdaNm) {
  const l = lambdaNm / 1000;
  return (
    material.ior + material.dispersion * (1 / (l * l) - 1 / LAMBDA_REF ** 2)
  );
}

// Light each source emits, in "CSS px of beam": a beam of width w has power w,
// so every unobstructed beam renders at the same brightness.
function sourcePower(src) {
  if (src.type === 'beam') return src.width;
  return src.type === 'laser' ? LASER_POWER : POINT_POWER;
}

// Ray `t` ∈ [0, 1) of a source: its start, direction, and rainbow hue.
function emit(src, t) {
  const c = Math.cos(src.angle);
  const s = Math.sin(src.angle);
  if (src.type === 'point') {
    const a = t * 2 * Math.PI;
    return {o: {x: src.x, y: src.y}, d: {x: Math.cos(a), y: Math.sin(a)}};
  }
  const across = src.type === 'beam' ? (t - 0.5) * src.width : 0;
  return {o: {x: src.x - across * s, y: src.y + across * c}, d: {x: c, y: s}};
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

function traceOrigin(scene, {o, d}, t, weight, far) {
  if (scene.light !== 'White') {
    const rgb = hueToRGB(t).map((v) => v * weight);
    traceRay(scene, o, d, LAMBDA_REF * 1000, rgb, far); // base IOR
    return;
  }
  // Stratified wavelengths, jittered within each stratum.
  const samples = [];
  const sum = [0, 0, 0];
  for (let j = 0; j < WAVELENGTHS_PER_RAY; j++) {
    const lambda =
      LAMBDA_MIN +
      ((j + Math.random()) / WAVELENGTHS_PER_RAY) * (LAMBDA_MAX - LAMBDA_MIN);
    const k = Math.round(lambda - LAMBDA_MIN) * 3;
    const rgb = [0, 1, 2].map(
      (c) => (SPECTRUM[k + c] * weight) / WAVELENGTHS_PER_RAY,
    );
    for (let c = 0; c < 3; c++) sum[c] += rgb[c];
    samples.push({lambda, rgb});
  }
  // Every wavelength shares the path up to the first surface, so draw
  // that segment once (the costly part for rays that miss every lens).
  const hit = nearestHit(scene.lenses, {o, d});
  addLine(o, hit ? hit.pt : farPoint(o, d, far), ...sum);
  if (!hit) return;
  for (const {lambda, rgb} of samples) {
    traceRay(scene, o, d, lambda, rgb, far, hit);
  }
}

// --- GPU ---
// Segments are drawn as thin quads with a tent profile across them, added
// into a float texture (`accum`). Presenting runs a few full-screen passes:
// bright parts → quarter-res bloom → blur → an even blurrier wide bloom, then
// a composite that adds bloom, tone maps, vignettes and dithers.

const LINE_VS = `#version 300 es
layout(location = 0) in vec2 corner; // (along 0..1, across -1..1)
layout(location = 1) in vec4 seg; // endpoints, CSS px
layout(location = 2) in vec3 color;
uniform vec2 res; // CSS px
uniform float halfWidth; // CSS px
out float across;
out vec3 vColor;
void main() {
  vec2 d = seg.zw - seg.xy;
  float len = length(d);
  vec2 dir = len > 0.0 ? d / len : vec2(1.0, 0.0);
  vec2 p = mix(seg.xy, seg.zw, corner.x) + vec2(-dir.y, dir.x) * corner.y * halfWidth;
  across = corner.y;
  vColor = color;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
}`;

// The tent integrates to 1 per CSS px across the line, so a beam of
// evenly spaced rays with weight = spacing accumulates to exactly 1.
const LINE_FS = `#version 300 es
precision highp float;
in float across;
in vec3 vColor;
uniform float halfWidth;
out vec4 outColor;
void main() {
  outColor = vec4(vColor * (1.0 - abs(across)) / halfWidth, 0.0);
}`;

// One triangle covering the screen.
const FULLSCREEN_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Averages each `factor`×`factor` block of light above the threshold.
const BRIGHT_FS = `#version 300 es
precision highp float;
uniform sampler2D accum;
uniform float scale;
uniform float threshold;
uniform int factor;
out vec4 outColor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * factor;
  ivec2 last = textureSize(accum, 0) - 1;
  vec3 sum = vec3(0.0);
  for (int y = 0; y < factor; y++) {
    for (int x = 0; x < factor; x++) {
      vec3 v = texelFetch(accum, min(base + ivec2(x, y), last), 0).rgb * scale;
      sum += max(v - threshold, 0.0);
    }
  }
  outColor = vec4(sum / float(factor * factor), 1.0);
}`;

// Separable Gaussian, σ = 3 texels along `dir`.
const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 dir;
out vec4 outColor;
void main() {
  vec2 texel = 1.0 / vec2(textureSize(src, 0));
  vec2 uv = gl_FragCoord.xy * texel;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -9; i <= 9; i++) {
    float w = exp(-float(i * i) / 18.0);
    sum += texture(src, uv + dir * texel * float(i)).rgb * w;
    total += w;
  }
  outColor = vec4(sum / total, 1.0);
}`;

// 4× smaller: four bilinear taps cover a 4×4 block.
const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D src;
out vec4 outColor;
void main() {
  vec2 texel = 1.0 / vec2(textureSize(src, 0));
  vec2 uv = gl_FragCoord.xy * 4.0 * texel;
  vec3 sum = texture(src, uv + texel * vec2(-1.0, -1.0)).rgb
           + texture(src, uv + texel * vec2(1.0, -1.0)).rgb
           + texture(src, uv + texel * vec2(-1.0, 1.0)).rgb
           + texture(src, uv + texel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(sum / 4.0, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D accum;
uniform sampler2D bloom;
uniform sampler2D wide;
uniform float scale;
uniform vec2 bloomAmount; // narrow, wide
out vec4 outColor;

// AgX (Troy Sobotka; polynomial fit by Benjamin Wrensch). Unlike per-channel
// curves it keeps hues steady as they brighten and lets saturated highlights
// fade gracefully to white. Input is linear sRGB; output is display-encoded.
vec3 agxContrast(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
       - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 toneMap(vec3 c) {
  const mat3 inset = mat3(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outset = mat3(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  c = clamp(log2(max(inset * c, 1e-10)), minEv, maxEv);
  c = agxContrast((c - minEv) / (maxEv - minEv));
  return clamp(outset * c, 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 res = vec2(textureSize(accum, 0));
  vec2 uv = gl_FragCoord.xy / res;
  vec3 hdr = texelFetch(accum, ivec2(gl_FragCoord.xy), 0).rgb * scale;
  hdr += texture(bloom, uv).rgb * bloomAmount.x + texture(wide, uv).rgb * bloomAmount.y;
  vec3 c = toneMap(hdr);

  // Vignette: darken toward the corners.
  float r = length((uv - 0.5) * res) / (0.6 * length(res));
  c *= 1.0 - 0.52 * pow(smoothstep(0.42, 1.0, r), 1.5);

  // Dither away 8-bit banding in the smooth gradients.
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}`;

const BLOOM_NARROW = 0.8;
const BLOOM_WIDE = 0.5;

let gl = null;
let glCanvas = null;
let programs = null;
let lineVAO = null;
let segBuffer = null;
let emptyVAO = null;
let accum = null; // {tex, fb}
let bloomA = null;
let bloomB = null;
let wideA = null;
let wideB = null;
let accumFormat = 0;
let bloomFactor = 1; // device px per bloom px
let W = 0; // device pixels
let H = 0;
let dpr = 1;

function compile(vsSource, fsSource) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vsSource],
    [gl.FRAGMENT_SHADER, fsSource],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  // Look up every uniform once.
  const uniforms = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const {name} = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return {program, uniforms};
}

function initGL(canvas) {
  glCanvas = canvas;
  gl = canvas.getContext('webgl2', {antialias: false, depth: false});
  if (!gl) throw new Error('WebGL2 isn’t available');
  // Float render targets; blending into 32-bit floats needs EXT_float_blend,
  // otherwise fall back to half floats (blendable everywhere).
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('this GPU can’t render to float textures');
  }
  accumFormat = gl.getExtension('EXT_float_blend') ? gl.RGBA32F : gl.RGBA16F;

  programs = {
    line: compile(LINE_VS, LINE_FS),
    bright: compile(FULLSCREEN_VS, BRIGHT_FS),
    blur: compile(FULLSCREEN_VS, BLUR_FS),
    down: compile(FULLSCREEN_VS, DOWN_FS),
    composite: compile(FULLSCREEN_VS, COMPOSITE_FS),
  };

  lineVAO = gl.createVertexArray();
  gl.bindVertexArray(lineVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  // prettier-ignore
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  segBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
  const stride = SEG_FLOATS * 4;
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 16);
  gl.vertexAttribDivisor(2, 1);
  emptyVAO = gl.createVertexArray();
  gl.bindVertexArray(null);
}

function target(w, h, format, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  // prettier-ignore
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return {tex, fb, w, h};
}

function resizeTargets() {
  for (const t of [accum, bloomA, bloomB, wideA, wideB]) {
    if (!t) continue;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fb);
  }
  glCanvas.width = W;
  glCanvas.height = H;
  accum = target(W, H, accumFormat, gl.NEAREST);
  bloomFactor = Math.max(1, Math.round(BLOOM_DOWNSAMPLE * dpr));
  const f = bloomFactor;
  const bw = Math.ceil(W / f);
  const bh = Math.ceil(H / f);
  bloomA = target(bw, bh, gl.RGBA16F, gl.LINEAR);
  bloomB = target(bw, bh, gl.RGBA16F, gl.LINEAR);
  const ww = Math.ceil(bw / 4);
  const wh = Math.ceil(bh / 4);
  wideA = target(ww, wh, gl.RGBA16F, gl.LINEAR);
  wideB = target(ww, wh, gl.RGBA16F, gl.LINEAR);
}

function clearAccum() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fb);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

// Adds this pass's segments into `accum`.
function drawSegments(scene) {
  const {program, uniforms} = programs.line;
  gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fb);
  gl.viewport(0, 0, W, H);
  gl.useProgram(program);
  gl.uniform2f(uniforms.res, scene.width, scene.height);
  gl.uniform1f(uniforms.halfWidth, 1 / dpr); // one device px each side
  gl.bindVertexArray(lineVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    segs.subarray(0, segCount * SEG_FLOATS),
    gl.STREAM_DRAW,
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segCount);
  gl.disable(gl.BLEND);
  segCount = 0;
}

function fullscreen(name, dst, inputs, setUniforms) {
  const {program, uniforms} = programs[name];
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
  gl.useProgram(program);
  Object.entries(inputs).forEach(([uniform, t], i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(uniforms[uniform], i);
  });
  setUniforms?.(uniforms);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function blur(a, b) {
  fullscreen('blur', b, {src: a}, (u) => gl.uniform2f(u.dir, 1, 0));
  fullscreen('blur', a, {src: b}, (u) => gl.uniform2f(u.dir, 0, 1));
}

// An unobstructed beam accumulates 1 per pass; `scale` averages the passes
// and applies exposure.
function present(passes, exposure) {
  const scale = exposure / passes;
  fullscreen('bright', bloomA, {accum}, (u) => {
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.threshold, BLOOM_THRESHOLD);
    gl.uniform1i(u.factor, bloomFactor);
  });
  blur(bloomA, bloomB);
  fullscreen('down', wideA, {src: bloomA});
  blur(wideA, wideB);
  fullscreen('composite', null, {accum, bloom: bloomA, wide: wideA}, (u) => {
    gl.uniform1f(u.scale, scale);
    gl.uniform2f(u.bloomAmount, BLOOM_NARROW, BLOOM_WIDE);
  });
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
  if (dirty) {
    dpr = scene.dpr;
    const w = Math.round(scene.width * dpr);
    const h = Math.round(scene.height * dpr);
    if (w !== W || h !== H) {
      W = w;
      H = h;
      resizeTargets();
    }
    clearAccum();
    passes = 0;
    dirty = false;
  }
  renderPass(scene, passes);
  drawSegments(scene);
  passes++;
  present(passes, exposure);
  if (passes < MAX_PASSES) schedule();
}

function schedule() {
  if (!timer) timer = setTimeout(step, 0);
}

self.onmessage = ({data}) => {
  if (data.canvas) {
    try {
      initGL(data.canvas);
    } catch (e) {
      gl = null;
      self.postMessage({error: e.message});
    }
    return;
  }
  if (!gl) return; // no renderer; the page already shows why
  exposure = data.exposure;
  if (data.scene) {
    scene = data.scene;
    dirty = true;
    schedule();
  } else if (passes) {
    present(passes, exposure); // exposure-only change: no re-trace
  }
};
