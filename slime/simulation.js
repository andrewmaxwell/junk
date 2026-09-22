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

const NUM_AGENTS = 1_000_000;
const SORT_INTERVAL = 32; // steps between agent re-sorts

export const createSimulation = async (gpu, canvas, mouse) => {
  const {adapter, device} = gpu;
  const uniforms = createUniforms(device);
  const layout = bindGroupLayout(device, GPUShaderStage.COMPUTE, [
    'uniform',
    'storage', // agents
    'read-only-storage', // trail in
    'storage', // trail out
    'storage', // deposit
  ]);
  const module = await loadShader(gpu, 'simulate');
  const pipelines = computePipelines(device, layout, module, [
    'initAgents',
    'updateAgents',
    'diffuse',
  ]);
  const [sorter, renderer] = await Promise.all([
    createSorter(gpu, uniforms.buffer),
    createRenderer(gpu, uniforms.buffer),
  ]);

  const state = {width: 0, height: 0, numAgents: NUM_AGENTS, frame: 0};
  let buffers = [];
  let groups, deposit;
  let parity = 0; // which trail buffer is current

  const agentGroups = () => Math.ceil(state.numAgents / 256);

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

  const reset = () => {
    buffers.forEach((b) => b.destroy());
    // Full device resolution, unless that exceeds the GPU's buffer limit.
    const trailBytes = gpu.f16 ? 8 : 16; // four channels per cell
    const maxCells = adapter.limits.maxStorageBufferBindingSize / trailBytes;
    const scale = Math.min(
      devicePixelRatio,
      Math.sqrt(maxCells / (innerWidth * innerHeight)),
    );
    state.width = canvas.width = Math.max(1, Math.floor(innerWidth * scale));
    state.height = canvas.height = Math.max(1, Math.floor(innerHeight * scale));
    state.frame = Math.floor(Math.random() * 2 ** 32);

    const cells = state.width * state.height;
    const agents = storageBuffer(device, state.numAgents * 16);
    const trails = [
      storageBuffer(device, cells * trailBytes),
      storageBuffer(device, cells * trailBytes),
    ];
    deposit = storageBuffer(device, cells * 4); // packed per-species counts
    buffers = [agents, ...trails, deposit];
    groups = [0, 1].map((i) =>
      bindGroup(device, layout, [
        uniforms.buffer,
        agents,
        trails[i],
        trails[1 - i],
        deposit,
      ]),
    );
    sorter.resize(agents, state.numAgents, state.width, state.height);
    renderer.setTrails(trails);
    parity = 0;

    uniforms.write(state, mouse);
    const encoder = device.createCommandEncoder();
    computePass(encoder, [[pipelines.initAgents, agentGroups()]]);
    device.queue.submit([encoder.finish()]);
  };

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

  return {reset, step, draw};
};
