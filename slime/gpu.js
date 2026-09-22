export const fail = (msg) => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="position:fixed;top:40%;width:100%;text-align:center;color:white;font:18px sans-serif">${msg}</p>`,
  );
  throw new Error(msg);
};

export const initGpu = async (canvas) => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) fail('This needs a browser with WebGPU support.');
  // Half-precision trails halve memory traffic, where supported.
  const f16 = adapter.features.has('shader-f16');
  const device = await adapter.requestDevice({
    requiredFeatures: f16 ? ['shader-f16'] : [],
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });
  device.lost.then((info) => fail(`GPU device lost: ${info.message}`));
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  return {adapter, device, context, format, f16};
};

/**
 * Loads a shader from shaders/, with the shared Params struct prepended and
 * `trail4` aliased to the trail's storage type (f16 when supported).
 */
export const loadShader = async ({device, f16}, name) => {
  const [common, code] = await Promise.all(
    ['params', name].map((n) =>
      fetch(new URL(`shaders/${n}.wgsl`, import.meta.url)).then((r) =>
        r.text(),
      ),
    ),
  );
  const prefix = f16
    ? 'enable f16;\nalias trail4 = vec4<f16>;\n'
    : 'alias trail4 = vec4f;\n';
  return device.createShaderModule({label: name, code: prefix + common + code});
};

/** Buffer types in binding order, e.g. ['uniform', 'storage']. */
export const bindGroupLayout = (device, visibility, types) =>
  device.createBindGroupLayout({
    entries: types.map((type, binding) => ({
      binding,
      visibility,
      buffer: {type},
    })),
  });

/** Buffers in binding order. */
export const bindGroup = (device, layout, buffers) =>
  device.createBindGroup({
    layout,
    entries: buffers.map((buffer, binding) => ({binding, resource: {buffer}})),
  });

/** Returns {entryPoint: pipeline} for each compute entry point in the module. */
export const computePipelines = (device, bindLayout, module, entryPoints) => {
  const layout = device.createPipelineLayout({bindGroupLayouts: [bindLayout]});
  return Object.fromEntries(
    entryPoints.map((entryPoint) => [
      entryPoint,
      device.createComputePipeline({layout, compute: {module, entryPoint}}),
    ]),
  );
};

export const storageBuffer = (device, size, extraUsage = 0) =>
  device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | extraUsage,
  });
