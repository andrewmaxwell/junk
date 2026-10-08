import * as pc from 'playcanvas';

// Viewer for scenes exported by drone2splat.py: <name>.sog (the splat) and <name>.json (the
// drone's viewpoints, in meters with y up and the ground at y=0). ?scene=<name> picks another.
const sceneName = new URLSearchParams(location.search).get('scene') ?? 'house';

const lookSmoothing = 12; // per second; higher = snappier movement
const tourViewsPerSecond = 0.8; // photos were taken 2s apart, so this replays at ~1.6x speed
const flyToSeconds = 1.2;
const focusSeconds = 0.6;
const orbitDegreesPerPixel = 0.3;
const spinDegreesPerSecond = 4; // the slow turntable spin before anyone touches it
const glideDamping = 6; // per second; how fast a flicked orbit or pan slows down

const title = `${sceneName[0].toUpperCase()}${sceneName.slice(1)} splat`;

document.title = title;
document.querySelector('#help h1').textContent = title;

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);
$('hint').textContent = isTouch
  ? 'Drag to spin · Pinch to zoom · Double-tap to fly in'
  : 'Drag to spin · Scroll to zoom · Double-click to fly in';

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
// Phones have 3x screens and weaker GPUs; 1.5x still looks sharp there.
device.maxPixelRatio = Math.min(
  devicePixelRatio,
  device.isWebGPU ? (isTouch ? 1.5 : 2) : 1,
);
const app = new pc.Application(canvas, {graphicsDevice: device});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.85, 0.89, 0.92), // under the sky dome's horizon haze
  fov: meta.fov, // the drone camera's own field of view, so photo spots frame like the photos
  nearClip: 0.05,
  farClip: meta.radius * 30,
});
app.root.addChild(camera);

