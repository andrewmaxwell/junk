// The preview: rays marched through the crystal's cells, refracted in and out
// of the ice, against a dark background with a ring of light behind the
// crystal (dark-field lighting, like a microscope's). Flat ice barely bends
// light, so it shows the dark background; edges, ridges and steps bend the
// ring's light toward the camera and glow.
//
// World space is in cells: the crystal's middle layer is the xz plane and its
// c-axis is y.

import {brickCode} from './sim.js';

const code = /* wgsl */ `
${brickCode}
struct View {
  pos: vec3f, zoom: f32,
  fwd: vec3f, aspect: f32,
  right: vec3f, exposure: f32,
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

/** The light around the crystal, fixed to the camera like a microscope's:
    dark straight behind the crystal, a bright ring around that, and a dim
    glow on the camera's side for reflections */
fn env(d: vec3f) -> vec3f {
  let c = dot(d, v.fwd);
  let ang = acos(clamp(c, -1.0, 1.0));
  let ring = smoothstep(0.6, 0.7, ang) * (1.0 - smoothstep(0.9, 1.2, ang));
  let side = dot(d, v.up) * 0.5 + 0.5;
  var col = vec3f(0.004, 0.008, 0.02) * (1.0 + ang)
    + mix(vec3f(0.5, 0.75, 1.0), vec3f(1.0, 0.95, 0.85), side) * ring * 2.5;
  let front = max(0.0, -c);
  col += vec3f(0.08, 0.09, 0.11) * front * front;
  return col;
}

/** Light reaching the camera along a ray that just hit ice at t */
fn shade(o: vec3f, d0: vec3f, t: f32) -> vec3f {
  let eta = v.ice;
  var p = o + d0 * t;
  var n = normal(p, d0);
  var cosi = clamp(-dot(d0, n), 0.0, 1.0);
  let f0 = ((eta - 1.0) / (eta + 1.0)) * ((eta - 1.0) / (eta + 1.0));
  let fr = f0 + (1.0 - f0) * pow(1.0 - cosi, 5.0);
  var col = fr * env(reflect(d0, n));

  // Through the ice, bouncing inside where light can't get out
  var d = refract(d0, n, 1.0 / eta);
  var weight = 1.0 - fr;
  for (var k = 0; k < v.bounces; k++) {
    let span = bounds(p, d);
    let te = crossing(p, d, 0.05, min(span.y + 1.0, FAR), true);
    if (te < 0.0) {
      // deep in the branches: let it out the way it was going
      col += weight * env(d);
      break;
    }
    p = p + d * te;
    n = normal(p, d);
    let out = refract(d, -n, eta);
    if (dot(out, out) < 0.5) {
      d = reflect(d, -n);
      continue;
    }
    let c = clamp(dot(d, n), 0.0, 1.0);
    let f = f0 + (1.0 - f0) * pow(1.0 - c, 5.0);
    // Light leaving here, then what's beyond it if it re-enters ice
    let span2 = bounds(p, out);
    let t2 = crossing(p, out, 0.05, min(span2.y, FAR), false);
    if (t2 < 0.0) {
      col += weight * (1.0 - f) * env(out);
      weight *= f;
      d = reflect(d, -n);
    } else {
      // it goes back into ice: follow that instead of the internal reflection
      weight *= 1.0 - f;
      p = p + out * t2;
      n = normal(p, out);
      d = refract(out, n, 1.0 / eta);
    }
  }
  return col;
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
const SETTLED = 64;

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
   * @param {{exposure: number, ice: number, bounces: number}} look
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
    f[11] = 0;
    f.set(camera.up, 12);
    f[15] = look.ice;
    i[16] = sim.n;
    i[17] = sim.nz;
    i[18] = sim.layer;
    i[19] = look.bounces;
    device.queue.writeBuffer(view, 0, data);

    // While the crystal grows, keep some of the old frames to smooth out the
    // sparkle of details smaller than a pixel; once it stops, average them all
    const weight = frames
      ? Math.max(1 / (frames + 1), growing || zoomed ? 0.3 : 0)
      : 1;
    const scale = frames && lastDistance ? camera.distance / lastDistance : 1;
    lastDistance = camera.distance;
    const jitter = frames ? [Math.random() - 0.5, Math.random() - 0.5] : [0, 0];
    device.queue.writeBuffer(
      frameBuffer,
      0,
      new Float32Array([width, height, ...jitter, weight, scale, 0, 0]),
    );
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
