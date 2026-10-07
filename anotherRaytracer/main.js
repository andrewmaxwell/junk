import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {LIGHT, hitDistance, packObjects, scenes} from './scenes.js';
import {displayShader, tileShader, traceShader} from './shaders.js';

/**
 * Everything the controls change. Settings that differ from their defaults
 * are kept in the URL, so a view can be shared or reloaded.
 */
const defaults = {
  /** See `scenes` in scenes.js */
  scene: 'cornell',
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
  /** How strongly glass splits light into rainbows. See `dispersion` in shaders.js */
  dispersion: 1,
  /** Fog density; see `fogDensity` in shaders.js. Scenes can change this default. */
  fog: 0,
  /** Which way fog scatters, -1 to 1; see `fogForward` in shaders.js. Scenes can change this default. */
  fogForward: 0,
  /** 0 for gray fog, up to 1 for sky blue; see `fogBlue` in shaders.js. Scenes can change this default. */
  fogBlue: 0,
  /** Brightens or darkens the display, in stops (doublings) */
  exposure: 0,
  /** Over 1 deepens shadows and brightens highlights; see applyContrast in shaders.js */
  contrast: 1.25,
  /**
   * Depth of field: the camera lens's radius, as a fraction of the distance
   * in focus. 0 keeps everything sharp. Click the image to focus. Scenes
   * can change this default.
   */
  dof: 0,
  /** 'sobol' or 'random'; see rand2 in shaders.js */
  sequence: 'sobol',
};
/** @typedef {typeof defaults} Settings */

const urlParams = new URLSearchParams(location.search);
/** @type {Settings} */
const settings = {...defaults};
for (const [key, value] of Object.entries(defaults)) {
  const param = urlParams.get(key);
  if (param === null) continue;
  Object.assign(settings, {
    [key]: typeof value === 'number' ? Number(param) : param,
  });
}
if (!(settings.scene in scenes)) settings.scene = defaults.scene;

/** Settings each scene can pick its own default for; see `Scene` in scenes.js */
const sceneKeys = ['fog', 'fogForward', 'fogBlue', 'dof'];
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

