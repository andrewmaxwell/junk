import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {
  DIFFUSE,
  GLASS,
  LIGHT,
  MIRROR,
  PLATE,
  SPHERE,
  TEAPOT,
  bottomOf,
  hitObject,
  packObjects,
  scenes,
  sphere,
  teapot,
} from './scenes.js';
import {
  denoiseShader,
  displayShader,
  glowShader,
  tileShader,
  traceShader,
} from './shaders.js';
import {albedoTable} from './ggx.js';
import {skyTable} from './sky.js';
import {packTeapot} from './teapot.js';

/**
 * Everything the controls change. Settings that differ from their defaults
 * are kept in the URL, so a view can be shared or reloaded.
 */
const defaults = {
  /** See `scenes` in scenes.js */
  scene: 'shafts',
  /** 'mis', 'light' or 'bsdf'; see `sampling` in shaders.js */
  sampling: 'mis',
  /** Cap on bounced light per sample; 0 for none. See `maxIndirect` in shaders.js */
  clamp: 20,
  /** Rendered pixels per CSS pixel. 2 is sharp on retina screens, but 4x slower. */
  scale: 1,
  /** Stop refining after this many samples per pixel */
  spp: 4096,
  /**
   * In HDR, how many times brighter than white lights may get. Browsers don't
   * say how much headroom the screen has; brighter than it just clips.
   */
  headroom: 8,
  /**
   * Adaptive sampling stops refining a tile once its noise is below this, in
   * display brightness from 0 to 1; 0 to refine everything. See
   * `noiseThreshold` in shaders.js
   */
  noise: 0.02,
  /** How strongly glass splits light into rainbows. See `dispersion` in shaders.js. Scenes can change this default. */
  dispersion: 1,
  /** Show the image denoised; see denoiseShader in shaders.js */
  denoise: true,
  /** Fog density; see `fogDensity` in shaders.js. Scenes can change this default. */
  fog: 0,
  /** Which way fog scatters, -1 to 1; see `fogForward` in shaders.js. Scenes can change this default. */
  fogForward: 0,
  /** 0 for gray fog, up to 1 for sky blue; see `fogBlue` in shaders.js. Scenes can change this default. */
  fogBlue: 0,
  /** How uneven surfaces are, 0 for mathematically smooth; see `detail` in shaders.js */
  detail: 1,
  /** The fraction of light the lens spreads into a glow; see glowShader in shaders.js */
  glow: 0.005,
  /** How SDR screens show brightness over 1: 'filmic', 'ease' or 'clip'; see `toneMap` in shaders.js */
  tone: 'filmic',
  /** Darkening toward the corners, 0 to 1; see `vignette` in shaders.js */
  vignette: 0.5,
  /** Brightens or darkens the display, in stops (doublings). Scenes can change this default. */
  exposure: 0,
  /**
   * Depth of field: the camera lens's radius, as a fraction of how far the
   * scene's own camera is from what it looks at. 0 keeps everything sharp.
   * Click the image to focus. Scenes can change this default. (A fraction
   * of the distance in focus would make focusing on the sky blur
   * everything else away.)
   */
  dof: 0,
};
/** @typedef {typeof defaults} Settings */

const urlParams = new URLSearchParams(location.search);
/** @type {Settings} */
const settings = {...defaults};
for (const [key, value] of Object.entries(defaults)) {
  const param = urlParams.get(key);
  if (param === null) continue;
  Object.assign(settings, {
    [key]:
      typeof value === 'number'
        ? Number(param)
        : typeof value === 'boolean'
          ? param === 'true'
          : param,
  });
}
if (!(settings.scene in scenes)) settings.scene = defaults.scene;

/** Settings each scene can pick its own default for; see `Scene` in scenes.js */
const sceneKeys = [
  'fog',
  'fogForward',
  'fogBlue',
  'dof',
  'dispersion',
  'exposure',
];
/** The default for a setting in this scene, which the URL leaves out */
const sceneDefault = (/** @type {string} */ key) =>
  scenes[settings.scene]().defaults?.[key] ??
  defaults[/** @type {keyof Settings} */ (key)];
/** Sets sceneKeys to this scene's defaults, except ones the URL sets if keepUrl */
const useSceneDefaults = (keepUrl = false) => {
  for (const key of sceneKeys) {
    if (keepUrl && urlParams.has(key)) continue;
    Object.assign(settings, {[key]: sceneDefault(key)});
  }
};
useSceneDefaults(true);

const saveSettings = () => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(settings)) {
    if (value === sceneDefault(key)) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  history.replaceState(null, '', url);
};

/**
 * In SDR, lights clamp at the brightness each tone curve shows as white:
 * toneMap's and agx's in shaders.js
 */
const sdrWhite = {clip: 1, ease: 4, filmic: 16};
/** settings.tone as params.toneMap */
const toneCurves = ['clip', 'ease', 'filmic'];

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
/** Set once something has gone wrong for good */
let failure = '';
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
/** Settings that aren't kept in the URL */
const view = {
  paused: false,
  /** Highlight the tiles adaptive sampling is still refining */
  showTiles: false,
  hdr: matchMedia('(dynamic-range: high)').matches,
};
// HDR is remembered per browser, since some (Chrome on macOS, as of 154) say
// the screen is HDR but then show HDR canvases clipped
try {
  const saved = localStorage.getItem('anotherRaytracer.hdr');
  if (saved) view.hdr = saved === 'on';
} catch {
  // Storage blocked; use the default
}
const configure = () =>
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
const glowModule = compile(glowShader);
// The lens glow's three passes, in order
const glowPipelines = ['downsample', 'blurRows', 'blurColumns'].map(
  (entryPoint) =>
    device.createComputePipeline({
      layout: 'auto',
      compute: {module: glowModule, entryPoint},
    }),
);

