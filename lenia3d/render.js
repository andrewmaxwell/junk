// Raymarches the simulation's 3D texture: a lit surface where the state crosses
// a threshold, with soft shadows, ambient occlusion, and a faint glow from the
// thinner material around it. Color shows growth: warm where it's growing,
// cool where it's dying back.

const shader = /* wgsl */ `
struct View {
  eye: vec3f, threshold: f32,
  right: vec3f, aspect: f32,
  up: vec3f, voxel: f32,
  forward: vec3f, time: f32,
}
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var vol: texture_3d<f32>;
@group(0) @binding(2) var samp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}

// the world is the cube [-1, 1]^3, wrapping around at the edges like the sim
fn vox(p: vec3f) -> vec4f { return textureSampleLevel(vol, samp, p * 0.5 + 0.5, 0.0); }
fn density(p: vec3f) -> f32 { return vox(p).r; }

fn boxHit(ro: vec3f, rd: vec3f) -> vec2f {
  let inv = 1.0 / rd;
  let a = (-1.0 - ro) * inv;
  let b = (1.0 - ro) * inv;
  let lo = min(a, b);
  let hi = max(a, b);
  return vec2f(max(max(lo.x, lo.y), max(lo.z, 0.0)), min(min(hi.x, hi.y), hi.z));
}

const LIGHT = vec3f(0.45, 0.8, 0.35);

fn background(rd: vec3f) -> vec3f {
  let t = rd.y * 0.5 + 0.5;
  return mix(vec3f(0.002, 0.002, 0.004), vec3f(0.012, 0.015, 0.028), t);
}

fn growthColor(g: f32) -> vec3f {
  let growing = vec3f(1.0, 0.42, 0.12);
  let steady = vec3f(0.16, 0.5, 0.55);
  let dying = vec3f(0.42, 0.22, 0.95);
  let t = sqrt(abs(g));
  return select(mix(steady, dying, t), mix(steady, growing, t), g > 0.0);
}

fn shadow(p: vec3f) -> f32 {
  var dens = 0.0;
  var t = view.voxel * 2.0;
  for (var i = 0; i < 40; i++) {
    let q = p + LIGHT * t;
    if (any(abs(q) > vec3f(1.0))) { break; }
    dens += density(q) * t * 0.12;
    t *= 1.12;
  }
  return exp(-dens * 60.0);
}

fn occlusion(p: vec3f, n: vec3f) -> f32 {
  var ao = 0.0;
  for (var i = 1; i <= 5; i++) {
    let d = f32(i) * view.voxel * 2.5;
    ao += density(p + n * d) / f32(i);
  }
  return clamp(1.0 - ao * 0.9, 0.0, 1.0);
}

@group(0) @binding(3) var<uniform> screen: vec2f;

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ndc = vec2f(pos.x / screen.x * 2.0 - 1.0, 1.0 - pos.y / screen.y * 2.0);
  let rd = normalize(view.forward * 1.8 + view.right * ndc.x * view.aspect + view.up * ndc.y);
  let ro = view.eye;

  var color = background(rd);
  let span = boxHit(ro, rd);
  if (span.x < span.y) {
    let stepSize = view.voxel * 0.6;
    // jitter the start so banding becomes fine noise
    let jitter = fract(sin(dot(pos.xy, vec2f(12.9898, 78.233))) * 43758.5453);
    var t = span.x + stepSize * jitter;
    var glow = vec3f(0.0);
    var transmittance = 1.0;
    var hit = false;
    var prevT = t;
    var first = true;
    loop {
      if (t > span.y) { break; }
      let s = vox(ro + rd * t);
      if (s.r > view.threshold) { hit = true; break; }
      // thin material glows faintly and also hides what's behind it, like fog
      let thin = smoothstep(0.0, view.threshold, s.r) * stepSize;
      glow += growthColor(s.g) * thin * transmittance;
      transmittance *= exp(-thin * 3.0);
      prevT = t;
      first = false;
      t += stepSize;
    }
    color = color * transmittance + glow * 1.2;
    if (hit) {
      // refine the crossing between the last two samples
      var a = select(prevT, span.x, first);
      var b = t;
      for (var i = 0; i < 6; i++) {
        let m = (a + b) * 0.5;
        if (density(ro + rd * m) > view.threshold) { b = m; } else { a = m; }
      }
      var p = ro + rd * b;
      let e = view.voxel;
      var n = -normalize(vec3f(
        density(p + vec3f(e, 0, 0)) - density(p - vec3f(e, 0, 0)),
        density(p + vec3f(0, e, 0)) - density(p - vec3f(0, e, 0)),
        density(p + vec3f(0, 0, e)) - density(p - vec3f(0, 0, e)),
      ) + vec3f(1e-6));
      // material cut open by the edge of the world: show the cut face flat
      if (first && density(ro + rd * span.x) > view.threshold) {
        p = ro + rd * span.x;
        let q = abs(p);
        n = sign(p) * vec3f(
          select(0.0, 1.0, q.x >= max(q.y, q.z)),
          select(0.0, 1.0, q.y > q.x && q.y >= q.z),
          select(0.0, 1.0, q.z > max(q.x, q.y)),
        );
      }
      let albedo = growthColor(vox(p).g);
      let diffuse = max(dot(n, LIGHT), 0.0) * shadow(p + n * e);
      let ao = occlusion(p, n);
      let sky = (0.5 + 0.5 * n.y) * vec3f(0.12, 0.15, 0.24);
      let bounce = (0.5 - 0.5 * n.y) * vec3f(0.08, 0.05, 0.04);
      let h = normalize(LIGHT - rd);
      let spec = pow(max(dot(n, h), 0.0), 40.0) * 0.5 * diffuse;
      let rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.25;
      let lit = albedo * (diffuse * vec3f(1.0, 0.93, 0.82) * 1.1 + (sky + bounce) * ao)
        + spec + rim * ao * vec3f(0.4, 0.5, 0.8);
      color = glow * 1.2 + lit * transmittance;
    }
  }

  // filmic tone map and gamma, since the canvas isn't sRGB
  color = color * (2.51 * color + 0.03) / (color * (2.43 * color + 0.59) + 0.14);
  return vec4f(pow(clamp(color, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
`;

export const makeRenderer = (device, context, format, sim) => {
  const module = device.createShaderModule({code: shader});
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {module, entryPoint: 'vs'},
    fragment: {module, entryPoint: 'main', targets: [{format}]},
  });
  const viewBuffer = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const screenBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {binding: 0, resource: {buffer: viewBuffer}},
      {binding: 1, resource: sim.texture.createView()},
      {binding: 2, resource: sampler},
      {binding: 3, resource: {buffer: screenBuffer}},
    ],
  });

  // camera: yaw and pitch around the origin at a distance
  return (encoder, {yaw, pitch, distance, threshold, time}) => {
    const {width, height} = context.canvas;
    const eye = [
      Math.cos(pitch) * Math.sin(yaw) * distance,
      Math.sin(pitch) * distance,
      Math.cos(pitch) * Math.cos(yaw) * distance,
    ];
    const forward = eye.map((v) => -v / distance);
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    device.queue.writeBuffer(
      viewBuffer,
      0,
      new Float32Array([
        ...eye,
        threshold,
        ...right,
        width / height,
        ...up,
        2 / sim.N,
        ...forward,
        time,
      ]),
    );
    device.queue.writeBuffer(
      screenBuffer,
      0,
      new Float32Array([width, height]),
    );

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  };
};
