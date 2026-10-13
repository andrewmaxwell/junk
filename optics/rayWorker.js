// Renders the light. tracer.js traces rays on the GPU into a segment buffer;
// this draws the segments into a float texture at device resolution, adding
// one pass after another so the image keeps refining while the scene is
// still. Every animation frame then presents it: bloom and tone mapping,
// then drifting dust that catches the light.
//
// The canvas is always rgba16float. In HDR its tone mapping is 'extended', so
// values over 1 show brighter than white (see anotherRaytracer).

import {Tracer, SEGMENT_BYTES, WAVELENGTHS_PER_RAY} from './tracer.js';

const MAX_PASSES = 250;
// Each pass traces as many rays as fit in about this long, adapting to the
// GPU; the first pass after a change is what you see while dragging.
const TARGET_PASS_MS = 16;
const START_ORIGINS = 4000;
const MIN_ORIGINS = 256;
const SEGMENT_CAPACITY = 1 << 21; // 64MB of segments
const SEGMENTS_PER_PATH = 16; // generous, to keep passes inside the capacity
const BLOOM_THRESHOLD = 0.25;
const BLOOM_PX = 4; // bloom resolution, in CSS px (roughly)
const BLOOM_NARROW = 0.8;
const BLOOM_WIDE = 0.5;
const DUST_AREA_PER_SPECK = 2500; // CSS px²
const ACCUM_FALLBACK = 'rgba16float'; // when 32-bit floats can't be blended
const FLOAT16 = 'rgba16float';
const CANVAS_FORMAT = 'rgba16float';

// --- Shaders ---
const LINE_WGSL = /* wgsl */ `
struct Uniforms { res: vec2f, halfWidth: f32 } // CSS px
@group(0) @binding(0) var<uniform> u: Uniforms;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
}

// One instance per segment (see Segment in tracer.js).
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

// Half resolution: averages each 2×2 block of light above the threshold.
// (One coherent read of every texel; the bilinear downsamples take it from
// there.)
const BRIGHT_WGSL = /* wgsl */ `
struct Uniforms { scale: f32, threshold: f32 }
@group(0) @binding(0) var accum: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: Uniforms;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let base = vec2i(pos.xy) * 2;
  let last = vec2i(textureDimensions(accum)) - 1;
  var sum = vec3f(0.);
  for (var k = 0; k < 4; k++) {
    let v = textureLoad(accum, min(base + vec2i(k & 1, k >> 1), last), 0).rgb * u.scale;
    sum += max(v - u.threshold, vec3f(0.));
  }
  return vec4f(sum / 4., 1.);
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

// factor× smaller (2 or 4): each factor×factor block, averaged with
// bilinear taps that each cover 2×2 texels.
const DOWN_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var<uniform> factor: u32;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(src));
  let n = i32(factor / 2u);
  let corner = floor(pos.xy) * f32(factor);
  var sum = vec3f(0.);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      let center = corner + vec2f(f32(x), f32(y)) * 2. + 1.;
      sum += textureSampleLevel(src, linearSampler, center / size, 0.).rgb;
    }
  }
  return vec4f(sum / f32(n * n), 1.);
}`;

// Adds a finished pass (16-bit, cheap to draw lines into) into the 32-bit
// running total.
const ADD_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return textureLoad(src, vec2i(pos.xy), 0);
}`;