/** In SDR with tone mapping, lights clamp here, which toneMap shows as white */
const sdrWhite = 4;

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
/** Settings that aren't kept in the URL */
const view = {
  paused: false,
  /** Highlight the tiles adaptive sampling is still refining */
  showTiles: false,
  hdr: matchMedia('(dynamic-range: high)').matches,
  /** In SDR, whether to ease bright areas into white instead of clipping them */
  toneMapping: true,
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

// Params in shaders.js: 4 × (vec3f + u32), then 16 scalars
const paramsData = new ArrayBuffer(144);
const paramsF32 = new Float32Array(paramsData);
const paramsU32 = new Uint32Array(paramsData);
const paramsBuffer = device.createBuffer({
  size: paramsData.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

let scene = scenes[settings.scene]();
// The shader expects lights first
let lightCount = 0;
/** @type {GPUBuffer} */
let objectBuffer;

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

/** Orbits target. `focus` is the distance that depth of field keeps sharp. */
const camera = {target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, focus: 1};

const loadScene = () => {
  scene = scenes[settings.scene]();
  // Lights first, as the shader expects
  const isLight = (/** @type {{material: number}} */ s) => s.material === LIGHT;
  scene.objects = [
    ...scene.objects.filter(isLight),
    ...scene.objects.filter((s) => !isLight(s)),
  ];
  lightCount = scene.objects.filter(isLight).length;
  objectBuffer?.destroy();
  const objectData = packObjects(scene.objects);
  objectBuffer = device.createBuffer({
    size: objectData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(objectBuffer, 0, objectData);
  resize();
  resetCamera();
};

function resetCamera() {
  const {position, target} = scene.camera;
  const offset = position.map((p, i) => p - target[i]);
  camera.target = [...target];
  camera.distance = Math.hypot(...offset);
  camera.yaw = Math.atan2(offset[0], offset[2]);
  camera.pitch = Math.asin(offset[1] / camera.distance);
  camera.focus = camera.distance;
  cameraMoved();
}

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
  paramsU32[15] = ['mis', 'light', 'bsdf'].indexOf(settings.sampling);
  paramsF32[16] = settings.clamp || 1e30;
  paramsU32[17] = scene.objects.length;
  paramsU32[18] = width;
  paramsU32[19] = height;
  const toneMap = !view.hdr && view.toneMapping;
  paramsF32[20] = view.hdr ? settings.headroom : toneMap ? sdrWhite : 1;
  paramsU32[21] = +toneMap;
  paramsF32[22] = settings.fog;
  paramsF32[23] = settings.dispersion;
  paramsF32[24] = settings.noise;
  paramsU32[25] = +view.showTiles;
  paramsF32[26] = 2 ** settings.exposure;
  paramsF32[27] = settings.dof * camera.focus;
  paramsF32[28] = camera.focus;
  paramsU32[29] = lightCount;
  paramsU32[30] = +(settings.sequence === 'sobol');
  paramsF32[31] = settings.contrast;
  paramsF32[32] = settings.fogForward;
  paramsF32[33] = settings.fogBlue;
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

  const status = done ? 'done' : view.paused ? 'paused' : 'rendering';
  const secs = (performance.now() - startTime) / 1000;
  const rate = secs ? samplesPerPixel / secs : 0;
  stats.textContent =
    `${status} · ${samplesPerPixel} spp · ${rate.toFixed(0)} spp/s · ` +
    `${activeTiles < 0 ? '–' : Math.round((100 * activeTiles) / tileCount)}% refining · ` +
    `${width}×${height}\n` +
    'drag: orbit · shift/right drag: pan · scroll: zoom · click: focus · ' +
    'space: pause · r: reset view';
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
// How far the pointer has moved since it went down, to tell clicks from drags
let dragged = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  dragged = 0;
});
canvas.addEventListener('pointermove', (e) => {
  if (!e.buttons) return;
  dragged += Math.abs(e.movementX) + Math.abs(e.movementY);
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
    const factor = Math.exp(e.deltaY * 0.001);
    camera.distance *= factor;
    // Moving toward the target, keep the same thing in focus
    camera.focus *= factor;
    cameraMoved();
  },
  {passive: false},
);
// Click: focus on whatever is under the pointer
canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0 || dragged > 3) return;
  const {position, forward, right, up} = cameraBasis();
  const {zoom} = scene.camera;
  const x = (e.offsetX / canvas.clientWidth - 0.5) * zoom;
  const y = (0.5 - e.offsetY / canvas.clientHeight) * zoom;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const d = normalize(
    forward.map((f, i) => f + right[i] * x * aspect + up[i] * y),
  );
  const t = hitDistance(scene.objects, position, d);
  if (!isFinite(t)) return;
  // The lens focuses on a plane, so it's the depth that matters
  camera.focus = t * forward.reduce((sum, f, i) => sum + f * d[i], 0);
  if (settings.dof > 0) restart();
});
/** Downloads the image as shown, as a PNG */
function saveImage() {
  // A WebGPU canvas only keeps its image until the frame ends, so draw it
  // again and capture it right away
  render(false);
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
gui.add(settings, 'scene', Object.keys(scenes)).onChange(() => {
  // Each scene has its own fog and depth of field
  useSceneDefaults();
  saveSettings();
  loadScene();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
});
gui.add(view, 'paused').name('pause (space)').listen();
gui.add({reset: resetCamera}, 'reset').name('reset view (r)');
gui.add({saveImage}, 'saveImage').name('save image');
gui
  .add(settings, 'dof', 0, 0.05, 0.001)
  .name('depth of field (click to focus)')
  .onChange(changed);

const light = gui.addFolder('Light');
light.add(settings, 'fog', 0, 0.02, 0.0001).onChange(changed);
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
  .add(settings, 'clamp', 0, 100, 1)
  .name('indirect clamp (0: none)')
  .onChange(changed);
light
  .add(settings, 'sampling', {
    'both (MIS)': 'mis',
    'aim at lights': 'light',
    'random bounces': 'bsdf',
  })
  .onChange(changed);

const display = gui.addFolder('Display');
display
  .add(settings, 'exposure', -4, 4, 0.1)
  .name('exposure (stops)')
  .onChange(() => {
    saveSettings();
    redraw = true;
  });
display.add(settings, 'contrast', 0.5, 2, 0.05).onChange(() => {
  saveSettings();
  redraw = true;
});
display.add(view, 'hdr').name('HDR (h)').onChange(saveHdr).listen();
display
  .add(view, 'toneMapping')
  .name('SDR tone mapping (t)')
  .onChange(restart)
  .listen();
display
  .add(settings, 'headroom', 1, 16, 0.5)
  .name('HDR headroom')
  .onChange(changed);

const quality = gui.addFolder('Quality');
quality
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
quality
  .add(settings, 'noise', 0, 0.1, 0.005)
  .name('noise target (0: none)')
  .onChange(keepGoing);
quality.add(settings, 'spp', 16, 16384, 16).name('max spp').onChange(keepGoing);
quality
  .add(settings, 'sequence', {'Sobol (smoother)': 'sobol', random: 'random'})
  .name('random numbers')
  .onChange(changed);
quality
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
  } else if (e.key === 'n') {
    view.showTiles = !view.showTiles;
    redraw = true;
  } else if (e.key === 't') {
    view.toneMapping = !view.toneMapping;
    restart();
  } else if (e.key === 'h') {
    view.hdr = !view.hdr;
    saveHdr();
  }
});
new ResizeObserver(resize).observe(canvas);

loadScene();
loop();
