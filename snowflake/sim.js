// The growth model: Gravner and Griffeath's mesoscopic model of snow crystals
// ("Modeling snow-crystal growth: a three-dimensional mesoscopic approach",
// 2009), on a lattice of hexagonal prisms: layers of triangular lattices
// stacked along the crystal's c-axis. Each cell holds:
//   a: 1 if it's part of the crystal, 0 if not
//   b: boundary mass, the quasi-liquid layer on the crystal's surface
//   c: crystal mass, ice that hasn't joined the crystal yet
//   d: diffusive mass, water vapor
// Every step, vapor diffuses, vapor at the crystal's surface freezes into b and
// c, surface cells with enough b join the crystal (more easily the more
// crystal neighbors they have), and a little b and c melt back into vapor.
//
// The crystal has the lattice's twelve-fold planar symmetry and is the same
// above and below its middle layer, so only 1/24 of it is simulated: the
// 30-degree wedge 0 <= r <= q of the axial coordinates (q, r) of the middle
// layer and the layers above it. Lookups outside the wedge fold back into it.

/** Axial neighbor offsets in a layer */
const HEX = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

const common = /* wgsl */ `
struct Params {
  n: i32, nz: i32, layer: i32, unused: u32,
  rho: f32, kappa: f32, mu: f32, gamma: f32,
  b01: f32, b10: f32, b20: f32, b11: f32,
  b21: f32, b30: f32, b31: f32, theta: f32,
  xi: f32, sigma: f32, diff: f32, r2: f32,
}
@group(0) @binding(0) var<uniform> p: Params;

/** A cell's index after folding into the wedge, or -1 past the domain */
fn cell(q0: i32, r0: i32, z0: i32) -> i32 {
  var q = q0;
  var r = r0;
  for (var k = 0; k < 3; k++) {
    if (r < 0) { q += r; r = -r; }
    if (r > q) { let t = q; q = r; r = t; }
  }
  let z = abs(z0);
  if (q >= p.n || z >= p.nz) { return -1; }
  return z * p.layer + q * (q + 1) / 2 + r;
}
`;

/**
 * Bricks: a coarse grid over world space (4 cells on a side) marking where
 * crystal is, padded by a margin, so rays can skip the empty ones. They follow
 * the four extents in the same buffer. World space has the crystal's middle
 * layer in the xz plane and its c-axis along y.
 */
export const brickCode = /* wgsl */ `
const BRICK = 4.0;
const MARGIN = 2.5;
fn brickDims(n: i32, nz: i32) -> vec2i {
  return vec2i((2 * (n + 2) + 3) / 4, (2 * (nz + 1) + 3) / 4);
}
fn brickOff(n: i32, nz: i32) -> vec3f {
  return vec3f(f32(n + 2), f32(nz + 1), f32(n + 2));
}
/** Where brick b's flag is in the extents buffer, or -1 if it's off the grid */
fn brickIndex(b: vec3i, dims: vec2i) -> i32 {
  if (any(b < vec3i(0)) || b.x >= dims.x || b.z >= dims.x || b.y >= dims.y) {
    return -1;
  }
  return 4 + (b.y * dims.x + b.z) * dims.x + b.x;
}
`;

/** Bricks in the grid for a size */
const brickCount = (n, nz) =>
  Math.floor((2 * (n + 2) + 3) / 4) ** 2 * Math.floor((2 * (nz + 1) + 3) / 4);

const neighbors = (fn) =>
  HEX.map(([dq, dr]) => fn(`cell(q + ${dq}, r + ${dr}, z)`)).join(' + ');

const diffuseCode = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read> aIn: array<u32>;
@group(0) @binding(2) var<storage, read> dIn: array<f32>;
@group(0) @binding(3) var<storage, read_write> dOut: array<f32>;
@group(0) @binding(4) var<storage, read_write> ext: array<atomic<u32>>;

