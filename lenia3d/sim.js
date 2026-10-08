// 3D Lenia on the GPU. Each step convolves the state with a shell-shaped
// kernel (via FFT, so big kernels cost nothing extra), then nudges every cell
// toward growth or decay a little, so things change smoothly instead of
// flipping whole cells.

const fftShader = (N) => /* wgsl */ `
struct FftParams { axis: u32, inverse: u32 }
@group(0) @binding(0) var<storage, read_write> data: array<vec2f>;
@group(0) @binding(1) var<uniform> fp: FftParams;

const N = ${N}u;
const LOG_N = ${Math.log2(N)}u;
var<workgroup> buf: array<vec2f, N>;

fn cellIndex(a: u32, b: u32, i: u32) -> u32 {
  if (fp.axis == 0u) { return i + a * N + b * N * N; }
  if (fp.axis == 1u) { return a + i * N + b * N * N; }
  return a + b * N + i * N * N;
}

// One workgroup does a whole line of N values along one axis, in shared memory.
@compute @workgroup_size(${N / 2})
fn main(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_index) t: u32) {
  for (var j = 0u; j < 2u; j++) {
    let i = t + j * N / 2u;
    buf[reverseBits(i) >> (32u - LOG_N)] = data[cellIndex(wg.x, wg.y, i)];
  }
  workgroupBarrier();

  let sign = select(-1.0, 1.0, fp.inverse == 1u);
  for (var h = 1u; h < N; h *= 2u) {
    let k = t % h;
    let i0 = (t / h) * 2u * h + k;
    let angle = sign * 3.14159265358979 * f32(k) / f32(h);
    let w = vec2f(cos(angle), sin(angle));
    let u = buf[i0];
    let v = buf[i0 + h];
    let vw = vec2f(v.x * w.x - v.y * w.y, v.x * w.y + v.y * w.x);
    buf[i0] = u + vw;
    buf[i0 + h] = u - vw;
    workgroupBarrier();
  }

  let scale = select(1.0, 1.0 / f32(N), fp.inverse == 1u);
  for (var j = 0u; j < 2u; j++) {
    let i = t + j * N / 2u;
    data[cellIndex(wg.x, wg.y, i)] = buf[i] * scale;
  }
}`;

const cellShaders = (N) => /* wgsl */ `
struct Params { mu: f32, sigma: f32, dt: f32 }
@group(0) @binding(0) var<storage, read_write> state: array<f32>;
@group(0) @binding(1) var<storage, read_write> field: array<vec2f>;
@group(0) @binding(2) var<storage, read> kernelHat: array<vec2f>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var tex: texture_storage_3d<rgba16float, write>;

const N = ${N}u;

fn cell(id: vec3u) -> u32 { return id.x + id.y * N + id.z * N * N; }

fn growth(u: f32) -> f32 {
  let d = (u - params.mu) / params.sigma;
  return 2.0 * exp(-0.5 * d * d) - 1.0;
}

@compute @workgroup_size(4, 4, 4)
fn pack(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  field[i] = vec2f(state[i], 0.0);
}

@compute @workgroup_size(4, 4, 4)
fn multiply(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let a = field[i];
  let b = kernelHat[i];
  field[i] = vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(4, 4, 4)
fn update(@builtin(global_invocation_id) id: vec3u) {
  let i = cell(id);
  let u = field[i].x; // the neighborhood: kernel-weighted average around this cell
  state[i] = clamp(state[i] + params.dt * growth(u), 0.0, 1.0);
}

// What gets drawn: the state, slightly blurred (1-2-1 along each axis) so the
// surface doesn't show the grid, plus the growth rate for coloring.
@compute @workgroup_size(4, 4, 4)
fn display(@builtin(global_invocation_id) id: vec3u) {
  var a = 0.0;
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let p = (vec3i(id) + vec3i(dx, dy, dz) + i32(N)) % i32(N);
        let w = f32((2 - abs(dx)) * (2 - abs(dy)) * (2 - abs(dz)));
        a += state[cell(vec3u(p))] * w;
      }
    }
  }
  let u = field[cell(id)].x;
  textureStore(tex, id, vec4f(a / 64.0, growth(u), u, 1.0));
}`;

