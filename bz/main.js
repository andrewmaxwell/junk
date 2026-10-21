import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

// Two models of the Belousov-Zhabotinsky reaction, both run on the GPU in WebGL2.
//
// Oregonator (Tyson-Fife two-variable form), the standard model of the real chemistry:
//   du/dt = (u - u² - f v (u - q) / (u + q)) / ε + ∇²u     u: HBrO2, the autocatalyst
//   dv/dt = u - v                                          v: oxidized catalyst (ferriin, blue)
// For q = 0.002 the resting state is stable (an excitable medium: spirals) when f is above
// about 2.4, and oscillates on its own below that, down to f = 0.5. Pacemakers, like the dust
// specks that start target rings in a real dish, are spots where f is 1 so they oscillate.
// The state texture holds u, v, and how much of a pacemaker each cell is.
//
// Turner's "BZ reaction in a nutshell" (2009): three species that eat each other
// rock-paper-scissors style, averaged over each 3x3 neighborhood every generation. It's a toy,
// not chemistry, but it makes a similar dense tangle of spirals.

const Q = 0.002;
const EPSILON = 0.05;
const presets = {
  spirals: {model: 'oregonator', f: 3, seeds: 'broken'},
  targets: {model: 'oregonator', f: 3, seeds: 'pacemakers'},
  nutshell: {model: 'nutshell', alpha: 1.2, beta: 1, gamma: 1},
};
const presetNames = {
  Spirals: 'spirals',
  'Target rings': 'targets',
  'Nutshell (Turner 2009)': 'nutshell',
};
// Oregonator grid spacing and time step, in the model's dimensionless units. dt stays under the
// explicit diffusion limit (0.375 dx² for this stencil); the stiff reaction is solved implicitly.
const DX = 0.3;
const DT = 0.01;
// At speed 1, model time units per second (one oscillation takes about 5) and nutshell
// generations per second.
const RATE = {oregonator: 2.5 / DT, nutshell: 60};
// The Oregonator grid scales with the screen, so a phone and a monitor both frame a handful of
// spirals (about a million cells). The nutshell's waves are only three cells long, so its cells
// are a whole number of pixels across, or they shimmer with moiré.
const OREGONATOR_CELLS_ACROSS = 700;
const MAX_NUTSHELL_CELLS = 2_000_000;

const params = {
  preset: 'spirals',
  ...presets.spirals,
  alpha: 1.2,
  beta: 1,
  gamma: 1,
  speed: 1,
  colors: 'dish',
  seed: 1,
};

// URL hash state, like #oscillating&f=1.2&seed=7
const readHash = () => {
  const parts = location.hash.slice(1).split('&').filter(Boolean);
  const name = parts.find((p) => !p.includes('=') && presets[p]);
  if (name) Object.assign(params, {preset: name}, presets[name]);
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!(key in params) || value === undefined) continue;
    params[key] = typeof params[key] === 'number' ? Number(value) : value;
  }
};
const writeHash = () => {
  const keys =
    params.model === 'oregonator' ? ['f'] : ['alpha', 'beta', 'gamma'];
  const parts = [params.preset, `seed=${params.seed}`];
  for (const key of keys)
    if (params[key] !== presets[params.preset][key])
      parts.push(`${key}=${+params[key].toFixed(3)}`);
  if (params.speed !== 1) parts.push(`speed=${params.speed}`);
  if (params.colors !== 'dish') parts.push(`colors=${params.colors}`);
  history.replaceState(null, '', '#' + parts.join('&'));
};
readHash();