const denoiseModule = compile(denoiseShader);
const [preparePipeline, blurPipeline] = ['prepare', 'blur'].map((entryPoint) =>
  device.createComputePipeline({
    layout: 'auto',
    compute: {module: denoiseModule, entryPoint},
  }),
);
// The denoiser's passes reach 1, 2, 4, 8 and 16 pixels apart
const strideBuffers = [1, 2, 4, 8, 16].map((stride) => {
  const buffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, new Int32Array([stride, 0, 0, 0]));
  return buffer;
});

/** For rough reflections' lost light; see ggx.js */
const singleBounceData = albedoTable();
const singleBounceBuffer = device.createBuffer({
  size: singleBounceData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(singleBounceBuffer, 0, singleBounceData);

// Params in shaders.js: 4 × (vec3f + u32), then 25 scalars, padded to a
// multiple of 16 bytes
const paramsData = new ArrayBuffer(176);
const paramsF32 = new Float32Array(paramsData);
const paramsU32 = new Uint32Array(paramsData);
const paramsBuffer = device.createBuffer({
  size: paramsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let scene = scenes[settings.scene]();
/**
 * The scene's objects as edited: null where one was deleted, then any that
 * were added. Edits are kept in the URL as differences from scene.objects.
 * @type {(import('./scenes.js').Shape | null)[]}
 */
let objects = [];
/**
 * The objects as the GPU gets them: without deleted ones, lights first and
 * teapots last, as the shader expects. Each knows its index in objects as
 * `id`.
 * @type {(import('./scenes.js').Shape & {id: number})[]}
 */
let gpuObjects = [];
let lightCount = 0;
let teapotCount = 0;
/** The selected object's index in objects, or -1 */
let selected = -1;
/** @type {GPUBuffer} */
let objectBuffer;
/**
 * The scene's sky for sky domes (skyTable in sky.js, or a placeholder), then
 * the teapot (packTeapot in teapot.js); see `tables` in shaders.js
 * @type {GPUBuffer}
 */
let tablesBuffer;
const teapotData = packTeapot();
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

/** @type {GPUBuffer[]} */
let pixelBuffers = [];
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
let width = 0;
let height = 0;
let tileCount = 0;

/** Sizes the image to the canvas, and makes buffers and bind groups to match */
const resize = () => {
  width = Math.max(1, Math.round(canvas.clientWidth * settings.scale));
  height = Math.max(1, Math.round(canvas.clientHeight * settings.scale));
  canvas.width = width;
  canvas.height = height;
  tileCount = Math.ceil(width / 8) * Math.ceil(height / 8);
  for (const b of pixelBuffers) b.destroy();
  /** @type {(size: number) => GPUBuffer} */
  const storage = (size) =>
    device.createBuffer({size, usage: GPUBufferUsage.STORAGE});
  const sums = storage(width * height * 16);
  const sqSums = storage(width * height * 16);
  const tiles = storage(tileCount * 4);
  const glowSums = storage(width * height * 16);
  // The lens glow works at one texel per tile
  const small = storage(tileCount * 16);
  const rows = storage(tileCount * 32);
  const glow = storage(tileCount * 16);
  // The denoiser's guides, and two images it filters back and forth
  const albedoSums = storage(width * height * 16);
  const normalDepthSums = storage(width * height * 16);
  const normalDepth = storage(width * height * 16);
  const albedoSlope = storage(width * height * 16);
  const filtered = [storage(width * height * 16), storage(width * height * 16)];
  pixelBuffers = [
    sums,
    sqSums,
    tiles,
    glowSums,
    small,
    rows,
    glow,
    albedoSums,
    normalDepthSums,
    normalDepth,
    albedoSlope,
    ...filtered,
  ];
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
  traceBindGroup = bindGroup(tracePipeline, [
    paramsBuffer,
    objectBuffer,
    sums,
    sqSums,
    tiles,
    glowSums,
    tablesBuffer,
    albedoSums,
    normalDepthSums,
    singleBounceBuffer,
  ]);
  tileBindGroup = bindGroup(tilePipeline, [
    paramsBuffer,
    sums,
    sqSums,
    tiles,
    activeTilesBuffer,
  ]);
  glowBindGroups = [
    {0: paramsBuffer, 1: sums, 2: glowSums, 3: small},
    {0: paramsBuffer, 3: small, 4: rows},
    {0: paramsBuffer, 4: rows, 5: glow},
  ].map((buffers, i) => bindGroup(glowPipelines[i], buffers));
  const guides = {0: paramsBuffer, 5: normalDepth, 6: albedoSlope};
  denoiseBindGroups = [
    bindGroup(preparePipeline, {
      ...guides,
      1: sums,
      2: sqSums,
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
  restart();
};

///////////////////////////////
// Orbit camera
///////////////////////////////

/** Orbits target. `focus` is the distance that depth of field keeps sharp. */
const camera = {target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, focus: 1};

/** How far the scene's own camera is from what it looks at: its size, roughly */
let sceneSize = 1;
/** World units per bump on surfaces: smaller for smaller scenes */
let detailScale = 1;

const loadScene = () => {
  scene = scenes[settings.scene]();
  // From the scene's own camera, not the current one, so zooming doesn't
  // change the bumps
  const {position, target} = scene.camera;
  sceneSize =
    scene.size ?? Math.hypot(...position.map((p, i) => p - target[i]));
  detailScale = sceneSize / 300;
  objects = scene.objects.map((o) => ({...o}));
  selected = -1;
  uploadObjects(false);
  tablesBuffer?.destroy();
  const skyData = scene.sky
    ? skyTable(scene.sky.sun, scene.sky.haze)
    : new Float32Array(4);
  teapotStart = skyData.length / 4;
  tablesBuffer = device.createBuffer({
    size: skyData.byteLength + teapotData.data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tablesBuffer, 0, skyData);
  device.queue.writeBuffer(tablesBuffer, skyData.byteLength, teapotData.data);
  resize();
  resetCamera();
};

/**
 * Sends the objects to the GPU, after they change. Restarts the image unless
 * told not to.
 */
function uploadObjects(start = true) {
  const isLight = (/** @type {{material: number}} */ o) => o.material === LIGHT;
  const present = objects.flatMap((o, id) => (o ? [{...o, id}] : []));
  const isTeapot = (/** @type {{shape: number}} */ o) => o.shape === TEAPOT;
  gpuObjects = [
    ...present.filter(isLight),
    ...present.filter((o) => !isLight(o) && !isTeapot(o)),
    ...present.filter(isTeapot),
  ];
  lightCount = present.filter(isLight).length;
  teapotCount = present.filter(isTeapot).length;
  const data = packObjects(gpuObjects);
  // Room to add a few without making a new buffer, which needs new bind
  // groups too
  if (!objectBuffer || objectBuffer.size < data.byteLength) {
    objectBuffer?.destroy();
    objectBuffer = device.createBuffer({
      size: Math.max(data.byteLength * 2, 96 * 64),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (tablesBuffer) resize();
  }
  device.queue.writeBuffer(objectBuffer, 0, data);
  if (start) restart();
}

function resetCamera() {
  const {position, target} = scene.camera;
  const offset = position.map((p, i) => p - target[i]);
  camera.target = [...target];
  camera.distance = Math.hypot(...offset);
  camera.yaw = Math.atan2(offset[0], offset[2]);
  camera.pitch = Math.asin(offset[1] / camera.distance);
  camera.focus = scene.camera.focus ?? camera.distance;
  sceneCamera = cameraParam();
  cameraMoved();
}

/** The camera as the URL keeps it: target, yaw, pitch, distance and focus */
const cameraParam = () =>
  [...camera.target, camera.yaw, camera.pitch, camera.distance, camera.focus]
    .map((x) => +x.toFixed(3))
    .join('_');
/** cameraParam for the scene's own camera, which the URL leaves out */
let sceneCamera = '';
let saveCameraTimer = 0;
/** Puts the camera in the URL once it stops moving, since browsers limit how often the URL can change */
const saveCamera = () => {
  clearTimeout(saveCameraTimer);
  saveCameraTimer = setTimeout(() => {
    const url = new URL(location.href);
    const value = cameraParam();
    if (value === sceneCamera) url.searchParams.delete('camera');
    else url.searchParams.set('camera', value);
    history.replaceState(null, '', url);
  }, 300);
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

/**
 * The image's height at distance 1. Scenes are framed for landscape screens
 * by their height, which would crop most of the scene on a phone held
 * upright, so narrow screens show at least as much width as a 5:4 one.
 */
const viewZoom = () =>
  scene.camera.zoom *
  Math.max(1, 1.25 / (canvas.clientWidth / canvas.clientHeight));

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
// Set when something only the display uses changes, to redraw even when
// paused or done
let redraw = false;
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
// When the denoiser last ran
let lastDenoise = 0;
// Whether sampling was done or paused as of the last frame
let wasStopped = false;

function restart() {
  frame = 0;
  samplesPerPixel = 0;
  activeTiles = -1;
  restarts++;
  startTime = performance.now();
}

/** Adds samples, then shows them. With trace false, only shows them. */
const render = (trace = true) => {
  const {position, forward, right, up} = cameraBasis();
  const zoom = viewZoom();
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
  paramsU32[15] = ['mis', 'light', 'bsdf'].indexOf(settings.sampling);
  paramsF32[16] = settings.clamp || 1e30;
  paramsU32[17] = gpuObjects.length - teapotCount;
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
  paramsF32[27] = settings.dof * sceneSize;
  paramsF32[28] = camera.focus;
  paramsU32[29] = lightCount;
  paramsF32[30] = settings.fogForward;
  paramsF32[31] = settings.fogBlue;
  paramsF32[32] = settings.detail;
  paramsF32[33] = detailScale;
  paramsF32[34] = settings.glow;
  paramsF32[35] = settings.vignette;
  paramsU32[36] = +settings.denoise;
  const shown = gpuObjects.findIndex((o) => o.id === selected);
  paramsU32[37] = shown < 0 || hideSelection ? 0xffffffff : shown;
  paramsU32[38] = teapotStart;
  paramsU32[39] = teapotStart + teapotData.trianglesStart;
  paramsU32[40] = teapotCount;
  device.queue.writeBuffer(paramsBuffer, 0, paramsData);

  const encoder = device.createCommandEncoder();
  if (trace) {
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
      pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
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

const loop = () => {
  const done = samplesPerPixel >= settings.spp || activeTiles === 0;
  // Once sampling stops, denoise the final samples, since it skips some
  // frames while sampling
  const stopped = done || view.paused;
  if (stopped && !wasStopped) redraw = true;
  wasStopped = stopped;
  if (framesInFlight < 2 && !view.paused && !done) {
    if (moving) samplesPerFrame = 1;
    samplesPerFrame = Math.min(samplesPerFrame, settings.spp - samplesPerPixel);
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
    redraw = false;
  } else if (redraw) {
    render(false);
    redraw = false;
  }

  if (failure) return;
  const status = done ? 'done' : view.paused ? 'paused' : 'rendering';
  const secs = (performance.now() - startTime) / 1000;
  const rate = secs ? samplesPerPixel / secs : 0;
  stats.textContent =
    `${status} · ${samplesPerPixel} spp · ${rate.toFixed(0)} spp/s · ` +
    `${activeTiles < 0 ? '–' : Math.round((100 * activeTiles) / tileCount)}% refining · ` +
    `${width}×${height}${settings.denoise ? ' · denoised' : ''}\n` +
    hints;
  requestAnimationFrame(loop);
};

const hints = matchMedia('(pointer: coarse)').matches
  ? 'drag: orbit · pinch: zoom · two fingers: pan · tap: select and focus'
  : 'drag: orbit · shift/right drag: pan · scroll: zoom · ' +
    'click: select and focus · space: pause · r: reset view';

/** Call whenever the camera changes */
const cameraMoved = () => {
  moving = true;
  restart();
  saveCamera();
};

///////////////////////////////
// Controls
///////////////////////////////

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/** The ray from the camera through a point on the canvas, in CSS pixels */
const pointerRay = (/** @type {number} */ x, /** @type {number} */ y) => {
  const {position, forward, right, up} = cameraBasis();
  const zoom = viewZoom();
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const u = (x / canvas.clientWidth - 0.5) * zoom * aspect;
  const v = (0.5 - y / canvas.clientHeight) * zoom;
  const d = normalize(forward.map((f, i) => f + right[i] * u + up[i] * v));
  return {position, forward, d};
};

/** Pointers that are down, by id, at their last position */
const pointers = new Map();
/**
 * What dragging does: 'orbit', 'pan', 'move' (the selected ball), 'pinch'
 * (two fingers: zoom and pan), or 'none' (after a pinch, until every finger
 * lifts, so the last one doesn't suddenly orbit)
 */
let dragMode = 'orbit';
// How far the pointer has moved since it went down, to tell clicks from drags
let dragged = 0;
/** While moving a ball or teapot: from where the pointer's ray meets its height to its center */
let grabOffset = [0, 0, 0];

/** Where a ray meets the level plane at height y, or null if it doesn't */
const meetLevel = (
  /** @type {number[]} */ o,
  /** @type {number[]} */ d,
  /** @type {number} */ y,
) => {
  const t = (y - o[1]) / d[1];
  return t > 0 && isFinite(t) ? o.map((x, i) => x + d[i] * t) : null;
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x: e.offsetX, y: e.offsetY});
  if (pointers.size === 2) {
    dragMode = 'pinch';
    return;
  }
  if (pointers.size > 2) return;
  dragged = 0;
  dragMode = e.shiftKey || e.button > 0 ? 'pan' : 'orbit';
  // Dragging the selected ball or teapot moves it
  const ball = objects[selected];
  if (dragMode === 'orbit' && ball && ball.shape !== PLATE) {
    const {position, d} = pointerRay(e.offsetX, e.offsetY);
    const hit = hitObject(gpuObjects, position, d);
    const level = meetLevel(position, d, ball.center[1]);
    if (gpuObjects[hit.index]?.id === selected && level) {
      dragMode = 'move';
      grabOffset = ball.center.map((c, i) => c - level[i]);
    }
  }
});

/** Pans so the scene moves dx, dy CSS pixels with the pointer */
const pan = (/** @type {number} */ dx, /** @type {number} */ dy) => {
  const {right, up} = cameraBasis();
  const perPixel = (camera.distance * viewZoom()) / canvas.clientHeight;
  camera.target = camera.target.map(
    (t, i) => t + (-right[i] * dx + up[i] * dy) * perPixel,
  );
};

/** Zooms by factor, toward the target */
const zoomBy = (/** @type {number} */ factor) => {
  camera.distance *= factor;
  // Moving toward the target, keep the same thing in focus
  camera.focus *= factor;
};

canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  const now = {x: e.offsetX, y: e.offsetY};
  if (dragMode === 'pinch') {
    // Zoom by how far apart the two fingers are, and pan with their middle
    const [a, b] = [...pointers.values()];
    const before = {
      mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
      gap: Math.hypot(a.x - b.x, a.y - b.y),
    };
    pointers.set(e.pointerId, now);
    const [c, d] = [...pointers.values()];
    const gap = Math.hypot(c.x - d.x, c.y - d.y);
    if (gap > 0 && before.gap > 0) zoomBy(before.gap / gap);
    pan((c.x + d.x) / 2 - before.mid.x, (c.y + d.y) / 2 - before.mid.y);
    cameraMoved();
    return;
  }
  pointers.set(e.pointerId, now);
  if (dragMode === 'none') return;
  const dx = now.x - last.x;
  const dy = now.y - last.y;
  dragged += Math.abs(dx) + Math.abs(dy);
  // Small wobbles of a tap shouldn't move anything
  if (dragged < 4) return;
  if (dragMode === 'move') {
    const ball = objects[selected];
    if (!ball) return;
    const {position, d} = pointerRay(now.x, now.y);
    const level = meetLevel(position, d, ball.center[1]);
    if (!level) return;
    ball.center = level.map((x, i) => x + grabOffset[i]);
    objectsEdited();
    return;
  }
  if (dragMode === 'pan') {
    pan(dx, dy);
  } else {
    camera.yaw -= dx * 0.005;
    camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.005));
  }
  cameraMoved();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    // Trackpad pinches come as wheel events with ctrl held
    zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.001)));
    cameraMoved();
  },
  {passive: false},
);

const pointerEnd = (/** @type {PointerEvent} */ e) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size) {
    if (dragMode === 'pinch') dragMode = 'none';
    return;
  }
  // A click or tap: select what's under it, and focus on it
  if (
    e.type === 'pointerup' &&
    dragMode !== 'none' &&
    dragged < 4 &&
    e.button <= 0
  ) {
    click(e.offsetX, e.offsetY);
  }
};
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

/** Selects the object at a point on the canvas, and focuses on it */
const click = (/** @type {number} */ x, /** @type {number} */ y) => {
  const {position, forward, d} = pointerRay(x, y);
  const {index, t} = hitObject(gpuObjects, position, d);
  const hit = gpuObjects[index];
  // Sky domes aren't things you can pick up. Clicking the selection again
  // lets it go.
  const id = hit && !hit.sky ? hit.id : -1;
  select(id === selected ? -1 : id);
  if (!isFinite(t)) return;
  // The lens focuses on a plane, so it's the depth that matters
  camera.focus = t * forward.reduce((sum, f, i) => sum + f * d[i], 0);
  saveCamera();
  if (settings.dof > 0) restart();
};

/** True to leave out the selection's outline */
let hideSelection = false;
/** Downloads the image as shown, as a PNG */
function saveImage() {
  // A WebGPU canvas only keeps its image until the frame ends, so draw it
  // again and capture it right away, without the selection's outline
  hideSelection = true;
  render(false);
  hideSelection = false;
  redraw = true;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `anotherRaytracer-${settings.scene}-${samplesPerPixel}spp.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

///////////////////////////////
// Settings panel
///////////////////////////////

/** Settings changes that need the image started over */
const changed = () => {
  saveSettings();
  restart();
};

const saveHdr = () => {
  try {
    localStorage.setItem('anotherRaytracer.hdr', view.hdr ? 'on' : 'off');
  } catch {
    // Storage blocked; the choice lasts until reload
  }
  // Lights clamp to the screen's brightest, so start over
  configure();
  restart();
};

const gui = new GUI({title: 'Another Raytracer'});
if (innerWidth < 600) gui.close();
/** Puts every setting but the scene back to its default, or the scene's */
const useDefaults = () => {
  Object.assign(settings, defaults, {scene: settings.scene});
  useSceneDefaults();
  saveSettings();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};

gui.add(settings, 'scene', Object.keys(scenes)).onChange(() => {
  // Each scene starts with its own settings, not the last scene's
  useDefaults();
  loadScene();
  select(-1);
  saveEdits();
});
gui.add(view, 'paused').name('pause (space)').listen();
gui.add({reset: resetCamera}, 'reset').name('reset view (r)');
gui
  .add(
    {
      resetSettings: () => {
        useDefaults();
        // Pixel scale may have changed
        resize();
      },
    },
    'resetSettings',
  )
  .name('reset settings');
gui.add({saveImage}, 'saveImage').name('save image');
gui
  .add(settings, 'dof', 0, 0.05, 0.001)
  .name('depth of field (click to focus)')
  .onChange(changed);
gui.add(settings, 'fog', 0, 0.02, 0.0001).onChange(changed);
gui
  .add(settings, 'exposure', -4, 4, 0.1)
  .name('exposure (stops)')
  .onChange(() => brightnessChanged());

///////////////////////////////
// Editing objects
///////////////////////////////

/** Linear RGB, 0 to 1, as a CSS hex color, which is sRGB encoded */
const toHex = (/** @type {number[]} */ rgb) =>
  '#' +
  rgb
    .map((c) => {
      const x = Math.min(1, Math.max(0, c));
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
/** A CSS hex color as linear RGB */
const fromHex = (/** @type {string} */ hex) =>
  [1, 3, 5].map((i) => {
    const srgb = parseInt(hex.slice(i, i + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });

const materials = {paint: DIFFUSE, metal: MIRROR, glass: GLASS, light: LIGHT};
/** The selected object's settings, as the panel shows them */
const edit = {
  material: 'paint',
  color: '#ffffff',
  gloss: 0,
  roughness: 0.1,
  /** Lights' brightness, in stops over white */
  brightness: 5,
  size: 1,
  /** Teapots' turn around the vertical, in degrees */
  turn: 0,
};

/** What to call an object */
const describe = (/** @type {import('./scenes.js').Shape} */ o) => {
  if (o.material === LIGHT) return o.shape === SPHERE ? 'light' : 'light panel';
  const material = Object.keys(materials).find(
    (k) => materials[/** @type {keyof typeof materials} */ (k)] === o.material,
  );
  const coat = o.material === DIFFUSE && o.gloss > 0 ? 'glossy ' : '';
  if (o.shape === SPHERE) return `${coat}${material} ball`;
  if (o.shape === TEAPOT) return `${coat}${material} teapot`;
  const name =
    o.normal[1] > 0.7 ? 'floor' : o.normal[1] < -0.7 ? 'ceiling' : 'wall';
  return o.material === DIFFUSE ? `${coat}${name}` : `${material} ${name}`;
};

const objectFolder = gui.addFolder('Objects');
const editControls = {
  material: objectFolder
    .add(edit, 'material', Object.keys(materials))
    .onChange(() => applyEdit()),
  color: objectFolder.addColor(edit, 'color').onChange(() => applyEdit()),
  gloss: objectFolder
    .add(edit, 'gloss', 0, 1, 0.01)
    .name('gloss coat')
    .onChange(() => applyEdit()),
  roughness: objectFolder
    .add(edit, 'roughness', 0, 0.7, 0.001)
    .onChange(() => applyEdit()),
  brightness: objectFolder
    .add(edit, 'brightness', -2, 20, 0.1)
    .name('brightness (stops)')
    .onChange(() => applyEdit()),
  size: objectFolder.add(edit, 'size', 0, 1).onChange(() => applyEdit()),
  turn: objectFolder
    .add(edit, 'turn', -180, 180, 1)
    .name('turn (°)')
    .onChange(() => applyEdit()),
  remove: objectFolder
    .add({remove: () => removeSelected()}, 'remove')
    .name('delete (⌫)'),
  deselect: objectFolder
    .add({deselect: () => select(-1)}, 'deselect')
    .name('deselect (esc, or click it again)'),
};
objectFolder.add({addBall: () => addBall()}, 'addBall').name('add a ball');
objectFolder
  .add({addTeapot: () => addTeapot()}, 'addTeapot')
  .name('add a teapot');
const undoControl = objectFolder
  .add({undo: () => undoEdits()}, 'undo')
  .name('undo all edits');

/** Shows the selected object's settings in the panel, or a hint */
const showEdit = () => {
  const o = objects[selected];
  objectFolder.title(
    o ? `Objects: ${describe(o)}` : 'Objects (click one to edit it)',
  );
  for (const c of Object.values(editControls)) c.show(!!o);
  undoControl.show(!!editsParam());
  if (!o) return;
  const peak = Math.max(...o.color);
  edit.material =
    Object.keys(materials).find(
      (k) =>
        materials[/** @type {keyof typeof materials} */ (k)] === o.material,
    ) ?? 'paint';
  if (o.material === LIGHT) {
    edit.color = toHex(o.color.map((c) => c / peak));
    edit.brightness = +Math.log2(peak).toFixed(1);
  } else {
    edit.color = toHex(o.color);
    // Brightness to start at if it becomes a light: a ball glows, but a
    // whole wall as bright would be blinding
    edit.brightness = o.shape === SPHERE ? 5 : 1;
  }
  edit.gloss = o.gloss;
  edit.roughness = o.roughness;
  // Sizes from a quarter to four times what it was when selected. Only set
  // then, or the range would shift under the slider as it moves.
  edit.size = o.radius;
  if (sizeRangeFor !== selected) {
    sizeRangeFor = selected;
    editControls.size
      .min(+(o.radius / 4).toPrecision(2))
      .max(+(o.radius * 4).toPrecision(2))
      .step(+(o.radius / 50).toPrecision(1));
  }
  editControls.size.show(o.shape !== PLATE);
  edit.turn = o.turn;
  editControls.turn.show(o.shape === TEAPOT);
  // Teapots can't be lights
  const lightOption =
    editControls.material.$select.options[
      Object.keys(materials).indexOf('light')
    ];
  lightOption.disabled = o.shape === TEAPOT;
  editControls.gloss.show(o.material === DIFFUSE);
  editControls.roughness.show(
    o.material === MIRROR || (o.material === DIFFUSE && o.gloss > 0),
  );
  editControls.brightness.show(o.material === LIGHT);
  editControls.color.name(
    o.material === LIGHT ? 'color' : o.material === GLASS ? 'tint' : 'color',
  );
  shownColor = edit.color;
  for (const c of Object.values(editControls)) c.updateDisplay();
};
/** The color showEdit put in the panel, so other edits don't round it */
let shownColor = '';
/** Which selection the size slider's range was set for */
let sizeRangeFor = -1;

/** Changes the selected object to match the panel */
const applyEdit = () => {
  const o = objects[selected];
  if (!o) return;
  const material =
    materials[/** @type {keyof typeof materials} */ (edit.material)];
  const peak = Math.max(...o.color);
  const color =
    edit.color !== shownColor
      ? fromHex(edit.color)
      : o.material === LIGHT
        ? o.color.map((c) => c / peak)
        : o.color.map((c) => Math.min(c, 1));
  o.material = material;
  // A light's color is its hue, at its brightest channel, times its brightness
  const colorPeak = Math.max(...color, 1e-6);
  o.color =
    material === LIGHT
      ? color.map((c) => (c / colorPeak) * 2 ** edit.brightness)
      : color;
  o.gloss = material === DIFFUSE ? edit.gloss : 0;
  // Metal at 0 is a perfect mirror
  o.roughness =
    material === MIRROR || (material === DIFFUSE && edit.gloss > 0)
      ? edit.roughness
      : 0;
  if (o.shape !== PLATE && o.radius !== edit.size) {
    // Growing or shrinking from its bottom, so what's on the floor stays on
    // it
    o.center[1] += (edit.size - o.radius) * bottomOf(o);
    o.radius = edit.size;
  }
  if (o.shape === TEAPOT) o.turn = edit.turn;
  objectsEdited();
  showEdit();
};

/** Call whenever objects change */
const objectsEdited = () => {
  uploadObjects();
  moving = true;
  saveEdits();
};

/** Selects objects[index], or nothing with -1 */
const select = (/** @type {number} */ index) => {
  selected = index;
  sizeRangeFor = -1;
  showEdit();
  redraw = true;
};

const removeSelected = () => {
  if (!objects[selected]) return;
  objects[selected] = null;
  select(-1);
  objectsEdited();
};

const undoEdits = () => {
  objects = scene.objects.map((o) => ({...o}));
  select(-1);
  objectsEdited();
};

/**
 * A random place on the floor near the middle of the view and the point the
 * camera orbits, with room for something of this radius, clear of balls and
 * teapots, or the roomiest place it found, or the point the camera orbits
 * if it found no floor
 */
const floorSpot = (/** @type {number} */ radius) => {
  let best = {spot: [...camera.target], room: -Infinity};
  for (let tries = 0; tries < 30 && best.room < 0; tries++) {
    const {position, d} = pointerRay(
      canvas.clientWidth * (0.3 + 0.4 * Math.random()),
      canvas.clientHeight * (0.45 + 0.4 * Math.random()),
    );
    const {index, t} = hitObject(gpuObjects, position, d);
    const hit = gpuObjects[index];
    if (hit?.shape !== PLATE || hit.normal[1] < 0.7) continue;
    const spot = position.map((p, i) => p + d[i] * t);
    const [x, , z] = camera.target;
    // Not far off near the horizon
    if (Math.hypot(spot[0] - x, spot[2] - z) > camera.distance / 2) continue;
    const room = Math.min(
      ...gpuObjects
        // Ones standing near the floor, not lights high overhead
        .filter(
          (o) =>
            o.shape !== PLATE &&
            Math.abs(o.center[1] - spot[1]) < o.radius + 2 * radius,
        )
        .map(
          (o) =>
            Math.hypot(o.center[0] - spot[0], o.center[2] - spot[2]) -
            o.radius -
            radius,
        ),
    );
    if (room > best.room) best = {spot, room};
  }
  return best.spot;
};

/** A random color for paint, bright but not white */
const randomPaint = () => {
  const hue = Math.random() * 6;
  return [0, 4, 2].map((k) => {
    const x = Math.abs(((hue + k) % 6) - 3) - 1;
    return 0.05 + 0.75 * Math.min(1, Math.max(0, x)) ** 2;
  });
};

/** Adds one of these objects at random, and selects it */
const addOne = (/** @type {import('./scenes.js').Shape[]} */ options) => {
  objects.push(options[Math.floor(Math.random() * options.length)]);
  select(objects.length - 1);
  objectsEdited();
};

/** Drops a random ball onto the floor near the middle of the view, and selects it */
const addBall = () => {
  const radius = +(camera.distance / 20).toPrecision(2);
  const center = floorSpot(radius);
  center[1] += radius;
  const paint = randomPaint();
  addOne([
    sphere(radius, center, paint, DIFFUSE, 1, 0.08),
    sphere(radius, center, paint, DIFFUSE),
    sphere(radius, center, [0.95, 0.75, 0.4], MIRROR, 0, 0.05), // gold
    sphere(radius, center, [0.97, 0.97, 0.97], GLASS),
    sphere(
      radius,
      center,
      paint.map((c) => 0.3 + c),
      GLASS,
    ),
  ]);
};

/**
 * Stands a random teapot on the floor near the middle of the view, and
 * selects it. It's sized like the balls and teapots already there, if any.
 */
const addTeapot = () => {
  const sizes = gpuObjects
    .filter((o) => o.shape !== PLATE && o.material !== LIGHT)
    .map((o) => o.radius)
    .sort((a, b) => a - b);
  const radius = +(
    sizes.length ? 1.3 * sizes[sizes.length >> 1] : camera.distance / 12
  ).toPrecision(2);
  const spot = floorSpot(radius);
  // Spout to the right or left (a turn of the camera's yaw points it right),
  // a little toward the camera
  const yaw = (camera.yaw * 180) / Math.PI;
  const turn = Math.round(
    ((((yaw + (Math.random() < 0.5 ? -30 : -150) + 180) % 360) + 360) % 360) -
      180,
  );
  /** @type {(color: number[], material: number, gloss?: number, roughness?: number) => import('./scenes.js').Shape} */
  const make = (...args) => teapot(radius, spot, turn, ...args);
  addOne([
    make(randomPaint(), DIFFUSE, 1, 0.05), // glazed china
    make([0.95, 0.95, 0.95], DIFFUSE, 1, 0.03), // white china
    make([0.95, 0.75, 0.4], MIRROR, 0, 0.05), // gold
    make([0.95, 0.64, 0.54], MIRROR, 0, 0.15), // brushed copper
    make([0.97, 0.97, 0.97], GLASS),
    make([0.95, 0.6, 0.3], GLASS), // tea colored
  ]);
};

/**
 * Edits as differences from the scene, for the URL: for each object that
 * changed, by index, the fields that did, or 0 if it was deleted. Added
 * objects have every field. Null if nothing changed.
 */
const editsParam = () => {
  const round = (/** @type {number} */ x) => +x.toPrecision(5);
  /** @type {Record<number, object | 0>} */
  const edits = {};
  for (const [i, o] of objects.entries()) {
    const original = scene.objects[i];
    if (!o) {
      if (original) edits[i] = 0;
      continue;
    }
    const fields = /** @type {const} */ ([
      'shape',
      'center',
      'radius',
      'turn',
      'color',
      'material',
      'gloss',
      'roughness',
    ]);
    const changed = Object.fromEntries(
      fields
        .map((f) => {
          const v = o[f];
          return [f, Array.isArray(v) ? v.map(round) : round(v)];
        })
        .filter(
          ([f, v]) =>
            !original ||
            JSON.stringify(v) !==
              JSON.stringify(
                Array.isArray(original[f])
                  ? original[f].map(round)
                  : round(original[f]),
              ),
        ),
    );
    if (Object.keys(changed).length) edits[i] = changed;
  }
  return Object.keys(edits).length ? JSON.stringify(edits) : null;
};

let saveEditsTimer = 0;
/** Puts the edits in the URL, once they stop changing */
const saveEdits = () => {
  clearTimeout(saveEditsTimer);
  saveEditsTimer = setTimeout(() => {
    const url = new URL(location.href);
    const value = editsParam();
    if (value) url.searchParams.set('edits', value);
    else url.searchParams.delete('edits');
    history.replaceState(null, '', url);
    undoControl.show(!!value);
  }, 300);
};

/** Applies edits from the URL, as editsParam makes them */
const loadEdits = (/** @type {string} */ json) => {
  try {
    for (const [key, e] of Object.entries(JSON.parse(json))) {
      const i = Number(key);
      if (!(i >= 0 && i < 1000)) continue;
      const base = objects[i] ?? sphere(1, [0, 0, 0], [0.5, 0.5, 0.5], DIFFUSE);
      // Links from before roughness replaced Phong shininess
      if (e && 'shininess' in e) {
        e.roughness = e.shininess > 0 ? Math.sqrt(2 / (e.shininess + 2)) : 0;
        delete e.shininess;
      }
      objects[i] = e === 0 ? null : {...base, ...e};
      // Teapots can't be lights
      if (objects[i]?.shape === TEAPOT && objects[i]?.material === LIGHT) {
        /** @type {import('./scenes.js').Shape} */ (objects[i]).material =
          DIFFUSE;
      }
    }
    // Indexes skipped over are holes, not objects
    objects = Array.from(objects, (o) => o ?? null);
    uploadObjects();
  } catch (error) {
    console.warn("Ignoring edits in the URL that I can't read:", error);
  }
};

/** Settings changes that only change how the image is shown */
const displayChanged = () => {
  saveSettings();
  redraw = true;
};
// Adaptive sampling measures noise as displayed, so tiles that looked done
// may need more samples now
const brightnessChanged = () => {
  displayChanged();
  activeTiles = -1;
};

// The rest: finer control of light and display, and for comparing methods
// and trading speed for accuracy
const advanced = gui.addFolder('Advanced').close();

const light = advanced.addFolder('Light');
light
  .add(settings, 'fogForward', -0.9, 0.9, 0.05)
  .name('fog scatters forward')
  .onChange(changed);
light.add(settings, 'fogBlue', 0, 1, 0.05).name('fog blue').onChange(changed);
light
  .add(settings, 'dispersion', 0, 5, 0.1)
  .name('glass dispersion')
  .onChange(changed);
light
  .add(settings, 'detail', 0, 3, 0.1)
  .name('surface detail')
  .onChange(changed);

const display = advanced.addFolder('Display');
display
  .add(settings, 'denoise')
  .name('denoise (d)')
  .onChange(displayChanged)
  .listen();
display
  .add(settings, 'glow', 0, 0.2, 0.005)
  .name('lens glow')
  .onChange(displayChanged);
display.add(settings, 'vignette', 0, 1, 0.05).onChange(displayChanged);
display
  .add(settings, 'tone', {
    filmic: 'filmic',
    'ease into white': 'ease',
    clip: 'clip',
  })
  .name('SDR tone curve (t)')
  .onChange(changed)
  .listen();
display.add(view, 'hdr').name('HDR (h)').onChange(saveHdr).listen();
display
  .add(settings, 'headroom', 1, 16, 0.5)
  .name('HDR headroom')
  .onChange(changed);

const sampling = advanced.addFolder('Sampling');
sampling
  .add(settings, 'sampling', {
    'both (MIS)': 'mis',
    'aim at lights': 'light',
    'random bounces': 'bsdf',
  })
  .name('method')
  .onChange(changed);
sampling
  .add(settings, 'clamp', 0, 100, 1)
  .name('indirect clamp (0: none)')
  .onChange(changed);
sampling
  .add(settings, 'scale', 0.25, 2, 0.25)
  .name('pixel scale')
  .onChange(() => {
    saveSettings();
    resize();
  });
// Adaptive sampling picks up where it left off, without starting over: a
// lower threshold or more samples just keeps going
const keepGoing = () => {
  saveSettings();
  activeTiles = -1;
};
sampling
  .add(settings, 'noise', 0, 0.1, 0.005)
  .name('noise target (0: none)')
  .onChange(keepGoing);
sampling
  .add(settings, 'spp', 16, 16384, 16)
  .name('max spp')
  .onChange(keepGoing);
sampling
  .add(view, 'showTiles')
  .name('show refining tiles (n)')
  .onChange(() => {
    redraw = true;
  })
  .listen();

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    view.paused = !view.paused;
  } else if (e.key === 'r') {
    resetCamera();
  } else if (e.key === 'd') {
    settings.denoise = !settings.denoise;
    displayChanged();
  } else if (e.key === 'Escape') {
    select(-1);
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    removeSelected();
  } else if (e.key === 'n') {
    view.showTiles = !view.showTiles;
    redraw = true;
  } else if (e.key === 't') {
    settings.tone = toneCurves[(toneCurves.indexOf(settings.tone) + 1) % 3];
    changed();
  } else if (e.key === 'h') {
    view.hdr = !view.hdr;
    saveHdr();
  }
});
new ResizeObserver(resize).observe(canvas);

loadScene();
const urlEdits = urlParams.get('edits');
if (urlEdits) loadEdits(urlEdits);
// Drop anything in the URL that matches the defaults
saveSettings();
saveEdits();
showEdit();
const urlCamera = urlParams.get('camera')?.split('_').map(Number);
if (urlCamera?.length === 7 && urlCamera.every(isFinite)) {
  camera.target = urlCamera.slice(0, 3);
  [camera.yaw, camera.pitch, camera.distance, camera.focus] =
    urlCamera.slice(3);
  cameraMoved();
}
loop();
