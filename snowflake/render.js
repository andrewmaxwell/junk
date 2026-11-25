// The preview, path traced: rays marched through the crystal's cells, where
// at each surface of the ice they reflect or refract (one or the other, picked
// at random by Fresnel's odds), until they get out to the light. The frames
// are averaged, which adds up all the ways light gets through the crystal.
//
// The default light is dark-field, like a microscope's: a dark background
// with a ring of light behind the crystal. Flat ice barely bends light, so it
// shows the dark background; edges, ridges and steps bend the ring's light
// toward the camera and glow.
// The rainbow light is the same ring with a color wheel in it.
//
// The lamp light hangs the crystal over a pale floor under a small lamp, off
// to one side, and draws its shadow: a light pass sends rays from the lamp
// through the crystal to the floor and counts where they land, so the shadow
// has the bright lines and spots (caustics) where the ice focuses light.
//
// World space is in cells: the crystal's middle layer is the xz plane and its
// c-axis is y.

import {brickCode} from './sim.js';

const code = /* wgsl */ `
${brickCode}
struct View {
  pos: vec3f, zoom: f32,
  fwd: vec3f, aspect: f32,
  right: vec3f, light: i32,
  up: vec3f, aperture: f32, // the lens's radius, for depth of field
  n: i32, nz: i32, layer: i32, bounces: i32,
  focus: f32, // how far away things are sharp
  floor: f32, // the height of the floor under the lamp
  reach: f32, // the radius of the lamp's beam the light pass follows
  shine: f32, // 1 / frames of light counted, or 0 before there are any
  lamp: vec3f, lampSize: f32, // toward the lamp, and its angular radius
  seed: u32,
}
@group(0) @binding(0) var<uniform> v: View;
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> ext: array<u32>;
/** The light pass's counts of rays landing on the floor, MAP x MAP over the
    lamp's beam (one ray per cell per frame) */
@group(0) @binding(6) var<storage, read> counts: array<u32>;
@group(0) @binding(7) var<storage, read_write> landed: array<atomic<u32>>;
const MAP = 512u;
/** The most light one sample brings back */
const BRIGHTEST = 40.0;
/** How brightly the lamp lights the floor, seen square on */
const LAMP = 3.0;
const FLOOR = vec3f(0.5, 0.53, 0.58);
const LAMP_COLOR = vec3f(1.0, 0.9, 0.75);

const PI = 3.14159265;
const STEP = 0.35;
/** How far light is followed inside the crystal: past that, it's lost in
    the branches, and following it was most of the cost of drawing ferns */
const FAR = 40.0;

fn cell(q0: i32, r0: i32, z0: i32) -> i32 {
  var q = q0;
  var r = r0;
  for (var k = 0; k < 3; k++) {
    if (r < 0) { q += r; r = -r; }
    if (r > q) { let t = q; q = r; r = t; }
  }
  let z = abs(z0);
  if (q >= v.n || z >= v.nz) { return -1; }
  return z * v.layer + q * (q + 1) / 2 + r;
}

fn occ(q: i32, r: i32, z: i32) -> f32 {
  let j = cell(q, r, z);
  if (j < 0) { return 0.0; }
  return a[j];
}

/** How much of a point is ice: the cells interpolated across the triangle
    of cell centers around it and between layers. Ice where it's over 0.5. */
fn field(pp: vec3f) -> f32 {
  let rad = length(pp.xz);
  var ang = atan2(pp.z, pp.x);
  let sixty = PI / 3.0;
  ang = ang - floor(ang / sixty) * sixty;
  ang = min(ang, sixty - ang);
  let u = rad * cos(ang);
  let w = rad * sin(ang);
  let rr = w * 1.1547005;
  let qq = u - 0.5 * rr;
  let fq = floor(qq);
  let fr = floor(rr);
  let x = qq - fq;
  let y = rr - fr;
  let iq = i32(fq);
  let ir = i32(fr);
  var c0 = vec2i(iq, ir);
  var wt = vec3f(1.0 - x - y, x, y);
  if (x + y >= 1.0) {
    c0 = vec2i(iq + 1, ir + 1);
    wt = vec3f(x + y - 1.0, 1.0 - y, 1.0 - x);
  }
  let hz = abs(pp.y);
  let fz = floor(hz);
  let iz = i32(fz);
  var lo = wt.x * occ(c0.x, c0.y, iz)
    + wt.y * occ(iq + 1, ir, iz) + wt.z * occ(iq, ir + 1, iz);
  if (lo == 0.0 && iz + 1 >= v.nz) { return 0.0; }
  let hi = wt.x * occ(c0.x, c0.y, iz + 1)
    + wt.y * occ(iq + 1, ir, iz + 1) + wt.z * occ(iq, ir + 1, iz + 1);
  return mix(lo, hi, hz - fz);
}

/** Outward surface normal */
fn normal(pp: vec3f, d: vec3f) -> vec3f {
  let e = 0.5;
  let g = vec3f(
    field(pp + vec3f(e, 0, 0)) - field(pp - vec3f(e, 0, 0)),
    field(pp + vec3f(0, e, 0)) - field(pp - vec3f(0, e, 0)),
    field(pp + vec3f(0, 0, e)) - field(pp - vec3f(0, 0, e)));
  if (dot(g, g) < 1e-8) { return -d; }
  return -normalize(g);
}

/** Where the ray enters and leaves the crystal's bounding cylinder */
fn bounds(o: vec3f, d: vec3f) -> vec2f {
  let rad = f32(ext[0]) + 2.0;
  let h = f32(ext[1]) + 1.5;
  var t0 = 0.0;
  var t1 = 1e9;
  let A = dot(d.xz, d.xz);
  let B = dot(o.xz, d.xz);
  let C = dot(o.xz, o.xz) - rad * rad;
  if (A > 1e-9) {
    let disc = B * B - A * C;
    if (disc < 0.0) { return vec2f(1.0, 0.0); }
    let s = sqrt(disc);
    t0 = max(t0, (-B - s) / A);
    t1 = min(t1, (-B + s) / A);
  } else if (C > 0.0) { return vec2f(1.0, 0.0); }
  if (abs(d.y) > 1e-9) {
    let ta = (-h - o.y) / d.y;
    let tb = (h - o.y) / d.y;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (abs(o.y) > h) { return vec2f(1.0, 0.0); }
  return vec2f(t0, t1);
}

/** The first point past t0 where the ray goes into ice (or out of it, from
    inside), or -1 if it doesn't before t1 */
fn crossing(o: vec3f, d: vec3f, t0: f32, t1: f32, inside: bool) -> f32 {
  let dims = brickDims(v.n, v.nz);
  let off = brickOff(v.n, v.nz);
  var t = t0;
  loop {
    if (t > t1) { return -1.0; }
    if (!inside) {
      // Jump across bricks with no crystal near them
      let pp = o + d * t;
      let b = floor((pp + off) / BRICK);
      let j = brickIndex(vec3i(b), dims);
      if (j < 0 || ext[j] == 0u) {
        let lo = b * BRICK - off;
        let far = select(lo, lo + BRICK, d > vec3f(0.0));
        let exits = (far - pp) / select(d, vec3f(1e-9), abs(d) < vec3f(1e-9));
        t += max(min(min(exits.x, exits.y), exits.z), 0.0) + 0.01;
        continue;
      }
    }
    let next = t + STEP;
    if ((field(o + d * next) >= 0.5) != inside) {
      var lo = t;
      var hi = next;
      for (var k = 0; k < 6; k++) {
        let mid = 0.5 * (lo + hi);
        if ((field(o + d * mid) >= 0.5) != inside) { hi = mid; } else { lo = mid; }
      }
      return hi;
    }
    t = next;
  }
}

/** The light around the crystal. The microscope lights are fixed to the
    camera: dark straight behind the crystal (or a colored backdrop), a ring of
    light around that, and a dim glow on the camera's side. Outdoors the light
    is fixed to the world: an overcast sky above, a bright patch of it off to
    one side, and a dark wool mitten below. */
fn env(d: vec3f) -> vec3f {
  let c = dot(d, v.fwd);
  let ang = acos(clamp(c, -1.0, 1.0));
  let ring = smoothstep(0.6, 0.7, ang) * (1.0 - smoothstep(0.9, 1.2, ang));
  let side = dot(d, v.up) * 0.5 + 0.5;
  let front = max(0.0, -c);
  if (v.light == 1) {
    // Rheinberg: a blue disk behind the crystal, a ring warm above and cool
    // below
    let back = vec3f(0.003, 0.007, 0.03) * (1.0 - smoothstep(0.4, 0.6, ang));
    let lamps = mix(vec3f(0.4, 0.75, 1.0), vec3f(1.0, 0.55, 0.15), side);
    return back + lamps * ring * 2.5 + vec3f(0.06, 0.07, 0.1) * front * front;
  }
  if (v.light == 3) { return vec3f(1.0); } // white furnace, for testing
  if (v.light == 4) {
    // Rainbow: the ring runs through the spectrum around its circle, like a
    // segmented Rheinberg filter, so each edge takes the color of the way it
    // bends the light
    let around = atan2(dot(d, v.up), dot(d, v.right)) / (2.0 * PI);
    let hue = 0.5 + 0.5 * cos(2.0 * PI * (around + vec3f(0.0, 0.333, 0.667)));
    return vec3f(0.002, 0.002, 0.006) * (1.0 + ang)
      + mix(vec3f(1.0), hue * hue, 0.8) * ring * 3.0
      + vec3f(0.06, 0.06, 0.08) * front * front;
  }
  if (v.light == 5) {
    // A dark room, and the lamp: a small disk, bright enough that the light
    // it throws on the floor adds up to LAMP
    let disk = smoothstep(cos(v.lampSize * 1.15), cos(v.lampSize * 0.85), dot(d, v.lamp));
    return vec3f(0.002, 0.002, 0.003) * (1.0 + d.y)
      + LAMP_COLOR * disk * LAMP / (PI * v.lampSize * v.lampSize);
  }
  if (v.light == 2) {
    let sun = normalize(vec3f(0.6, 0.7, -0.4));
    let sky = mix(vec3f(0.55, 0.65, 0.8), vec3f(0.85, 0.9, 1.0), d.y)
      + vec3f(4.0, 3.6, 3.0) * smoothstep(0.9, 0.97, dot(d, sun));
    let wool = vec3f(0.005, 0.004, 0.006);
    return mix(wool, sky, smoothstep(-0.05, 0.05, d.y));
  }
  var col = vec3f(0.004, 0.008, 0.02) * (1.0 + ang)
    + mix(vec3f(0.5, 0.75, 1.0), vec3f(1.0, 0.95, 0.85), side) * ring * 2.5;
  col += vec3f(0.08, 0.09, 0.11) * front * front;
  return col;
}

var<private> seed: u32;
fn rand() -> f32 {
  seed = seed * 747796405u + 2891336453u;
  var w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  w = (w >> 22u) ^ w;
  return f32(w >> 8u) / 16777216.0; // under 1, always
}

/** Two directions square to the lamp's, for the light pass's map */
fn acrossLamp() -> mat2x3f {
  let e1 = normalize(cross(v.lamp, vec3f(0.0, 0.0, 1.0)));
  return mat2x3f(e1, cross(v.lamp, e1));
}

/** Where on the map a point is: its place across the lamp's beam */
fn onMap(g: vec3f) -> vec2f {
  let e = acrossLamp();
  return (vec2f(dot(g, e[0]), dot(g, e[1])) / v.reach * 0.5 + 0.5) * f32(MAP);
}

/** How much of the lamp's light reaches a point on the floor, 1 with nothing
    in the way: the light pass's counts per frame, read between cells */
fn lit(g: vec3f) -> f32 {
  let uv = onMap(g) - 0.5;
  if (v.shine == 0.0 || any(uv < vec2f(0.0)) || any(uv >= vec2f(f32(MAP - 1u)))) {
    return 1.0;
  }
  let i = vec2u(uv);
  let f = fract(uv);
  let k = i.y * MAP + i.x;
  let top = mix(f32(counts[k]), f32(counts[k + 1u]), f.x);
  let bottom = mix(f32(counts[k + MAP]), f32(counts[k + MAP + 1u]), f.x);
  // Rays near the map's edge that the lamp's size sends outward are lost, and
  // none come in from past it, so the counts fade into plain light there
  let edge = min(min(uv.x, uv.y), f32(MAP - 1u) - max(uv.x, uv.y)) / (0.06 * f32(MAP));
  return mix(1.0, mix(top, bottom, f.y) * v.shine, clamp(edge, 0.0, 1.0));
}

/** The light from past the crystal: the lights, or under the lamp, the floor */
fn sky(p: vec3f, d: vec3f) -> vec3f {
  if (v.light == 5 && d.y < 0.0) {
    let g = p + d * ((v.floor - p.y) / d.y);
    // the lamp lights a pool on the floor around the shadow
    let middle = v.lamp * (v.floor / v.lamp.y);
    let pool = exp(-dot(g.xz - middle.xz, g.xz - middle.xz) / (2.5 * v.reach * v.reach));
    return FLOOR / PI * (LAMP_COLOR * LAMP * v.lamp.y * lit(g) * pool + 0.01);
  }
  return env(d);
}

struct Ray { p: vec3f, d: vec3f, out: bool }

/** Follows light that just hit ice at p through the crystal, until it gets
    out (or is lost bouncing): at each surface it either reflects or goes
    through, picked at random by Fresnel's odds, and the frames average them */
fn passage(p0: vec3f, d0: vec3f) -> Ray {
  let eta = 1.31; // ice's index of refraction
  let f0 = ((eta - 1.0) / (eta + 1.0)) * ((eta - 1.0) / (eta + 1.0));
  var p = p0;
  var d = d0;
  var inside = false;
  for (var k = 0; k < v.bounces; k++) {
    var n = normal(p, d);
    if (dot(n, d) > 0.0) { n = -n; } // facing where the light comes from
    let through = refract(d, n, select(1.0 / eta, eta, inside));
    // Schlick's Fresnel, with the angle on the air side. Picking by the
    // exact odds keeps every path's weight 1: reweighting picks (reflect
    // more often, count each for less) gives a few paths huge weights, which
    // made glass sponges in anotherRaytracer render up to half too dark.
    let c = select(-dot(d, n), -dot(through, n), inside);
    let f = f0 + (1.0 - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
    if (dot(through, through) < 0.5 || rand() < f) {
      d = reflect(d, n);
    } else {
      d = through;
      inside = !inside;
    }
    let span = bounds(p, d);
    let te = crossing(p, d, 0.05, min(span.y + 1.0, FAR), inside);
    // out into the light, or deep in the branches: let it out the way it goes
    if (te < 0.0) { return Ray(p, d, true); }
    p = p + d * te;
  }
  return Ray(p, d, false);
}

/** Light reaching the camera along a ray that just hit ice at t */
fn shade(o: vec3f, d0: vec3f, t: f32) -> vec3f {
  let ray = passage(o + d0 * t, d0);
  // Still bouncing: let it out the way it's going, except in the furnace
  if (!ray.out && v.light == 3) { return vec3f(0.0); }
  return sky(ray.p, ray.d);
}

/** The light pass: a ray from the lamp for each cell of the map, through the
    crystal to the floor, where it's counted. Each starts from a random point
    of the lamp's disk, which softens the shadow's edges. */
@compute @workgroup_size(8, 8, 1)
fn light(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= MAP || id.y >= MAP) { return; }
  seed = id.x * 1973u + id.y * 9277u + v.seed * 26699u;
  rand();
  let e = acrossLamp();
  let uv = (vec2f(id.xy) + vec2f(rand(), rand())) / f32(MAP) * 2.0 - 1.0;
  let a = 2.0 * PI * rand();
  let r = v.lampSize * sqrt(rand());
  var d = -normalize(v.lamp + (e[0] * cos(a) + e[1] * sin(a)) * r);
  var p = (e[0] * uv.x + e[1] * uv.y) * v.reach - d * 2.0 * v.reach;
  let span = bounds(p, d);
  if (span.x < span.y) {
    let t = crossing(p, d, span.x, span.y, false);
    if (t >= 0.0) {
      let ray = passage(p + d * t, d);
      if (!ray.out) { return; }
      p = ray.p;
      d = ray.d;
    }
  }
  if (d.y >= 0.0) { return; }
  let cell = vec2i(floor(onMap(p + d * ((v.floor - p.y) / d.y))));
  if (any(cell < vec2i(0)) || any(cell >= vec2i(i32(MAP)))) { return; }
  atomicAdd(&landed[u32(cell.y) * MAP + u32(cell.x)], 1u);
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

struct Frame {
  size: vec2f,
  jitter: vec2f,
  weight: f32, // how much of this frame goes into the average
  scale: f32, // how much the view has shrunk since the last frame
  seed: u32,
}
@group(0) @binding(3) var<uniform> frame: Frame;
@group(0) @binding(4) var prev: texture_2d<f32>;
@group(0) @binding(5) var linear: sampler;

@fragment
fn fs(@builtin(position) pix: vec4f) -> @location(0) vec4f {
  let xy = pix.xy + frame.jitter;
  let uv = vec2f(xy.x / frame.size.x - 0.5, 0.5 - xy.y / frame.size.y);
  seed = u32(pix.x) * 1973u + u32(pix.y) * 9277u + frame.seed * 26699u;
  rand();
  // A thin lens: rays from across its disk meet at the focus distance
  let aim = normalize(v.fwd + v.right * uv.x * v.zoom * v.aspect + v.up * uv.y * v.zoom);
  let sharp = v.pos + aim * (v.focus / dot(aim, v.fwd));
  let r = v.aperture * sqrt(rand());
  let ang = 2.0 * PI * rand();
  let o = v.pos + (v.right * cos(ang) + v.up * sin(ang)) * r;
  let d = normalize(sharp - o);
  var col = sky(o, d);
  let span = bounds(o, d);
  if (span.x < span.y) {
    let t = crossing(o, d, span.x, span.y, false);
    if (t >= 0.0) { col = shade(o, d, t); }
  }
  // The rare path that finds a small lamp brings back hundreds of times the
  // light of the rest, which speckles the picture for many frames: cap it
  col = min(col, vec3f(BRIGHTEST));
  // Average with the last frames, moved to where they are now as the camera
  // backs away from the growing crystal
  let back = 0.5 + (pix.xy / frame.size - 0.5) * frame.scale;
  if (frame.weight < 1.0 && all(back >= vec2f(0.0)) && all(back <= vec2f(1.0))) {
    let old = textureSampleLevel(prev, linear, back, 0.0).rgb;
    col = mix(old, col, frame.weight);
  }
  return vec4f(col, 1.0);
}
`;

