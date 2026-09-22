import {bindGroup, bindGroupLayout, loadShader} from './gpu.js';

// Draws a trail buffer to the canvas, blending the species colors.
export const createRenderer = async (gpu, uniformBuffer) => {
  const {device, context, format} = gpu;
  const layout = bindGroupLayout(device, GPUShaderStage.FRAGMENT, [
    'uniform',
    'read-only-storage',
  ]);
  const module = await loadShader(gpu, 'render');
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts: [layout]}),
    vertex: {module, entryPoint: 'vs'},
    fragment: {module, entryPoint: 'fs', targets: [{format}]},
  });
  let groups;

  const setTrails = (trails) => {
    context.configure({device, format, alphaMode: 'opaque'});
    groups = trails.map((trail) =>
      bindGroup(device, layout, [uniformBuffer, trail]),
    );
  };

  const draw = (trailIndex) => {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, groups[trailIndex]);
    pass.draw(3); // one triangle covering the screen
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  return {setTrails, draw};
};
