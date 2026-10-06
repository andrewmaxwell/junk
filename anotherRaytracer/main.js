import {packObjects, scenes} from './scenes.js';
import {displayShader, tileShader, traceShader} from './shaders.js';

const params = new URLSearchParams(location.search);
/** 'cornell' (default), 'veach' or 'shafts'; see `scenes` in scenes.js */
const sceneName = params.get('scene') ?? 'cornell';
/** 'mis' (default), 'light' or 'bsdf'; see `sampling` in shaders.js */
const samplingName = params.get('sampling') ?? 'mis';
/** Cap on bounced light per sample; 0 for none. See `maxIndirect` in shaders.js */
const clamp = Number(params.get('clamp') ?? 20);
/** Rendered pixels per CSS pixel. 2 is sharp on retina screens, but 4x slower. */
const scale = Number(params.get('scale') ?? 1);
/** Stop refining after this many samples per pixel */
const maxSamples = Number(params.get('spp') ?? 4096);
/**
 * In HDR, how many times brighter than white lights may get. Browsers don't
 * say how much headroom the screen has; brighter than it just clips.
 */
const headroom = Number(params.get('headroom') ?? 8);
/** In SDR with tone mapping, lights clamp here, which toneMap shows as white */
const sdrWhite = 4;
/**
 * Adaptive sampling stops refining a tile once its noise is below this, in
 * display brightness from 0 to 1; 0 to refine everything. See `noiseThreshold`
 * in shaders.js
 */
const noiseThreshold = Number(params.get('noise') ?? 0.02);
/** How strongly glass splits light into rainbows. See `dispersion` in shaders.js */
const dispersionAmount = Number(params.get('dispersion') ?? 1);

const scene = (scenes[sceneName] ?? scenes.cornell)();
/** Fog density, defaulting to the scene's. See `fogDensity` in shaders.js */
const fogAmount = Number(params.get('fog') ?? scene.fog ?? 0);
const sampling = Math.max(0, ['mis', 'light', 'bsdf'].indexOf(samplingName));

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const stats = /** @type {HTMLElement} */ (document.querySelector('#stats'));

///////////////////////////////
// WebGPU setup
///////////////////////////////

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
device.lost.then((info) => console.error('WebGPU device lost:', info.message));

const context = /** @type {GPUCanvasContext} */ (canvas.getContext('webgpu'));
// Remembered per browser, since some (Chrome on macOS, as of 154) say the
// screen is HDR but then show HDR canvases clipped
let hdr = matchMedia('(dynamic-range: high)').matches;
try {
  const saved = localStorage.getItem('anotherRaytracer.hdr');
  if (saved) hdr = saved === 'on';
} catch {
  // Storage blocked; use the default
}
// In SDR, whether to ease bright areas into white instead of clipping them
let toneMapping = true;
const configure = () =>
  context.configure({
    device,
    // Float, so values over 1 survive to the screen
    format: 'rgba16float',
    alphaMode: 'opaque',
    // 'extended' shows values over 1 as brighter than white
    toneMapping: {mode: hdr ? 'extended' : 'standard'},
  });
configure();

/** @type {(code: string) => GPUShaderModule} */
const compile = (code) => {
  const module = device.createShaderModule({code});
  module.getCompilationInfo().then(({messages}) => {
    for (const m of messages) {
      console[m.type === 'error' ? 'error' : 'warn'](
        `${m.lineNum}:${m.linePos} ${m.message}`,
      );
    }
  });
  return module;
};

const tracePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {module: compile(traceShader)},
});
const tilePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {module: compile(tileShader)},
});
const displayModule = compile(displayShader);
const displayPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {module: displayModule},
  fragment: {module: displayModule, targets: [{format: 'rgba16float'}]},
});