// Shows the averaged frames
const displayCode = /* wgsl */ `
@group(0) @binding(0) var image: texture_2d<f32>;
@group(0) @binding(1) var<uniform> exposure: f32;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

/** AgX filmic tone mapping (Troy Sobotka's, with Benjamin Wrensch's
    polynomial fit and Blender's "punchy" look), copied from
    anotherRaytracer's shaders/tone.js. Like film, it rolls off shadows as
    well as highlights, so the dark background stays dark, and bright colors
    fade toward white. Its output is already encoded for the screen. */
fn agx(c: vec3f) -> vec3f {
  let inset = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104,
  );
  let lo = -12.47393;
  let hi = 4.026069;
  var x = clamp(log2(max(inset * c, vec3f(1e-10))), vec3f(lo), vec3f(hi));
  x = (x - lo) / (hi - lo);
  let x2 = x * x;
  let x4 = x2 * x2;
  x = 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  x = pow(max(x, vec3f(0.)), vec3f(1.35));
  let luma = dot(x, vec3f(0.2126, 0.7152, 0.0722));
  x = luma + 1.4 * (x - luma);
  let outset = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116,
  );
  return clamp(outset * x, vec3f(0.), vec3f(1.));
}

@fragment
fn fs(@builtin(position) pix: vec4f) -> @location(0) vec4f {
  let col = textureLoad(image, vec2i(pix.xy), 0).rgb * exposure;
  return vec4f(agx(col), 1.0);
}
`;

