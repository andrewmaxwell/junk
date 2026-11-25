// The preview, path traced: rays marched through the crystal's cells, where
// at each surface of the ice they reflect or refract (one or the other, picked
// at random by Fresnel's odds), until they get out to the light. The frames
// are averaged, which adds up all the ways light gets through the crystal.
//
// The default light is dark-field, like a microscope's: a dark background
// with a ring of light behind the crystal. Flat ice barely bends light, so it
// shows the dark background; edges, ridges and steps bend the ring's light
// toward the camera and glow.
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
  up: vec3f, ice: f32,
  n: i32, nz: i32, layer: i32, bounces: i32,
}
@group(0) @binding(0) var<uniform> v: View;
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> ext: array<u32>;

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
    let back = vec3f(0.004, 0.012, 0.06) * (1.0 - smoothstep(0.4, 0.6, ang));
    let lamps = mix(vec3f(0.4, 0.75, 1.0), vec3f(1.0, 0.55, 0.15), side);
    return back + lamps * ring * 2.5 + vec3f(0.06, 0.07, 0.1) * front * front;
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

/** Light reaching the camera along a ray that just hit ice at t. A path
    tracer: at each surface the light either reflects or goes through, and one
    of the two is followed at random. The frames average them out. */
fn shade(o: vec3f, d0: vec3f, t: f32) -> vec3f {
  let eta = v.ice;
  let f0 = ((eta - 1.0) / (eta + 1.0)) * ((eta - 1.0) / (eta + 1.0));
  var p = o + d0 * t;
  var d = d0;
  var inside = false;
  var weight = 1.0;
  for (var k = 0; k < v.bounces; k++) {
    var n = normal(p, d);
    if (dot(n, d) > 0.0) { n = -n; } // facing where the light comes from
    let through = refract(d, n, select(1.0 / eta, eta, inside));
    // Schlick's Fresnel, with the angle on the air side
    let c = select(-dot(d, n), -dot(through, n), inside);
    let f = f0 + (1.0 - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
    // Reflections are only a few percent, but picking them that rarely
    // leaves them speckled, so they're picked more often and weighted down
    let q = clamp(f, 0.2, 0.8);
    if (dot(through, through) < 0.5) {
      d = reflect(d, n); // all of it reflects when it can't get out
    } else if (rand() < q) {
      d = reflect(d, n);
      weight *= f / q;
    } else {
      d = through;
      weight *= (1.0 - f) / (1.0 - q);
      inside = !inside;
    }
    let span = bounds(p, d);
    let te = crossing(p, d, 0.05, min(span.y + 1.0, FAR), inside);
    // out into the light, or deep in the branches: let it out the way it goes
    if (te < 0.0) { break; }
    p = p + d * te;
  }
  return weight * env(d);
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
  let d = normalize(v.fwd + v.right * uv.x * v.zoom * v.aspect + v.up * uv.y * v.zoom);
  let o = v.pos;
  seed = u32(pix.x) * 1973u + u32(pix.y) * 9277u + frame.seed * 26699u;
  rand();
  var col = env(d);
  let span = bounds(o, d);
  if (span.x < span.y) {
    let t = crossing(o, d, span.x, span.y, false);
    if (t >= 0.0) { col = shade(o, d, t); }
  }
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

@fragment
fn fs(@builtin(position) pix: vec4f) -> @location(0) vec4f {
  var col = textureLoad(image, vec2i(pix.xy), 0).rgb * exposure;
  col = col / (1.0 + col); // Reinhard
  return vec4f(pow(col, vec3f(1.0 / 2.2)), 1.0);
}
`;

/** Frames averaged before the picture stops changing and drawing stops */
const SETTLED = 256;

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
  const view = uniform(80);
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
        ],
      }),
    );
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
   * @param {{exposure: number, ice: number, bounces: number, light: number}} look
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

    const data = new ArrayBuffer(80);
    const f = new Float32Array(data);
    const i = new Int32Array(data);
    f.set(camera.position, 0);
    f[3] = camera.zoom;
    f.set(camera.forward, 4);
    f[7] = width / height;
    f.set(camera.right, 8);
    i[11] = look.light;
    f.set(camera.up, 12);
    f[15] = look.ice;
    i[16] = sim.n;
    i[17] = sim.nz;
    i[18] = sim.layer;
    i[19] = look.bounces;
    device.queue.writeBuffer(view, 0, data);

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
