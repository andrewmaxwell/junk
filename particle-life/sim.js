/*
Particle life on the GPU. Each step:

1. clearCells, count: every particle finds its grid cell (cells are at least
   `radius` wide, so everything in reach is in its own cell or the 8 around
   it) and takes the next slot in that cell with an atomic add.
2. prefixSum: turns the per-cell counts into where each cell starts.
3. scatter: copies every particle into its cell's run, so each cell's
   particles sit next to each other in `sorted`.
4. interact: each particle reads its 3x3 block of cells, adds up the forces,
   moves, and writes itself back to `particles`, in sorted order, which keeps
   neighbors close in memory for the next step.

The world wraps around, so the cells next to an edge cell include the ones on
the far side, and distances take the shortest way, which may cross an edge.
*/

const code = /* wgsl */ `
struct Params {
  size: vec2f,
  radius: f32,
  force: f32,
  friction: f32,
  repulsion: f32,
  numParticles: u32,
  numColors: u32,
  cols: u32,
  rows: u32,
  numCells: u32,
  // what the pointer is doing: 0 nothing, 1 stir, 2 pull, 3 push, 4 paint
  tool: u32,
  pointer: vec2f,
  pointerVel: vec2f,
  brushRadius: f32,
  strength: f32,
  paintColor: u32,
  followRadius: f32,
  followCenter: vec2f,
  // everyone pushes everyone away inside this fraction of radius
  core: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
// x = attraction, y = reach as a fraction of radius, for
// [my color * numColors + their color]
@group(0) @binding(1) var<uniform> rules: array<vec4f, 256>;
// xy = position, zw = velocity
@group(0) @binding(2) var<storage, read_write> particles: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> colors: array<u32>;
@group(0) @binding(4) var<storage, read_write> sorted: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> sortedColors: array<u32>;
@group(0) @binding(6) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> cellStart: array<u32>;
// x = cell, y = slot within the cell
@group(0) @binding(8) var<storage, read_write> cellSlot: array<vec2u>;
// xy = summed offsets of the particles near followCenter, z = how many
@group(0) @binding(9) var<storage, read_write> tracked: vec4f;

fn cellOf(p: vec2f) -> vec2u {
  let grid = vec2u(params.cols, params.rows);
  return min(vec2u(p / params.size * vec2f(grid)), grid - 1u);
}

@compute @workgroup_size(256)
fn clearCells(@builtin(global_invocation_id) id: vec3u) {
  if (id.x < params.numCells) {
    atomicStore(&cellCount[id.x], 0u);
  }
}

@compute @workgroup_size(256)
fn count(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.numParticles) {
    return;
  }
  let c = cellOf(particles[i].xy);
  let cell = c.y * params.cols + c.x;
  cellSlot[i] = vec2u(cell, atomicAdd(&cellCount[cell], 1u));
}

var<workgroup> sums: array<u32, 256>;

// One workgroup: each thread totals a run of cells, the totals are scanned in
// shared memory, then each thread writes out its run's starts.
@compute @workgroup_size(256)
fn prefixSum(@builtin(local_invocation_id) lid: vec3u) {
  let n = params.numCells;
  let per = (n + 255u) / 256u;
  let start = min(lid.x * per, n);
  let end = min(start + per, n);
  var total = 0u;
  for (var c = start; c < end; c++) {
    total += atomicLoad(&cellCount[c]);
  }
  sums[lid.x] = total;
  workgroupBarrier();
  for (var offset = 1u; offset < 256u; offset *= 2u) {
    var add = 0u;
    if (lid.x >= offset) {
      add = sums[lid.x - offset];
    }
    workgroupBarrier();
    sums[lid.x] += add;
    workgroupBarrier();
  }
  var run = sums[lid.x] - total;
  for (var c = start; c < end; c++) {
    cellStart[c] = run;
    run += atomicLoad(&cellCount[c]);
  }
  if (lid.x == 255u) {
    cellStart[n] = sums[255];
  }
}

@compute @workgroup_size(256)
fn scatter(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.numParticles) {
    return;
  }
  let cs = cellSlot[i];
  let j = cellStart[cs.x] + cs.y;
  sorted[j] = particles[i];
  sortedColors[j] = colors[i];
}

@compute @workgroup_size(256)
fn interact(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= params.numParticles) {
    return;
  }
  let me = sorted[i];
  let pos = me.xy;
  let myRules = sortedColors[i] * params.numColors;
  let c = vec2i(cellOf(pos));
  let grid = vec2i(i32(params.cols), i32(params.rows));
  let r2 = params.radius * params.radius;
  let core = params.core * params.radius;

  var pull = vec2f(0.0);
  for (var dy = -1; dy <= 1; dy++) {
    let row = u32((c.y + dy + grid.y) % grid.y);
    for (var dx = -1; dx <= 1; dx++) {
      let cell = row * params.cols + u32((c.x + dx + grid.x) % grid.x);
      let end = cellStart[cell + 1u];
      for (var n = cellStart[cell]; n < end; n++) {
        var d = sorted[n].xy - pos;
        d -= params.size * round(d / params.size);
        let dist2 = dot(d, d);
        if (n == i || dist2 >= r2 || dist2 == 0.0) {
          continue;
        }
        let dist = sqrt(dist2);
        var f: f32;
        if (dist < core) {
          // the same for every pair, and growing without bound as particles
          // get closer (up to a cap), so however many pull a blob together,
          // packing it tighter always costs more than they can pay
          f = params.repulsion * (1.0 - core / max(dist, core * 0.25));
        } else {
          let rule = rules[myRules + sortedColors[n]];
          let reach = params.radius * rule.y;
          if (dist >= reach) {
            continue;
          }
          // the pair's attraction, strongest halfway out from the core
          let x = (dist - core) / (reach - core);
          f = rule.x * (1.0 - abs(2.0 * x - 1.0));
        }
        pull += f * d / dist;
      }
    }
  }

  // scaled by radius, so the motion looks the same at any scale
  var vel = me.zw * params.friction + pull * params.force * params.radius;
  var color = sortedColors[i];

  if (params.tool != 0u) {
    var d = pos - params.pointer;
    d -= params.size * round(d / params.size);
    let dist = length(d);
    if (dist < params.brushRadius) {
      let falloff = 1.0 - dist / params.brushRadius;
      let away = d / max(dist, 1e-3);
      // scaled by radius, like everything else that moves
      let push = params.strength * falloff * params.radius * 0.01;
      switch params.tool {
        case 1u: {
          vel += (params.pointerVel - vel) * min(1.0, params.strength * falloff);
        }
        case 2u: {
          vel -= away * push;
        }
        case 3u: {
          vel += away * push;
        }
        case 4u: {
          color = params.paintColor;
        }
        default: {}
      }
    }
  }

  var next = pos + vel;
  next -= params.size * floor(next / params.size);
  particles[i] = vec4f(next, vel);
  colors[i] = color;
}

var<workgroup> trackSums: array<vec3f, 256>;

// One workgroup adds up where the particles near followCenter are, so the
// camera can move to their middle and stay on whatever is there.
@compute @workgroup_size(256)
fn track(@builtin(local_invocation_id) lid: vec3u) {
  var sum = vec3f(0.0);
  let r2 = params.followRadius * params.followRadius;
  for (var i = lid.x; i < params.numParticles; i += 256u) {
    var d = particles[i].xy - params.followCenter;
    d -= params.size * round(d / params.size);
    if (dot(d, d) < r2) {
      sum += vec3f(d, 1.0);
    }
  }
  trackSums[lid.x] = sum;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s >>= 1u) {
    if (lid.x < s) {
      trackSums[lid.x] += trackSums[lid.x + s];
    }
    workgroupBarrier();
  }
  if (lid.x == 0u) {
    tracked = vec4f(trackSums[0], 0.0);
  }
}
`;