/** Vapor next door. The crystal reflects it, and far away it's rho. */
fn nd(j: i32, d0: f32) -> f32 {
  if (j < 0) { return p.rho; }
  if (aIn[j] != 0u) { return d0; }
  return dIn[j];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let q = i32(g.x);
  let r = i32(g.y);
  let z = i32(g.z);
  if (r > q || q >= p.n || z >= p.nz) { return; }
  if (q == 0 && z == 0) { atomicAdd(&ext[3], 1u); }
  let i = z * p.layer + q * (q + 1) / 2 + r;
  if (aIn[i] != 0u) { dOut[i] = 0.0; return; }
  if (z == p.nz - 1 || f32(q * q + q * r + r * r) >= p.r2) {
    dOut[i] = p.rho;
    return;
  }
  let d0 = dIn[i];
  let h = ${neighbors((c) => `nd(${c}, d0)`)};
  let v = nd(cell(q, r, z + 1), d0) + nd(cell(q, r, z - 1), d0);
  // Isotropic: a triangular lattice's Laplacian is 2/3 of its neighbor sum
  dOut[i] = d0 + p.diff * ((2.0 / 3.0) * (h - 6.0 * d0) + (v - 2.0 * d0));
}
`;

const growCode = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read> aIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> aOut: array<u32>;
@group(0) @binding(3) var<storage, read> dIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> dOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> bm: array<f32>;
@group(0) @binding(6) var<storage, read_write> cm: array<f32>;
@group(0) @binding(7) var<storage, read_write> ext: array<atomic<u32>>;

fn inA(j: i32) -> i32 {
  if (j < 0) { return 0; }
  return select(0, 1, aIn[j] != 0u);
}
fn dAt(j: i32) -> f32 {
  if (j < 0) { return p.rho; }
  return dIn[j];
}
${brickCode}

/** Marks the bricks near all 24 copies of a cell that just joined */
fn markBricks(q: i32, r: i32, z: i32) {
  let dims = brickDims(p.n, p.nz);
  let off = brickOff(p.n, p.nz);
  let x0 = f32(q) + 0.5 * f32(r);
  let y0 = f32(r) * 0.8660254;
  for (var k = 0; k < 12; k++) {
    let a = f32(k / 2) * 1.0471976;
    let y1 = select(y0, -y0, (k & 1) == 1);
    let c = cos(a);
    let s = sin(a);
    for (var m = 0; m < 2; m++) {
      let pp = vec3f(c * x0 - s * y1, select(f32(z), -f32(z), m == 1), s * x0 + c * y1);
      let lo = vec3i(floor((pp + off - MARGIN) / BRICK));
      let hi = vec3i(floor((pp + off + MARGIN) / BRICK));
      for (var bx = lo.x; bx <= hi.x; bx++) {
        for (var by = lo.y; by <= hi.y; by++) {
          for (var bz = lo.z; bz <= hi.z; bz++) {
            let j = brickIndex(vec3i(bx, by, bz), dims);
            if (j >= 0) { atomicStore(&ext[j], 1u); }
          }
        }
      }
    }
  }
}

fn hash(x0: u32) -> f32 {
  var x = x0 * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967296.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let q = i32(g.x);
  let r = i32(g.y);
  let z = i32(g.z);
  if (r > q || q >= p.n || z >= p.nz) { return; }
  let i = z * p.layer + q * (q + 1) / 2 + r;
  if (aIn[i] != 0u) {
    aOut[i] = aIn[i];
    dOut[i] = 0.0;
    return;
  }
  var d = dIn[i];
  if (z == p.nz - 1 || f32(q * q + q * r + r * r) >= p.r2) {
    // the far field, where vapor is held at rho: the crystal stops short of it
    aOut[i] = 0u;
    dOut[i] = d;
    return;
  }
  let nT = ${neighbors((c) => `inA(${c})`)};
  let nZ = inA(cell(q, r, z + 1)) + inA(cell(q, r, z - 1));
  if (nT + nZ == 0) {
    aOut[i] = 0u;
    if (p.sigma > 0.0) {
      let step = atomicLoad(&ext[3]);
      d *= 1.0 + p.sigma * (2.0 * hash(u32(i) ^ (step * 2654435761u)) - 1.0);
    }
    dOut[i] = d;
    return;
  }

  // Freezing: the vapor here condenses onto the surface
  var b = bm[i] + (1.0 - p.kappa) * d;
  var c = cm[i] + p.kappa * d;

  // Attachment: the more crystal neighbors, the less boundary mass it takes
  var need = p.b01;
  if (nT >= 4) {
    need = 0.0;
  } else if (nT == 3) {
    need = select(p.b30, p.b31, nZ > 0);
  } else if (nT >= 1) {
    if (nZ > 0) {
      need = select(p.b21, p.b11, nT == 1);
    } else {
      need = select(p.b20, p.b10, nT == 1);
    }
  }
  var attach = b >= need;
  // Concave corners starved of vapor fill in
  if (!attach && nT == 3 && nZ == 0 && b >= p.xi) {
    let local = d + ${neighbors((c) => `dAt(${c})`)};
    attach = local < p.theta;
  }

  if (attach) {
    aOut[i] = 1u;
    cm[i] = b + c;
    bm[i] = 0.0;
    dOut[i] = 0.0;
    atomicMax(&ext[0], u32(ceil(sqrt(f32(q * q + q * r + r * r)))));
    atomicMax(&ext[1], u32(z));
    atomicAdd(&ext[2], 1u);
    markBricks(q, r, z);
  } else {
    // Melting: a little of it evaporates back
    aOut[i] = 0u;
    dOut[i] = p.mu * b + p.gamma * c;
    bm[i] = (1.0 - p.mu) * b;
    cm[i] = (1.0 - p.gamma) * c;
  }
}
`;