const canvas = document.querySelector('canvas');
const hint = document.getElementById('hint');
const fail = (message) => {
  const error = document.getElementById('error');
  error.textContent = message;
  error.hidden = false;
  canvas.remove();
  hint.remove();
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
out vec4 color;
ivec2 size() { return textureSize(state, 0); }
// clamping at the edges makes them walls that nothing flows through, like the edge of a dish
vec4 at(ivec2 p) { return texelFetch(state, clamp(p, ivec2(0), size() - 1), 0); }
`;

const stepShader = `${header}
uniform int model;
uniform float f, epsilon, q, dt, invDx2, alpha, beta, gamma;
const float pacemakerF = 1.0;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 s = at(p);
  if (model == 0) {
    // isotropic 9-point Laplacian, so spirals come out round instead of square
    float lap = (4.0 * (at(p + ivec2(1, 0)).x + at(p - ivec2(1, 0)).x + at(p + ivec2(0, 1)).x + at(p - ivec2(0, 1)).x)
      + at(p + ivec2(1, 1)).x + at(p - ivec2(1, 1)).x + at(p + ivec2(1, -1)).x + at(p - ivec2(1, -1)).x
      - 20.0 * s.x) * invDx2 / 6.0;
    float u = s.x, v = s.y, b = u + dt * lap, w = u;
    float fHere = mix(f, pacemakerF, s.z);
    // backward Euler for the reaction (it's too stiff to step explicitly), by Newton's method
    for (int i = 0; i < 4; i++) {
      float r = w - w * w - fHere * v * (w - q) / (w + q);
      float dr = 1.0 - 2.0 * w - 2.0 * fHere * v * q / ((w + q) * (w + q));
      w = max(0.0, w - (w - b - dt / epsilon * r) / (1.0 - dt / epsilon * dr));
    }
    color = vec4(w, v + dt * (u - v), s.z, 1);
  } else {
    vec3 sum = vec3(0);
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) sum += at(p + ivec2(x, y)).rgb;
    vec3 c = sum / 9.0;
    color = vec4(clamp(c + c * vec3(alpha * c.g - gamma * c.b, beta * c.b - alpha * c.r, gamma * c.r - beta * c.g), 0.0, 1.0), 1);
  }
}`;

// Paints a capsule from a to b: mode 0 wipes the reaction back to rest, 1 sets it off.
const brushShader = `${header}
uniform int model, mode;
uniform vec2 a, b;
uniform float radius, rest, seed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 s = at(ivec2(p));
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  if (length(p - a - t * ab) < radius) {
    if (model == 0) s = mode == 0 ? vec4(rest, rest, s.z, 1) : vec4(0.9, s.yzw);
    else s = mode == 0 ? vec4(0, 0, 0, 1) : vec4(hash(p), hash(p + 0.1), hash(p + 0.2), 1);
  }
  color = s;
}`;

// Resamples the old grid onto a new one when the window changes size.
const copyShader = `${header}
uniform vec2 scale;
void main() { color = at(ivec2(gl_FragCoord.xy * scale)); }`;

const displayShader = `${header}
uniform int model, palette;
uniform vec2 scale;
uniform float vScale;
vec4 sampleAt(vec2 p) {
  p -= 0.5;
  ivec2 i = ivec2(floor(p));
  vec2 t = p - floor(p);
  return mix(mix(at(i), at(i + ivec2(1, 0)), t.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), t.x), t.y);
}
void main() {
  vec2 p = gl_FragCoord.xy * scale;
  vec4 s = sampleAt(p);
  vec3 c;
  if (model == 0) {
    float v = clamp(s.y / vScale, 0.0, 1.0);
    float u = clamp(s.x * 1.5, 0.0, 1.0);
    if (palette == 0) {
      // the ferroin indicator: red-orange when reduced, blue when oxidized,
      // lit from the upper left as if the waves were a little raised
      vec2 g = vec2(sampleAt(p + vec2(1, 0)).y - sampleAt(p - vec2(1, 0)).y,
                    sampleAt(p + vec2(0, 1)).y - sampleAt(p - vec2(0, 1)).y) / vScale;
      float light = 0.9 + 0.6 * dot(g, vec2(-0.7, 0.7));
      c = mix(vec3(0.82, 0.27, 0.12), vec3(0.12, 0.25, 0.72), smoothstep(0.2, 0.8, v));
      c = c * light + vec3(0.55, 0.75, 1.0) * u;
    } else {
      c = vec3(0.6, 0.1, 0.9) * v * v + vec3(0.2, 0.9, 1.0) * u;
    }
  } else {
    vec3 w = s.rgb;
    c = palette == 0
      ? (w.r * vec3(0.85, 0.3, 0.14) + w.g * vec3(0.12, 0.25, 0.72) + w.b * vec3(0.98, 0.85, 0.62)) / max(w.r + w.g + w.b, 0.05)
      : w;
  }
  // a gentle vignette, like looking down into a dish
  vec2 d = p / vec2(size()) - 0.5;
  c *= 1.0 - 0.35 * dot(d, d);
  color = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 1.1)), 1);
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
    uniforms[name] = {location: gl.getUniformLocation(p, name), type};
  }
  // run(target, {uniform: value}) draws a full screen triangle into target (null: the screen)
  return (target, values) => {
    gl.useProgram(p);
    for (const [name, value] of Object.entries(values)) {
      const u = uniforms[name];
      if (!u) continue;
      if (u.type === gl.INT || u.type === gl.SAMPLER_2D)
        gl.uniform1i(u.location, value);
      else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.location, value);
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
const runBrush = program(brushShader);
const runCopy = program(copyShader);
const runDisplay = program(displayShader);

const makeTarget = (width, height, data = null) => {
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
    data,
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
gl.deleteTexture(makeTarget(1, 1).tex); // fail now, before showing any controls

// Phones drop the GPU context when the page sits in the background for a while.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());

// The resting state of the Oregonator, where u = v and the reaction term is zero.
const restState = (f) => {
  let lo = Q;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (1 - m > (f * (m - Q)) / (m + Q)) lo = m;
    else hi = m;
  }
  return lo;
};

const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Starting chemistry, from params.seed so a link reproduces it.
const initialState = (width, height) => {
  const random = mulberry32(params.seed);
  const data = new Float32Array(width * height * 4);
  if (params.model === 'nutshell') {
    for (let i = 0; i < data.length; i++) data[i] = i % 4 === 3 ? 1 : random();
    return data;
  }
  const rest = restState(params.f);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rest;
    data[i * 4 + 1] = rest;
  }
  if (params.seeds === 'pacemakers') {
    const count = Math.max(2, Math.round((width * height * DX * DX) / 5000));
    for (let k = 0; k < count; k++) {
      const cx = random() * width;
      const cy = random() * height;
      const r = (2.5 + 1.5 * random()) / DX;
      for (let y = Math.max(0, (cy - r) | 0); y < Math.min(height, cy + r); y++)
        for (
          let x = Math.max(0, (cx - r) | 0);
          x < Math.min(width, cx + r);
          x++
        )
          if ((x - cx) ** 2 + (y - cy) ** 2 < r * r)
            data[(y * width + x) * 4 + 2] = 1;
    }
    return data;
  }
  // Broken wavefronts: a strip of excited u with recovering v behind it. Their free ends curl
  // up into pairs of spirals, which is how spirals form in a real dish.
  const count = Math.max(2, Math.round((width * height * DX * DX) / 2500));
  for (let k = 0; k < count; k++) {
    const cx = random() * width;
    const cy = random() * height;
    const angle = random() * 2 * Math.PI;
    const length = (20 + 25 * random()) / DX;
    const [nx, ny] = [Math.cos(angle), Math.sin(angle)];
    const r = length / 2 + 4 / DX;
    for (let y = Math.max(0, (cy - r) | 0); y < Math.min(height, cy + r); y++) {
      for (
        let x = Math.max(0, (cx - r) | 0);
        x < Math.min(width, cx + r);
        x++
      ) {
        const along = (x - cx) * -ny + (y - cy) * nx;
        const across = ((x - cx) * nx + (y - cy) * ny) * DX;
        if (Math.abs(along) > length / 2 || across < -3 || across > 0.6)
          continue;
        const i = (y * width + x) * 4;
        if (across > 0) data[i] = 0.8;
        else data[i + 1] = Math.max(data[i + 1], 0.2 * (1 + across / 3));
      }
    }
  }
  return data;
};

