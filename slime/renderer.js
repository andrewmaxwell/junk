import {bindGroup, bindGroupLayout, loadShader} from './gpu.js';

const HDR = 'rgba16float';

// Draws the trails and agent dots to an HDR texture, then tone maps it to the
// canvas.
export const createRenderer = async (gpu, uniformBuffer) => {
  const {device, context, format} = gpu;
  const {VERTEX, FRAGMENT} = GPUShaderStage;
  const sceneLayout = bindGroupLayout(device, VERTEX | FRAGMENT, [
    'uniform',
    'read-only-storage', // trail
    'read-only-storage', // agents
  ]);
  const postLayout = device.createBindGroupLayout({
    entries: [
      {binding: 0, visibility: FRAGMENT, buffer: {type: 'uniform'}},
      {binding: 1, visibility: FRAGMENT, texture: {}},
    ],
  });
  const [sceneModule, postModule] = await Promise.all([
    loadShader(gpu, 'render'),
    loadShader(gpu, 'post'),
  ]);

  const pipeline = (layout, module, vertex, fragment, target, primitive) =>
    device.createRenderPipeline({
      layout: device.createPipelineLayout({bindGroupLayouts: [layout]}),
      vertex: {module, entryPoint: vertex},
      fragment: {module, entryPoint: fragment, targets: [target]},
      primitive,
    });
  const add = {srcFactor: 'one', dstFactor: 'one'};
  const pipelines = {
    trails: pipeline(sceneLayout, sceneModule, 'fullscreen', 'trailColor', {
      format: HDR,
    }),
    dots: pipeline(
      sceneLayout,
      sceneModule,
      'agentDot',
      'dotColor',
      {format: HDR, blend: {color: add, alpha: add}},
      {topology: 'point-list'},
    ),
    composite: pipeline(postLayout, postModule, 'vs', 'composite', {format}),
  };
  let scene, sceneView, sceneGroups, postGroup, numAgents;

  const resize = (trails, agents, agentCount, width, height) => {
    context.configure({device, format, alphaMode: 'opaque'});
    scene?.destroy();
    scene = device.createTexture({
      size: [width, height],
      format: HDR,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    sceneView = scene.createView();
    numAgents = agentCount;
    sceneGroups = trails.map((trail) =>
      bindGroup(device, sceneLayout, [uniformBuffer, trail, agents]),
    );
    postGroup = device.createBindGroup({
      layout: postLayout,
      entries: [
        {binding: 0, resource: {buffer: uniformBuffer}},
        {binding: 1, resource: sceneView},
      ],
    });
  };

  const draw = (trailIndex) => {
    const encoder = device.createCommandEncoder();
    const renderPass = (view) =>
      encoder.beginRenderPass({
        colorAttachments: [{view, loadOp: 'clear', storeOp: 'store'}],
      });

    const pass = renderPass(sceneView);
    pass.setBindGroup(0, sceneGroups[trailIndex]);
    pass.setPipeline(pipelines.trails);
    pass.draw(3); // one triangle covering the screen
    pass.setPipeline(pipelines.dots);
    pass.draw(numAgents);
    pass.end();

    const post = renderPass(context.getCurrentTexture().createView());
    post.setPipeline(pipelines.composite);
    post.setBindGroup(0, postGroup);
    post.draw(3);
    post.end();
    device.queue.submit([encoder.finish()]);
  };

  return {resize, draw};
};
