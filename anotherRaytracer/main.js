import {packObjects, scenes} from './scenes.js';
import {displayShader, traceShader, vertexShader} from './shaders.js';

const params = new URLSearchParams(location.search);
/** 'cornell' (default) or 'veach'; see `scenes` in scenes.js */
const sceneName = params.get('scene') ?? 'cornell';
/** 'mis' (default), 'light' or 'bsdf'; see `sampling` in shaders.js */
const samplingName = params.get('sampling') ?? 'mis';
/** Cap on bounced light per sample; 0 for none. See `maxIndirect` in shaders.js */
const clamp = Number(params.get('clamp') ?? 20);
/** Rendered pixels per CSS pixel. 2 is sharp on retina screens, but 4x slower. */
const scale = Number(params.get('scale') ?? 1);
/** Stop refining after this many samples per pixel */
const maxSamples = Number(params.get('spp') ?? 4096);

const scene = (scenes[sceneName] ?? scenes.cornell)();
const sampling = ['mis', 'light', 'bsdf'].indexOf(samplingName);

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const stats = /** @type {HTMLElement} */ (document.querySelector('#stats'));

const gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2'));
if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
  stats.textContent = 'This needs WebGL2 with float render targets.';
  throw new Error('No float render targets');
}

///////////////////////////////
// GL setup
///////////////////////////////

/** @type {(type: number, source: string) => WebGLShader} */
const compile = (type, source) => {
  const shader = /** @type {WebGLShader} */ (gl.createShader(type));
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
  }
  return shader;
};

/** @type {(fragmentSource: string) => {program: WebGLProgram, uniforms: Record<string, WebGLUniformLocation | null>}} */
const makeProgram = (fragmentSource) => {
  const program = /** @type {WebGLProgram} */ (gl.createProgram());
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, 'corner');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
  }
  /** @type {Record<string, WebGLUniformLocation | null>} */
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const name = /** @type {WebGLActiveInfo} */ (
      gl.getActiveUniform(program, i)
    ).name.replace('[0]', '');
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return {program, uniforms};
};

const tracer = makeProgram(traceShader);
const display = makeProgram(displayShader);

// One triangle that covers the whole screen
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 3, -1, -1, 3]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// The scene doesn't change, so its uniforms are set once
gl.useProgram(tracer.program);
gl.uniform1i(tracer.uniforms.objectCount, scene.objects.length);
for (const [name, values] of Object.entries(packObjects(scene.objects))) {
  gl.uniform4fv(tracer.uniforms[name], values);
}
gl.uniform1i(tracer.uniforms.sampling, Math.max(0, sampling));
gl.uniform1f(tracer.uniforms.maxIndirect, clamp || 1e30);

// Two float textures holding running sums of samples, in alpha the count.
// Each draw reads one and writes the other.
/** @type {{texture: WebGLTexture, framebuffer: WebGLFramebuffer}[]} */
let targets = [];
let width = 0;
let height = 0;

const resize = () => {
  width = Math.max(1, Math.round(canvas.clientWidth * scale));
  height = Math.max(1, Math.round(canvas.clientHeight * scale));
  canvas.width = width;
  canvas.height = height;
  for (const {texture, framebuffer} of targets) {
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
  }
  targets = [0, 1].map(() => {
    const texture = /** @type {WebGLTexture} */ (gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const framebuffer = /** @type {WebGLFramebuffer} */ (
      gl.createFramebuffer()
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    return {texture, framebuffer};
  });
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
// True while the camera is moving, so frames stay quick
let moving = false;

function restart() {
  frame = 0;
  samplesPerPixel = 0;
}

let lastTime = performance.now();
let renderMs = 0;

const loop = () => {
  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;

  const done = samplesPerPixel >= maxSamples;
  if (!paused && !done) {
    // Take more samples per frame while the GPU keeps up, fewer when it
    // doesn't. Moving the camera goes back to one, to stay responsive.
    if (moving) samplesPerFrame = 1;
    else if (frame > 2 && dt < 20) samplesPerFrame++;
    else if (dt > 35) samplesPerFrame = Math.max(1, samplesPerFrame - 1);
    samplesPerFrame = Math.min(samplesPerFrame, maxSamples - samplesPerPixel);
    // Ignore long gaps, like while the tab was hidden
    if (frame) renderMs += Math.min(dt, 100);

    const {position, forward, right, up} = cameraBasis();
    const {zoom} = scene.camera;
    const [read, write] = frame % 2 ? targets : [targets[1], targets[0]];
    gl.useProgram(tracer.program);
    gl.uniform3fv(tracer.uniforms.camPos, position);
    gl.uniform3fv(tracer.uniforms.camForward, forward);
    gl.uniform3fv(
      tracer.uniforms.camRight,
      right.map((r) => (r * zoom * width) / height),
    );
    gl.uniform3fv(
      tracer.uniforms.camUp,
      up.map((u) => u * zoom),
    );
    gl.uniform1i(tracer.uniforms.frame, frame);
    gl.uniform1ui(tracer.uniforms.randomSeed, randomSeed++);
    gl.uniform1i(tracer.uniforms.samplesPerFrame, samplesPerFrame);
    gl.uniform1i(tracer.uniforms.previous, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(display.program);
    gl.uniform1i(display.uniforms.sums, 0);
    gl.bindTexture(gl.TEXTURE_2D, write.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    frame++;
    samplesPerPixel += samplesPerFrame;
    moving = false;
  }

  const status = done ? 'done' : paused ? 'paused' : 'rendering';
  const rate = renderMs ? (samplesPerPixel / renderMs) * 1000 : 0;
  stats.textContent =
    `${status} · ${samplesPerPixel} spp · ${rate.toFixed(0)} spp/s · ` +
    `${width}×${height} · ${sceneName} · sampling: ${samplingName} · ` +
    'drag: orbit · shift/right drag: pan · scroll: zoom · r: reset view · space: pause';
  requestAnimationFrame(loop);
};

/** Call whenever the camera changes */
const cameraMoved = () => {
  moving = true;
  restart();
  renderMs = 0;
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
  }
});
new ResizeObserver(resize).observe(canvas);

resize();
resetCamera();
loop();
