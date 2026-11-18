import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

// The Gray-Scott model, run on the GPU in WebGL2. Two chemicals, A and B, spread and react:
//   dA/dt = Da ∇²A - A B² + F (1 - A)       A is fed in at rate F
//   dB/dt = Db ∇²B + A B² - (F + k) B       B turns A into more B, and is removed at rate F + k
// Diffusion rates, grid spacing and time step are Pearson's (Science, 1993): Da = 2e-5,
// Db = 1e-5, a 2.5-unit square split into 256 cells, dt = 1. In cell units that's
// Da = 2e-5 / (2.5/256)² ≈ 0.21 and Db half that, so the F and k of his map (and of
// Munafo's Xmorphia catalog built on it) give the same patterns here.
const DA = 0.2097152;
const DB = 0.1048576;
// CSS pixels per cell, so patterns are the same size on a phone and a monitor.
const CELL_PX = 2.5;
// The square of F and k that "Map" spreads across the screen: Pearson's figure, minus its left
// quarter (k < 0.04), which is all one smooth blend of A and B.
const MAP = {kMin: 0.04, kMax: 0.07, fMin: 0, fMax: 0.08};

// F and k for each preset, mostly from Pearson's and Munafo's catalogs. Crescents and Waves
// were found by scanning for spots that keep moving, since the usual spiral settings
// (F 0.014, k 0.045) die out from these starting blobs. spacing is how far
// apart (in cells) the starting blobs are.
const presets = {
  mitosis: {
    name: 'Mitosis',
    desc: 'Spots grow and split in two, like dividing cells.',
    feed: 0.0367,
    kill: 0.0649,
    spacing: 110,
  },
  coral: {
    name: 'Coral',
    desc: 'Branches grow out and fill every gap.',
    feed: 0.0545,
    kill: 0.062,
    spacing: 90,
  },
  maze: {
    name: 'Maze',
    desc: 'Stripes wander until they lock into a labyrinth.',
    feed: 0.029,
    kill: 0.057,
    spacing: 70,
  },
  worms: {
    name: 'Worms',
    desc: 'Worms that grow and curl into loops.',
    feed: 0.078,
    kill: 0.061,
    spacing: 50,
  },
  holes: {
    name: 'Holes',
    desc: 'A sheet that spreads out, riddled with holes.',
    feed: 0.039,
    kill: 0.058,
    spacing: 80,
  },
  solitons: {
    name: 'Solitons',
    desc: 'Spots that keep their distance and stop dividing.',
    feed: 0.03,
    kill: 0.062,
    spacing: 40,
  },
  movingSpots: {
    name: 'Moving spots',
    desc: 'Spots that wander, split, and swallow each other.',
    feed: 0.014,
    kill: 0.054,
    spacing: 50,
  },
  crescents: {
    name: 'Crescents',
    desc: 'Crescents that swim, split, and wipe each other out. Never settles.',
    feed: 0.01,
    kill: 0.047,
    spacing: 50,
  },
  waves: {
    name: 'Waves',
    desc: 'Pulses that collide and break up into new ones. Never settles.',
    feed: 0.014,
    kill: 0.041,
    spacing: 70,
  },
  chaos: {
    name: 'Chaos',
    desc: 'A boiling mix of spots and stripes. Never settles.',
    feed: 0.026,
    kill: 0.051,
    spacing: 60,
  },
};

// Five colors from no B to the most B, then the color of newborn B.
const palettes = {
  Lagoon: ['#05141f', '#0b3c5d', '#1d8a99', '#e9c46a', '#fff4dc', '#ff7a59'],
  Ink: ['#f2ede2', '#d8cfbf', '#8796a4', '#2c3b55', '#101828', '#b3263a'],
  Ember: ['#080403', '#3f0c0c', '#a8301a', '#ee8a2a', '#ffe9a8', '#fff27a'],
  Glow: ['#020a04', '#0a3512', '#1d8a2b', '#86e36d', '#ecffe0', '#e4ff3a'],
  Orchid: ['#170a22', '#461656', '#a2327a', '#ef7b88', '#ffe2d2', '#6fdcff'],
};
const tourOrder = [
  'mitosis',
  'coral',
  'crescents',
  'worms',
  'maze',
  'waves',
  'holes',
  'movingSpots',
  'solitons',
  'chaos',
];

// Drift: how far F wanders along the dashed line (where the patterns are), and how far k
// wanders off it, at drift 1.
const DRIFT_F = 0.012;
const DRIFT_K = 0.0015;
// Simulation steps per unit of the drift and stirring fields' time, so they change slowly
// next to the patterns: one swirl takes tens of thousands of steps.
const FIELD_STEPS = 10000;
// How long trails take to fade and how long newborn B keeps its color, in steps.
const TRAIL_STEPS = 2500;
const YOUTH_STEPS = 5000;