let cellPx; // CSS pixels per grid cell
let state;
let next;
const cellSize = () =>
  params.model === 'oregonator'
    ? Math.min(innerWidth, innerHeight) / OREGONATOR_CELLS_ACROSS
    : Math.ceil(Math.sqrt((innerWidth * innerHeight) / MAX_NUTSHELL_CELLS));

const restart = () => {
  cellPx = cellSize();
  const width = Math.max(1, Math.ceil(innerWidth / cellPx));
  const height = Math.max(1, Math.ceil(innerHeight / cellPx));
  for (const t of [state, next]) if (t) gl.deleteTexture(t.tex);
  state = makeTarget(width, height, initialState(width, height));
  next = makeTarget(width, height);
  writeHash();
};

const resize = () => {
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  if (!state) return restart();
  cellPx = cellSize();
  const width = Math.max(1, Math.ceil(innerWidth / cellPx));
  const height = Math.max(1, Math.ceil(innerHeight / cellPx));
  if (width === state.width && height === state.height) return;
  const old = state;
  state = makeTarget(width, height);
  gl.bindTexture(gl.TEXTURE_2D, old.tex);
  runCopy(state, {scale: [old.width / width, old.height / height]});
  gl.deleteTexture(old.tex);
  gl.deleteTexture(next.tex);
  next = makeTarget(width, height);
};

