import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {Turmite, parseRule, CHUNK} from './turmite.js';
import {meshChunk} from './mesher.js';

const PRESETS = {
  'Coral (LRULL)': 'LRULL',
  'Chaos, then a highway (LRUD)': 'LRUD',
  'Necklace (ULLB)': 'ULLB',
  'Caterpillar (UNLNL)': 'UNLNL',
  'Spire (LUDD)': 'LUDD',
  "Langton's ant, flat (RL)": 'RL',
};
const DEFAULT_RULE = 'LRULL';
const SPEEDS = {
  '10 steps/s': 10,
  '100 steps/s': 100,
  '1k steps/s': 1e3,
  '10k steps/s': 1e4,
  '100k steps/s': 1e5,
  '1M steps/s': 1e6,
};

const phone = matchMedia('(pointer: coarse)').matches;
const MAX_QUADS = phone ? 1.5e6 : 5e6; // what the GPU has to draw
const MAX_CHUNKS = phone ? 3000 : 8000; // 32 KB each
const EDGE = 32000; // chunk keys run out at ±32768

const $ = (id) => document.getElementById(id);
const say = (text) => ($('message').textContent = text);
const fmt = (n) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
    : n.toLocaleString('en-US');

// One colour per state (state 0 is empty), evenly spaced in OKLCH hue.
const makePalette = (states) => {
  const palette = [[0, 0, 0]];
  for (let s = 1; s < states; s++) {
    const t = states > 2 ? (s - 1) / (states - 2) : 0;
    const h = ((25 + 260 * t) * Math.PI) / 180;
    const L = 0.84 - 0.2 * t; // later states a little darker, so they read apart in grey too
    const a = 0.12 * Math.cos(h);
    const b = 0.12 * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const q = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * q,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * q,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * q,
    ]; // linear sRGB, which is what vertex colours are
    palette.push(rgb.map((v) => Math.round(255 * Math.min(1, Math.max(0, v)))));
  }
  return palette;
};

// ---- three.js setup

const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: true});
} catch (e) {
  say(`This needs WebGL, which isn't available here (${e.message}).`);
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;

const BACKGROUND = new THREE.Color('#14161c');
const scene = new THREE.Scene();
scene.background = BACKGROUND;
scene.fog = new THREE.Fog(BACKGROUND, 10, 100);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(14, 10, 18);
scene.add(camera);
scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a302c', 0.9));
const sun = new THREE.DirectionalLight('#fff4e6', 2.6);
sun.position.set(-1, 2, 1); // up and to the left of the viewer, wherever they orbit
camera.add(sun);

const material = new THREE.MeshLambertMaterial({vertexColors: true});

const ant = new THREE.Mesh(
  new THREE.ConeGeometry(0.4, 1, 12).rotateX(Math.PI / 2), // points along +z
  // drawn through the sculpture, so you can always see where it is
  new THREE.MeshBasicMaterial({
    color: '#fff3c4',
    fog: false,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  }),
);
ant.renderOrder = 1;
scene.add(ant);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotateSpeed = 0.8;

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

// ---- the simulation and its meshes

const params = {
  rule: DEFAULT_RULE,
  preset: DEFAULT_RULE,
  speed: 1e4,
  autoRotate: true,
  follow: false,
};
let turmite, palette, queue, quads, running, budget;

const meshes = new Map(); // chunk -> Mesh

const clear = () => {
  for (const mesh of meshes.values()) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  meshes.clear();
};

const remesh = (chunk) => {
  const m = meshChunk(turmite, chunk, palette);
  let mesh = meshes.get(chunk);
  if (mesh) {
    quads -= mesh.userData.quads;
    mesh.geometry.dispose();
  }
  if (!m.quads) {
    if (mesh) scene.remove(mesh);
    meshes.delete(chunk);
    return;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(m.color, 3, true));
  geometry.setIndex(new THREE.BufferAttribute(m.index, 1));
  geometry.computeBoundingSphere();
  if (mesh) mesh.geometry = geometry;
  else {
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(chunk.cx, chunk.cy, chunk.cz).multiplyScalar(CHUNK);
    meshes.set(chunk, mesh);
    scene.add(mesh);
  }
  mesh.userData.quads = m.quads;
  quads += m.quads;
};

// Why it has to stop, if it does.
const limit = () => {
  const {x, y, z} = turmite;
  if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > EDGE)
    return 'the ant reached the edge of the world';
  if (quads > MAX_QUADS)
    return `it hit this device's ${fmt(MAX_QUADS)}-face drawing budget`;
  if (turmite.chunks.size > MAX_CHUNKS) return 'it hit the memory budget';
};