// Params in shaders.js: 4 × (vec3f + u32), then 10 scalars, padded to 16 bytes
const paramsData = new ArrayBuffer(112);
const paramsF32 = new Float32Array(paramsData);
const paramsU32 = new Uint32Array(paramsData);
const paramsBuffer = device.createBuffer({
  size: paramsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const objectData = packObjects(scene.objects);
const objectBuffer = device.createBuffer({
  size: objectData.byteLength,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(objectBuffer, 0, objectData);

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

/** @type {GPUBuffer[]} */
let pixelBuffers = [];
/** @type {GPUBindGroup} */
let traceBindGroup;
/** @type {GPUBindGroup} */
let tileBindGroup;
/** @type {GPUBindGroup} */
let displayBindGroup;
let width = 0;
let height = 0;
let tileCount = 0;

const resize = () => {
  width = Math.max(1, Math.round(canvas.clientWidth * scale));
  height = Math.max(1, Math.round(canvas.clientHeight * scale));
  canvas.width = width;
  canvas.height = height;
  tileCount = Math.ceil(width / 8) * Math.ceil(height / 8);
  for (const b of pixelBuffers) b.destroy();
  /** @type {(size: number) => GPUBuffer} */
  const storage = (size) =>
    device.createBuffer({size, usage: GPUBufferUsage.STORAGE});
  const sums = storage(width * height * 16);
  const sqSums = storage(width * height * 4);
  const tiles = storage(tileCount * 4);
  pixelBuffers = [sums, sqSums, tiles];
  /** @type {(pipeline: GPUPipelineBase, buffers: GPUBuffer[]) => GPUBindGroup} */
  const bindGroup = (pipeline, buffers) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: buffers.map((buffer, binding) => ({
        binding,
        resource: {buffer},
      })),
    });
  traceBindGroup = bindGroup(tracePipeline, [
    paramsBuffer,
    objectBuffer,
    sums,
    sqSums,
    tiles,
  ]);
  tileBindGroup = bindGroup(tilePipeline, [
    paramsBuffer,
    sums,
    sqSums,
    tiles,
    activeTilesBuffer,
  ]);
  displayBindGroup = bindGroup(displayPipeline, [paramsBuffer, sums, tiles]);
  restart();
};

///////////////////////////////
// Orbit camera
///////////////////////////////

const camera = {target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1};

const resetCamera = () => {
  const {position, target} = scene.camera;
  const offset = position.map((p, i) => p - target[i]);
  camera.target = [...target];
  camera.distance = Math.hypot(...offset);
  camera.yaw = Math.atan2(offset[0], offset[2]);
  camera.pitch = Math.asin(offset[1] / camera.distance);
  restart();
};

/** @type {(a: number[], b: number[]) => number[]} */
const cross = ([ax, ay, az], [bx, by, bz]) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
];

/** @type {(v: number[]) => number[]} */
const normalize = (v) => {
  const len = Math.hypot(...v);
  return v.map((x) => x / len);
};

/** Camera position and unit forward, right and up vectors */
const cameraBasis = () => {
  const {target, yaw, pitch, distance} = camera;
  const back = [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
  const position = target.map((t, i) => t + back[i] * distance);
  const forward = back.map((b) => -b);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return {position, forward, right, up};
};

///////////////////////////////
// Rendering
///////////////////////////////

let frame = 0;
let randomSeed = 0;
let samplesPerPixel = 0;
let samplesPerFrame = 1;
let paused = false;
let fog = fogAmount > 0;
let dispersion = dispersionAmount > 0;
let showTiles = false;
// Tiles still refining, as of the last count read back; -1 until then
let activeTiles = -1;
// Counts once per restart, so counts from before one are ignored
let restarts = 0;
// True while the camera is moving, so frames stay quick
let moving = false;
// At most two frames are queued on the GPU: enough that it never waits for
// the next, few enough that the camera stays responsive
let framesInFlight = 0;
// When the GPU last finished a frame
let lastDone = 0;
let startTime = performance.now();

function restart() {
  frame = 0;
  samplesPerPixel = 0;
  activeTiles = -1;
  restarts++;
  startTime = performance.now();
}

const render = () => {
  const {position, forward, right, up} = cameraBasis();
  const {zoom} = scene.camera;
  paramsF32.set(position, 0);
  paramsU32[3] = frame;
  paramsF32.set(forward, 4);
  paramsU32[7] = randomSeed++;
  paramsF32.set(
    right.map((r) => (r * zoom * width) / height),
    8,
  );
  paramsU32[11] = samplesPerFrame;
  paramsF32.set(
    up.map((u) => u * zoom),
    12,
  );
  paramsU32[15] = sampling;
  paramsF32[16] = clamp || 1e30;
  paramsU32[17] = scene.objects.length;
  paramsU32[18] = width;
  paramsU32[19] = height;
  const toneMap = !hdr && toneMapping;
  paramsF32[20] = hdr ? headroom : toneMap ? sdrWhite : 1;
  paramsU32[21] = +toneMap;
  paramsF32[22] = fog ? fogAmount : 0;
  paramsF32[23] = dispersion ? dispersionAmount : 0;
  paramsF32[24] = noiseThreshold;
  paramsU32[25] = +showTiles;
  device.queue.writeBuffer(paramsBuffer, 0, paramsData);

  const encoder = device.createCommandEncoder();
  encoder.clearBuffer(activeTilesBuffer);
  const pass = encoder.beginComputePass();
  // Pick the tiles that still need samples, then sample them
  pass.setPipeline(tilePipeline);
  pass.setBindGroup(0, tileBindGroup);
  pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  pass.setPipeline(tracePipeline);
  pass.setBindGroup(0, traceBindGroup);
  pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
  pass.end();
  const readActiveTiles = !readingActiveTiles;
  if (readActiveTiles) {
    encoder.copyBufferToBuffer(activeTilesBuffer, 0, activeTilesRead, 0, 4);
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

  frame++;
  samplesPerPixel += samplesPerFrame;
};

const loop = () => {
  const done = samplesPerPixel >= maxSamples || activeTiles === 0;
  if (framesInFlight < 2 && !paused && !done) {
    if (moving) samplesPerFrame = 1;
    samplesPerFrame = Math.min(samplesPerFrame, maxSamples - samplesPerPixel);
    const wasMoving = moving;
    moving = false;
    framesInFlight++;
    const submitted = performance.now();
    render();
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
  }

  const status = done ? 'done' : paused ? 'paused' : 'rendering';
  const secs = (performance.now() - startTime) / 1000;
  const rate = secs ? samplesPerPixel / secs : 0;
  stats.textContent =
    `${status} · ${samplesPerPixel} spp · ${rate.toFixed(0)} spp/s · ` +
    `${activeTiles < 0 ? '–' : Math.round((100 * activeTiles) / tileCount)}% refining · ` +
    `${width}×${height} · ${sceneName} · sampling: ${samplingName} · ` +
    `${hdr ? 'HDR' : toneMapping ? 'SDR, tone mapped' : 'SDR, clipped'} · ` +
    `fog ${fog ? 'on' : 'off'} · dispersion ${dispersion ? 'on' : 'off'} · ` +
    'drag: orbit · shift/right drag: pan · scroll: zoom · r: reset view · ' +
    'h: HDR on/off · t: tone mapping on/off · f: fog · d: dispersion · ' +
    'n: show refining tiles · space: pause';
  requestAnimationFrame(loop);
};

/** Call whenever the camera changes */
const cameraMoved = () => {
  moving = true;
  restart();
};

///////////////////////////////
// Controls
///////////////////////////////

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!e.buttons) return;
  if (e.shiftKey || e.buttons & 6) {
    // Pan: move the target so the scene follows the pointer
    const {right, up} = cameraBasis();
    const perPixel =
      (camera.distance * scene.camera.zoom) / canvas.clientHeight;
    camera.target = camera.target.map(
      (t, i) => t + (-right[i] * e.movementX + up[i] * e.movementY) * perPixel,
    );
  } else {
    camera.yaw -= e.movementX * 0.005;
    camera.pitch = Math.max(
      -1.5,
      Math.min(1.5, camera.pitch + e.movementY * 0.005),
    );
  }
  cameraMoved();
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.distance *= Math.exp(e.deltaY * 0.001);
    cameraMoved();
  },
  {passive: false},
);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    paused = !paused;
  } else if (e.key === 'r') {
    resetCamera();
    cameraMoved();
  } else if (e.key === 'f') {
    fog = !fog && fogAmount > 0;
    restart();
  } else if (e.key === 'd') {
    dispersion = !dispersion && dispersionAmount > 0;
    restart();
  } else if (e.key === 'n') {
    showTiles = !showTiles;
  } else if (e.key === 't') {
    // Lights clamp differently with tone mapping, so start over
    toneMapping = !toneMapping;
    restart();
  } else if (e.key === 'h') {
    // Lights clamp to the screen's brightest, so start over
    hdr = !hdr;
    try {
      localStorage.setItem('anotherRaytracer.hdr', hdr ? 'on' : 'off');
    } catch {
      // Storage blocked; the choice lasts until reload
    }
    configure();
    restart();
  }
});
new ResizeObserver(resize).observe(canvas);

resize();
resetCamera();
loop();