const entryPoints = [
  'clearCells',
  'count',
  'prefixSum',
  'scatter',
  'interact',
  'track',
];

export const makeSim = (device) => {
  const module = device.createShaderModule({label: 'sim', code});
  const pipelines = Object.fromEntries(
    entryPoints.map((entryPoint) => [
      entryPoint,
      device.createComputePipeline({
        layout: 'auto',
        compute: {module, entryPoint},
      }),
    ]),
  );

  const paramsBuffer = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const rulesBuffer = device.createBuffer({
    size: 256 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const storage = (size) =>
    device.createBuffer({
      size: Math.max(16, size),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  const tracked = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const trackedRead = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  let tracking = false; // a copy into trackedRead is on its way

  let numParticles = 0;
  let cols = 0;
  let rows = 0;
  let particles, colors, sorted, sortedColors, cellSlot, cellCount, cellStart;
  let bindGroups;

  // 'auto' layouts only include the bindings each entry point uses, so each
  // pipeline gets its own bind group holding just those.
  const used = {
    clearCells: [0, 6],
    count: [0, 2, 6, 8],
    prefixSum: [0, 6, 7],
    scatter: [0, 2, 3, 4, 5, 7, 8],
    interact: [0, 1, 2, 3, 4, 5, 7],
    track: [0, 2, 9],
  };
  const makeBindGroups = () => {
    const buffers = [
      paramsBuffer,
      rulesBuffer,
      particles,
      colors,
      sorted,
      sortedColors,
      cellCount,
      cellStart,
      cellSlot,
      tracked,
    ];
    bindGroups = Object.fromEntries(
      entryPoints.map((name) => [
        name,
        device.createBindGroup({
          layout: pipelines[name].getBindGroupLayout(0),
          entries: used[name].map((binding) => ({
            binding,
            resource: {buffer: buffers[binding]},
          })),
        }),
      ]),
    );
  };

  /** Starts over with these particles: xy = position, zw = velocity. */
  const setParticles = (data, colorData) => {
    numParticles = colorData.length;
    for (const b of [particles, colors, sorted, sortedColors, cellSlot]) {
      b?.destroy();
    }
    particles = storage(numParticles * 16);
    sorted = storage(numParticles * 16);
    colors = storage(numParticles * 4);
    sortedColors = storage(numParticles * 4);
    cellSlot = storage(numParticles * 8);
    device.queue.writeBuffer(particles, 0, data);
    device.queue.writeBuffer(colors, 0, colorData);
    if (cellCount) makeBindGroups();
  };

  /** Cells are at least `radius` wide, and there are at least 3 each way. */
  const setGrid = (width, height, radius) => {
    const nextCols = Math.max(3, Math.floor(width / radius));
    const nextRows = Math.max(3, Math.floor(height / radius));
    if (nextCols === cols && nextRows === rows) return;
    cols = nextCols;
    rows = nextRows;
    cellCount?.destroy();
    cellStart?.destroy();
    cellCount = storage(cols * rows * 4);
    cellStart = storage((cols * rows + 1) * 4);
    if (particles) makeBindGroups();
  };

  /** Each is numColors x numColors, row = my color. */
  const setRules = (attractions, reaches) => {
    const data = new Float32Array(256 * 4);
    attractions.forEach((a, i) => {
      data[i * 4] = a;
      data[i * 4 + 1] = reaches[i];
    });
    device.queue.writeBuffer(rulesBuffer, 0, data);
  };

  /**
   * p: the settings, plus `tool` (0-4, see Params), `pointer` and
   * `pointerVel` in world pixels, and `follow` ({x, y, radius}) to also find
   * the middle of the particles there.
   */
  const step = (encoder, steps, p) => {
    const data = new ArrayBuffer(96);
    const f = new Float32Array(data);
    const u = new Uint32Array(data);
    f.set([p.width, p.height, p.radius, p.force, p.friction, p.repulsion]);
    u.set([numParticles, p.numColors, cols, rows, cols * rows, p.tool], 6);
    f.set([...p.pointer, ...p.pointerVel, p.brushRadius, p.strength], 12);
    u[18] = p.paintColor;
    if (p.follow) f.set([p.follow.radius, p.follow.x, p.follow.y], 19);
    f[22] = p.core;
    device.queue.writeBuffer(paramsBuffer, 0, data);

    const pass = encoder.beginComputePass();
    const run = (name, groups) => {
      pass.setPipeline(pipelines[name]);
      pass.setBindGroup(0, bindGroups[name]);
      pass.dispatchWorkgroups(groups);
    };
    const particleGroups = Math.ceil(numParticles / 256);
    for (let s = 0; s < steps; s++) {
      run('clearCells', Math.ceil((cols * rows) / 256));
      run('count', particleGroups);
      run('prefixSum', 1);
      run('scatter', particleGroups);
      run('interact', particleGroups);
    }
    const track = p.follow && !tracking;
    if (track) run('track', 1);
    pass.end();
    if (track) {
      encoder.copyBufferToBuffer(tracked, 0, trackedRead, 0, 16);
      tracking = true;
    }
  };

  /**
   * Call after submitting a step that was following. Resolves to how far
   * the middle of the particles near the follow point is from it, or null if
   * there was nothing to read or nothing near it.
   */
  const readTracked = async () => {
    if (!tracking || trackedRead.mapState !== 'unmapped') return null;
    await trackedRead.mapAsync(GPUMapMode.READ);
    const [x, y, count] = new Float32Array(trackedRead.getMappedRange());
    trackedRead.unmap();
    tracking = false;
    return count ? {x: x / count, y: y / count} : null;
  };

  return {
    setParticles,
    setGrid,
    setRules,
    step,
    readTracked,
    get particles() {
      return particles;
    },
    get colors() {
      return colors;
    },
    get numParticles() {
      return numParticles;
    },
  };
};