const advance = (steps, ms) => {
  const t0 = performance.now();
  while (steps > 0 && performance.now() - t0 < ms) {
    const n = Math.min(steps, 20000);
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

const start = (rule, steps = 0) => {
  clear();
  turmite = new Turmite(rule);
  palette = makePalette(rule.length);
  queue = new Set();
  quads = 0;
  budget = 0;
  params.rule = rule;
  params.preset = rule;
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
  say('');
  if (steps) advance(steps, 3000);
  history.replaceState(null, '', `#rule=${rule}`);
};

// ---- camera framing: keep the whole sculpture in view as it grows, unless the user takes over

const box = new THREE.Box3();
const center = new THREE.Vector3();
const offset = new THREE.Vector3();
let zoom = 1;
let touching = false;
let resumeRotate;

const framing = () => {
  const {min, max, x, y, z} = turmite;
  if (params.follow) {
    center.set(x + 0.5, y + 0.5, z + 0.5);
    return {radius: 30, distance: 70};
  }
  box.min.set(Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z));
  box.max.set(Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z));
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
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    corner.sub(center);
    const toward = corner.dot(axes[2]);
    distance = Math.max(
      distance,
      Math.abs(corner.dot(axes[0])) / tanH + toward,
      Math.abs(corner.dot(axes[1])) / tanV + toward,
    );
  }
  return {radius, distance};
};
const axes = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const corner = new THREE.Vector3();

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
  resumeRotate = setTimeout(
    () => (controls.autoRotate = params.autoRotate),
    4000,
  );
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
  const d = camera.position.distanceTo(controls.target);
  camera.near = Math.max(0.05, (d - radius) * 0.5, d * 0.002);
  camera.far = d + radius * 3;
  camera.updateProjectionMatrix();
  scene.fog.near = d;
  scene.fog.far = d + radius * 2.5;
  ant.scale.setScalar(Math.max(1, d / 60));
  controls.update();
};

const heading = new THREE.Vector3();
const updateAnt = () => {
  const {x, y, z, hx, hy, hz} = turmite;
  ant.position.set(x + 0.5, y + 0.5, z + 0.5);
  ant.lookAt(heading.set(hx, hy, hz).add(ant.position));
};

const updateStats = () => {
  const {steps, filled, min, max} = turmite;
  const size = filled ? max.map((v, i) => v - min[i] + 1).join('×') : '–';
  $('stats').textContent =
    `${params.rule} · step ${fmt(steps)} · ${fmt(filled)} voxels · ${size} · ${fmt(quads)} faces`;
};

let last = performance.now();
const frame = (now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    budget += params.speed * dt;
    const n = Math.floor(budget);
    budget -= n;
    if (advance(n, 8) > 0) budget = 0; // can't keep up: run as fast as we can
  }
  for (const chunk of turmite.takeDirty()) queue.add(chunk);
  const t0 = performance.now();
  for (const chunk of queue) {
    if (performance.now() - t0 > 6) break; // the rest next frame
    queue.delete(chunk);
    remesh(chunk);
  }
  updateAnt();
  updateCamera(dt);
  updateStats();
  renderer.render(scene, camera);
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

const setRule = (text) => {
  const rule = parseRule(text);
  if (!rule) {
    say(`“${text}” isn't a rule: use 2–12 of the letters L R U D N B.`);
    params.rule = turmite.rule;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    return;
  }
  start(rule);
  setRunning(true);
};

const actions = {
  random: () => setRule(randomRule()),
  toggle: () => setRunning(!running),
  step: () => {
    setRunning(false);
    turmite.run(1);
  },
  restart: () => setRule(turmite.rule),
  share: async () => {
    const url = `${location.origin}${location.pathname}#rule=${turmite.rule}&steps=${turmite.steps}`;
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
  .onChange((v) => setRule(v));
gui.add(actions, 'random').name('🎲 Random rule');
gui.add(params, 'speed', SPEEDS).name('Speed');
playButton = gui.add(actions, 'toggle');
gui.add(actions, 'step').name('Step once');
gui.add(actions, 'restart').name('↺ Restart');
gui
  .add(params, 'autoRotate')
  .name('Auto-rotate')
  .onChange((v) => (controls.autoRotate = v));
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
  const linked = parseRule(hash.get('rule') || '');
  const linkedSteps = Math.max(0, Math.floor(+hash.get('steps') || 0));
  start(linked || DEFAULT_RULE, linked ? linkedSteps : 0);
  if (!linked || !linkedSteps) return setRunning(true);
  const message = $('message').textContent; // set if it hit a limit
  setRunning(false);
  say(
    message ||
      (turmite.steps < linkedSteps
        ? `Got to step ${fmt(turmite.steps)} of ${fmt(linkedSteps)} before giving up. Press play to go on.`
        : `Opened at step ${fmt(turmite.steps)}. Press play to go on.`),
  );
};
openLink();
addEventListener('hashchange', openLink);
controls.autoRotate = params.autoRotate;
requestAnimationFrame(frame);