const params = {
  preset: 'mitosis',
  feed: presets.mitosis.feed,
  kill: presets.mitosis.kill,
  map: false,
  speed: 20,
  palette: 'Lagoon',
  drift: 0.5,
  stir: 0.4,
  history: 0.7,
  relief: 0.6,
  tour: true,
  brush: 12,
  eraser: false,
  paused: false,
};

const defaults = {...params};

// URL hash state, like #coral&palette=Ink, #F=0.031&k=0.06, or #map
const readHash = () => {
  for (const part of location.hash.slice(1).split('&')) {
    const [key, value] = part.split('=');
    if (presets[key]) {
      params.preset = key;
      params.feed = presets[key].feed;
      params.kill = presets[key].kill;
    } else if (key === 'F' && isFinite(value)) params.feed = +value;
    else if (key === 'k' && isFinite(value)) params.kill = +value;
    else if (key === 'palette' && palettes[value]) params.palette = value;
    else if (key === 'map') params.map = true;
    else if (['drift', 'stir', 'history'].includes(key) && isFinite(value))
      params[key] = Math.min(1, Math.max(0, +value));
  }
};
let hashTimer;
const writeHash = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    // where F and k are headed, if they're still gliding toward a preset
    const {feed, kill} = target ?? params;
    const p = presets[params.preset];
    const parts =
      p && p.feed === feed && p.kill === kill
        ? [params.preset]
        : [`F=${+feed.toFixed(4)}`, `k=${+kill.toFixed(4)}`];
    if (params.palette !== 'Lagoon') parts.push(`palette=${params.palette}`);
    if (params.map) parts.push('map');
    for (const key of ['drift', 'stir', 'history'])
      if (params[key] !== defaults[key])
        parts.push(`${key}=${+params[key].toFixed(2)}`);
    history.replaceState(null, '', '#' + parts.join('&'));
  }, 300);
};
readHash();

const canvas = document.getElementById('sim');
const hint = document.getElementById('hint');
const card = document.getElementById('card');
const fail = (message) => {
  const error = document.getElementById('error');
  error.textContent = message;
  error.hidden = false;
  canvas.remove();
  hint.remove();
  card.remove();
  throw new Error(message);
};

const gl = canvas.getContext('webgl2', {antialias: false});
if (!gl) fail('This needs WebGL2, which this browser doesn’t have.');
// Prefer 32-bit floats; half floats are enough to look right if that's all there is.
const full = gl.getExtension('EXT_color_buffer_float');
const half = full || gl.getExtension('EXT_color_buffer_half_float');
if (!half) fail('This needs a GPU that can render to floating point textures.');
const format = full ? gl.RGBA32F : gl.RGBA16F;

const vertexShader = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0, 1); }`;

const header = `#version 300 es
precision highp float;
uniform highp sampler2D state;
uniform bool mapMode;
uniform vec4 mapRange; // kMin, kMax, fMin, fMax
out vec4 color;
ivec2 size() { return textureSize(state, 0); }
// The screen wraps around like a torus, except on the map, where F and k change across it,
// so its edges are walls instead.
vec4 at(ivec2 p) {
  ivec2 n = size();
  return texelFetch(state, mapMode ? clamp(p, ivec2(0), n - 1) : (p % n + n) % n, 0);
}
// F and k at a point on the map, given as a fraction of the way across
vec2 mapFK(vec2 f) { return vec2(mix(mapRange.z, mapRange.w, f.y), mix(mapRange.x, mapRange.y, f.x)); }
float hash(vec2 p, float seed) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }

