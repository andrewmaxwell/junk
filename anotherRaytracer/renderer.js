// The WebGPU side: the shaders' pipelines and buffers, and drawing frames.
// Samples add up across frames until something restarts them.

import {albedoTable} from './ggx.js';
import {settings, toneCurves, view} from './settings.js';
import {packObjects, LIGHT, isBounded} from './shapes.js';
import {denoiseShader} from './shaders/denoise.js';
import {displayShader} from './shaders/display.js';
import {glowShader} from './shaders/glow.js';
import {tileShader} from './shaders/tiles.js';
import {traceShader} from './shaders/trace.js';
import {
  PHOTONS,
  PHOTON_CELLS,
  PHOTON_MAP_SIZE,
  photonShader,
} from './shaders/photons.js';
import {photonEmitters} from './photons.js';
import {packDiamond} from './diamond.js';
import {packTeapot} from './teapot.js';

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const stats = /** @type {HTMLElement} */ (document.querySelector('#stats'));

/**
 * In SDR, lights clamp at the brightness each tone curve shows as white
 * (see shaders/tone.js): about 4 for toneMap, and 2^AGX_MAX_EV for agx
 */
const sdrWhite = {clip: 1, ease: 4, filmic: 16};

/**
 * How far around a point the first frame gathers photons from, in units of
 * the bumps' size (a 300th of the scene)
 */
const PHOTON_RADIUS = 1;

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
  stats.textContent = 'This needs WebGPU.';
  throw new Error('No WebGPU');
}
const device = await adapter.requestDevice({
  // The sums buffer is 16 bytes per pixel, which can pass the default limit
  // on big screens
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});
/** Set once something has gone wrong for good */
export let failure = '';
/** Shows a problem where people will see it, rather than a frozen image */
const fail = (/** @type {string} */ message) => {
  failure = message;
  stats.textContent = message;
};
device.addEventListener('uncapturederror', (e) =>
  fail(
    `GPU error: ${/** @type {GPUUncapturedErrorEvent} */ (e).error.message}`,
  ),
);
device.lost.then((info) =>
  fail(
    `The GPU stopped (${info.message || info.reason}). Reload to try again.`,
  ),
);

const context = /** @type {GPUCanvasContext} */ (canvas.getContext('webgpu'));
/** Sets the canvas up for view.hdr */
export const configure = () =>
  context.configure({
    device,
    // Float, so values over 1 survive to the screen
    format: 'rgba16float',
    alphaMode: 'opaque',
    // 'extended' shows values over 1 as brighter than white
    toneMapping: {mode: view.hdr ? 'extended' : 'standard'},
  });
configure();

/** @type {(code: string) => GPUShaderModule} */
const compile = (code) => {
  const module = device.createShaderModule({code});
  module.getCompilationInfo().then(({messages}) => {
    for (const m of messages) {
      const text = `${m.lineNum}:${m.linePos} ${m.message}`;
      if (m.type === 'error') fail(`Shader error: ${text}`);
      console[m.type === 'error' ? 'error' : 'warn'](text);
    }
  });
  return module;
};

/** @type {(module: GPUShaderModule, entryPoint?: string) => GPUComputePipeline} */
const computePipeline = (module, entryPoint) =>
  device.createComputePipeline({
    layout: 'auto',
    compute: {module, entryPoint},
  });
const tracePipeline = computePipeline(compile(traceShader));
const photonPipeline = computePipeline(compile(photonShader));
const tilePipeline = computePipeline(compile(tileShader));
const displayModule = compile(displayShader);
const displayPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {module: displayModule},
  fragment: {module: displayModule, targets: [{format: 'rgba16float'}]},
});
const glowModule = compile(glowShader);
// The lens glow's three passes, in order
const glowPipelines = ['downsample', 'blurRows', 'blurColumns'].map((entry) =>
  computePipeline(glowModule, entry),
);
const denoiseModule = compile(denoiseShader);
const [preparePipeline, blurPipeline] = ['prepare', 'blur'].map((entry) =>
  computePipeline(denoiseModule, entry),
);

/** @type {(data: ArrayBufferView, usage: number) => GPUBuffer} */
const bufferWith = (data, usage) => {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
};
// The denoiser's passes reach 1, 2, 4, 8 and 16 pixels apart
const strideBuffers = [1, 2, 4, 8, 16].map((stride) =>
  bufferWith(new Int32Array([stride, 0, 0, 0]), GPUBufferUsage.UNIFORM),
);
/** For rough reflections' lost light; see ggx.js */
const singleBounceBuffer = bufferWith(albedoTable(), GPUBufferUsage.UNIFORM);

