import {
  bindGroup,
  bindGroupLayout,
  computePipelines,
  loadShader,
  storageBuffer,
} from './gpu.js';

const TILE = 16; // keep in sync with shaders/sort.wgsl

// Reorders agents by screen tile so the agent pass reads memory coherently.
export const createSorter = async (gpu, uniformBuffer) => {
  const {device} = gpu;
  const layout = bindGroupLayout(device, GPUShaderStage.COMPUTE, [
    'uniform',
    'read-only-storage',
    'storage',
    'storage',
  ]);
  const module = await loadShader(gpu, 'sort');
  const pipelines = computePipelines(device, layout, module, [
    'countTiles',
    'scanTiles',
    'scatter',
  ]);
  let agents, numAgents, sorted, tiles, group;

  const resize = (agentBuffer, agentCount, width, height) => {
    sorted?.destroy();
    tiles?.destroy();
    agents = agentBuffer;
    numAgents = agentCount;
    sorted = storageBuffer(device, numAgents * 16, GPUBufferUsage.COPY_SRC);
    tiles = storageBuffer(
      device,
      Math.ceil(width / TILE) * Math.ceil(height / TILE) * 4,
    );
    group = bindGroup(device, layout, [uniformBuffer, agents, sorted, tiles]);
  };

  const encode = (encoder) => {
    encoder.clearBuffer(tiles);
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, group);
    pass.setPipeline(pipelines.countTiles);
    pass.dispatchWorkgroups(Math.ceil(numAgents / 256));
    pass.setPipeline(pipelines.scanTiles);
    pass.dispatchWorkgroups(1);
    pass.setPipeline(pipelines.scatter);
    pass.dispatchWorkgroups(Math.ceil(numAgents / 256));
    pass.end();
    encoder.copyBufferToBuffer(sorted, 0, agents, 0, numAgents * 16);
  };

  return {resize, encode};
};