const pass = (run, values) => {
  gl.bindTexture(gl.TEXTURE_2D, state.tex);
  run(next, values);
  [state, next] = [next, state];
};

// Pointers: dragging wipes a stroke back to rest, which breaks any wave it crosses. A tap
// without dragging sets off a new wave.
const strokes = [];
const pointers = new Map();
const toGrid = (e) => [e.clientX / cellPx, (innerHeight - e.clientY) / cellPx];
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {
    start: [e.clientX, e.clientY],
    last: toGrid(e),
    dragging: false,
  });
  hint.classList.add('gone');
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (
    !p.dragging &&
    Math.hypot(e.clientX - p.start[0], e.clientY - p.start[1]) < 6
  )
    return;
  p.dragging = true;
  const point = toGrid(e);
  strokes.push({mode: 0, a: p.last, b: point, radius: 14 / cellPx});
  p.last = point;
});
const release = (e) => {
  const p = pointers.get(e.pointerId);
  if (p && !p.dragging)
    strokes.push({mode: 1, a: p.last, b: p.last, radius: 10 / cellPx});
  pointers.delete(e.pointerId);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));

let lastFrame = performance.now();
let pending = 0;
const frame = () => {
  const oregonator = params.model === 'oregonator';
  const model = oregonator ? 0 : 1;
  const rest = oregonator ? restState(params.f) : 0;
  for (const s of strokes.splice(0))
    pass(runBrush, {model, ...s, rest, seed: Math.random() * 100});
  // step by the clock, not the frame rate, and slow down rather than pile up behind a slow GPU
  const now = performance.now();
  pending +=
    (params.speed * RATE[params.model] * Math.min(now - lastFrame, 50)) / 1000;
  lastFrame = now;
  const steps = Math.floor(pending);
  pending -= steps;
  const values = {
    model,
    f: params.f,
    epsilon: EPSILON,
    q: Q,
    dt: DT,
    invDx2: 1 / (DX * DX),
    alpha: params.alpha,
    beta: params.beta,
    gamma: params.gamma,
  };
  for (let i = 0; i < steps; i++) pass(runStep, values);
  gl.bindTexture(gl.TEXTURE_2D, state.tex);
  runDisplay(null, {
    model,
    palette: params.colors === 'dish' ? 0 : 1,
    scale: [state.width / canvas.width, state.height / canvas.height],
    vScale: 0.15,
  });
  requestAnimationFrame(frame);
};

const gui = new GUI({title: 'Oscillating Reaction'});
if (innerWidth < 600) gui.close();
gui.add(params, 'preset', presetNames).onChange((name) => {
  Object.assign(params, presets[name]);
  showControls();
  restart();
});
const controllers = {
  f: gui.add(params, 'f', 0.5, 4, 0.01).name('f (below 2.4 it oscillates)'),
  alpha: gui.add(params, 'alpha', 0, 2, 0.01).name('α (red eats green)'),
  beta: gui.add(params, 'beta', 0, 2, 0.01).name('β (green eats blue)'),
  gamma: gui.add(params, 'gamma', 0, 2, 0.01).name('γ (blue eats red)'),
};
const showControls = () => {
  const oregonator = params.model === 'oregonator';
  controllers.f.show(oregonator);
  for (const key of ['alpha', 'beta', 'gamma'])
    controllers[key].show(!oregonator);
  hint.textContent = oregonator
    ? 'Drag to break a wave · tap to start one'
    : 'Drag to clear a path · tap to drop fresh chemicals';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};
for (const c of Object.values(controllers)) c.onChange(writeHash);
gui.add(params, 'speed', 0, 4, 0.1).onChange(writeHash);
gui
  .add(params, 'colors', {'Ferroin dish': 'dish', Neon: 'neon'})
  .onChange(writeHash);
gui
  .add(
    {
      restart: () => {
        params.seed = Math.floor(Math.random() * 1e6);
        restart();
      },
    },
    'restart',
  )
  .name('restart');

addEventListener('resize', resize);
addEventListener('hashchange', () => {
  readHash();
  showControls();
  restart();
});
showControls();
resize();
setTimeout(() => hint.classList.add('gone'), 8000);
frame();