// For drawing: the crystal, with its single-cell bumps and pits smoothed away
const smoothCode = /* wgsl */ `
${common}
@group(0) @binding(1) var<storage, read> aIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> sOut: array<f32>;

fn at(j: i32) -> f32 {
  if (j < 0) { return 0.0; }
  return f32(aIn[j]);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let q = i32(g.x);
  let r = i32(g.y);
  let z = i32(g.z);
  if (r > q || q >= p.n || z >= p.nz) { return; }
  let i = z * p.layer + q * (q + 1) / 2 + r;
  let around = ${neighbors((c) => `at(${c})`)}
    + at(cell(q, r, z + 1)) + at(cell(q, r, z - 1));
  sOut[i] = 0.4 * at(i) + 0.6 * around / 8.0;
}
`;

/** The parameters in the order the Params struct holds them */
const PARAM_ORDER = [
  'rho',
  'kappa',
  'mu',
  'gamma',
  'b01',
  'b10',
  'b20',
  'b11',
  'b21',
  'b30',
  'b31',
  'theta',
  'xi',
  'sigma',
  'diff',
];

/**
 * @param {GPUDevice} device
 * @param {{n: number, nz: number}} size cells from the center to the edge, and
 *   layers from the middle to the top
 */
export const makeSim = (device, {n, nz}) => {
  const layer = (n * (n + 1)) / 2;
  const cells = layer * nz;
  const storage =
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const buffer = (size, usage = storage) => device.createBuffer({size, usage});
  const a = [buffer(cells * 4), buffer(cells * 4)];
  const d = [buffer(cells * 4), buffer(cells * 4)];
  const bm = buffer(cells * 4);
  const cm = buffer(cells * 4);
  const field = buffer(cells * 4);
  const ext = buffer(16 + 4 * brickCount(n, nz));
  const extRead = buffer(16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const uniform = buffer(80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

  const pipeline = (code) =>
    device.createComputePipeline({
      layout: 'auto',
      compute: {module: device.createShaderModule({code}), entryPoint: 'main'},
    });
  const diffuse = pipeline(diffuseCode);
  const grow = pipeline(growCode);
  const smooth = pipeline(smoothCode);
  const group = (pipe, buffers) =>
    device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: buffers.map((buf, binding) => ({
        binding,
        resource: {buffer: buf},
      })),
    });
  // [parity]: the crystal is in a[parity] before the step
  const groups = [0, 1].map((k) => ({
    diffuse: group(diffuse, [uniform, a[k], d[0], d[1], ext]),
    grow: group(grow, [uniform, a[k], a[1 - k], d[1], d[0], bm, cm, ext]),
    smooth: group(smooth, [uniform, a[k], field]),
  }));

  let parity = 0;
  let reading = false;
  /** What the last readback found: radius and half-height in cells, cells */
  const extents = {radius: 0, height: 0, cells: 1, steps: 0};

  const reset = (rho) => {
    parity = 0;
    const zeros = new Float32Array(cells);
    device.queue.writeBuffer(bm, 0, zeros);
    device.queue.writeBuffer(cm, 0, zeros);
    device.queue.writeBuffer(a[1], 0, zeros);
    const vapor = new Float32Array(cells).fill(rho);
    vapor[0] = 0;
    device.queue.writeBuffer(d[0], 0, vapor);
    device.queue.writeBuffer(d[1], 0, vapor);
    const crystal = new Uint32Array(cells);
    crystal[0] = 1; // the seed: the center cell
    device.queue.writeBuffer(a[0], 0, crystal);
    device.queue.writeBuffer(cm, 0, new Float32Array([1]));
    const bricks = new Uint32Array(4 + brickCount(n, nz));
    bricks.set([0, 0, 1, 0]);
    // the seed's bricks: the ones around the origin
    const across = Math.floor((2 * (n + 2) + 3) / 4);
    const up = Math.floor((2 * (nz + 1) + 3) / 4);
    const near = (off) => [
      Math.floor((off - 2.5) / 4),
      Math.floor((off + 2.5) / 4),
    ];
    const [x0, x1] = near(n + 2);
    const [y0, y1] = near(nz + 1);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = x0; z <= x1; z++)
          if (x < across && y < up)
            bricks[4 + (y * across + z) * across + x] = 1;
    device.queue.writeBuffer(ext, 0, bricks);
    device.queue.writeBuffer(field, 0, zeros);
    Object.assign(extents, {radius: 0, height: 0, cells: 1, steps: 0});
  };

  const setParams = (params) => {
    const data = new ArrayBuffer(80);
    const ints = new Int32Array(data);
    const floats = new Float32Array(data);
    ints[0] = n;
    ints[1] = nz;
    ints[2] = layer;
    PARAM_ORDER.forEach((key, k) => (floats[4 + k] = params[key]));
    floats[19] = (n - 1) ** 2;
    device.queue.writeBuffer(uniform, 0, data);
  };

  const wg = Math.ceil(n / 8);
  /** Encodes `count` steps */
  const step = (/** @type {GPUCommandEncoder} */ encoder, count) => {
    const pass = encoder.beginComputePass();
    for (let k = 0; k < count; k++) {
      pass.setPipeline(diffuse);
      pass.setBindGroup(0, groups[parity].diffuse);
      pass.dispatchWorkgroups(wg, wg, nz);
      pass.setPipeline(grow);
      pass.setBindGroup(0, groups[parity].grow);
      pass.dispatchWorkgroups(wg, wg, nz);
      parity ^= 1;
    }
    pass.end();
  };

  /** Encodes updating the field drawn from the crystal */
  const smoothField = (/** @type {GPUCommandEncoder} */ encoder) => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(smooth);
    pass.setBindGroup(0, groups[parity].smooth);
    pass.dispatchWorkgroups(wg, wg, nz);
    pass.end();
  };

  /** Starts reading the extents back, if a read isn't already going */
  const readExtents = (/** @type {GPUCommandEncoder} */ encoder) => {
    if (reading) return () => {};
    reading = true;
    encoder.copyBufferToBuffer(ext, 0, extRead, 0, 16);
    return () =>
      extRead.mapAsync(GPUMapMode.READ).then(
        () => {
          const [radius, height, count, done] = new Uint32Array(
            extRead.getMappedRange().slice(0),
          );
          extRead.unmap();
          Object.assign(extents, {radius, height, cells: count, steps: done});
          reading = false;
        },
        () => {},
      );
  };

  return {
    n,
    nz,
    layer,
    cells,
    ext,
    extents,
    /** The smoothed crystal, for drawing */
    field,
    /** For tuning: the crystal seen from above, 1 where any layer is
        crystal, read back */
    async above() {
      const read = device.createBuffer({
        size: cells * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(a[0], 0, read, 0, cells * 4);
      encoder.copyBufferToBuffer(a[1], 0, read, cells * 4, cells * 4);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const both = new Uint32Array(read.getMappedRange().slice(0));
      read.destroy();
      const [x, y] = [both.subarray(0, cells), both.subarray(cells)];
      // the newer copy has the more crystal
      const sum = (c) => c.reduce((t, v) => t + v, 0);
      const now = sum(x) >= sum(y) ? x : y;
      const top = new Uint8Array(layer);
      for (let i = 0; i < cells; i++) if (now[i]) top[i % layer] = 1;
      return top;
    },
    reset,
    setParams,
    step,
    smoothField,
    readExtents,
    destroy: () =>
      [...a, ...d, bm, cm, field, ext, extRead, uniform].forEach((b) =>
        b.destroy(),
      ),
  };
};
