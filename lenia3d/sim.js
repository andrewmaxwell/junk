import {fftShader} from './fft.js';

// Flow-Lenia (Plantec et al. 2023) in 3D. Like Lenia, each kernel turns the
// neighborhood into growth, but instead of cells growing or dying, matter
// flows up the growth gradient (and away from crowding), so the total amount
// never changes: nothing can die out or explode into foam.
//
// Each step: the state's FFT, then for each pair of kernels one inverse FFT
// (two real results fit in one complex one), summed into the growth field;
// then every cell works out where its matter goes, and every cell gathers what
// lands on it from its neighbors (reintegration tracking).

const DD = 2; // how far matter can come from, in cells

const flowShaders = (N) => /* wgsl */ `
struct Flow { dt: f32, sigma: f32 }
@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<storage, read_write> next: array<f32>;
@group(0) @binding(2) var<storage, read_write> stateHat: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> work: array<vec2f>;
@group(0) @binding(4) var<storage, read> kernelHat: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> growthField: array<f32>;
@group(0) @binding(6) var<storage, read_write> disp: array<vec4f>;
@group(0) @binding(7) var<storage, read> kernels: array<vec4f>; // m, s, h
@group(0) @binding(8) var<uniform> flow: Flow;
@group(0) @binding(9) var<uniform> pair: u32;
@group(0) @binding(10) var tex: texture_storage_3d<rgba16float, write>;

const N = ${N}u;
const CELLS = ${N * N * N}u;
const DD = ${DD};

fn cell(id: vec3u) -> u32 { return id.x + id.y * N + id.z * N * N; }
fn wrapped(p: vec3i) -> u32 { return cell(vec3u((p + i32(N)) % i32(N))); }

fn growth(u: f32, k: vec4f) -> f32 {
  let d = (u - k.x) / k.y;
  return k.z * (2.0 * exp(-0.5 * d * d) - 1.0);
}

@compute @workgroup_size(4, 4, 4)
fn pack(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  stateHat[i] = vec2f(state[i], 0.0);
}

fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

// two kernels at once: the first's result comes out real, the second's imaginary
@compute @workgroup_size(4, 4, 4)
fn multiply(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let a = stateHat[i];
  let p = cmul(a, kernelHat[2u * pair * CELLS + i]);
  let q = cmul(a, kernelHat[(2u * pair + 1u) * CELLS + i]);
  work[i] = vec2f(p.x - q.y, p.y + q.x);
}

@compute @workgroup_size(4, 4, 4)
fn accumulate(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let u = work[i];
  let g = growth(u.x, kernels[2u * pair]) + growth(u.y, kernels[2u * pair + 1u]);
  growthField[i] = select(growthField[i], 0.0, pair == 0u) + g;
}

// Smoothed gradients of the growth and of the matter itself. Matter flows up
// the growth gradient, but where it's crowded (near 1 or more) it mostly
// spreads out instead.
@compute @workgroup_size(4, 4, 4)
fn displace(@builtin(global_invocation_id) id: vec3u) {
  var gradG = vec3f(0.0);
  var gradA = vec3f(0.0);
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let o = vec3f(f32(dx), f32(dy), f32(dz));
        let w = 2.0 - abs(o);
        let weight = o * vec3f(w.y * w.z, w.x * w.z, w.x * w.y) / 4.0;
        let j = wrapped(vec3i(id) + vec3i(dx, dy, dz));
        gradG += growthField[j] * weight;
        gradA += state[j] * weight;
      }
    }
  }
  let a = state[cell(id)];
  let alpha = clamp(a * a, 0.0, 1.0);
  let f = gradG * (1.0 - alpha) - gradA * alpha;
  let reach = f32(DD) - flow.sigma;
  disp[cell(id)] = vec4f(clamp(flow.dt * f, vec3f(-reach), vec3f(reach)), 0.0);
}

// Each cell's matter lands as a little box (2 sigma wide) centered where it
// moved to. Every cell sums the parts of its neighbors' boxes that overlap it.
@compute @workgroup_size(4, 4, 4)
fn gather(@builtin(global_invocation_id) id: vec3u) {
  let s = flow.sigma;
  var total = 0.0;
  for (var dz = -DD; dz <= DD; dz++) {
    for (var dy = -DD; dy <= DD; dy++) {
      for (var dx = -DD; dx <= DD; dx++) {
        let j = wrapped(vec3i(id) + vec3i(dx, dy, dz));
        let a = state[j];
        if (a == 0.0) { continue; }
        let mu = vec3f(f32(dx), f32(dy), f32(dz)) + disp[j].xyz;
        let overlap = clamp(min(vec3f(0.5), mu + s) - max(vec3f(-0.5), mu - s), vec3f(0.0), vec3f(1.0));
        total += a * overlap.x * overlap.y * overlap.z;
      }
    }
  }
  next[cell(id)] = total / (8.0 * s * s * s);
}

@compute @workgroup_size(4, 4, 4)
fn copy(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  state[i] = next[i];
}

@compute @workgroup_size(4, 4, 4)
fn display(@builtin(global_invocation_id) id: vec3u) {
  var a = 0.0;
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let w = f32((2 - abs(dx)) * (2 - abs(dy)) * (2 - abs(dz)));
        a += state[wrapped(vec3i(id) + vec3i(dx, dy, dz))] * w;
      }
    }
  }
  // which way and how fast its matter is flowing, for coloring
  textureStore(tex, id, vec4f(a / 64.0, disp[cell(id)].xyz / flow.dt));
}`;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// One kernel: up to three soft rings (a: where, w: how wide, b: how strong),
// out to radius R * r, with a soft edge. Center at cell 0, so it wraps.
export const makeKernel = (N, R, {r, a, b, w}) => {
  const k = new Float32Array(N * N * N * 2);
  const radius = R * r;
  let sum = 0;
  for (let z = 0; z < N; z++) {
    const dz = z < N / 2 ? z : z - N;
    for (let y = 0; y < N; y++) {
      const dy = y < N / 2 ? y : y - N;
      for (let x = 0; x < N; x++) {
        const dx = x < N / 2 ? x : x - N;
        const D = Math.hypot(dx, dy, dz) / radius;
        if (D > 1.5) continue; // the soft edge is all but gone by here
        let v = 0;
        for (let i = 0; i < a.length; i++) {
          v += b[i] * Math.exp(-((D - a[i]) ** 2) / w[i]);
        }
        v *= sigmoid(-(D - 1) * 10);
        k[2 * (x + y * N + z * N * N)] = v;
        sum += v;
      }
    }
  }
  for (let i = 0; i < k.length; i += 2) k[i] /= sum;
  return k;
};