/** Frames averaged before the picture stops changing and drawing stops */
const SETTLED = 256;
/** The lamp light, its direction (fixed to the world, up and off to one side)
    and its angular radius: a small lamp, about 2.3 degrees across */
const LAMP_LIGHT = 5;
const LAMP_TOWARD = (([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})([-0.5, 1, 0.15]);
const LAMP_SIZE = 0.02;
/** The light pass's map: MAP x MAP cells across the lamp's beam */
const MAP = 512;

/**
 * @param {GPUDevice} device
 * @param {GPUTextureFormat} format
 */
export const makeRenderer = (device, format) => {
  const module = device.createShaderModule({code});
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {module, entryPoint: 'vs'},
    fragment: {module, entryPoint: 'fs', targets: [{format: 'rgba16float'}]},
  });
  const displayModule = device.createShaderModule({code: displayCode});
  const lightPass = device.createComputePipeline({
    layout: 'auto',
    compute: {module, entryPoint: 'light'},
  });
  const display = device.createRenderPipeline({
    layout: 'auto',
    vertex: {module: displayModule, entryPoint: 'vs'},
    fragment: {module: displayModule, entryPoint: 'fs', targets: [{format}]},
  });
  const uniform = (size) =>
    device.createBuffer({
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const view = uniform(128);
  /** The light pass's counts, MAP x MAP */
  const counts = device.createBuffer({
    size: MAP * MAP * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const frameBuffer = uniform(32);
  const exposureBuffer = uniform(16);
  const linear = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  /** Two images, each frame drawn into one from the other */
  let images = [];
  let current = 0;
  let traceGroups = [];
  let displayGroups = [];
  let field = null;
  let frames = 0;
  /** Frames of the light pass counted since the crystal or the light changed */
  let lightFrames = 0;
  let lastLight = -1;
  let lightGroup = null;
  let lastDistance = 0;
  let lastExposure = 0;

  const makeGroups = (sim) => {
    traceGroups = [0, 1].map((k) =>
      device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          {binding: 0, resource: {buffer: view}},
          {binding: 1, resource: {buffer: sim.field}},
          {binding: 2, resource: {buffer: sim.ext}},
          {binding: 3, resource: {buffer: frameBuffer}},
          {binding: 4, resource: images[1 - k].createView()},
          {binding: 5, resource: linear},
          {binding: 6, resource: {buffer: counts}},
        ],
      }),
    );
    lightGroup = device.createBindGroup({
      layout: lightPass.getBindGroupLayout(0),
      entries: [
        {binding: 0, resource: {buffer: view}},
        {binding: 1, resource: {buffer: sim.field}},
        {binding: 2, resource: {buffer: sim.ext}},
        {binding: 7, resource: {buffer: counts}},
      ],
    });
    displayGroups = [0, 1].map((k) =>
      device.createBindGroup({
        layout: display.getBindGroupLayout(0),
        entries: [
          {binding: 0, resource: images[k].createView()},
          {binding: 1, resource: {buffer: exposureBuffer}},
        ],
      }),
    );
  };

  /** Starts the average over, for when the camera turns or the look changes */
  const restart = () => (frames = 0);

  /**
   * Draws a frame, unless nothing has changed since the picture settled.
   * @param {GPUCommandEncoder} encoder
   * @param {GPUCanvasContext} context
   * @param {{width: number, height: number}} canvasSize
   * @param {ReturnType<import('./sim.js').makeSim>} sim
   * @param {{position: number[], forward: number[], right: number[], up: number[], zoom: number, distance: number}} camera
   * @param {{exposure: number, bounces: number, light: number, aperture: number, focus: number}} look
   * @param {boolean} growing whether the crystal changed since the last frame
   */
  const render = (encoder, context, canvasSize, sim, camera, look, growing) => {
    const {width, height} = canvasSize;
    const resized = images[0]?.width !== width || images[0]?.height !== height;
    if (resized) {
      images.forEach((image) => image.destroy());
      images = [0, 1].map(() =>
        device.createTexture({
          size: [width, height],
          format: 'rgba16float',
          usage:
            GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
    }
    if (resized || field !== sim.field) {
      field = sim.field;
      makeGroups(sim);
      frames = 0;
    }
    const zoomed = Math.abs(camera.distance / lastDistance - 1) > 1e-4;
    const exposed = look.exposure !== lastExposure;
    if (!growing && !zoomed && !exposed && frames >= SETTLED) return;
    lastExposure = look.exposure;
    device.queue.writeBuffer(
      exposureBuffer,
      0,
      new Float32Array([look.exposure]),
    );

    if (!growing && !zoomed && frames >= SETTLED) {
      // only the exposure changed: show the same average again
      draw(encoder, context);
      return;
    }

    // The light pass runs once the crystal is still, counting on until it has
    // as many frames as the picture
    if (growing || look.light !== lastLight) lightFrames = 0;
    lastLight = look.light;
    const counting =
      look.light === LAMP_LIGHT && !growing && lightFrames < SETTLED;
    if (counting) {
      if (lightFrames === 0) encoder.clearBuffer(counts);
      lightFrames++;
    }

    const data = new ArrayBuffer(128);
    const f = new Float32Array(data);
    const i = new Int32Array(data);
    f.set(camera.position, 0);
    f[3] = camera.zoom;
    f.set(camera.forward, 4);
    f[7] = width / height;
    f.set(camera.right, 8);
    i[11] = look.light;
    f.set(camera.up, 12);
    f[15] = look.aperture;
    i[16] = sim.n;
    i[17] = sim.nz;
    i[18] = sim.layer;
    // While things change (growing, turning, the first frames after), the
    // average is only a few frames deep, so following light trapped past 8
    // bounces only costs time; skipping it keeps turning the camera smooth.
    // While it grows, 2 (in through a surface and out through another): a
    // frame of a thick crystal took 35-50 ms at 8, which left the growth a few
    // steps a frame, and 2 at full size (10-14 ms) looked sharper than 8 at
    // half size (11-15 ms).
    const quick = growing || zoomed || frames < 16;
    i[19] = Math.min(look.bounces, growing ? 2 : quick ? 8 : look.bounces);
    f[20] = camera.distance + look.focus;
    // The floor sits half the crystal's radius below it, so the shadow falls
    // a little to the side, and the light pass covers all of the crystal
    const {radius, height: tall} = sim.extents;
    f[21] = -(tall + 1 + 0.5 * radius);
    f[22] = Math.hypot(radius, tall) + 4;
    f[23] = lightFrames && !growing ? 1 / lightFrames : 0;
    f.set(LAMP_TOWARD, 24);
    f[27] = LAMP_SIZE;
    new Uint32Array(data)[28] = (Math.random() * 2 ** 32) >>> 0;
    device.queue.writeBuffer(view, 0, data);
    if (counting) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(lightPass);
      pass.setBindGroup(0, lightGroup);
      pass.dispatchWorkgroups(MAP / 8, MAP / 8);
      pass.end();
    }

    // While the crystal grows, keep some of the old frames to smooth out the
    // sparkle of details smaller than a pixel; once it stops, average them all
    // While it changes, the average only holds the last few frames, and once
    // it stops the average starts building again from there. (Counting on
    // through growth left the finished crystal with no antialiasing at all.)
    if (growing || zoomed) frames = Math.min(frames, 2);
    const scale = frames && lastDistance ? camera.distance / lastDistance : 1;
    // Unless the camera jumped back too far for the old frames to line up,
    // which left rings around a crystal that grew fast on a slow GPU
    const weight =
      frames && Math.abs(scale - 1) < 0.03
        ? Math.max(1 / (frames + 1), growing || zoomed ? 0.3 : 0)
        : 1;
    lastDistance = camera.distance;
    const jitter = frames ? [Math.random() - 0.5, Math.random() - 0.5] : [0, 0];
    const frameData = new Float32Array([
      width,
      height,
      ...jitter,
      weight,
      scale,
      0,
      0,
    ]);
    new Uint32Array(frameData.buffer)[6] = (Math.random() * 2 ** 32) >>> 0;
    device.queue.writeBuffer(frameBuffer, 0, frameData);
    frames++;

    current = 1 - current;
    const trace = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: images[current].createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    trace.setPipeline(pipeline);
    trace.setBindGroup(0, traceGroups[current]);
    trace.draw(3);
    trace.end();
    draw(encoder, context);
  };

  const draw = (encoder, context) => {
    const show = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    show.setPipeline(display);
    show.setBindGroup(0, displayGroups[current]);
    show.draw(3);
    show.end();
  };

  return {
    render,
    restart,
    get frames() {
      return frames;
    },
  };
};