// Params in shaders/common.js: 4 × (vec3f + u32), then 31 scalars, padded to
// a multiple of 16 bytes
const paramsData = new ArrayBuffer(192);
const paramsF32 = new Float32Array(paramsData);
const paramsU32 = new Uint32Array(paramsData);
const paramsBuffer = device.createBuffer({
  size: paramsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

/** Caustic photons, traced afresh each frame; see photonGrid in shaders/photons.js */
const photonBuffer = device.createBuffer({
  size: PHOTON_MAP_SIZE * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
/** Lights and the glass or mirrors they aim photons at; see photons.js */
/** @type {GPUBuffer | undefined} */
let pairsBuffer;
let pairCount = 0;
/** @type {GPUBindGroup} */
let photonBindGroup;

/** @type {GPUBuffer | undefined} */
let objectBuffer;
let objectCount = 0;
let lightCount = 0;
let boundedCount = 0;
/**
 * The scene's sky for sky domes (skyTable in sky.js, or a placeholder), then
 * the teapot (packTeapot in teapot.js); see `tables` in shaders/geometry.js
 * @type {GPUBuffer | undefined}
 */
let tablesBuffer;
const teapotData = packTeapot();
const diamondData = packDiamond();
/** Where the teapot starts in tablesBuffer, in vec4s */
let teapotStart = 0;

// How many tiles adaptive sampling still refines, counted on the GPU and
// copied back to show and to know when to stop
const activeTilesBuffer = device.createBuffer({
  size: 4,
  usage:
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
const activeTilesRead = device.createBuffer({
  size: 4,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});
let readingActiveTiles = false;

/** @type {Record<string, GPUBuffer>} */
let pixelBuffers = {};
/** @type {GPUBindGroup} */
let traceBindGroup;
/** @type {GPUBindGroup} */
let tileBindGroup;
/** @type {GPUBindGroup} */
let displayBindGroup;
/** @type {GPUBindGroup[]} */
let glowBindGroups = [];
/** The denoiser's prepare pass, then its blur passes */
/** @type {GPUBindGroup[]} */
let denoiseBindGroups = [];
export let width = 0;
export let height = 0;
export let tileCount = 0;

/**
 * Binds buffers in order, or each at the binding it's keyed by
 * @type {(pipeline: GPUPipelineBase, buffers: GPUBuffer[] | Record<number, GPUBuffer>) => GPUBindGroup}
 */
const bindGroup = (pipeline, buffers) =>
  device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: Object.entries(buffers).map(([binding, buffer]) => ({
      binding: Number(binding),
      resource: {buffer},
    })),
  });

/** Makes the bind groups, once every buffer they need exists */
const bind = () => {
  if (!objectBuffer || !tablesBuffer || !pairsBuffer || !pixelBuffers.sums) {
    return;
  }
  const {sums, sqGlowSums, tiles, small, rows, glow} = pixelBuffers;
  const {albedoSums, normalDepthSums, normalDepth, albedoSlope} = pixelBuffers;
  const filtered = [pixelBuffers.filtered0, pixelBuffers.filtered1];
  traceBindGroup = bindGroup(tracePipeline, {
    0: paramsBuffer,
    1: objectBuffer,
    2: sums,
    3: sqGlowSums,
    4: tiles,
    5: photonBuffer,
    6: tablesBuffer,
    7: albedoSums,
    8: normalDepthSums,
    9: singleBounceBuffer,
  });
  photonBindGroup = bindGroup(photonPipeline, {
    0: paramsBuffer,
    1: objectBuffer,
    5: photonBuffer,
    6: tablesBuffer,
    9: singleBounceBuffer,
    10: pairsBuffer,
  });
  tileBindGroup = bindGroup(tilePipeline, [
    paramsBuffer,
    sums,
    sqGlowSums,
    tiles,
    activeTilesBuffer,
  ]);
  glowBindGroups = [
    {0: paramsBuffer, 1: sums, 2: sqGlowSums, 3: small},
    {0: paramsBuffer, 3: small, 4: rows},
    {0: paramsBuffer, 4: rows, 5: glow},
  ].map((buffers, i) => bindGroup(glowPipelines[i], buffers));
  const guides = {0: paramsBuffer, 5: normalDepth, 6: albedoSlope};
  denoiseBindGroups = [
    bindGroup(preparePipeline, {
      ...guides,
      1: sums,
      2: sqGlowSums,
      3: albedoSums,
      4: normalDepthSums,
      9: filtered[0],
    }),
    // Back and forth, ending in filtered[1]
    ...strideBuffers.map((stride, i) =>
      bindGroup(blurPipeline, {
        ...guides,
        7: stride,
        8: filtered[i % 2],
        9: filtered[(i + 1) % 2],
      }),
    ),
  ];
  displayBindGroup = bindGroup(displayPipeline, [
    paramsBuffer,
    sums,
    tiles,
    glow,
    filtered[1],
    albedoSums,
  ]);
};

/** Sizes the image to the canvas, and makes buffers to match */
export const resize = () => {
  width = Math.max(1, Math.round(canvas.clientWidth * settings.scale));
  height = Math.max(1, Math.round(canvas.clientHeight * settings.scale));
  canvas.width = width;
  canvas.height = height;
  tileCount = Math.ceil(width / 8) * Math.ceil(height / 8);
  for (const b of Object.values(pixelBuffers)) b.destroy();
  /** @type {(size: number) => GPUBuffer} */
  const storage = (size) =>
    device.createBuffer({size, usage: GPUBufferUsage.STORAGE});
  const pixels = width * height * 16;
  pixelBuffers = {
    sums: storage(pixels),
    sqGlowSums: storage(pixels * 2),
    tiles: storage(tileCount * 4),
    // The lens glow works at one texel per tile
    small: storage(tileCount * 16),
    rows: storage(tileCount * 32),
    glow: storage(tileCount * 16),
    // The denoiser's guides, and two images it filters back and forth
    albedoSums: storage(pixels),
    normalDepthSums: storage(pixels),
    normalDepth: storage(pixels),
    albedoSlope: storage(pixels),
    filtered0: storage(pixels),
    filtered1: storage(pixels),
  };
  bind();
  restart();
};

/**
 * Sends objects to the GPU: lights first and teapots and diamonds last, as the shader
 * expects, and where photons come from, including lasers
 * @type {(objects: import('./shapes.js').Shape[], lasers?: import('./photons.js').Laser[]) => void}
 */
export const setObjects = (objects, lasers = []) => {
  const data = packObjects(objects);
  const pairs = photonEmitters(objects, lasers);
  pairCount = pairs.count;
  if (!pairsBuffer || pairsBuffer.size < pairs.data.byteLength) {
    pairsBuffer?.destroy();
    pairsBuffer = device.createBuffer({
      size: Math.max(pairs.data.byteLength * 2, 4096),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    bind();
  }
  device.queue.writeBuffer(pairsBuffer, 0, pairs.data);
  lightCount = objects.filter((o) => o.material === LIGHT).length;
  boundedCount = objects.filter(isBounded).length;
  objectCount = objects.length - boundedCount;
  // Room to add a few without making a new buffer, which needs new bind
  // groups too
  if (!objectBuffer || objectBuffer.size < data.byteLength) {
    objectBuffer?.destroy();
    objectBuffer = device.createBuffer({
      size: Math.max(data.byteLength * 2, 96 * 64),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    bind();
  }
  device.queue.writeBuffer(objectBuffer, 0, data);
};

/** Sends the scene's sky (skyTable in sky.js), if it has one, the teapot and the diamond */
export const setTables = (/** @type {Float32Array | null} */ sky) => {
  const skyData = sky ?? new Float32Array(4);
  teapotStart = skyData.length / 4;
  tablesBuffer?.destroy();
  tablesBuffer = device.createBuffer({
    size:
      skyData.byteLength + teapotData.data.byteLength + diamondData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tablesBuffer, 0, skyData);
  device.queue.writeBuffer(tablesBuffer, skyData.byteLength, teapotData.data);
  device.queue.writeBuffer(
    tablesBuffer,
    skyData.byteLength + teapotData.data.byteLength,
    diamondData,
  );
  bind();
};

let frame = 0;
let randomSeed = 0;
export let samplesPerPixel = 0;
let samplesPerFrame = 1;
// Set when something only the display uses changes, to redraw even when
// paused or done
let redrawSoon = false;
/** Tiles still refining, as of the last count read back; -1 until then */
export let activeTiles = -1;
// Counts once per restart, so counts from before one are ignored
let restarts = 0;
// True while the camera or an object is moving, so frames stay quick
let moving = false;
// At most two frames are queued on the GPU: enough that it never waits for
// the next, few enough that the camera stays responsive
let framesInFlight = 0;
// When the GPU last finished a frame
let lastDone = 0;
/** When the samples started */
export let startTime = performance.now();
// When the denoiser last ran
let lastDenoise = 0;
// Whether sampling was done or paused as of the last frame
let wasStopped = false;

/**
 * Throws the samples away and starts again. While something is moving,
 * frames take one sample each, so they keep up with it.
 */
export const restart = (isMoving = false) => {
  frame = 0;
  samplesPerPixel = 0;
  activeTiles = -1;
  restarts++;
  startTime = performance.now();
  moving ||= isMoving;
};

/** Draws the image again, after something only the display uses changes */
export const redraw = () => {
  redrawSoon = true;
};

/**
 * After a change that can only make tiles need more samples, not fewer:
 * keeps the samples, but has every tile checked again
 */
export const keepGoing = () => {
  activeTiles = -1;
};

/** Whether sampling has finished */
export const isDone = () =>
  samplesPerPixel >= settings.spp || activeTiles === 0;

/**
 * What a frame shows, besides settings: the camera's position and unit
 * forward, right and up vectors, the image's height at distance 1, the lens
 * and focus, the bumps' scale, and the selected object's index on the GPU
 * (or -1)
 * @typedef {{
 *   position: number[], forward: number[], right: number[], up: number[],
 *   zoom: number, lensRadius: number, focus: number, detailScale: number,
 *   selected: number,
 * }} FrameView
 */

/** Fills in Params in shaders/common.js */
const writeParams = (/** @type {FrameView} */ v) => {
  paramsF32.set(v.position, 0);
  paramsU32[3] = frame;
  paramsF32.set(v.forward, 4);
  paramsU32[7] = randomSeed++;
  paramsF32.set(
    v.right.map((r) => (r * v.zoom * width) / height),
    8,
  );
  paramsU32[11] = samplesPerFrame;
  paramsF32.set(
    v.up.map((u) => u * v.zoom),
    12,
  );
  paramsU32[15] = ['mis', 'light', 'bsdf'].indexOf(settings.sampling);
  paramsF32[16] = settings.clamp || 1e30;
  paramsU32[17] = objectCount;
  paramsU32[18] = width;
  paramsU32[19] = height;
  const tone = /** @type {keyof typeof sdrWhite} */ (settings.tone);
  paramsF32[20] = view.hdr ? settings.headroom : sdrWhite[tone];
  paramsU32[21] = view.hdr ? 0 : toneCurves.indexOf(tone);
  paramsF32[22] = settings.fog;
  paramsF32[23] = settings.dispersion;
  paramsF32[24] = settings.noise;
  paramsU32[25] = +view.showTiles;
  paramsF32[26] = 2 ** settings.exposure;
  paramsF32[27] = v.lensRadius;
  paramsF32[28] = v.focus;
  paramsU32[29] = lightCount;
  paramsF32[30] = settings.fogForward;
  paramsF32[31] = settings.fogBlue;
  paramsF32[32] = settings.detail;
  paramsF32[33] = v.detailScale;
  paramsF32[34] = settings.glow;
  paramsF32[35] = settings.vignette;
  paramsU32[36] = +settings.denoise;
  paramsU32[37] = v.selected < 0 ? 0xffffffff : v.selected;
  paramsU32[38] = teapotStart;
  paramsU32[39] = teapotStart + teapotData.trianglesStart;
  paramsU32[40] = boundedCount;
  paramsF32[41] = settings.grain;
  paramsF32[42] = settings.aberration;
  paramsU32[43] = teapotStart + teapotData.data.length / 4;
  paramsF32[44] = settings.contrast;
  paramsU32[45] = settings.photons ? pairCount : 0;
  // Shrinking each frame, so the blur fades as photons add up (Knaus and
  // Zwicker's progressive photon mapping, with alpha 2/3)
  paramsF32[46] = PHOTON_RADIUS * v.detailScale * (frame + 1) ** (-1 / 6);
  device.queue.writeBuffer(paramsBuffer, 0, paramsData);
};

/** Adds samples, then shows them. With trace false, only shows them. */
const render = (/** @type {FrameView} */ v, trace = true) => {
  writeParams(v);
  const encoder = device.createCommandEncoder();
  const groups = [Math.ceil(width / 8), Math.ceil(height / 8)];
  if (trace) {
    encoder.clearBuffer(activeTilesBuffer);
    const photons = settings.photons && pairCount > 0;
    if (photons) encoder.clearBuffer(photonBuffer, 0, PHOTON_CELLS * 4);
    const pass = encoder.beginComputePass();
    // Photons first, for the trace to gather
    if (photons) {
      pass.setPipeline(photonPipeline);
      pass.setBindGroup(0, photonBindGroup);
      pass.dispatchWorkgroups(PHOTONS / 64);
    }
    // Pick the tiles that still need samples, then sample them
    pass.setPipeline(tilePipeline);
    pass.setBindGroup(0, tileBindGroup);
    pass.dispatchWorkgroups(...groups);
    pass.setPipeline(tracePipeline);
    pass.setBindGroup(0, traceBindGroup);
    pass.dispatchWorkgroups(...groups);
    pass.end();
  }
  const readActiveTiles = trace && !readingActiveTiles;
  if (readActiveTiles) {
    encoder.copyBufferToBuffer(activeTilesBuffer, 0, activeTilesRead, 0, 4);
  }

  // Every frame while the image changes fast; after that, a few times a
  // second is plenty, and leaves the GPU to sampling
  const now = performance.now();
  if (
    settings.denoise &&
    (!trace || samplesPerPixel < 64 || now - lastDenoise > 150)
  ) {
    lastDenoise = now;
    const pass = encoder.beginComputePass();
    for (const [i, group] of denoiseBindGroups.entries()) {
      pass.setPipeline(i ? blurPipeline : preparePipeline);
      pass.setBindGroup(0, group);
      pass.dispatchWorkgroups(...groups);
    }
    pass.end();
  }

  if (settings.glow > 0) {
    const pass = encoder.beginComputePass();
    for (const [i, pipeline] of glowPipelines.entries()) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, glowBindGroups[i]);
      pass.dispatchWorkgroups(Math.ceil(width / 64), Math.ceil(height / 64));
    }
    pass.end();
  }

  const display = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  display.setPipeline(displayPipeline);
  display.setBindGroup(0, displayBindGroup);
  display.draw(3);
  display.end();
  device.queue.submit([encoder.finish()]);
  if (readActiveTiles) {
    readingActiveTiles = true;
    const restartsThen = restarts;
    activeTilesRead.mapAsync(GPUMapMode.READ).then(() => {
      const count = new Uint32Array(activeTilesRead.getMappedRange())[0];
      activeTilesRead.unmap();
      readingActiveTiles = false;
      if (restartsThen === restarts) activeTiles = count;
    });
  }

  if (trace) {
    frame++;
    samplesPerPixel += samplesPerFrame;
  }
};

/**
 * Called every animation frame: adds samples unless sampling is done or
 * paused, as many as the GPU keeps up with, or redraws if asked to
 */
export const step = (/** @type {() => FrameView} */ describe) => {
  const done = isDone();
  // Once sampling stops, denoise the final samples, since it skips some
  // frames while sampling
  const stopped = done || view.paused;
  if (stopped && !wasStopped) redrawSoon = true;
  wasStopped = stopped;
  if (framesInFlight < 2 && !stopped) {
    if (moving) samplesPerFrame = 1;
    samplesPerFrame = Math.min(samplesPerFrame, settings.spp - samplesPerPixel);
    const wasMoving = moving;
    moving = false;
    framesInFlight++;
    const submitted = performance.now();
    render(describe());
    device.queue.onSubmittedWorkDone().then(() => {
      framesInFlight--;
      // Take more samples per frame while the GPU keeps up, fewer when it
      // doesn't. Moving the camera goes back to one, to stay responsive.
      // It started on the GPU when submitted or when the one before it
      // finished, whichever was later.
      const now = performance.now();
      const ms = now - Math.max(submitted, lastDone);
      lastDone = now;
      if (wasMoving) return;
      if (ms < 25) samplesPerFrame++;
      else if (ms > 40) samplesPerFrame = Math.max(1, samplesPerFrame - 1);
    });
    redrawSoon = false;
  } else if (redrawSoon) {
    render(describe(), false);
    redrawSoon = false;
  }
};

/**
 * The image as shown, as a PNG, without the selection's outline. A WebGPU
 * canvas only keeps its image until the frame ends, so this draws it again
 * and captures it right away.
 * @type {(v: FrameView) => Promise<Blob | null>}
 */
export const capture = (v) => {
  render({...v, selected: -1}, false);
  redrawSoon = true;
  return new Promise((resolve) => canvas.toBlob(resolve));
};