export const makeSim = (device, N) => {
  const cells = N * N * N;
  const storage =
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buffer = (size, usage = storage) => device.createBuffer({size, usage});
  const state = buffer(cells * 4);
  const next = buffer(cells * 4);
  const stateHat = buffer(cells * 8);
  const work = buffer(cells * 8);
  const growthField = buffer(cells * 4);
  const disp = buffer(cells * 16);
  const flow = buffer(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const texture = device.createTexture({
    dimension: '3d',
    size: [N, N, N],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  const fftPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({code: fftShader(N)}),
      entryPoint: 'main',
    },
  });
  // forward x, y, z then inverse z, y, x
  const fftPasses = (data) =>
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
    ].map(([axis, inverse]) => {
      const uniform = buffer(
        8,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      );
      device.queue.writeBuffer(uniform, 0, new Uint32Array([axis, inverse]));
      return device.createBindGroup({
        layout: fftPipeline.getBindGroupLayout(0),
        entries: [
          {binding: 0, resource: {buffer: data}},
          {binding: 1, resource: {buffer: uniform}},
        ],
      });
    });
  const stateFft = fftPasses(stateHat).slice(0, 3);
  const workFft = fftPasses(work);
  const runFft = (pass, bindGroup) => {
    pass.setPipeline(fftPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(N, N);
  };

  const module = device.createShaderModule({code: flowShaders(N)});
  const uses = {
    pack: [0, 2],
    multiply: [2, 3, 4, 9],
    accumulate: [3, 5, 7, 9],
    displace: [0, 5, 6, 8],
    gather: [0, 1, 6, 8],
    copy: [0, 1],
    display: [0, 6, 8, 10],
  };
  const pipelines = Object.fromEntries(
    Object.keys(uses).map((entryPoint) => [
      entryPoint,
      device.createComputePipeline({
        layout: 'auto',
        compute: {module, entryPoint},
      }),
    ]),
  );

  // these depend on the number of kernels, so they're made by setRule
  let kernelHat = null;
  let kernelParams = null;
  let pairUniforms = [];
  let bindGroups = null;
  const makeBindGroups = () => {
    const resources = {
      0: {buffer: state},
      1: {buffer: next},
      2: {buffer: stateHat},
      3: {buffer: work},
      4: {buffer: kernelHat},
      5: {buffer: growthField},
      6: {buffer: disp},
      7: {buffer: kernelParams},
      8: {buffer: flow},
      10: texture.createView(),
    };
    const make = (name, pairUniform) =>
      device.createBindGroup({
        layout: pipelines[name].getBindGroupLayout(0),
        entries: uses[name].map((binding) => ({
          binding,
          resource: binding === 9 ? {buffer: pairUniform} : resources[binding],
        })),
      });
    bindGroups = Object.fromEntries(
      Object.keys(uses).map((name) => [
        name,
        uses[name].includes(9)
          ? pairUniforms.map((u) => make(name, u))
          : make(name),
      ]),
    );
  };

  // rule: {R, kernels: [{r, a, b, w, m, s, h}]} (see rule.js)
  const setRule = ({R, kernels}) => {
    const pairs = Math.ceil(kernels.length / 2);
    // an odd one out is paired with a kernel that does nothing
    const padded = [...kernels];
    if (padded.length % 2) padded.push(null);
    kernelHat?.destroy();
    kernelParams?.destroy();
    kernelHat = buffer(pairs * 2 * cells * 8);
    kernelParams = buffer(pairs * 2 * 16);
    device.queue.writeBuffer(
      kernelParams,
      0,
      new Float32Array(
        padded.flatMap((k) => (k ? [k.m, k.s, k.h, 0] : [0, 1, 0, 0])),
      ),
    );
    padded.forEach((k, i) => {
      if (!k) return;
      device.queue.writeBuffer(work, 0, makeKernel(N, R, k));
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      for (const bindGroup of workFft.slice(0, 3)) runFft(pass, bindGroup);
      pass.end();
      encoder.copyBufferToBuffer(work, 0, kernelHat, i * cells * 8, cells * 8);
      device.queue.submit([encoder.finish()]);
    });
    while (pairUniforms.length < pairs) {
      const u = buffer(4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      device.queue.writeBuffer(u, 0, new Uint32Array([pairUniforms.length]));
      pairUniforms.push(u);
    }
    makeBindGroups();
    activePairs = pairs;
  };
  let activePairs = 0;

  const setTimeStep = (dt) =>
    device.queue.writeBuffer(flow, 0, new Float32Array([dt, 0.65, 0, 0]));
  setTimeStep(0.2);

  const setState = (values) => device.queue.writeBuffer(state, 0, values);

  const run = (pass, name, bindGroup = bindGroups[name]) => {
    pass.setPipeline(pipelines[name]);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(N / 4, N / 4, N / 4);
  };

  const step = (encoder, count) => {
    const pass = encoder.beginComputePass();
    for (let s = 0; s < count; s++) {
      run(pass, 'pack');
      for (const bindGroup of stateFft) runFft(pass, bindGroup);
      for (let p = 0; p < activePairs; p++) {
        run(pass, 'multiply', bindGroups.multiply[p]);
        for (const bindGroup of workFft.slice(3)) runFft(pass, bindGroup);
        run(pass, 'accumulate', bindGroups.accumulate[p]);
      }
      run(pass, 'displace');
      run(pass, 'gather');
      run(pass, 'copy');
    }
    run(pass, 'display');
    pass.end();
  };

  const readback = buffer(
    cells * 4,
    GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  );
  const readState = async () => {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(state, 0, readback, 0, cells * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(readback.getMappedRange()).slice();
    readback.unmap();
    return values;
  };

  return {N, texture, setRule, setTimeStep, setState, step, readState};
};
