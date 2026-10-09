import {fftShader} from './fft.js';

// Flow-Lenia (Plantec et al. 2023) in 3D. Like Lenia, each kernel turns the
// neighborhood into growth, but instead of cells growing or dying, matter
// flows up the growth gradient (and away from crowding), so the total amount
// never changes: nothing can die out or explode into foam.
//
// There can be up to three kinds of matter (channels). Each kernel looks at
// one kind and pushes another (or the same) kind around, so they can chase,
// wrap around, or avoid each other.
//
// Each step: each channel's FFT, then for each pair of kernels one inverse FFT
// (two real results fit in one complex one), summed into each channel's growth
// field; then every cell works out where its matter goes, and every cell
// gathers what lands on it from its neighbors (reintegration tracking).

const DD = 2; // how far matter can come from, in cells
export const MAX_CHANNELS = 3;
export const MAX_KERNELS = 12;
export const GENES = 16; // kernel weights, then a lineage color, then spare

const flowShaders = (N) => /* wgsl */ `
struct Flow { dt: f32, sigma: f32, channels: u32, colorMode: u32 }
@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<storage, read_write> next: array<f32>;
@group(0) @binding(2) var<storage, read_write> stateHat: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> work: array<vec2f>;
@group(0) @binding(4) var<storage, read> kernelHat: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> growthField: array<f32>;
@group(0) @binding(6) var<storage, read_write> disp: array<vec4f>;
@group(0) @binding(7) var<storage, read> kernels: array<vec4f>; // m, s, unused, target channel
@group(0) @binding(8) var<uniform> flow: Flow;
// a pair of kernels (index, source channel of each), or a channel (x)
@group(0) @binding(9) var<uniform> which: vec4u;
@group(0) @binding(10) var tex: texture_storage_3d<rgba16float, write>;
// Each cell's genome: how strongly each kernel counts there (up to 12), then
// a lineage color. It travels with the matter.
@group(0) @binding(11) var<storage, read_write> genome: array<f32>;
@group(0) @binding(12) var<storage, read_write> nextGenome: array<f32>;
struct Mutation { center: vec3f, radius: f32, color: vec3f, seed: u32 }
@group(0) @binding(13) var<uniform> mutation: Mutation;

const N = ${N}u;
const CELLS = ${N * N * N}u;
const DD = ${DD};
const GENES = ${GENES}u;
const COLOR = ${MAX_KERNELS}u; // where the lineage color starts in a genome

fn cell(id: vec3u) -> u32 { return id.x + id.y * N + id.z * N * N; }
fn wrapped(p: vec3i) -> u32 { return cell(vec3u((p + i32(N)) % i32(N))); }

fn growth(u: f32, k: vec4f) -> f32 {
  let d = (u - k.x) / k.y;
  return 2.0 * exp(-0.5 * d * d) - 1.0;
}

fn hash(x: u32) -> u32 {
  var h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return (h >> 22u) ^ h;
}

fn total(i: u32) -> f32 {
  var a = 0.0;
  for (var c = 0u; c < flow.channels; c++) { a += state[c * CELLS + i]; }
  return a;
}

@compute @workgroup_size(4, 4, 4)
fn pack(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  for (var c = 0u; c < flow.channels; c++) {
    stateHat[c * CELLS + i] = vec2f(state[c * CELLS + i], 0.0);
    growthField[c * CELLS + i] = 0.0;
  }
}

fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

// two kernels at once: the first's result comes out real, the second's imaginary
@compute @workgroup_size(4, 4, 4)
fn multiply(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let p = cmul(stateHat[which.y * CELLS + i], kernelHat[2u * which.x * CELLS + i]);
  let q = cmul(stateHat[which.z * CELLS + i], kernelHat[(2u * which.x + 1u) * CELLS + i]);
  work[i] = vec2f(p.x - q.y, p.y + q.x);
}

@compute @workgroup_size(4, 4, 4)
fn accumulate(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let u = work[i];
  let k1 = kernels[2u * which.x];
  let k2 = kernels[2u * which.x + 1u];
  // each kernel's weight here comes from this cell's genome
  let h1 = genome[i * GENES + 2u * which.x];
  let h2 = genome[i * GENES + 2u * which.x + 1u];
  growthField[u32(k1.w) * CELLS + i] += h1 * growth(u.x, k1);
  growthField[u32(k2.w) * CELLS + i] += h2 * growth(u.y, k2);
}

// Smoothed gradients of a channel's growth and of all the matter. Matter flows
// up its growth gradient, but where it's crowded (near 1 or more, counting
// every kind) it mostly spreads out instead.
@compute @workgroup_size(4, 4, 4)
fn displace(@builtin(global_invocation_id) id: vec3u) {
  let c = which.x;
  var gradG = vec3f(0.0);
  var gradA = vec3f(0.0);
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let o = vec3f(f32(dx), f32(dy), f32(dz));
        let w = 2.0 - abs(o);
        let weight = o * vec3f(w.y * w.z, w.x * w.z, w.x * w.y) / 4.0;
        let j = wrapped(vec3i(id) + vec3i(dx, dy, dz));
        gradG += growthField[c * CELLS + j] * weight;
        gradA += total(j) * weight;
      }
    }
  }
  let a = total(cell(id));
  let alpha = clamp(a * a, 0.0, 1.0);
  let f = gradG * (1.0 - alpha) - gradA * alpha;
  let reach = f32(DD) - flow.sigma;
  disp[c * CELLS + cell(id)] = vec4f(clamp(flow.dt * f, vec3f(-reach), vec3f(reach)), 0.0);
}

// Each cell's matter lands as a little box (2 sigma wide) centered where it
// moved to. Every cell sums the parts of its neighbors' boxes that overlap it.
@compute @workgroup_size(4, 4, 4)
fn gather(@builtin(global_invocation_id) id: vec3u) {
  let c = which.x;
  let s = flow.sigma;
  var sum = 0.0;
  for (var dz = -DD; dz <= DD; dz++) {
    for (var dy = -DD; dy <= DD; dy++) {
      for (var dx = -DD; dx <= DD; dx++) {
        let j = c * CELLS + wrapped(vec3i(id) + vec3i(dx, dy, dz));
        let a = state[j];
        if (a == 0.0) { continue; }
        let mu = vec3f(f32(dx), f32(dy), f32(dz)) + disp[j].xyz;
        let overlap = clamp(min(vec3f(0.5), mu + s) - max(vec3f(-0.5), mu - s), vec3f(0.0), vec3f(1.0));
        sum += a * overlap.x * overlap.y * overlap.z;
      }
    }
  }
  next[c * CELLS + cell(id)] = sum / (8.0 * s * s * s);
}

// A cell's new genome is the genome of one of the cells whose matter landed
// on it, picked at random in proportion to how much each brought (of every
// kind). Where bodies with different genomes meet, they mix cell by cell.
@compute @workgroup_size(4, 4, 4)
fn inherit(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let s = flow.sigma;
  var seen = 0.0;
  var chosen = i;
  var random = hash(i ^ bitcast<u32>(state[i] + disp[i].x));
  for (var dz = -DD; dz <= DD; dz++) {
    for (var dy = -DD; dy <= DD; dy++) {
      for (var dx = -DD; dx <= DD; dx++) {
        let j = wrapped(vec3i(id) + vec3i(dx, dy, dz));
        var brought = 0.0;
        for (var c = 0u; c < flow.channels; c++) {
          let a = state[c * CELLS + j];
          if (a == 0.0) { continue; }
          let mu = vec3f(f32(dx), f32(dy), f32(dz)) + disp[c * CELLS + j].xyz;
          let overlap = clamp(min(vec3f(0.5), mu + s) - max(vec3f(-0.5), mu - s), vec3f(0.0), vec3f(1.0));
          brought += a * overlap.x * overlap.y * overlap.z;
        }
        if (brought <= 0.0) { continue; }
        // keep each candidate with chance brought / everything seen so far
        seen += brought;
        random = hash(random);
        if (f32(random >> 8u) / 16777216.0 * seen < brought) { chosen = j; }
      }
    }
  }
  for (var g = 0u; g < GENES; g++) { nextGenome[i * GENES + g] = genome[chosen * GENES + g]; }
}

// A mutation: every cell within a small ball gets the same new lineage color
// and the same random change to each kernel's weight (up to about double or
// half), so the mutant starts out as a little group that may take over or die
// out.
@compute @workgroup_size(4, 4, 4)
fn mutate(@builtin(global_invocation_id) id: vec3u) {
  let d = abs(vec3f(id) - mutation.center);
  if (length(min(d, f32(N) - d)) > mutation.radius) { return; }
  let i = cell(id);
  for (var k = 0u; k < COLOR; k++) {
    let r = f32(hash(mutation.seed + k * 7919u) >> 8u) / 16777216.0;
    genome[i * GENES + k] = clamp(genome[i * GENES + k] * exp((r * 2.0 - 1.0) * 0.7), 0.0, 1.0);
  }
  genome[i * GENES + COLOR] = mutation.color.x;
  genome[i * GENES + COLOR + 1u] = mutation.color.y;
  genome[i * GENES + COLOR + 2u] = mutation.color.z;
}

@compute @workgroup_size(4, 4, 4)
fn copy(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  for (var c = 0u; c < flow.channels; c++) { state[c * CELLS + i] = next[c * CELLS + i]; }
  for (var g = 0u; g < GENES; g++) { genome[i * GENES + g] = nextGenome[i * GENES + g]; }
}

// What gets drawn: all the matter, slightly blurred so the surface doesn't
// show the grid, and for coloring (colorMode): which way it's flowing (0), how
// much there is of each kind (1), or its lineage color (2).
@compute @workgroup_size(4, 4, 4)
fn display(@builtin(global_invocation_id) id: vec3u) {
  var each = vec3f(0.0);
  var lineage = vec3f(0.0);
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let w = f32((2 - abs(dx)) * (2 - abs(dy)) * (2 - abs(dz))) / 64.0;
        let j = wrapped(vec3i(id) + vec3i(dx, dy, dz));
        var here = 0.0;
        for (var c = 0u; c < flow.channels; c++) {
          each[c] += state[c * CELLS + j] * w;
          here += state[c * CELLS + j] * w;
        }
        lineage += here * vec3f(genome[j * GENES + COLOR], genome[j * GENES + COLOR + 1u], genome[j * GENES + COLOR + 2u]);
      }
    }
  }
  let a = each.x + each.y + each.z;
  var extra = each;
  if (flow.colorMode == 0u) { extra = disp[cell(id)].xyz / flow.dt; }
  if (flow.colorMode == 2u) { extra = lineage / max(a, 1e-6); }
  textureStore(tex, id, vec4f(a, extra));
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
  const C = MAX_CHANNELS;
  const storage =
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buffer = (size, usage = storage) => device.createBuffer({size, usage});
  const uniform = (size) =>
    buffer(size, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const state = buffer(C * cells * 4);
  const next = buffer(C * cells * 4);
  const stateHat = buffer(C * cells * 8);
  const work = buffer(cells * 8);
  const growthField = buffer(C * cells * 4);
  const disp = buffer(C * cells * 16);
  const genome = buffer(cells * GENES * 4);
  const mutation = uniform(32);
  const nextGenome = buffer(cells * GENES * 4);
  const flow = uniform(16);
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
  // forward x, y, z then inverse z, y, x, on one N³ block of a buffer
  const fftPasses = (data, offset = 0) =>
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
    ].map(([axis, inverse]) => {
      const u = uniform(8);
      device.queue.writeBuffer(u, 0, new Uint32Array([axis, inverse]));
      return device.createBindGroup({
        layout: fftPipeline.getBindGroupLayout(0),
        entries: [
          {binding: 0, resource: {buffer: data, offset, size: cells * 8}},
          {binding: 1, resource: {buffer: u}},
        ],
      });
    });
  const stateFft = Array.from({length: C}, (_, c) =>
    fftPasses(stateHat, c * cells * 8).slice(0, 3),
  );
  const workFft = fftPasses(work);
  const runFft = (pass, bindGroup) => {
    pass.setPipeline(fftPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(N, N);
  };

  const module = device.createShaderModule({code: flowShaders(N)});
  const uses = {
    pack: [0, 2, 5, 8],
    multiply: [2, 3, 4, 9],
    accumulate: [3, 5, 7, 9, 11],
    displace: [0, 5, 6, 8, 9],
    gather: [0, 1, 6, 8, 9],
    inherit: [0, 6, 8, 11, 12],
    mutate: [11, 13],
    copy: [0, 1, 8, 11, 12],
    display: [0, 6, 8, 10, 11],
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

  const channelUniforms = Array.from({length: C}, (_, c) => {
    const u = uniform(16);
    device.queue.writeBuffer(u, 0, new Uint32Array([c, 0, 0, 0]));
    return u;
  });

  // these depend on the rule, so they're made by setRule
  let kernelHat = null;
  let kernelParams = null;
  let pairUniforms = [];
  let bindGroups = null;
  let channels = 1;
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
      11: {buffer: genome},
      12: {buffer: nextGenome},
      13: {buffer: mutation},
    };
    const make = (name, which) =>
      device.createBindGroup({
        layout: pipelines[name].getBindGroupLayout(0),
        entries: uses[name].map((binding) => ({
          binding,
          resource: binding === 9 ? {buffer: which} : resources[binding],
        })),
      });
    const perPair = ['multiply', 'accumulate'];
    bindGroups = Object.fromEntries(
      Object.keys(uses).map((name) => [
        name,
        perPair.includes(name)
          ? pairUniforms.map((u) => make(name, u))
          : uses[name].includes(9)
            ? channelUniforms.map((u) => make(name, u))
            : make(name),
      ]),
    );
  };

  let dt = 0.2;
  let colorMode = 0;
  const writeFlow = () => {
    const data = new ArrayBuffer(16);
    new Float32Array(data, 0, 2).set([dt, 0.65]);
    new Uint32Array(data, 8, 2).set([channels, colorMode]);
    device.queue.writeBuffer(flow, 0, data);
  };

  // rule: {R, channels, kernels: [{r, a, b, w, m, s, h, from, to}]} (see rule.js)
  const setRule = (rule) => {
    const {R, kernels} = rule;
    channels = rule.channels ?? 1;
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
        padded.flatMap((k) => (k ? [k.m, k.s, 0, k.to ?? 0] : [0, 1, 0, 0])),
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
    pairUniforms.forEach((u) => u.destroy());
    pairUniforms = Array.from({length: pairs}, (_, p) => {
      const u = uniform(16);
      const from = (k) => k?.from ?? 0;
      device.queue.writeBuffer(
        u,
        0,
        new Uint32Array([p, from(padded[2 * p]), from(padded[2 * p + 1]), 0]),
      );
      return u;
    });
    makeBindGroups();
    writeFlow();
  };

  const setTimeStep = (value) => {
    dt = value;
    writeFlow();
  };

  // what the display pass puts beside the density: 0 flow, 1 kinds, 2 lineage
  const setColorMode = (value) => {
    colorMode = value;
    writeFlow();
  };

  // a new lineage in a ball of the given radius at a random place, with a
  // random color
  const mutate = (radius) => {
    const data = new ArrayBuffer(32);
    const hue = Math.random() * Math.PI * 2;
    const color = [0, 2, 4].map(
      (o) => 0.6 + 0.4 * Math.cos(hue - (o * Math.PI) / 3),
    );
    new Float32Array(data, 0, 7).set([
      ...[0, 1, 2].map(() => Math.random() * N),
      radius,
      ...color,
    ]);
    new Uint32Array(data, 28, 1).set([(Math.random() * 2 ** 32) >>> 0]);
    device.queue.writeBuffer(mutation, 0, data);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    run(pass, 'mutate');
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  // values: each channel's N³ cells, one after another
  const setState = (values) => device.queue.writeBuffer(state, 0, values);
  // values: GENES numbers per cell (see seed.js)
  const setGenomes = (values) => device.queue.writeBuffer(genome, 0, values);

  const run = (pass, name, bindGroup = bindGroups[name]) => {
    pass.setPipeline(pipelines[name]);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(N / 4, N / 4, N / 4);
  };

  const step = (encoder, count) => {
    const pass = encoder.beginComputePass();
    for (let s = 0; s < count; s++) {
      run(pass, 'pack');
      for (let c = 0; c < channels; c++) {
        for (const bindGroup of stateFft[c]) runFft(pass, bindGroup);
      }
      bindGroups.multiply.forEach((multiply, p) => {
        run(pass, 'multiply', multiply);
        for (const bindGroup of workFft.slice(3)) runFft(pass, bindGroup);
        run(pass, 'accumulate', bindGroups.accumulate[p]);
      });
      for (let c = 0; c < channels; c++) {
        run(pass, 'displace', bindGroups.displace[c]);
        run(pass, 'gather', bindGroups.gather[c]);
      }
      run(pass, 'inherit');
      run(pass, 'copy');
    }
    run(pass, 'display');
    pass.end();
  };

  // all the matter in each cell, every kind together
  const readback = buffer(
    C * cells * 4,
    GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  );
  const readState = async () => {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(state, 0, readback, 0, channels * cells * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ, 0, channels * cells * 4);
    const all = new Float32Array(
      readback.getMappedRange(0, channels * cells * 4),
    );
    const values = all.slice(0, cells);
    for (let c = 1; c < channels; c++) {
      for (let i = 0; i < cells; i++) values[i] += all[c * cells + i];
    }
    readback.unmap();
    return values;
  };

  return {
    N,
    texture,
    setRule,
    setTimeStep,
    setColorMode,
    setState,
    setGenomes,
    mutate,
    step,
    readState,
    channels: () => channels,
  };
};