// A smooth shell of radius R, with one bump per entry in peaks (inner to outer),
// stored with its center at cell 0 so the convolution wraps around the edges.
export const makeKernel = (N, R, peaks) => {
  const k = new Float32Array(N * N * N * 2);
  let sum = 0;
  for (let z = 0; z < N; z++) {
    const dz = z < N / 2 ? z : z - N;
    for (let y = 0; y < N; y++) {
      const dy = y < N / 2 ? y : y - N;
      for (let x = 0; x < N; x++) {
        const dx = x < N / 2 ? x : x - N;
        const r = (Math.hypot(dx, dy, dz) / R) * peaks.length;
        if (r <= 0 || r >= peaks.length) continue;
        const ring = Math.floor(r);
        const f = r - ring;
        const v = peaks[ring] * Math.exp(4 - 1 / (f * (1 - f)));
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
  const state = device.createBuffer({size: cells * 4, usage: storage});
  const field = device.createBuffer({size: cells * 8, usage: storage});
  const kernelHat = device.createBuffer({size: cells * 8, usage: storage});
  const params = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const texture = device.createTexture({
    dimension: '3d',
    size: [N, N, N],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  const fftModule = device.createShaderModule({code: fftShader(N)});
  const fftPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {module: fftModule, entryPoint: 'main'},
  });
  // forward x, y, z then inverse z, y, x
  const fftPasses = (buffer) =>
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
    ].map(([axis, inverse]) => {
      const uniform = device.createBuffer({
        size: 8,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(uniform, 0, new Uint32Array([axis, inverse]));
      return device.createBindGroup({
        layout: fftPipeline.getBindGroupLayout(0),
        entries: [
          {binding: 0, resource: {buffer}},
          {binding: 1, resource: {buffer: uniform}},
        ],
      });
    });
  const fieldFft = fftPasses(field);
  const kernelFft = fftPasses(kernelHat);

  const cellModule = device.createShaderModule({code: cellShaders(N)});
  const cellPipelines = Object.fromEntries(
    ['pack', 'multiply', 'update', 'display'].map((entryPoint) => [
      entryPoint,
      device.createComputePipeline({
        layout: 'auto',
        compute: {module: cellModule, entryPoint},
      }),
    ]),
  );
  // 'auto' layouts only include the bindings each entry point uses
  const cellBindGroup = (name) => {
    const all = [
      {binding: 0, resource: {buffer: state}},
      {binding: 1, resource: {buffer: field}},
      {binding: 2, resource: {buffer: kernelHat}},
      {binding: 3, resource: {buffer: params}},
      {binding: 4, resource: texture.createView()},
    ];
    const used = {
      pack: [0, 1],
      multiply: [1, 2],
      update: [0, 1, 3],
      display: [0, 1, 3, 4],
    }[name];
    return device.createBindGroup({
      layout: cellPipelines[name].getBindGroupLayout(0),
      entries: all.filter((e) => used.includes(e.binding)),
    });
  };
  const cellBindGroups = {
    pack: cellBindGroup('pack'),
    multiply: cellBindGroup('multiply'),
    update: cellBindGroup('update'),
    display: cellBindGroup('display'),
  };

  const runCells = (pass, name) => {
    pass.setPipeline(cellPipelines[name]);
    pass.setBindGroup(0, cellBindGroups[name]);
    pass.dispatchWorkgroups(N / 4, N / 4, N / 4);
  };
  const runFft = (pass, bindGroup) => {
    pass.setPipeline(fftPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(N, N);
  };

  const setKernel = (R, peaks) => {
    device.queue.writeBuffer(kernelHat, 0, makeKernel(N, R, peaks));
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    for (const bindGroup of kernelFft.slice(0, 3)) runFft(pass, bindGroup);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  const setParams = ({mu, sigma, dt}) =>
    device.queue.writeBuffer(params, 0, new Float32Array([mu, sigma, dt, 0]));

  const setState = (values) => device.queue.writeBuffer(state, 0, values);

  const step = (encoder, count) => {
    const pass = encoder.beginComputePass();
    for (let s = 0; s < count; s++) {
      runCells(pass, 'pack');
      for (const bindGroup of fieldFft.slice(0, 3)) runFft(pass, bindGroup);
      runCells(pass, 'multiply');
      for (const bindGroup of fieldFft.slice(3)) runFft(pass, bindGroup);
      runCells(pass, 'update');
    }
    runCells(pass, 'display');
    pass.end();
  };

  const readback = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const readState = async () => {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(state, 0, readback, 0, cells * 4);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = new Float32Array(readback.getMappedRange()).slice();
    readback.unmap();
    return values;
  };

  return {N, texture, setKernel, setParams, setState, step, readState};
};