uniform float time, drift; // time in units of FIELD_STEPS
uniform vec2 fk;
const float TAU = 6.28318531;
// A smooth field from -1 to 1 that slowly wanders and wraps around with the screen (u is the
// fraction of the way across). It's nested sines rather than hashed noise so main.js can compute
// the same thing for the card.
float wander(vec2 u, float t, vec4 c) {
  vec2 a = TAU * u;
  return 0.5 * (sin(a.x + c.x * t + 1.3 * sin(a.y + c.y * t)) + sin(a.y - c.z * t + 1.3 * sin(a.x - c.w * t + 1.0)));
}
// The saddle-node line, k = √F/2 - F
float lineK(float f) { return sqrt(f) / 2.0 - f; }
// F and k at u. With drift, F slides along the dashed line and k keeps its distance from it,
// plus a little, so each part of the screen sits in a slightly different, slowly changing regime.
vec2 fkAt(vec2 u) {
  if (mapMode) return mapFK(u);
  if (drift == 0.0) return fk;
  float f = clamp(fk.x + drift * ${DRIFT_F} * wander(u, time, vec4(0.7, 0.5, 0.6, 0.4)), 0.008, 0.08);
  return vec2(f, lineK(f) + fk.y - lineK(fk.x) + drift * ${DRIFT_K} * wander(u + 0.37, time, vec4(0.5, 0.8, 0.4, 0.7)));
}
`;

// x and y are A and B. z is a fading memory of B, for trails. w is when (in steps) B last
// appeared here, or -1 if it's absent, to color newborn B.
const stepShader = `${header}
uniform float da, db, clock;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 old = at(p);
  vec2 s = old.xy;
  // isotropic 9-point Laplacian, so spots come out round instead of square
  vec2 lap = (4.0 * (at(p + ivec2(1, 0)).xy + at(p - ivec2(1, 0)).xy + at(p + ivec2(0, 1)).xy + at(p - ivec2(0, 1)).xy)
    + at(p + ivec2(1, 1)).xy + at(p - ivec2(1, 1)).xy + at(p + ivec2(1, -1)).xy + at(p - ivec2(1, -1)).xy
    - 20.0 * s) / 6.0;
  vec2 f = fkAt(gl_FragCoord.xy / vec2(size()));
  float r = s.x * s.y * s.y;
  s = clamp(s + vec2(da * lap.x - r + f.x * (1.0 - s.x), db * lap.y + r - (f.x + f.y) * s.y), 0.0, 1.0);
  float birth = s.y > 0.1 ? (old.w < 0.0 ? clock : old.w) : s.y < 0.06 ? -1.0 : old.w;
  color = vec4(s, max(s.y, old.z - 0.4 / ${TRAIL_STEPS}.0), birth);
}`;

// Blobs of A = 1/2, B = 1/2, a little noisy, in a sea of pure A. (Pearson started from one
// 20-cell square with B = 1/4; blobs this small need more B, or at high F they fade away.) Blobs are scattered on a jittered grid, so any cell only checks the nine nearest.
// keep adds them to what's already there instead of starting over.
const seedShader = `${header}
uniform float seed, spacing;
uniform bool keep;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 s = keep ? at(ivec2(p)) : vec4(1, 0, 0, -1);
  vec2 cell = floor(p / spacing);
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 c = cell + vec2(x, y);
      if (hash(c, seed) > 0.6) continue;
      vec2 center = (c + vec2(hash(c + 0.3, seed), hash(c + 0.7, seed))) * spacing;
      if (length(p - center) < mix(4.0, 0.2 * spacing, hash(c + 0.5, seed)))
        s = vec4(0.5 + 0.04 * hash(p, seed), 0.5 + 0.04 * hash(p + 0.1, seed), s.z, -1);
    }
  color = s;
}`;

// Paints a capsule from a to b: seeds the reaction, or wipes back to pure A.
const brushShader = `${header}
uniform vec2 a, b;
uniform float radius, seed;
uniform bool erase;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 s = at(ivec2(p));
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  if (length(p - a - t * ab) < radius)
    s = erase ? vec4(1, 0, s.z, -1) : vec4(0.5 + 0.1 * hash(p, seed), 0.5 + 0.1 * hash(p + 0.1, seed), s.z, -1);
  color = s;
}`;

// Tiles the old grid onto a new one when the window changes size, so patterns keep their size.
const copyShader = `${header}
void main() { color = at(ivec2(gl_FragCoord.xy)); }`;

// Stirring: carries everything along a slowly swirling flow, traced back one frame's worth of
// steps at a time (doing it every step would blur the pattern far more). The flow is the curl
// of a wandering stream function, so it neither piles chemicals up nor thins them out.
const advectShader = `${header}
uniform float amount; // cells moved per frame at the fastest
float psi(vec2 u) { return wander(u, time, vec4(0.3, 0.45, 0.35, 0.25)); }
void main() {
  vec2 p = gl_FragCoord.xy, n = vec2(size()), u = p / n;
  const float e = 0.002;
  vec2 g = vec2(psi(u + vec2(e, 0)) - psi(u - vec2(e, 0)), psi(u + vec2(0, e)) - psi(u - vec2(0, e))) / (2.0 * e);
  vec2 v = vec2(g.y / n.y, -g.x / n.x) * sqrt(n.x * n.y) / (2.0 * TAU);
  vec2 q = p - amount * v - 0.5;
  ivec2 i = ivec2(floor(q));
  vec2 t = q - floor(q);
  vec4 s = mix(mix(at(i), at(i + ivec2(1, 0)), t.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), t.x), t.y);
  // when B appeared can't be averaged, so take the nearest cell's
  color = vec4(s.xyz, at(ivec2(floor(q + 0.5))).w);
}`;

// The most B in each of 16x16 blocks, read back now and then to notice when B has died out.
const probeShader = `${header}
void main() {
  ivec2 n = size(), o = ivec2(gl_FragCoord.xy), lo = o * n / 16, hi = (o + 1) * n / 16;
  float m = 0.0;
  for (int y = lo.y; y < hi.y; y += 2)
    for (int x = lo.x; x < hi.x; x += 2) m = max(m, texelFetch(state, ivec2(x, y), 0).y);
  color = vec4(m, 0, 0, 1);
}`;

const displayShader = `${header}
uniform vec2 scale;
uniform vec3 pal[6];
uniform float relief, history, clock;
vec4 sampleAt(vec2 p) {
  p -= 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 t = p - floor(p);
  return mix(mix(at(i), at(i + ivec2(1, 0)), t.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), t.x), t.y);
}
// how much B there is, 0 to 1, which picks the color and is the height for the relief
float tone(vec2 p) { return clamp(sampleAt(p).y / 0.45, 0.0, 1.0); }
vec3 ramp(float t) {
  float x = t * 4.0;
  int i = min(int(x), 3);
  return mix(pal[i], pal[i + 1], x - float(i));
}
void main() {
  vec2 p = gl_FragCoord.xy * scale;
  vec4 s = sampleAt(p);
  float t = clamp(s.y / 0.45, 0.0, 1.0);
  vec3 c = ramp(t);
  // trails: where B was a moment ago but isn't now
  float ghost = clamp((s.z - s.y) / 0.45, 0.0, 1.0);
  c = mix(c, ramp(0.5), history * 0.55 * ghost);
  // newborn B glows in the accent color and fades to the palette
  float birth = at(ivec2(p)).w;
  if (birth >= 0.0) {
    float youth = exp(-(clock - birth) / ${YOUTH_STEPS}.0);
    c = mix(c, pal[5], history * 0.75 * youth * t);
  }
  // lit from the upper left, as if B were raised up off the page
  vec2 g = vec2(tone(p + vec2(1, 0)) - tone(p - vec2(1, 0)), tone(p + vec2(0, 1)) - tone(p - vec2(0, 1)));
  vec3 n = normalize(vec3(-2.5 * g, 1));
  vec3 l = normalize(vec3(-0.6, 0.6, 0.55));
  float shade = max(dot(n, l), 0.0) / l.z;
  float spec = pow(max(dot(n, normalize(l + vec3(0, 0, 1))), 0.0), 60.0);
  c = c * mix(1.0, 0.35 + 0.65 * shade, relief) + relief * 0.35 * spec;
  if (mapMode) {
    // the saddle-node line k = √F/2 - F: to its right, pure A is the only uniform state
    vec2 f = mapFK(p / vec2(size()));
    float d = f.y - (sqrt(f.x) / 2.0 - f.x);
    if (abs(d) < 1.2 * fwidth(d) && mod(gl_FragCoord.x + gl_FragCoord.y, 16.0) < 9.0) c = mix(c, vec3(1), 0.7);
  }
  color = vec4(c, 1);
}`;

const compile = (type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    fail('Shader failed to compile: ' + gl.getShaderInfoLog(shader));
  return shader;
};
const program = (source) => {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, source));
  gl.bindAttribLocation(p, 0, 'pos');
  gl.linkProgram(p);
  const uniforms = {};
  const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const {name, type} = gl.getActiveUniform(p, i);
    uniforms[name.replace('[0]', '')] = {
      location: gl.getUniformLocation(p, name),
      type,
    };
  }
  // run(target, {uniform: value}) draws a full screen triangle into target (null: the screen)
  return (target, values) => {
    gl.useProgram(p);
    for (const [name, value] of Object.entries(values)) {
      const u = uniforms[name];
      if (!u) continue;
      if (u.type === gl.INT || u.type === gl.SAMPLER_2D || u.type === gl.BOOL)
        gl.uniform1i(u.location, value);
      else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.location, value);
      else if (u.type === gl.FLOAT_VEC3) gl.uniform3fv(u.location, value);
      else if (u.type === gl.FLOAT_VEC4) gl.uniform4fv(u.location, value);
      else gl.uniform1f(u.location, value);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fb ?? null);
    if (target) gl.viewport(0, 0, target.width, target.height);
    else gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
};

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 3, -1, -1, 3]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const runStep = program(stepShader);
const runSeed = program(seedShader);
const runBrush = program(brushShader);
const runCopy = program(copyShader);
const runAdvect = program(advectShader);
const runProbe = program(probeShader);
const runDisplay = program(displayShader);

const makeTarget = (width, height) => {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    format,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    null,
  );
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    fail('This GPU can’t render to floating point textures.');
  return {tex, fb, width, height};
};
const free = (t) => {
  gl.deleteTexture(t.tex);
  gl.deleteFramebuffer(t.fb);
};
const probe = makeTarget(16, 16);

// Phones drop the GPU context when the page sits in the background for a while.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());

let state, next;
let clock = 0; // simulation steps so far
const mapRange = [MAP.kMin, MAP.kMax, MAP.fMin, MAP.fMax];
// Uniforms most shaders share.
const common = () => ({
  state: 0,
  mapMode: params.map,
  mapRange,
  fk: [params.feed, params.kill],
  drift: params.drift,
  time: clock / FIELD_STEPS,
  clock,
});
// Runs a shader that reads the state and writes the next one, then swaps them.
const pass = (run, values = {}) => {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.tex);
  run(next, {...common(), ...values});
  [state, next] = [next, state];
};
// Blobs at least spacing cells apart, but closer on a small screen, so a phone gets enough of
// them to look alive from the start.
const seed = (keep, spacing) =>
  pass(runSeed, {
    keep,
    spacing: Math.min(spacing, Math.sqrt((state.width * state.height) / 25)),
    seed: Math.random() * 100,
  });

const resize = () => {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  const width = Math.max(1, Math.round(innerWidth / CELL_PX));
  const height = Math.max(1, Math.round(innerHeight / CELL_PX));
  if (state && state.width === width && state.height === height) return;
  const old = state;
  state = makeTarget(width, height);
  next = makeTarget(width, height);
  if (old) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, old.tex);
    runCopy(state, {state: 0, mapMode: params.map, mapRange});
    free(old);
  } else seed(false, params.map ? 24 : presets[params.preset].spacing);
};
resize();
addEventListener('resize', resize);

// Where on the screen (in cells, y up) a pointer is.
const toCell = (e) => [
  (e.clientX / innerWidth) * state.width,
  (1 - e.clientY / innerHeight) * state.height,
];
// F and k at a spot on the map, given as a fraction of the way across and up
const mapAt = (fx, fy) => ({
  feed: MAP.fMin + fy * (MAP.fMax - MAP.fMin),
  kill: MAP.kMin + fx * (MAP.kMax - MAP.kMin),
});

// The preset closest to F and k, if any is close.
const nearestPreset = (feed, kill) => {
  let best;
  let bestD = 0.03;
  for (const [key, p] of Object.entries(presets)) {
    const d = Math.hypot(
      (p.feed - feed) / (MAP.fMax - MAP.fMin),
      (p.kill - kill) / (MAP.kMax - MAP.kMin),
    );
    if (d < bestD) [best, bestD] = [key, d];
  }
  return best;
};

// The same drift field as fkAt in the shaders, to show on the card which F and k are on screen.
const TAU = 2 * Math.PI;
const wander = (ux, uy, t, c) => {
  const ax = TAU * ux;
  const ay = TAU * uy;
  return (
    0.5 *
    (Math.sin(ax + c[0] * t + 1.3 * Math.sin(ay + c[1] * t)) +
      Math.sin(ay - c[2] * t + 1.3 * Math.sin(ax - c[3] * t + 1)))
  );
};
const lineK = (f) => Math.sqrt(f) / 2 - f;
const fkAt = (ux, uy) => {
  const t = clock / FIELD_STEPS;
  const {feed, kill, drift} = params;
  const f = Math.min(
    0.08,
    Math.max(
      0.008,
      feed + drift * DRIFT_F * wander(ux, uy, t, [0.7, 0.5, 0.6, 0.4]),
    ),
  );
  return {
    feed: f,
    kill:
      lineK(f) +
      kill -
      lineK(feed) +
      drift * DRIFT_K * wander(ux + 0.37, uy + 0.37, t, [0.5, 0.8, 0.4, 0.7]),
  };
};

// The info card: which pattern this is, and where it sits on the map.
const nameEl = document.getElementById('name');
const descEl = document.getElementById('desc');
const fEl = document.getElementById('fVal');
const kEl = document.getElementById('kVal');
const mapCanvas = document.getElementById('map');
const mapCtx = mapCanvas.getContext('2d');
const mapImage = new Image();
mapImage.src = 'map.webp';
mapImage.onload = () => drawCard();
let hover = null; // a spot under the pointer on the big map, which the card shows instead

const drawCard = () => {
  const {feed, kill} = hover ?? params;
  // while gliding to a preset, name the preset it's headed for
  const aim = hover ?? target ?? params;
  const key = nearestPreset(aim.feed, aim.kill);
  if (hover) {
    nameEl.textContent = key ? presets[key].name : 'Map';
    descEl.textContent = 'Tap to use this spot’s F and k everywhere.';
  } else if (params.map) {
    nameEl.textContent = 'Every F and k at once';
    descEl.textContent =
      'F rises upward, k to the right. Tap a spot to use it everywhere.';
  } else {
    nameEl.textContent = key ? presets[key].name : 'Custom';
    descEl.textContent = key
      ? presets[key].desc
      : 'Drag on the map below, or try a preset.';
  }
  // With drift, sample F and k across the screen, to plot and to give their range.
  const drifting = !hover && !params.map && params.drift > 0;
  const samples = [];
  if (drifting)
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 8; j++)
        samples.push(fkAt((i + 0.5) / 12, (j + 0.5) / 8));
  const range = (key, digits) => {
    const values = samples.map((s) => s[key]);
    return `${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}`;
  };
  fEl.textContent = drifting ? `F ${range('feed', 3)}` : `F ${feed.toFixed(4)}`;
  kEl.textContent = drifting ? `k ${range('kill', 3)}` : `k ${kill.toFixed(4)}`;

  const dpr = Math.min(devicePixelRatio, 2);
  const w = (mapCanvas.width = Math.round(mapCanvas.clientWidth * dpr));
  const h = (mapCanvas.height = Math.round(mapCanvas.clientHeight * dpr));
  const x = (k) => ((k - MAP.kMin) / (MAP.kMax - MAP.kMin)) * w;
  const y = (f) => (1 - (f - MAP.fMin) / (MAP.fMax - MAP.fMin)) * h;
  mapCtx.fillStyle = '#0b2233';
  mapCtx.fillRect(0, 0, w, h);
  if (mapImage.complete && mapImage.naturalWidth) {
    mapCtx.globalAlpha = 0.85;
    mapCtx.drawImage(mapImage, 0, 0, w, h);
    mapCtx.globalAlpha = 1;
  }
  // the saddle-node line, as on the big map
  mapCtx.setLineDash([3 * dpr, 3 * dpr]);
  mapCtx.strokeStyle = 'rgba(255,255,255,.6)';
  mapCtx.lineWidth = dpr;
  mapCtx.beginPath();
  for (let f = MAP.fMin; f <= MAP.fMax; f += 0.0005)
    mapCtx.lineTo(x(Math.sqrt(f) / 2 - f), y(f));
  mapCtx.stroke();
  mapCtx.setLineDash([]);
  for (const [k, p] of Object.entries(presets)) {
    mapCtx.fillStyle = k === key ? '#fff' : 'rgba(255,255,255,.55)';
    mapCtx.beginPath();
    mapCtx.arc(x(p.kill), y(p.feed), 2.2 * dpr, 0, 2 * Math.PI);
    mapCtx.fill();
  }
  mapCtx.fillStyle = 'rgba(255,207,90,.8)';
  for (const s of samples) {
    mapCtx.beginPath();
    mapCtx.arc(x(s.kill), y(s.feed), 1.3 * dpr, 0, 2 * Math.PI);
    mapCtx.fill();
  }
  mapCtx.strokeStyle = '#ffcf5a';
  mapCtx.lineWidth = 2 * dpr;
  mapCtx.beginPath();
  mapCtx.arc(x(kill), y(feed), 5 * dpr, 0, 2 * Math.PI);
  mapCtx.stroke();
  mapCtx.fillStyle = 'rgba(255,255,255,.7)';
  mapCtx.font = `${10 * dpr}px sans-serif`;
  mapCtx.fillText('F ↑', 4 * dpr, 12 * dpr);
  mapCtx.textAlign = 'right';
  mapCtx.fillText('k →', w - 4 * dpr, h - 5 * dpr);
};

// Moving F and k toward a preset over a second or so, instead of jumping.
let target = null;
let deadChecks = 0;
let aliveChecks = 0;
let draggingMap = false;
const setFK = (feed, kill) => {
  target = null;
  params.feed = Math.round(feed * 1e4) / 1e4;
  params.kill = Math.round(kill * 1e4) / 1e4;
  params.preset = nearestPreset(feed, kill) ?? '';
  drawCard();
  writeHash();
};
const choosePreset = (key) => {
  const p = presets[key];
  params.preset = key;
  if (params.map) setMap(false);
  target = {feed: p.feed, kill: p.kill};
  seed(true, p.spacing);
  drawCard();
  writeHash();
};
const setMap = (on) => {
  params.map = on;
  hover = null;
  if (on) seed(false, 24);
  else seed(true, presets[params.preset]?.spacing ?? 60);
  drawCard();
  writeHash();
};

// After a while with no input, tour the presets and palettes. Any input takes back control, and
// once someone has touched it, it waits longer before touring again.
const TOUR_IDLE_MS = 20000;
const TOUR_IDLE_AFTER_INPUT_MS = 90000;
let hadInput = false;
const TOUR_STEP_MS = 25000;
let lastInput = performance.now();
let touring = false;
let tourNext = 0;
let tourCount = 0;
const noteInput = () => {
  lastInput = performance.now();
  hadInput = true;
  if (touring) {
    touring = false;
    hideHint();
  }
};
for (const type of ['pointerdown', 'keydown', 'wheel'])
  addEventListener(type, noteInput, true);
const tour = (now) => {
  if (!params.tour || params.map || params.paused) return;
  const idle = hadInput ? TOUR_IDLE_AFTER_INPUT_MS : TOUR_IDLE_MS;
  if (!touring && now - lastInput > idle) {
    touring = true;
    tourNext = now;
    showHint('Touring the patterns · touch to take over');
    setTimeout(() => touring && hideHint(), 4000);
  }
  if (!touring || now < tourNext) return;
  tourNext = now + TOUR_STEP_MS;
  const i = tourOrder.indexOf(params.preset);
  if (++tourCount % 2 === 0) {
    const names = Object.keys(palettes);
    params.palette = names[(names.indexOf(params.palette) + 1) % names.length];
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
  choosePreset(tourOrder[(i + 1) % tourOrder.length]);
};

const showHint = (text) => {
  hint.textContent = text;
  hint.classList.remove('gone');
};
const hideHint = () => hint.classList.add('gone');

// Dragging on the card's map sets F and k.
mapCanvas.addEventListener('pointerdown', (e) => {
  mapCanvas.setPointerCapture(e.pointerId);
  draggingMap = true;
  if (params.map) setMap(false);
  dragMap(e);
});
const dragMap = (e) => {
  if (!mapCanvas.hasPointerCapture(e.pointerId)) return;
  const r = mapCanvas.getBoundingClientRect();
  const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const fy = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
  const {feed, kill} = mapAt(fx, fy);
  setFK(feed, kill);
};
mapCanvas.addEventListener('pointermove', dragMap);
for (const type of ['pointerup', 'pointercancel'])
  mapCanvas.addEventListener(type, () => (draggingMap = false));

// Painting on the screen. On the big map, a tap picks that spot's F and k instead.
const pointers = new Map();
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const erase = params.eraser || e.button === 2 || e.shiftKey || e.altKey;
  pointers.set(e.pointerId, {
    last: toCell(e),
    start: [e.clientX, e.clientY],
    painting: !params.map,
    erase,
  });
  if (!params.map) paint(e);
  hideHint();
});
const paint = (e) => {
  const p = pointers.get(e.pointerId);
  const cell = toCell(e);
  pass(runBrush, {
    a: p.last,
    b: cell,
    radius: params.brush / CELL_PX,
    erase: p.erase,
    seed: Math.random() * 100,
  });
  p.last = cell;
};
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (params.map && (!p || !p.painting)) {
    hover = mapAt(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
    drawCard();
  }
  if (!p) return;
  if (!p.painting)
    p.painting =
      Math.hypot(e.clientX - p.start[0], e.clientY - p.start[1]) > 10;
  if (p.painting) paint(e);
});
canvas.addEventListener('pointerup', (e) => {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (p && !p.painting && params.map) {
    const {feed, kill} = mapAt(
      e.clientX / innerWidth,
      1 - e.clientY / innerHeight,
    );
    params.map = false;
    hover = null;
    setFK(feed, kill);
  }
});
canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
canvas.addEventListener('pointerleave', () => {
  if (hover) {
    hover = null;
    drawCard();
  }
});
// Listening in the capture phase, since lil-gui stops keys from bubbling up past its buttons.
addEventListener(
  'keydown',
  (e) => {
    if (e.target.closest?.('input, select, textarea')) return;
    if (e.key === ' ') params.paused = !params.paused;
    else if (e.key === 'm') setMap(!params.map);
    else return;
    e.preventDefault();
  },
  true,
);

const presetOptions = Object.fromEntries(
  Object.entries(presets).map(([key, p]) => [p.name, key]),
);
const gui = new GUI({title: 'Reaction Diffusion'});
gui
  .add(params, 'preset', presetOptions)
  .name('Pattern')
  .listen()
  .onChange(choosePreset);
gui
  .add(params, 'feed', 0, 0.1, 0.0001)
  .name('Feed rate F')
  .decimals(4)
  .listen()
  .onChange(() => setFK(params.feed, params.kill));
gui
  .add(params, 'kill', 0.03, 0.075, 0.0001)
  .name('Kill rate k')
  .decimals(4)
  .listen()
  .onChange(() => setFK(params.feed, params.kill));
gui
  .add(params, 'map')
  .name('Map of every F, k')
  .listen()
  .onChange((on) => setMap(on));
gui.add(params, 'speed', 1, 100, 1).name('Speed (steps/frame)');
gui
  .add(params, 'drift', 0, 1)
  .name('Drift F and k')
  .onChange(() => {
    drawCard();
    writeHash();
  });
gui.add(params, 'stir', 0, 1).name('Stir').onChange(writeHash);
gui.add(params, 'history', 0, 1).name('Trails & growth').onChange(writeHash);
gui
  .add(params, 'palette', Object.keys(palettes))
  .name('Colors')
  .onChange(writeHash);
gui.add(params, 'relief', 0, 1).name('Relief');
gui.add(params, 'tour').name('Tour when idle');
gui.add(params, 'brush', 3, 60, 1).name('Brush size (px)');
gui.add(params, 'eraser').name('Brush erases');
gui
  .add(
    {
      restart: () =>
        seed(false, params.map ? 24 : (presets[params.preset]?.spacing ?? 60)),
    },
    'restart',
  )
  .name('Restart');
gui
  .add(
    {
      surprise: () => {
        const keys = Object.keys(presets).filter((k) => k !== params.preset);
        const key = keys[Math.floor(Math.random() * keys.length)];
        const names = Object.keys(palettes).filter((p) => p !== params.palette);
        params.palette = names[Math.floor(Math.random() * names.length)];
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
        choosePreset(key);
      },
    },
    'surprise',
  )
  .name('Surprise me');
gui.add(params, 'paused').name('Pause (space)').listen();
if (innerWidth < 600) gui.close();

// Palette colors fade from one set to the next.
const hexToRgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const shownPalette = palettes[params.palette].flatMap(hexToRgb);

const probeData = new Float32Array(16 * 16 * 4);
let frame = 0;
let lastTime = performance.now();
let owed = 0;
const loop = (time) => {
  const dt = Math.min(time - lastTime, 50);
  lastTime = time;

  if (target) {
    const a = Math.min(1, dt / 250);
    params.feed += (target.feed - params.feed) * a;
    params.kill += (target.kill - params.kill) * a;
    if (
      Math.abs(target.feed - params.feed) < 1e-5 &&
      Math.abs(target.kill - params.kill) < 1e-5
    ) {
      Object.assign(params, target);
      target = null;
    }
    drawCard();
  }

  if (!params.paused) {
    owed += (params.speed * dt) / (1000 / 60);
    const steps = Math.floor(owed);
    owed -= steps;
    for (let i = 0; i < steps; i++) {
      pass(runStep, {da: DA, db: DB});
      clock++;
    }
    if (params.stir > 0 && !params.map && steps)
      pass(runAdvect, {amount: params.stir * 0.04 * steps});
    if (params.drift > 0 && !params.map && frame % 15 === 0 && !target)
      drawCard();

    // Twice a second, check whether B is gone everywhere, which would otherwise just be a blank
    // screen. If it stays gone, scatter fresh seeds, which also shows that nothing survives here.
    if (++frame % 30 === 0) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.tex);
      runProbe(probe, {state: 0, mapMode: params.map, mapRange});
      gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.FLOAT, probeData);
      let most = 0;
      for (let i = 0; i < probeData.length; i += 4)
        most = Math.max(most, probeData[i]);
      if (most < 0.002) {
        aliveChecks = 0;
        if (++deadChecks === 1)
          showHint('Nothing survives at this F and k. Reseeding…');
        if (deadChecks >= 3 && !draggingMap) {
          seed(true, presets[params.preset]?.spacing ?? 60);
          deadChecks = 0;
        }
      } else {
        deadChecks = 0;
        if (++aliveChecks === 6 && hint.textContent.startsWith('Nothing'))
          hideHint();
      }
    }
  }

  const goal = palettes[params.palette].flatMap(hexToRgb);
  for (let i = 0; i < goal.length; i++)
    shownPalette[i] += (goal[i] - shownPalette[i]) * Math.min(1, dt / 120);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.tex);
  tour(time);
  runDisplay(null, {
    ...common(),
    // when B appeared needs full floats to keep counting steps
    history: full ? params.history : 0,
    scale: [state.width / canvas.width, state.height / canvas.height],
    pal: shownPalette,
    relief: params.relief,
  });
  requestAnimationFrame(loop);
};

drawCard();
addEventListener('resize', drawCard);
if (params.map) setMap(true);
showHint(
  matchMedia('(pointer: coarse)').matches
    ? 'Drag to paint'
    : 'Drag to paint · right-drag to erase',
);
setTimeout(() => deadChecks || hideHint(), 6000);
requestAnimationFrame(loop);
