import * as pc from 'playcanvas';

// Viewer for scenes exported by drone2splat.py: <name>.sog (the splat) and <name>.json (the
// drone's viewpoints, in meters with y up and the ground at y=0). ?scene=<name> picks another.
const sceneName = new URLSearchParams(location.search).get('scene') ?? 'house';

const lookSmoothing = 12; // per second; higher = snappier movement
const tourViewsPerSecond = 0.8; // photos were taken 2s apart, so this replays at ~1.6x speed
const flyToSeconds = 1.2;
const focusSeconds = 0.6;
const orbitDegreesPerPixel = 0.3;

const title = `${sceneName[0].toUpperCase()}${sceneName.slice(1)} splat`;
document.title = title;
document.querySelector('#help h1').textContent = title;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);

const fail = (message) => {
  $('loadingText').textContent = message;
  $('bar').hidden = true;
  $('loading').hidden = false;
};

const meta = await fetch(`${sceneName}.json`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
  .catch((e) => fail(`Couldn't load ${sceneName}.json (${e.message})`));
if (!meta) throw new Error('no scene');

// ----------------------------------------------------------------------------- engine

// WebGPU sorts the splats on the GPU. The WebGL2 fallback sorts on the CPU and is far slower,
// so it also renders at 1x to keep the frame rate usable.
const device = await pc.createGraphicsDevice(canvas, {
  deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
  antialias: false,
});
device.maxPixelRatio = Math.min(devicePixelRatio, device.isWebGPU ? 2 : 1);
const app = new pc.Application(canvas, {graphicsDevice: device});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.72, 0.79, 0.86), // hazy sky; splats don't draw on a transparent canvas
  fov: meta.fov, // the drone camera's own field of view, so photo spots frame like the photos
  nearClip: 0.05,
  farClip: meta.radius * 30,
});
app.root.addChild(camera);

const asset = new pc.Asset(sceneName, 'gsplat', {url: `${sceneName}.sog`});
asset.on('progress', (received, total) => {
  const mb = (n) => (n / 1e6).toFixed(1);
  $('bar').firstElementChild.style.width = total
    ? `${(100 * received) / total}%`
    : '50%';
  $('loadingText').textContent = total
    ? `Loading splat… ${mb(received)} / ${mb(total)} MB`
    : `Loading splat… ${mb(received)} MB`;
});
asset.on('error', (err) => fail(`Couldn't load ${sceneName}.sog (${err})`));
asset.ready(() => {
  const splat = new pc.Entity('splat');
  splat.addComponent('gsplat', {asset});
  app.root.addChild(splat);
  $('loading').hidden = true;
  $('hud').hidden = false;
  $('help').hidden = false;
});
app.assets.add(asset);
app.assets.load(asset);
app.start();

// ----------------------------------------------------------------------------- camera state

const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

// PlayCanvas cameras look down -z. yaw turns left about +y, pitch tilts up about the camera's x.
const anglesOf = ([x, y, z]) => ({
  yaw: Math.atan2(-x, -z) / RAD,
  pitch: Math.asin(clamp(y, -1, 1)) / RAD,
});

const views = meta.views.map((v) => ({
  name: v.name,
  pos: v.pos,
  fwd: v.fwd,
  ...anglesOf(v.fwd),
}));
// Start with an overview from the edge of the drone's coverage (splats get smeary beyond it),
// as high as it flew, on the side of its first photo, looking at a point ~3 m up the middle.
const overview = (() => {
  const [x, , z] = views[0].pos;
  const out = (meta.radius * 0.9) / (Math.hypot(x, z) || 1);
  const pos = [x * out, Math.max(...views.map((v) => v.pos[1])), z * out];
  const to = [-pos[0], 3 - pos[1], -pos[2]];
  const len = Math.hypot(...to);
  return {pos, ...anglesOf(to.map((v) => v / len)), dist: len};
})();

// The camera orbits a pivot `dist` meters straight ahead. After flying around without one
// (photo spots, the tour, W A S D) the pivot is stale, and the next drag finds a new one.
const cam = {
  pos: [...overview.pos],
  yaw: overview.yaw,
  pitch: overview.pitch,
  dist: overview.dist,
};
let pivotStale = false;
const velocity = [0, 0, 0];
let current = null; // index of the photo spot we're parked at, or null
let flight = null; // {from, to, t, seconds, onDone}: an animated hop
let tour = null; // {u}: fractional index along the drone's path

const baseSpeed = meta.radius * 0.35; // m/s
const qYaw = new pc.Quat();
const qPitch = new pc.Quat();

