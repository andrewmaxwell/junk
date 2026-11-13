import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {Turmite, parseRule, CHUNK, FORMATIONS, MAX_STATES} from './turmite.js';
import {meshChunk} from './mesher.js';

// rule, or rule*ants
const PRESETS = {
  'Cage (LRRL ×48)': 'LRRL*48',
  'Star (UND ×48)': 'UND*48',
  'Flower (LNBLN ×24)': 'LNBLN*24',
  'Jacks (LLBRB ×48)': 'LLBRB*48',
  'Mandala (UDNN ×8)': 'UDNN*8',
  'Coral (LRULL)': 'LRULL',
  'Chaos, then a highway (LRUD)': 'LRUD',
  'Necklace (ULLB)': 'ULLB',
  "Langton's ant, flat (RL)": 'RL',
};
const DEFAULT = 'LRRL*48';
const SPEEDS = {
  '10 steps/s': 10,
  '100 steps/s': 100,
  '1k steps/s': 1e3,
  '10k steps/s': 1e4,
  '100k steps/s': 1e5,
  '1M steps/s': 1e6,
};
const ANTS = {
  1: 1,
  '2 · mirror': 2,
  '4 · two mirrors': 4,
  '8 · three mirrors': 8,
  '24 · rotations': 24,
  '48 · full cube': 48,
};

const phone = matchMedia('(pointer: coarse)').matches;
const MAX_QUADS = phone ? 1e6 : 3e6; // what the GPU has to draw, twice a frame (once for shadows)
const MAX_CHUNKS = phone ? 600 : 2000; // 160 KB each
const EDGE = 32000; // chunk keys run out at ±32768

const $ = (id) => document.getElementById(id);
const say = (text) => ($('message').textContent = text);
const fmt = (n) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
    : n.toLocaleString('en-US');

// One colour per state (state 0 is empty), evenly spaced in OKLCH hue.
const setPalette = (states, colors) => {
  for (let s = 1; s < states; s++) {
    const t = states > 2 ? (s - 1) / (states - 2) : 0;
    const h = ((25 + 260 * t) * Math.PI) / 180;
    const L = 0.84 - 0.2 * t; // later states a little darker, so they read apart in grey too
    const a = 0.12 * Math.cos(h);
    const b = 0.12 * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    colors[s].setRGB(
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
      THREE.LinearSRGBColorSpace,
    );
  }
};

// ---- three.js setup

const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas});
} catch (e) {
  say(`This needs WebGL, which isn't available here (${e.message}).`);
  throw e;
}
const pixelRatio = Math.min(devicePixelRatio, phone ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;

const BACKGROUND = new THREE.Color('#14161c');
const scene = new THREE.Scene();
scene.background = BACKGROUND;
scene.fog = new THREE.Fog(BACKGROUND, 10, 100);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(14, 10, 18);
scene.add(new THREE.HemisphereLight('#e6ecff', '#57525e', 0.95));
// The sun stays up and to the left of the viewer, like a turntable under a studio light.
const sun = new THREE.DirectionalLight('#fff4e6', 2.3);
const SHADOW_SIZE = phone ? 1024 : 2048;
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
sun.shadow.bias = -0.0002;
sun.shadow.intensity = 0.85;
scene.add(sun, sun.target);

// Colour comes from what the mesher put on each vertex: state, age and openness.
const AGE_RAMP = [
  '#34388f',
  '#7a3fa6',
  '#c9488c',
  '#f0765a',
  '#f8b84a',
  '#fff0b5',
]; // old to new
const uniforms = {
  uNow: {value: 1},
  uByAge: {value: 1},
  uStates: {value: 2},
  uPalette: {value: Array.from({length: MAX_STATES}, () => new THREE.Color())},
  uRamp: {value: AGE_RAMP.map((c) => new THREE.Color(c))},
};
const material = new THREE.MeshLambertMaterial();
material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      attribute vec3 voxel; // state, step last visited, openness
      uniform float uNow, uByAge, uStates;
      uniform vec3 uPalette[${MAX_STATES}];
      uniform vec3 uRamp[${AGE_RAMP.length}];
      varying vec3 vTint;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // squared, so that the newest colours are kept for the cells the ants have only just left
      float t = pow(clamp(voxel.y / uNow, 0.0, 1.0), 2.0) * ${AGE_RAMP.length - 1}.0;
      int k = int(min(t, ${AGE_RAMP.length - 2}.0));
      vec3 byAge = mix(uRamp[k], uRamp[k + 1], t - float(k));
      // later states a little darker, so the pattern of states still shows
      byAge *= mix(1.0, 0.7, (voxel.x - 1.0) / max(1.0, uStates - 2.0));
      vTint = mix(uPalette[int(voxel.x + 0.5)], byAge, uByAge) * voxel.z;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
    .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;');
};

