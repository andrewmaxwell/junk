import {bindGroup, bindGroupLayout, loadShader} from './gpu.js';

const HDR = 'rgba16float';
const BLOOM_SCALE = 4; // glow is computed at 1/4 resolution

// Draws the trails (and optionally agent dots) to an HDR texture, then adds
// a blurred glow and tone maps to the canvas.
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
      {binding: 2, visibility: FRAGMENT, sampler: {}},
      {binding: 3, visibility: FRAGMENT, texture: {}},
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
    downsample: pipeline(postLayout, postModule, 'vs', 'downsample', {
      format: HDR,
    }),
    blurH: pipeline(postLayout, postModule, 'vs', 'blurH', {format: HDR}),
    blurV: pipeline(postLayout, postModule, 'vs', 'blurV', {format: HDR}),
    composite: pipeline(postLayout, postModule, 'vs', 'composite', {format}),
  };
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  let textures = [];
  let views, sceneGroups, postGroups, numAgents;

  const resize = (trails, agents, agentCount, width, height) => {
    context.configure({device, format, alphaMode: 'opaque'});
    textures.forEach((t) => t.destroy());
    const texture = (w, h) =>
      device.createTexture({
        size: [Math.max(1, w), Math.max(1, h)],
        format: HDR,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    const [bw, bh] = [width, height].map((n) => Math.ceil(n / BLOOM_SCALE));
    textures = [texture(width, height), texture(bw, bh), texture(bw, bh)];
    const [scene, bloomA, bloomB] = textures.map((t) => t.createView());
    views = {scene, bloomA, bloomB};
    numAgents = agentCount;

    sceneGroups = trails.map((trail) =>
      bindGroup(device, sceneLayout, [uniformBuffer, trail, agents]),
    );
    // `bloom` is only read by composite; the others get any texture they
    // aren't rendering into.
    const postGroup = (src, bloom) =>
      device.createBindGroup({
        layout: postLayout,
        entries: [
          {binding: 0, resource: {buffer: uniformBuffer}},
          {binding: 1, resource: src},
          {binding: 2, resource: sampler},
          {binding: 3, resource: bloom},
        ],
      });
    postGroups = {
      downsample: postGroup(scene, bloomB), // scene -> bloomA
      blurH: postGroup(bloomA, scene), // bloomA -> bloomB
      blurV: postGroup(bloomB, scene), // bloomB -> bloomA
      composite: postGroup(scene, bloomA), // scene + bloomA -> canvas
    };
  };

  const draw = (trailIndex, showDots) => {
    const encoder = device.createCommandEncoder();
    const renderPass = (view) =>
      encoder.beginRenderPass({
        colorAttachments: [{view, loadOp: 'clear', storeOp: 'store'}],
      });

    const pass = renderPass(views.scene);
    pass.setBindGroup(0, sceneGroups[trailIndex]);
    pass.setPipeline(pipelines.trails);
    pass.draw(3); // one triangle covering the screen
    if (showDots) {
      pass.setPipeline(pipelines.dots);
      pass.draw(numAgents);
    }
    pass.end();

    for (const [name, target] of [
      ['downsample', views.bloomA],
      ['blurH', views.bloomB],
      ['blurV', views.bloomA],
      ['composite', context.getCurrentTexture().createView()],
    ]) {
      const post = renderPass(target);
      post.setPipeline(pipelines[name]);
      post.setBindGroup(0, postGroups[name]);
      post.draw(3);
      post.end();
    }
    device.queue.submit([encoder.finish()]);
  };

  return {resize, draw};
};