const forward = () => {
  const cp = Math.cos(cam.pitch * RAD);
  return [
    -Math.sin(cam.yaw * RAD) * cp,
    Math.sin(cam.pitch * RAD),
    -Math.cos(cam.yaw * RAD) * cp,
  ];
};
const right = () => [Math.cos(cam.yaw * RAD), 0, -Math.sin(cam.yaw * RAD)];
const up = () => {
  const [f, r] = [forward(), right()];
  return [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];
};
const pivot = () => cam.pos.map((x, k) => x + forward()[k] * cam.dist);
const addScaled = (v, d, s) => {
  for (let i = 0; i < 3; i++) v[i] += d[i] * s;
};

const stopAnimations = () => {
  if (flight && !flight.to.dist) pivotStale = true; // stopped partway to a photo spot
  flight = null;
  tour = null;
  current = null;
  $('tour').classList.remove('on');
};

const nearestView = () => {
  let best = 0;
  let bestDist = Infinity;
  views.forEach((v, i) => {
    const d = v.pos.reduce((sum, x, k) => sum + (x - cam.pos[k]) ** 2, 0);
    if (d < bestDist) [best, bestDist] = [i, d];
  });
  return best;
};

const flyTo = (index, onDone) => {
  tour = null;
  flight = {
    from: {...cam, pos: [...cam.pos]},
    to: views[index] ?? overview,
    t: 0,
    seconds: flyToSeconds,
    onDone,
  };
  current = views[index] ? index : null;
};

const step = (delta) => {
  const from = current ?? nearestView();
  flyTo((from + delta + views.length) % views.length);
};

const toggleTour = () => {
  if (tour || flight?.onDone) {
    stopAnimations();
    return;
  }
  const i = current ?? nearestView();
  $('tour').classList.add('on');
  flyTo(i, () => (tour = {u: i}));
};

// Catmull-Rom through the drone's positions and look directions gives a smooth replay.
const catmull = (p0, p1, p2, p3, t) =>
  p1.map((_, k) => {
    const [a, b, c, d] = [p0[k], p1[k], p2[k], p3[k]];
    return (
      0.5 *
      (2 * b +
        (c - a) * t +
        (2 * a - 5 * b + 4 * c - d) * t * t +
        (3 * b - a - 3 * c + d) * t * t * t)
    );
  });

const tourPose = (u) => {
  const i = Math.floor(u);
  const at = (k) => views[clamp(k, 0, views.length - 1)];
  const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  const f = catmull(a.fwd, b.fwd, c.fwd, d.fwd, u - i);
  const len = Math.hypot(...f);
  return {
    pos: catmull(a.pos, b.pos, c.pos, d.pos, u - i),
    ...anglesOf(f.map((x) => x / len)),
  };
};

// ----------------------------------------------------------------------------- input

const keys = new Set();
const moveKeys = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
];

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  keys.add(e.code);
  if (moveKeys.includes(e.code)) {
    stopAnimations();
    pivotStale = true;
  }
  if (e.code === 'BracketLeft') step(-1);
  if (e.code === 'BracketRight') step(1);
  if (e.code === 'KeyT') toggleTour();
  if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
  if (e.code === 'KeyR') flyTo(-1); // back to the overview
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

$('prev').onclick = () => step(-1);
$('next').onclick = () => step(1);
$('tour').onclick = toggleTour;
$('helpButton').onclick = () => ($('help').hidden = !$('help').hidden);

// Depth picking: renders the splat's depth under a pixel and turns it into a world point.
const picker = new pc.Picker(app, 1, 1, true);
const pickPoint = async (x, y) => {
  const [w, h] = [canvas.clientWidth, canvas.clientHeight];
  picker.resize(w, h);
  picker.prepare(camera.camera, app.scene, [
    app.scene.layers.getLayerByName('World'),
  ]);
  const p = await picker.getWorldPointAsync(x, y);
  return p && [p.x, p.y, p.z];
};

// Like Sketchfab: double-click a spot to fly toward it and orbit around it from then on.
const focusOn = async (x, y) => {
  const hit = await pickPoint(x, y);
  if (!hit) return;
  stopAnimations();
  const to = hit.map((v, k) => v - cam.pos[k]);
  const len = Math.hypot(...to);
  const dist = Math.max(len * 0.6, 0.5);
  const dir = to.map((v) => v / len);
  flight = {
    from: {...cam, pos: [...cam.pos]},
    to: {pos: hit.map((v, k) => v - dir[k] * dist), ...anglesOf(dir), dist},
    t: 0,
    seconds: focusSeconds,
  };
};

// After a photo spot or the tour, orbit around whatever is in the middle of the screen.
const refreshPivot = async () => {
  if (!pivotStale) return;
  pivotStale = false;
  const hit = await pickPoint(canvas.clientWidth / 2, canvas.clientHeight / 2);
  if (!hit) return;
  const d = hit.reduce((sum, v, k) => sum + (v - cam.pos[k]) * forward()[k], 0);
  if (d > 0.1) cam.dist = d;
};