// The ants are drawn after the sculpture and through it, so you can always see where they are,
// and brighter than white, so the bloom pass makes them glow.
const antGeometry = new THREE.ConeGeometry(0.4, 1, 12).rotateX(Math.PI / 2); // points along +z
const antMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#fff3c4').multiplyScalar(2.5),
  depthTest: false,
  fog: false,
});
let antMeshes = [];

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: phone ? 2 : 4,
  }),
);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.2, 1.5));
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

// ---- the simulation and its meshes

const params = {
  rule: DEFAULT,
  preset: DEFAULT,
  ants: 1,
  colorByAge: 1,
  speed: 1e4,
  time: 0,
  follow: false,
};
let turmite, running, budget;
let quads = 0;
let seek = null; // the step the time slider wants to be at
let horizon = 0; // the furthest step this rule has been run to

const meshes = new Map(); // chunk key -> Mesh
const queue = new Set(); // keys of chunks to mesh again

const remesh = (key) => {
  const chunk = turmite.chunks.get(key);
  const m = chunk && meshChunk(turmite, chunk);
  let mesh = meshes.get(key);
  if (mesh) {
    quads -= mesh.userData.quads;
    mesh.geometry.dispose();
  }
  if (!m?.quads) {
    if (mesh) scene.remove(mesh);
    meshes.delete(key);
    return;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3, true));
  geometry.setAttribute('voxel', new THREE.BufferAttribute(m.voxel, 3));
  geometry.setIndex(new THREE.BufferAttribute(m.index, 1));
  geometry.computeBoundingSphere();
  if (mesh) mesh.geometry = geometry;
  else {
    mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(chunk.cx, chunk.cy, chunk.cz).multiplyScalar(CHUNK);
    meshes.set(key, mesh);
    scene.add(mesh);
  }
  mesh.userData.quads = m.quads;
  quads += m.quads;
};

// Why it has to stop, if it does.
const limit = () => {
  if (
    turmite.ants.some(
      ({x, y, z}) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > EDGE,
    )
  )
    return 'an ant reached the edge of the world';
  if (quads > MAX_QUADS)
    return `it hit this device's ${fmt(MAX_QUADS)}-face drawing budget`;
  if (turmite.chunks.size > MAX_CHUNKS) return 'it hit the memory budget';
};

// Runs up to this many steps in about this many milliseconds. Returns how many are left.
const advance = (steps, ms) => {
  const t0 = performance.now();
  while (steps > 0 && performance.now() - t0 < ms) {
    const n = Math.min(steps, Math.ceil(20000 / turmite.ants.length));
    turmite.run(n);
    steps -= n;
    const why = limit();
    if (why) {
      setRunning(false);
      say(`Paused at step ${fmt(turmite.steps)}: ${why}.`);
      return 0;
    }
  }
  return steps;
};

// Back to step 0. The old meshes stay up until the new ones replace them.
const rewind = () => {
  turmite = new Turmite(params.rule, params.ants);
  for (const key of meshes.keys()) queue.add(key);
  budget = 0;
};

const presetOf = (rule, ants) => (ants > 1 ? `${rule}*${ants}` : rule);

const start = (rule, ants) => {
  params.rule = rule;
  params.ants = ants;
  params.preset = presetOf(rule, ants);
  rewind();
  seek = null;
  horizon = 0;
  setPalette(rule.length, uniforms.uPalette.value);
  uniforms.uStates.value = rule.length;
  scene.remove(...antMeshes);
  antMeshes = turmite.ants.map(() => new THREE.Mesh(antGeometry, antMaterial));
  for (const mesh of antMeshes) mesh.renderOrder = 1;
  scene.add(...antMeshes);
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  say('');
  history.replaceState(null, '', link());
};

const link = (steps) =>
  `#rule=${params.rule}${params.ants > 1 ? `&ants=${params.ants}` : ''}${steps ? `&steps=${steps}` : ''}`;