// Dust drifting through the air. Each speck's path is a function of time
// (a slow steady drift plus a gentle wander, wrapping at the edges), so
// nothing is stored. A speck scatters the light that reaches it: it takes
// the color and brightness of the light at its position, so specks only
// show inside beams, and they glint as they tumble.
const DUST_WGSL = /* wgsl */ `
struct Uniforms {
  res: vec2f, // CSS px
  time: f32, // seconds
  scale: f32, // turns accumulated light into what the screen shows
  dpr: f32,
  gain: f32, // 0 hides the dust
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var accum: texture_2d<f32>;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f, // in speck radii
  @location(1) color: vec3f,
}

fn random(n: u32) -> f32 {
  // PCG hash
  var s = n * 747796405u + 2891336453u;
  s = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  s = (s >> 22u) ^ s;
  return f32(s) / 4294967296.;
}

const QUAD = 3.; // quad half-size, in speck radii

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let r = array(random(i * 8u), random(i * 8u + 1u), random(i * 8u + 2u), random(i * 8u + 3u),
                random(i * 8u + 4u), random(i * 8u + 5u), random(i * 8u + 6u), random(i * 8u + 7u));
  let t = u.time;
  let margin = 30.;
  let span = u.res + 2. * margin;
  let velocity = (vec2f(r[2], r[3]) - 0.5) * 16.; // px/s
  let wander = 18. * vec2f(sin(t * (0.07 + 0.15 * r[4]) + 6.283 * r[5]),
                           cos(t * (0.07 + 0.15 * r[6]) + 6.283 * r[7]));
  let raw = vec2f(r[0], r[1]) * span + velocity * t + wander;
  let p = raw - floor(raw / span) * span - margin;

  // Mostly fine specks; a few big, faint, out-of-focus motes.
  let big = r[4] > 0.95;
  let radius = select(0.5 + 0.8 * r[5], 3. + 4. * r[6], big); // CSS px
  let faint = select(1., 0.12, big);

  // The light here, as the screen shows it.
  let size = vec2f(textureDimensions(accum));
  let px = vec2i(clamp(p * u.dpr, vec2f(0.), size - 1.));
  let light = textureLoad(accum, px, 0).rgb * u.scale;
  // Flakes catch the light as they tumble.
  let glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * (0.4 + 1.6 * r[7]) + 6.283 * r[0]), 6.);

  let corner = vec2f(f32(v & 1u), f32(v >> 1u)) * 2. - 1.;
  let q = p + corner * radius * QUAD;
  var o: Out;
  o.pos = vec4f(q.x / u.res.x * 2. - 1., 1. - q.y / u.res.y * 2., 0., 1.);
  o.local = corner * QUAD;
  o.color = light * u.gain * glint * faint;
  return o;
}

@fragment
fn fs(i: Out) -> @location(0) vec4f {
  return vec4f(i.color * exp(-dot(i.local, i.local)), 0.);
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

// --- GPU state ---
let device = null;
let context = null;
let tracer = null;
let accumFormat = 'rgba32float';
let pipelines = null;
let linearSampler = null;
let uniforms = null; // name → GPUBuffer
let targets = null; // name → {texture, view}
let bindGroups = null;
let bloomKey = ''; // what the bloom was last computed for
let headroom = 0; // HDR headroom, 0 in SDR
let dustGain = 1;
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
  tracer = new Tracer(device, SEGMENT_CAPACITY);

  const add = {srcFactor: 'one', dstFactor: 'one', operation: 'add'};
  const fullscreen = device.createShaderModule({code: FULLSCREEN_WGSL});
  const pipeline = (code, format) => {
    const module = device.createShaderModule({code});
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {module: fullscreen},
      fragment: {module, targets: [{format}]},
    });
  };
  // Quads added into a float target: segments into a pass, dust into dust.
  const additive = (code, format, buffers = []) => {
    const module = device.createShaderModule({code});
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: {module, buffers},
      fragment: {module, targets: [{format, blend: {color: add, alpha: add}}]},
      primitive: {topology: 'triangle-strip'},
    });
  };
  const addModule = device.createShaderModule({code: ADD_WGSL});
  pipelines = {
    line: additive(LINE_WGSL, FLOAT16, [
      {
        arrayStride: SEGMENT_BYTES,
        stepMode: 'instance',
        attributes: [
          {shaderLocation: 0, offset: 0, format: 'float32x4'},
          {shaderLocation: 1, offset: 16, format: 'float32x3'},
        ],
      },
    ]),
    // Faint enough to add straight onto the finished frame.
    dust: additive(DUST_WGSL, CANVAS_FORMAT),
    add: device.createRenderPipeline({
      layout: 'auto',
      vertex: {module: fullscreen},
      fragment: {
        module: addModule,
        targets: [{format: accumFormat, blend: {color: add, alpha: add}}],
      },
    }),
    bright: pipeline(BRIGHT_WGSL, FLOAT16),
    blur: pipeline(BLUR_WGSL, FLOAT16),
    down: pipeline(DOWN_WGSL, FLOAT16),
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
    dust: buffer(32),
    bright: buffer(16),
    downBloom: buffer(16),
    downWide: buffer(16),
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
  // accum → half → bloom (about BLOOM_PX CSS px) → wide (4× coarser).
  const hw = Math.ceil(W / 2);
  const hh = Math.ceil(H / 2);
  const down = (BLOOM_PX * dpr) / 2 >= 3 ? 4 : 2; // the rest of the way
  const bw = Math.ceil(hw / down);
  const bh = Math.ceil(hh / down);
  const ww = Math.ceil(bw / 4);
  const wh = Math.ceil(bh / 4);
  device.queue.writeBuffer(
    uniforms.downBloom,
    0,
    new Uint32Array([down, 0, 0, 0]),
  );
  device.queue.writeBuffer(uniforms.downWide, 0, new Uint32Array([4, 0, 0, 0]));
  bloomKey = '';
  targets = {
    accum: target(W, H, accumFormat),
    pass: target(W, H, FLOAT16),
    half: target(hw, hh, FLOAT16),
    bloomA: target(bw, bh, FLOAT16),
    bloomB: target(bw, bh, FLOAT16),
    wideA: target(ww, wh, FLOAT16),
    wideB: target(ww, wh, FLOAT16),
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
    add: group('add', [t.pass.view]),
    dust: group('dust', [uniforms.dust, t.accum.view]),
    bright: group('bright', [t.accum.view, uniforms.bright]),
    blurAX: group('blur', [t.bloomA.view, linearSampler, uniforms.blurX]),
    blurBY: group('blur', [t.bloomB.view, linearSampler, uniforms.blurY]),
    down: group('down', [t.half.view, linearSampler, uniforms.downBloom]),
    downWide: group('down', [t.bloomA.view, linearSampler, uniforms.downWide]),
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

// Shows the light accumulated so far. An unobstructed beam accumulates 1 per
// pass; `scale` averages the passes and applies exposure.
function present(time) {
  const scale = exposure / passes;
  const cssW = W / dpr;
  const cssH = H / dpr;
  // prettier-ignore
  device.queue.writeBuffer(uniforms.dust, 0, new Float32Array([cssW, cssH, time, scale, dpr, dustGain]));
  // prettier-ignore
  device.queue.writeBuffer(uniforms.bright, 0, new Float32Array([scale, BLOOM_THRESHOLD, 0, 0]));
  // prettier-ignore
  device.queue.writeBuffer(uniforms.composite, 0, new Float32Array([scale, BLOOM_NARROW, BLOOM_WIDE, headroom]));

  const encoder = device.createCommandEncoder();
  const t = targets;
  // Bloom only changes with the image, not with the drifting dust.
  const key = `${passes} ${exposure}`;
  if (key !== bloomKey) {
    bloomKey = key;
    fullscreen(encoder, 'bright', 'bright', t.half.view);
    fullscreen(encoder, 'down', 'down', t.bloomA.view);
    fullscreen(encoder, 'blur', 'blurAX', t.bloomB.view);
    fullscreen(encoder, 'blur', 'blurBY', t.bloomA.view);
    fullscreen(encoder, 'down', 'downWide', t.wideA.view);
    fullscreen(encoder, 'blur', 'blurWideX', t.wideB.view);
    fullscreen(encoder, 'blur', 'blurWideY', t.wideA.view);
  }
  const screen = context.getCurrentTexture().createView();
  fullscreen(encoder, 'composite', 'composite', screen);
  renderTo(encoder, screen, 'load', (pass) => {
    if (!dustGain) return;
    pass.setPipeline(pipelines.dust);
    pass.setBindGroup(0, bindGroups.dust);
    pass.draw(4, Math.round((cssW * cssH) / DUST_AREA_PER_SPECK));
  });
  device.queue.submit([encoder.finish()]);
}

// --- Tracing loop ---
// Messages only record the latest scene; the loop resets the image when it
// next runs, so a burst of drag events costs one reset.
let scene = null;
let exposure = 1;
let dirty = false;
let passes = 0; // submitted since the last reset
let origins = START_ORIGINS;
let busy = false;
let timer = 0;

async function step() {
  timer = 0;
  if (!device || !scene || busy) return;
  busy = true;
  const encoder = device.createCommandEncoder();
  const clear = dirty;
  if (dirty) {
    dpr = scene.dpr;
    const w = Math.round(scene.width * dpr);
    const h = Math.round(scene.height * dpr);
    if (w !== W || h !== H) {
      W = w;
      H = h;
      resizeTargets();
    }
    // prettier-ignore
    device.queue.writeBuffer(uniforms.line, 0, new Float32Array([scene.width, scene.height, 1 / dpr, 0]));
    tracer.setScene(scene);
    passes = 0;
    dirty = false;
  }
  tracer.encode(encoder, passes, origins);
  renderTo(encoder, targets.pass.view, 'clear', (pass) => {
    pass.setPipeline(pipelines.line);
    pass.setBindGroup(0, bindGroups.line); // half width: one device px
    pass.setVertexBuffer(0, tracer.segments);
    pass.drawIndirect(tracer.draw, 0);
  });
  renderTo(encoder, targets.accum.view, clear ? 'clear' : 'load', (pass) => {
    pass.setPipeline(pipelines.add);
    pass.setBindGroup(0, bindGroups.add);
    pass.draw(3);
  });
  device.queue.submit([encoder.finish()]);
  passes++; // presents queued from now on include this pass

  const start = performance.now();
  await device.queue.onSubmittedWorkDone();
  adaptOrigins(performance.now() - start);
  busy = false;
  if (dirty || passes < MAX_PASSES) schedule();
}

// Steer the rays per pass toward TARGET_PASS_MS, within the segment buffer.
// Timings are noisy (frames share the GPU), so follow a smoothed time per
// origin.
let msPerOrigin = 0;
function adaptOrigins(ms) {
  const sample = ms / origins;
  msPerOrigin = msPerOrigin ? 0.8 * msPerOrigin + 0.2 * sample : sample;
  const wavelengths = scene.light === 'White' ? WAVELENGTHS_PER_RAY : 1;
  const max = SEGMENT_CAPACITY / (SEGMENTS_PER_PATH * wavelengths);
  const target = TARGET_PASS_MS / msPerOrigin;
  origins = Math.round(Math.min(max, Math.max(MIN_ORIGINS, target)));
}

function schedule() {
  if (!timer) timer = setTimeout(step, 0);
}

// Present every frame, so the dust keeps drifting after tracing stops.
const nextFrame = self.requestAnimationFrame
  ? (f) => self.requestAnimationFrame(f)
  : (f) => setTimeout(() => f(performance.now()), 16);

// About 60fps is plenty for drifting dust, even on 120Hz screens.
let lastPresent = 0;
function frame(now) {
  if (passes && now - lastPresent >= 15) {
    lastPresent = now;
    present(now / 1000);
  }
  nextFrame(frame);
}

let failed = false;

self.onmessage = async ({data}) => {
  if (failed) return; // no renderer; the page already shows why
  if (data.canvas) {
    dustGain = data.dust;
    try {
      await initGPU(data.canvas, data.headroom);
      nextFrame(frame);
      schedule(); // a scene may have arrived while starting up
    } catch (e) {
      failed = true;
      self.postMessage({error: e.message});
    }
    return;
  }
  if ('headroom' in data && device) setHeadroom(data.headroom);
  if ('dust' in data) dustGain = data.dust;
  if ('exposure' in data) exposure = data.exposure;
  if (data.scene) {
    scene = data.scene;
    dirty = true;
    schedule();
  }
};