const placeAroundPivot = (center) =>
  (cam.pos = center.map((x, k) => x - forward()[k] * cam.dist));
const orbit = (dx, dy) => {
  const center = pivot();
  cam.yaw = wrapAngle(cam.yaw - dx * orbitDegreesPerPixel);
  cam.pitch = clamp(cam.pitch - dy * orbitDegreesPerPixel, -89, 89);
  placeAroundPivot(center);
};
// Panning tracks the cursor 1:1 at the pivot's distance.
const metersPerPixel = () =>
  (2 * cam.dist * Math.tan((meta.fov / 2) * RAD)) / canvas.clientHeight;
const pan = (dx, dy) => {
  addScaled(cam.pos, right(), -dx * metersPerPixel());
  addScaled(cam.pos, up(), dy * metersPerPixel());
};
const zoom = (factor) => {
  const center = pivot();
  cam.dist = clamp(cam.dist * factor, 0.2, meta.radius * 20);
  placeAroundPivot(center);
};

const pointers = new Map();
const pinch = () => {
  const [a, b] = [...pointers.values()];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    d: Math.hypot(a.x - b.x, a.y - b.y),
  };
};
let lastPinch = null;
let lastTap = null; // {time, x, y}, to spot double taps (dblclick doesn't fire for touch)

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY, button: e.button});
  canvas.classList.add('dragging');
  lastPinch = pointers.size === 2 ? pinch() : null;
  const tap = {time: e.timeStamp, x: e.clientX, y: e.clientY};
  if (
    pointers.size === 1 &&
    e.button === 0 &&
    lastTap &&
    tap.time - lastTap.time < 350 &&
    Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 20
  ) {
    lastTap = null;
    focusOn(e.clientX, e.clientY);
    return;
  }
  lastTap = tap;
  stopAnimations();
  refreshPivot();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
  [p.x, p.y] = [e.clientX, e.clientY];
  if (flight) return; // a double-click focus is flying
  if (pointers.size === 2) {
    const now = pinch();
    pan(now.x - lastPinch.x, now.y - lastPinch.y);
    zoom(lastPinch.d / now.d);
    lastPinch = now;
  } else if (p.button === 2 || e.shiftKey) {
    pan(dx, dy);
  } else {
    orbit(dx, dy);
  }
});
const release = (e) => {
  pointers.delete(e.pointerId);
  lastPinch = pointers.size === 2 ? pinch() : null;
  if (!pointers.size) canvas.classList.remove('dragging');
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    stopAnimations();
    refreshPivot();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    zoom(Math.exp(pixels * 0.002));
  },
  {passive: false},
);

// ----------------------------------------------------------------------------- update

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

app.on('update', (dt) => {
  dt = Math.min(dt, 0.1);

  if (flight) {
    flight.t = Math.min(1, flight.t + dt / flight.seconds);
    const t = ease(flight.t);
    const {from, to} = flight;
    cam.pos = from.pos.map((x, k) => lerp(x, to.pos[k], t));
    cam.yaw = from.yaw + wrapAngle(to.yaw - from.yaw) * t;
    cam.pitch = lerp(from.pitch, to.pitch, t);
    if (flight.t === 1) {
      if (to.dist) cam.dist = to.dist;
      else pivotStale = true;
      const done = flight.onDone;
      flight = null;
      done?.();
    }
  } else if (tour) {
    tour.u += dt * tourViewsPerSecond;
    if (tour.u >= views.length - 1) tour.u = 0;
    Object.assign(cam, tourPose(tour.u));
    pivotStale = true;
    current = Math.round(tour.u);
  }

  // Keyboard flying: W/S follow the look direction, A/D strafe, Q/E go straight down/up.
  const held = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  const fwdIn = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
  const sideIn = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
  const upIn = held('KeyE') - held('KeyQ');
  const speed =
    baseSpeed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1);
  const target = [0, 0, 0];
  addScaled(target, forward(), fwdIn * speed);
  addScaled(target, right(), sideIn * speed);
  target[1] += upIn * speed;
  const blend = 1 - Math.exp(-lookSmoothing * dt);
  for (let k = 0; k < 3; k++) velocity[k] = lerp(velocity[k], target[k], blend);
  addScaled(cam.pos, velocity, dt);

  camera.setPosition(cam.pos[0], cam.pos[1], cam.pos[2]);
  qYaw.setFromAxisAngle(pc.Vec3.UP, cam.yaw);
  qPitch.setFromAxisAngle(pc.Vec3.RIGHT, cam.pitch);
  camera.setRotation(qYaw.mul(qPitch));

  const spot = current === null ? '' : `${views[current].name} · `;
  const height = meta.aligned ? `${cam.pos[1].toFixed(1)} m up` : '';
  $('status').textContent = spot + height;
});