// ---- camera framing: keep the whole sculpture in view as it grows, unless the user takes over

const box = new THREE.Box3();
const center = new THREE.Vector3();
const offset = new THREE.Vector3();
const point = new THREE.Vector3();
const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
let zoom = 1;
let touching = false;
let resumeRotate;

const framing = () => {
  const {min, max, ants} = turmite;
  if (params.follow) {
    center.set(ants[0].x + 0.5, ants[0].y + 0.5, ants[0].z + 0.5);
    return {radius: 30, distance: 70};
  }
  box.makeEmpty();
  if (turmite.filled) box.set(point.fromArray(min), offset.fromArray(max));
  for (const {x, y, z} of ants) box.expandByPoint(point.set(x, y, z));
  box.max.addScalar(1);
  box.getCenter(center);
  const radius = Math.max(4, box.min.distanceTo(box.max) / 2);
  // How far back the camera must be, looking the way it does now, to fit every corner of the box.
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / 1.1; // with a margin
  const tanH = tanV * camera.aspect;
  axes[0].set(1, 0, 0).applyQuaternion(camera.quaternion);
  axes[1].set(0, 1, 0).applyQuaternion(camera.quaternion);
  axes[2].set(0, 0, 1).applyQuaternion(camera.quaternion); // towards the camera
  let distance = 8;
  for (let i = 0; i < 8; i++) {
    point.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    point.sub(center);
    const toward = point.dot(axes[2]);
    distance = Math.max(
      distance,
      Math.abs(point.dot(axes[0])) / tanH + toward,
      Math.abs(point.dot(axes[1])) / tanV + toward,
    );
  }
  return {radius, distance};
};

controls.addEventListener('start', () => {
  touching = true;
  controls.autoRotate = false;
  clearTimeout(resumeRotate);
});
controls.addEventListener('end', () => {
  touching = false;
  zoom = THREE.MathUtils.clamp(
    camera.position.distanceTo(controls.target) / framing().distance,
    0.15,
    5,
  );
  resumeRotate = setTimeout(() => (controls.autoRotate = true), 4000);
});

const updateCamera = (dt) => {
  const {radius, distance} = framing();
  const k = 1 - Math.exp(-dt * 2.5);
  if (!touching) {
    controls.target.lerp(center, k);
    offset.subVectors(camera.position, controls.target);
    const d = offset.length();
    offset.setLength(d + (distance * zoom - d) * k);
    camera.position.copy(controls.target).add(offset);
  }
  controls.update();
  const d = camera.position.distanceTo(controls.target);
  camera.near = Math.max(0.05, (d - radius) * 0.5, d * 0.002);
  camera.far = d + radius * 3;
  camera.updateProjectionMatrix();
  scene.fog.near = d;
  scene.fog.far = d + radius * 2.5;

  // light and shadow for the part of the sculpture in view
  const view = Math.min(radius, d);
  point.set(-0.55, 0.7, 0.45).normalize().applyQuaternion(camera.quaternion);
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).addScaledVector(point, view * 3);
  const shadow = sun.shadow.camera;
  shadow.left = shadow.bottom = -view;
  shadow.right = shadow.top = view;
  shadow.near = view;
  shadow.far = view * 5;
  shadow.updateProjectionMatrix();
  sun.shadow.normalBias = ((2 * view) / SHADOW_SIZE) * 1.5;

  const heading = point;
  turmite.ants.forEach(({x, y, z, hx, hy, hz}, i) => {
    const mesh = antMeshes[i];
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    mesh.lookAt(heading.set(hx, hy, hz).add(mesh.position));
    mesh.scale.setScalar(Math.max(1, d / (antMeshes.length > 1 ? 120 : 60)));
  });
};

const updateStats = () => {
  const {steps, filled, min, max, ants} = turmite;
  const size = filled ? max.map((v, i) => v - min[i] + 1).join('×') : '–';
  $('stats').textContent =
    `${params.rule}${ants.length > 1 ? ` · ${ants.length} ants` : ''} · step ${fmt(steps)} · ${fmt(filled)} voxels · ${size}`;
};

