import {
  bindGroup,
  bindGroupLayout,
  computePipelines,
  loadShader,
  storageBuffer,
} from './gpu.js';
import {createUniforms} from './uniforms.js';
import {createSorter} from './sorter.js';
import {createRenderer} from './renderer.js';

const SORT_INTERVAL = 32; // steps between agent re-sorts
const AGENT_DENSITY = 0.2; // agents per grid cell
const MAX_AGENTS = 4_000_000;
// calibrate() sizes the grid so a step takes about this long (as measured
// here, including submission overhead), leaving the pacer room for several
// steps per frame.
const TARGET_STEP_MS = 6;
const MIN_QUALITY = 0.1; // never fewer than 10% of full-resolution cells

export const createSimulation = async (gpu, canvas, mouse) => {
  const {adapter, device} = gpu;
  const uniforms = createUniforms(device);
  const layout = bindGroupLayout(device, GPUShaderStage.COMPUTE, [
    'uniform',
    'storage', // agents
    'read-only-storage', // trail in
    'storage', // trail out
    'storage', // deposit
    'storage', // drawing
  ]);
  const module = await loadShader(gpu, 'simulate');
  const pipelines = computePipelines(device, layout, module, [
    'initAgents',
    'updateAgents',
    'diffuse',
    'restoreDrawing',
    'clearFood',
  ]);
  const [sorter, renderer] = await Promise.all([
    createSorter(gpu, uniforms.buffer),
    createRenderer(gpu, uniforms.buffer),
  ]);

  const state = {width: 0, height: 0, numAgents: 0, frame: 0};
  const trailBytes = gpu.f16 ? 8 : 16; // four channels per cell
  let quality = 1; // fraction of full-resolution cells, set by calibrate()
  let buffers = []; // everything sized by the grid
  let groups, deposit, drawing;
  let parity = 0; // which trail buffer is current

  const agentGroups = () => Math.ceil(state.numAgents / 256);
  const cellGroups = () => Math.ceil((state.width * state.height) / 256);

  // Runs [pipeline, workgroupsX, workgroupsY?] dispatches in one compute pass.
  const computePass = (encoder, dispatches) => {
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, groups[parity]);
    for (const [pipeline, x, y = 1] of dispatches) {
      pass.setPipeline(pipeline);
      pass.dispatchWorkgroups(x, y);
    }
    pass.end();
  };

  /** Runs one pass that writes the other trail buffer, making it current. */
  const trailPass = (pipeline, before) => {
    uniforms.write(state, mouse);
    const encoder = device.createCommandEncoder();
    before?.(encoder);
    computePass(encoder, [[pipeline, cellGroups()]]);
    device.queue.submit([encoder.finish()]);
    parity = 1 - parity;
  };

  // Allocates the grid, and agents in proportion to it.
  const resize = (width, height) => {
    buffers.forEach((b) => b.destroy());
    state.width = canvas.width = width;
    state.height = canvas.height = height;
    const cells = width * height;
    state.numAgents = Math.min(MAX_AGENTS, Math.round(cells * AGENT_DENSITY));
    const agents = storageBuffer(device, state.numAgents * 16);
    const trails = [
      storageBuffer(device, cells * trailBytes),
      storageBuffer(device, cells * trailBytes),
    ];
    deposit = storageBuffer(device, cells * 4); // packed per-species counts
    drawing = storageBuffer(device, cells * 4);
    buffers = [agents, ...trails, deposit, drawing];
    groups = [0, 1].map((i) =>
      bindGroup(device, layout, [
        uniforms.buffer,
        agents,
        trails[i],
        trails[1 - i],
        deposit,
        drawing,
      ]),
    );
    sorter.resize(agents, state.numAgents, width, height);
    renderer.resize(trails, agents, state.numAgents, width, height);
    parity = 0;
  };

  /**
   * Restarts the colony. The drawing (food and walls) is kept, with eaten
   * food restored, unless the window size changed.
   */
  const reset = () => {
    // Device resolution scaled by quality, within the GPU's buffer limit.
    const maxCells = adapter.limits.maxStorageBufferBindingSize / trailBytes;
    const cssPixels = innerWidth * innerHeight;
    const scale = Math.sqrt(
      Math.min(devicePixelRatio ** 2 * quality, maxCells / cssPixels),
    );
    const width = Math.max(1, Math.floor(innerWidth * scale));
    const height = Math.max(1, Math.floor(innerHeight * scale));
    if (width !== state.width || height !== state.height) resize(width, height);

    state.frame = Math.floor(Math.random() * 2 ** 32);
    trailPass(pipelines.restoreDrawing);
    uniforms.write(state, mouse);
    const encoder = device.createCommandEncoder();
    computePass(encoder, [[pipelines.initAgents, agentGroups()]]);
    device.queue.submit([encoder.finish()]);
  };

  /**
   * Times a few steps on a quarter-size grid and picks the grid size (and so
   * the agent count) for this device. Cost is roughly proportional to cells.
   */
  const calibrate = async () => {
    quality = 0.25;
    reset();
    const run = async (steps) => {
      for (let i = 0; i < steps; i++) step();
      await done();
    };
    await run(30); // warm up, and let the GPU clock up
    // Best of three, since timings are noisy while the GPU settles.
    let msPerStep = Infinity;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await run(20);
      msPerStep = Math.min(msPerStep, (performance.now() - start) / 20);
    }
    const fullCells = (state.width * state.height) / quality;
    quality = Math.min(
      1,
      Math.max(MIN_QUALITY, (quality * TARGET_STEP_MS) / msPerStep),
    );
    reset();
    console.info(
      `slime: ${msPerStep.toFixed(2)} ms/step at 25% resolution, running at ` +
        `${Math.round(quality * 100)}%: ${state.width}×${state.height} cells, ` +
        `${state.numAgents.toLocaleString()} agents (${Math.round(fullCells).toLocaleString()} cells at 100%)`,
    );
  };

  /** Removes all food and walls, leaving the colony running. */
  const clearDrawing = () =>
    trailPass(pipelines.clearFood, (encoder) => encoder.clearBuffer(drawing));

  const step = () => {
    state.frame = (state.frame + 1) >>> 0;
    uniforms.write(state, mouse);
    const encoder = device.createCommandEncoder();
    computePass(encoder, [
      [pipelines.updateAgents, agentGroups()],
      [
        pipelines.diffuse,
        Math.ceil(state.width / 16),
        Math.ceil(state.height / 16),
      ],
    ]);
    encoder.clearBuffer(deposit);
    // This step painted the stroke up to here; the next one continues from it.
    [mouse.lastX, mouse.lastY] = [mouse.x, mouse.y];
    if (state.frame % SORT_INTERVAL === 0) sorter.encode(encoder);
    device.queue.submit([encoder.finish()]);
    parity = 1 - parity;
  };

  const draw = () => {
    uniforms.write(state, mouse);
    renderer.draw(parity);
  };

  /** Resolves when all GPU work submitted so far has finished. */
  const done = () => device.queue.onSubmittedWorkDone();

  return {calibrate, reset, clearDrawing, step, draw, done};
};
