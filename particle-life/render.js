/*
Particles are drawn as small soft dots, stretched back along their velocity
into streaks, added together into a float texture
that holds the trails. Each frame that texture is first multiplied by `fade`
(0 clears it), so moving particles leave tails. Float keeps faint tails from
getting stuck as gray ghosts the way 8-bit color does. Then it's tone mapped
onto the screen, so dense clusters glow toward white instead of clipping.
*/

const code = /* wgsl */ `
struct View {
  size: vec2f,
  // the world point in the middle of the screen
  center: vec2f,
  dotSize: f32,
  brightness: f32,
  fade: f32,
  zoom: f32,
  // how many steps of motion each streak shows
  streaks: f32,
  colors: array<vec4f, 16>,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>;
@group(0) @binding(2) var<storage, read> colors: array<u32>;

struct Dot {
  @builtin(position) position: vec4f,
  // in pixels: x along the streak, y across it
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  // x = dot radius, y = half the streak's length
  @location(2) @interpolate(flat) shape: vec2f,
}

@vertex
fn dotVertex(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Dot {
  var corners = array(
    vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
    vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1),
  );
  let particle = particles[i];

  // where it is relative to the camera, the short way around the world
  var d = particle.xy - view.center;
  d -= view.size * round(d / view.size);
  let screen = d * view.zoom + view.size * 0.5;

  let r = view.dotSize * view.zoom * 0.5;
  let vel = particle.zw * view.zoom;
  let speed = length(vel);
  let halfLen = speed * view.streaks * 0.5;
  var dir = vec2f(1, 0);
  if (speed > 1e-6) {
    dir = vel / speed;
  }
  let local = corners[v] * vec2f(r + halfLen, r);
  let p = screen - dir * halfLen + dir * local.x + vec2f(-dir.y, dir.x) * local.y;

  var out: Dot;
  out.position = vec4f(p / view.size * vec2f(2, -2) + vec2f(-1, 1), 0, 1);
  out.local = local;
  // a longer streak spreads the same light over more pixels
  out.color = view.colors[colors[i]].rgb * view.brightness * r / (r + halfLen);
  out.shape = vec2f(r, halfLen);
  return out;
}

@fragment
fn dotFragment(in: Dot) -> @location(0) vec4f {
  let along = max(abs(in.local.x) - in.shape.y, 0.0);
  let glow = saturate(1.0 - length(vec2f(along, in.local.y)) / in.shape.x);
  return vec4f(in.color * glow, 1);
}

@vertex
fn fullscreen(@builtin(vertex_index) v: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(corners[v], 0, 1);
}

@fragment
fn fadeFragment() -> @location(0) vec4f {
  return vec4f(view.fade);
}

@group(0) @binding(3) var trails: texture_2d<f32>;

@fragment
fn showFragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let c = textureLoad(trails, vec2i(position.xy), 0).rgb;
  return vec4f(1.0 - exp(-c), 1);
}
`;

const trailFormat = 'rgba16float';

export const makeRenderer = (device, context, format) => {
  const module = device.createShaderModule({label: 'render', code});
  const pipeline = (vertex, fragment, targetFormat, blend) =>
    device.createRenderPipeline({
      layout: 'auto',
      vertex: {module, entryPoint: vertex},
      fragment: {
        module,
        entryPoint: fragment,
        targets: [{format: targetFormat, blend}],
      },
    });
  const add = {srcFactor: 'one', dstFactor: 'one'};
  const multiply = {srcFactor: 'zero', dstFactor: 'src'};
  const dots = pipeline('dotVertex', 'dotFragment', trailFormat, {
    color: add,
    alpha: add,
  });
  const fade = pipeline('fullscreen', 'fadeFragment', trailFormat, {
    color: multiply,
    alpha: multiply,
  });
  const show = pipeline('fullscreen', 'showFragment', format);

  const viewBuffer = device.createBuffer({
    size: 48 + 16 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let trails, fadeGroup, showGroup, dotGroup, dotBuffers;

  const resize = (width, height) => {
    trails?.destroy();
    trails = device.createTexture({
      size: [width, height],
      format: trailFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    fadeGroup = device.createBindGroup({
      layout: fade.getBindGroupLayout(0),
      entries: [{binding: 0, resource: {buffer: viewBuffer}}],
    });
    showGroup = device.createBindGroup({
      layout: show.getBindGroupLayout(0),
      entries: [{binding: 3, resource: trails.createView()}],
    });
  };

  /** sim: its particle buffers; v: view settings in CSS pixels. */
  const draw = (encoder, sim, v) => {
    if (dotBuffers !== sim.particles) {
      dotBuffers = sim.particles;
      dotGroup = device.createBindGroup({
        layout: dots.getBindGroupLayout(0),
        entries: [viewBuffer, sim.particles, sim.colors].map(
          (buffer, binding) => ({binding, resource: {buffer}}),
        ),
      });
    }

    const data = new Float32Array(12 + 16 * 4);
    data.set([
      v.width,
      v.height,
      v.centerX,
      v.centerY,
      v.dotSize,
      v.brightness,
      v.fade,
      v.zoom,
      v.streaks,
    ]);
    v.colors.forEach((rgb, i) => data.set(rgb, 12 + i * 4));
    device.queue.writeBuffer(viewBuffer, 0, data);

    const trailPass = encoder.beginRenderPass({
      colorAttachments: [
        {view: trails.createView(), loadOp: 'load', storeOp: 'store'},
      ],
    });
    trailPass.setPipeline(fade);
    trailPass.setBindGroup(0, fadeGroup);
    trailPass.draw(3);
    trailPass.setPipeline(dots);
    trailPass.setBindGroup(0, dotGroup);
    trailPass.draw(6, sim.numParticles);
    trailPass.end();

    const showPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          clearValue: [0, 0, 0, 1],
          storeOp: 'store',
        },
      ],
    });
    showPass.setPipeline(show);
    showPass.setBindGroup(0, showGroup);
    showPass.draw(3);
    showPass.end();
  };

  return {resize, draw};
};