let timeSlider;
let last = performance.now();
const frame = (now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (seek !== null) {
    if (seek < turmite.steps) rewind();
    if (advance(seek - turmite.steps, 12) === 0) seek = null;
  } else if (running) {
    budget += params.speed * dt;
    const n = Math.floor(budget);
    budget -= n;
    if (advance(n, 6) > 0) budget = 0; // can't keep up: run as fast as we can
  }
  if (seek === null && (params.time !== turmite.steps || !horizon)) {
    horizon = Math.max(horizon, turmite.steps, 1);
    params.time = turmite.steps;
    timeSlider.max(horizon).updateDisplay();
  }

  for (const chunk of turmite.takeDirty()) queue.add(chunk.key);
  const t0 = performance.now();
  for (const key of queue) {
    if (performance.now() - t0 > 5) break; // the rest next frame
    queue.delete(key);
    remesh(key);
  }
  uniforms.uNow.value = Math.max(1, turmite.steps);
  updateCamera(dt);
  updateStats();
  composer.render();
  requestAnimationFrame(frame);
};

// ---- controls

const randomRule = () => {
  for (;;) {
    const n = 3 + Math.floor(Math.random() * 4);
    let rule = '';
    for (let i = 0; i < n; i++) rule += 'LRUDNB'[Math.floor(Math.random() * 6)];
    if (!/[UD]/.test(rule) || !/[LR]/.test(rule)) continue;
    const t = new Turmite(rule);
    t.run(30000);
    // skip rules that fall into a tiny loop or shoot straight off on a highway
    const size = Math.max(...t.max.map((v, i) => v - t.min[i]));
    if (t.filled > 1000 && size < 100) return rule;
  }
};

let playButton;
const setRunning = (on) => {
  running = on;
  playButton?.name(on ? '⏸ Pause' : '▶ Play');
  if (on) say('');
};

const setRule = (text, ants = params.ants) => {
  const rule = parseRule(text);
  if (!rule) {
    say(`“${text}” isn't a rule: use 2–12 of the letters L R U D N B.`);
    params.rule = turmite.rule;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    return;
  }
  start(rule, ants);
  setRunning(true);
};

const actions = {
  random: () => setRule(randomRule()),
  toggle: () => setRunning(!running),
  step: () => {
    setRunning(false);
    if (seek === null) advance(1, 8);
  },
  share: async () => {
    const url = location.origin + location.pathname + link(turmite.steps);
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      say(`Link copied. It opens paused at step ${fmt(turmite.steps)}.`);
    } catch {
      say('Couldn’t copy; the link is in the address bar.');
    }
  },
};

const gui = new GUI({title: '3D Turmite'});
gui
  .add(params, 'rule')
  .name('Rule')
  .onFinishChange((v) => v !== turmite.rule && setRule(v));
gui
  .add(params, 'preset', PRESETS)
  .name('Preset')
  .onChange((v) => setRule(v.split('*')[0], +v.split('*')[1] || 1));
gui.add(actions, 'random').name('🎲 Random rule');
gui
  .add(params, 'ants', ANTS)
  .name('Ants')
  .onChange((v) => setRule(turmite.rule, v));
gui
  .add(params, 'colorByAge', {Age: 1, State: 0})
  .name('Color by')
  .onChange((v) => (uniforms.uByAge.value = v));
gui.add(params, 'speed', SPEEDS).name('Speed');
playButton = gui.add(actions, 'toggle');
timeSlider = gui
  .add(params, 'time', 0, 1, 1)
  .name('Time')
  .onChange((v) => {
    seek = v;
    setRunning(false);
    say('');
  });
gui.add(params, 'follow').name('Follow the ant');
gui.add(actions, 'share').name('🔗 Copy link');
if (phone) gui.close();

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    actions.toggle();
  } else if (e.key === '.') actions.step();
});

// ---- start: from the link if there is one

const openLink = () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  const rule = parseRule(hash.get('rule') || '');
  const ants = Object.hasOwn(FORMATIONS, hash.get('ants'))
    ? +hash.get('ants')
    : 1;
  const steps = Math.max(0, Math.floor(+hash.get('steps') || 0));
  if (!rule) {
    const [r, a] = DEFAULT.split('*');
    start(r, +a || 1);
  } else start(rule, ants);
  setRunning(!(rule && steps));
  if (rule && steps) {
    seek = horizon = steps;
    say(`Opened at step ${fmt(steps)}. Press play to go on.`);
  }
};
openLink();
addEventListener('hashchange', openLink);
requestAnimationFrame(frame);