// Sky: a big sphere that follows the camera, blue overhead fading to haze at the horizon.
// (Splats don't draw on a transparent canvas, so a CSS background can't do this.)
const sky = (() => {
  const c = document.createElement('canvas');
  [c.width, c.height] = [1, 256];
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5b8fd0');
  grad.addColorStop(0.42, '#b9d0e6');
  grad.addColorStop(0.5, '#dfe6ea');
  grad.addColorStop(1, '#d4d8d2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 256);
  const texture = new pc.Texture(device, {
    width: 1,
    height: 256,
    format: pc.PIXELFORMAT_SRGBA8,
    mipmaps: false,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  texture.setSource(c);
  const material = new pc.StandardMaterial();
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = pc.Color.BLACK;
  material.emissive = pc.Color.WHITE;
  material.emissiveMap = texture;
  material.cull = pc.CULLFACE_FRONT; // seen from inside
  material.depthWrite = false;
  material.update();
  const entity = new pc.Entity('sky');
  entity.addComponent('render', {type: 'sphere', material, castShadows: false});
  entity.setLocalScale(meta.radius * 40, meta.radius * 40, meta.radius * 40);
  app.root.addChild(entity);
  return entity;
})();

// Fade splats out toward the edge of the drone's coverage, where they turn to smears.
const fadeFrom = meta.radius * 1.1;
const fadeTo = meta.radius * 2.2;
const fadeChunks = {
  glsl: `
void modifySplatCenter(inout vec3 center) {}
void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {}
void modifySplatColor(vec3 center, inout vec4 color) {
  color.a *= 1.0 - smoothstep(${fadeFrom.toFixed(1)}, ${fadeTo.toFixed(1)}, length(center.xz));
}`,
  wgsl: `
fn modifySplatCenter(center: ptr<function, vec3f>) {}
fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {}
fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
  (*color).a *= 1.0 - smoothstep(${fadeFrom.toFixed(1)}, ${fadeTo.toFixed(1)}, length(center.xz));
}`,
};
if (meta.aligned) {
  const material = app.scene.gsplat.material;
  material.getShaderChunks('glsl').set('gsplatModifyVS', fadeChunks.glsl);
  material.getShaderChunks('wgsl').set('gsplatModifyVS', fadeChunks.wgsl);
  material.update();
}

const loadSplat = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const asset = new pc.Asset(file, 'gsplat', {url: file});
    asset.on('progress', onProgress);
    asset.on('error', (err) =>
      reject(new Error(`Couldn't load ${file} (${err})`)),
    );
    asset.ready(resolve);
    app.assets.add(asset);
    app.assets.load(asset);
  });
const addSplat = (asset) => {
  const entity = new pc.Entity('splat');
  entity.addComponent('gsplat', {asset});
  app.root.addChild(entity);
  return entity;
};
const mb = (n) => (n / 1e6).toFixed(1);

// The preview (a few MB) shows up fast; the full splat replaces it when it arrives.
const loadScene = async () => {
  const full = `${sceneName}.sog`;
  const first = await loadSplat(meta.preview ?? full, (received, total) => {
    $('bar').firstElementChild.style.width = total
      ? `${(100 * received) / total}%`
      : '50%';
    $('loadingText').textContent = total
      ? `Loading… ${mb(received)} / ${mb(total)} MB`
      : `Loading… ${mb(received)} MB`;
  });
  const shown = addSplat(first);
  $('loading').hidden = true;
  $('hud').hidden = false;
  $('hint').hidden = false;
  if (!sharedView) spinning = true;
  if (!meta.preview) return;

  $('detail').hidden = false;
  const asset = await loadSplat(full, (received, total) => {
    $('detail').textContent = total
      ? `Loading full detail… ${Math.round((100 * received) / total)}%`
      : `Loading full detail… ${mb(received)} MB`;
  });
  addSplat(asset);
  $('detail').hidden = true;
  // Give the full splat a moment to sort before the preview disappears.
  setTimeout(() => {
    shown.destroy();
    first.unload();
  }, 500);
};

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
// Start where the scene's json says (`start`, in the same x,y,z,yaw,pitch,dist form as a shared
// link), or else with an overview from the edge of the drone's coverage (splats get smeary
// beyond it), as high as it flew, on the side of its first photo, looking ~3 m up the middle.
const overview = (() => {
  if (meta.start) {
    const [x, y, z, yaw, pitch, dist] = meta.start;
    return {pos: [x, y, z], yaw, pitch, dist};
  }
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

// A shared link carries its view in the hash: #v=x,y,z,yaw,pitch,dist
const sharedView = (() => {
  const v = location.hash
    .match(/v=([-\d.,]+)/)?.[1]
    .split(',')
    .map(Number);
  if (v?.length !== 6 || v.some(isNaN)) return false;
  Object.assign(cam, {pos: v.slice(0, 3), yaw: v[3], pitch: v[4], dist: v[5]});
  return true;
})();
let spinning = false; // turns on once the splat shows, off at the first touch
let spinTime = 0;
const glide = {orbit: [0, 0], pan: [0, 0]}; // pixels/second left over from a flick
let pendingZoom = 0; // log-distance the wheel asked for that hasn't been applied yet

// Aligned scenes keep the camera above the ground and over the area the drone covered.
const floor = 1;
const ceiling = Math.max(...views.map((v) => v.pos[1])) * 1.5;
const maxRange = Math.max(
  meta.radius * 1.5,
  ...views.map((v) => Math.hypot(v.pos[0], v.pos[2]) * 1.1),
);
const maxDist = meta.radius * 2.5;

const velocity = [0, 0, 0];
let current = null; // index of the photo spot we're parked at, or null
let flight = null; // {from, to, t, seconds, onDone}: an animated hop
let tour = null; // {u}: fractional index along the drone's path

const baseSpeed = meta.radius * 0.35; // m/s
// The drone's field of view is vertical, which on a phone held upright shows a sliver of the
// scene. Widen it on tall screens so at least ~45 degrees fit across.
const fitFov = () => {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const tall = (2 * Math.atan(Math.tan(22.5 * RAD) / aspect)) / RAD;
  camera.camera.fov = clamp(tall, meta.fov, 80);
};
fitFov();
window.addEventListener('resize', fitFov);

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

const interacted = () => {
  spinning = false;
  $('hint').classList.add('gone');
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
  interacted();
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

const button = (id, action) =>
  ($(id).onclick = () => {
    interacted();
    action();
  });
button('prev', () => step(-1));
button('next', () => step(1));
button('tour', toggleTour);
button('reset', () => flyTo(-1));
button('helpButton', () => ($('help').hidden = !$('help').hidden));

const toast = (text) => {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('toast').hidden = true), 2000);
};
// Shares <scene>.html, a small page with a link preview that opens this view.
button('share', async () => {
  const v = [...cam.pos, cam.yaw, cam.pitch, cam.dist].map(
    (x) => +x.toFixed(2),
  );
  const url = new URL(`${sceneName}.html#v=${v}`, location.href).href;
  if (isTouch && navigator.share) {
    await navigator.share({title, url}).catch(() => {});
  } else {
    await navigator.clipboard.writeText(url);
    toast('Link to this view copied');
  }
});

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
  if (meta.aligned) {
    // Tilt no further than keeps the camera above the floor (it's center - forward * dist).
    const room = (center[1] - floor) / cam.dist;
    if (room < 1)
      cam.pitch = Math.min(cam.pitch, Math.asin(Math.max(room, -1)) / RAD);
  }
  placeAroundPivot(center);
};
// Panning tracks the cursor 1:1 at the pivot's distance.
const metersPerPixel = () =>
  (2 * cam.dist * Math.tan((camera.camera.fov / 2) * RAD)) /
  canvas.clientHeight;
const pan = (dx, dy) => {
  addScaled(cam.pos, right(), -dx * metersPerPixel());
  addScaled(cam.pos, up(), dy * metersPerPixel());
};
const zoom = (factor) => {
  const center = pivot();
  cam.dist = clamp(cam.dist * factor, 0.2, maxDist);
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
// One gesture lasts from the first finger down to the last one up. A gesture that never moved
// is a tap, and two taps close together are a double tap (dblclick doesn't fire for touch).
let gesture = null; // {time, x, y, moved, multi}
let lastTap = null; // {time, x, y}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY, button: e.button});
  canvas.classList.add('dragging');
  lastPinch = pointers.size >= 2 ? pinch() : null;
  if (pointers.size > 1) {
    gesture.multi = true;
    return;
  }
  interacted();
  glide.orbit = [0, 0];
  glide.pan = [0, 0];
  pendingZoom = 0;
  gesture = {
    time: e.timeStamp,
    x: e.clientX,
    y: e.clientY,
    moved: 0,
    multi: false,
  };
  const near = isTouch ? 40 : 10;
  if (
    e.button === 0 &&
    lastTap &&
    e.timeStamp - lastTap.time < 400 &&
    Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < near
  ) {
    lastTap = null;
    gesture.multi = true; // so this second tap isn't the start of another double tap
    focusOn(e.clientX, e.clientY);
    return;
  }
  stopAnimations();
  refreshPivot();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const [dx, dy] = [e.clientX - p.x, e.clientY - p.y];
  [p.x, p.y] = [e.clientX, e.clientY];
  // Remember how fast it was moving, so letting go mid-flick keeps it gliding.
  const ms = Math.max(e.timeStamp - (gesture.lastMove ?? gesture.time), 1);
  gesture.lastMove = e.timeStamp;
  const track = (v) => {
    v[0] = lerp(v[0], (dx * 1000) / ms, 0.5);
    v[1] = lerp(v[1], (dy * 1000) / ms, 0.5);
  };
  gesture.moved = Math.max(
    gesture.moved,
    Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y),
  );
  if (flight) return; // a double-tap focus is flying
  if (pointers.size >= 2) {
    const now = pinch();
    pan(now.x - lastPinch.x, now.y - lastPinch.y);
    zoom(lastPinch.d / now.d);
    lastPinch = now;
  } else if (gesture.multi) {
    // The finger left over after a pinch would jerk the view into an orbit.
  } else if (p.button === 2 || e.shiftKey) {
    pan(dx, dy);
    track(glide.pan);
  } else {
    orbit(dx, dy);
    track(glide.orbit);
  }
});
const release = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  lastPinch = pointers.size >= 2 ? pinch() : null;
  if (pointers.size) return;
  canvas.classList.remove('dragging');
  // Held still before letting go: no glide.
  if (gesture.multi || e.timeStamp - (gesture.lastMove ?? 0) > 80) {
    glide.orbit = [0, 0];
    glide.pan = [0, 0];
  }
  const tapped =
    !gesture.multi && gesture.moved < 10 && e.timeStamp - gesture.time < 300;
  lastTap = tapped ? {time: e.timeStamp, x: gesture.x, y: gesture.y} : null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    interacted();
    stopAnimations();
    refreshPivot();
    const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    pendingZoom += pixels * 0.002; // applied smoothly over the next few frames
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
  } else if (spinning) {
    spinTime += dt;
    const speed = spinDegreesPerSecond * Math.min(1, spinTime / 2); // ease in
    orbit((speed * dt) / orbitDegreesPerPixel, 0);
  } else if (!pointers.size) {
    const fade = Math.exp(-glideDamping * dt);
    if (Math.hypot(...glide.orbit) > 1) {
      orbit(glide.orbit[0] * dt, glide.orbit[1] * dt);
      glide.orbit = glide.orbit.map((v) => v * fade);
    }
    if (Math.hypot(...glide.pan) > 1) {
      pan(glide.pan[0] * dt, glide.pan[1] * dt);
      glide.pan = glide.pan.map((v) => v * fade);
    }
    if (Math.abs(pendingZoom) > 1e-4) {
      const take = pendingZoom * (1 - Math.exp(-12 * dt));
      zoom(Math.exp(take));
      pendingZoom -= take;
    }
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

  if (meta.aligned) {
    const r = Math.hypot(cam.pos[0], cam.pos[2]);
    if (r > maxRange)
      [cam.pos[0], cam.pos[2]] = [
        cam.pos[0] * (maxRange / r),
        cam.pos[2] * (maxRange / r),
      ];
    cam.pos[1] = clamp(cam.pos[1], floor, ceiling);
  }
  sky.setPosition(cam.pos[0], cam.pos[1], cam.pos[2]);

  camera.setPosition(cam.pos[0], cam.pos[1], cam.pos[2]);
  qYaw.setFromAxisAngle(pc.Vec3.UP, cam.yaw);
  qPitch.setFromAxisAngle(pc.Vec3.RIGHT, cam.pitch);
  camera.setRotation(qYaw.mul(qPitch));

  const spot = current === null ? '' : `${views[current].name} · `;
  const height = meta.aligned ? `${cam.pos[1].toFixed(1)} m up` : '';
  $('status').textContent = spot + height;
});

loadScene().catch((e) => fail(e.message));
