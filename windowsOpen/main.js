// The world as a field of columns. The main map makes each as tall as the
// share of the year's hours you could have left the windows open there
// (ERA5-Land, about 9 km, hourly, reduced by build/fetch.py and resampled onto
// an Equal Earth grid by build/export.py). The other maps, from
// build/layers.py, are on the same projection, most of them twice as fine.
// The picture is path traced with the Comfort spike map's tracer and sharpens
// as samples add up. Titles, labels and the legend are drawn on a 2D canvas
// over it, so "save PNG" can stack the two into one image.
//
// The tracer gets a fixed budget of columns: the whole map at the home view,
// and only what's in view, in finer columns, after zooming in.
//
// Rendering pauses while the window isn't focused, since it keeps the GPU
// busy; ?noPause turns that off. ?map=<name> opens another map.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {createPathTracer} from '../comfort/map/spikes/pathtracer.js';

const [meta, layers] = await Promise.all(
  ['data/meta.json', 'data/layers.json'].map((url) =>
    fetch(url).then((r) => r.json()),
  ),
);
const {width: nx, height: ny, projection} = meta;
const NO_VALUE = 65535; // sea, once a map is decoded
const WORLD = 100; // map width in scene units
const CELL = WORLD / nx;
const KM_PER_UNIT = (2 * projection.xMax * 6371) / WORLD;

const FONT = 'Jost';

const query = new URLSearchParams(location.search);
const NO_PAUSE = query.has('noPause');

const MONTHS =
  'January February March April May June July August September October November December'.split(
    ' ',
  );
const monthName = (period) => MONTHS[Number(period) - 1];
function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}
const round2 = new Intl.NumberFormat('en-US', {maximumSignificantDigits: 2});
const compact = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: 2,
  notation: 'compact',
});

// Each map: where its numbers come from, how they become columns, and the
// words around it. settings are the column shape, kept per map.
const hours = (minutes) =>
  minutes < 60
    ? `${Math.round(minutes)} min`
    : minutes < 48 * 60
      ? `${round2.format(minutes / 60)} h`
      : `${round2.format(minutes / 1440)} days`;
const MAPS = {
  windows: {
    button: 'Open windows',
    title: 'Windows open',
    kicker: (period) =>
      period === 'all'
        ? 'A YEAR OF OPEN-WINDOW WEATHER AROUND THE WORLD'
        : `OPEN-WINDOW WEATHER IN ${monthName(period).toUpperCase()} AROUND THE WORLD`,
    subtitle(period) {
      const {lowF, nightLowF, highF, dewF, rainMm, windMph} = meta.test;
      const when =
        period === 'all'
          ? `${formatDate(meta.start)} – ${formatDate(meta.end)}`
          : monthName(period);
      return `Share of all hours ${lowF}–${highF}°F (${nightLowF}°F at night), dew point under ${dewF}°F, under ${rainMm} mm of rain, wind under ${windMph} mph and no dust or smoke  ·  ${when}`;
    },
    legend: 'HEIGHT · HOURS WITH THE WINDOWS OPEN',
    unit: '% open',
    format: (v) => `${Math.round(v)}%`,
    source: [
      'Weather: ERA5-Land reanalysis, 0.1°, hourly. Dust and smoke: CAMS PM10 and PM2.5 over AQI 100.',
      'All 24 hours of the day, in Equal Earth projection.',
    ],
    ramp: ['#f3e2c4', '#f0b56a', '#e8763a', '#cf3f22', '#9a1b14'],
    ranges: {low: [0, 90, 1], high: [10, 100, 1]},
    settings: {low: 0, high: 100, gamma: 1.6, height: 4},
  },
  elevation: {
    button: 'Elevation',
    title: 'Elevation',
    kicker: () => 'THE LAND, STRETCHED UPWARD',
    subtitle() {
      const {low, high, gamma, height} = params;
      const times = (height * KM_PER_UNIT) / ((high - low) / 1000);
      const scale =
        gamma === 1 && low === 0
          ? `exaggerated about ${round2.format(times)} times`
          : 'exaggerated';
      return `The highest ground in each column, above sea level and ${scale}`;
    },
    legend: 'HEIGHT · ELEVATION',
    unit: 'm',
    format: (m) =>
      `${(Math.round((m * 3.28084) / 10) * 10).toLocaleString('en-US')} ft`,
    source: [
      'Elevation: ETOPO 2022 (NOAA), 60″ grid, highest point per 5 km cell.',
      'In Equal Earth projection.',
    ],
    ramp: ['#8fb07a', '#d6cf9a', '#c09062', '#8c6b58', '#f7f4ef'],
    ranges: {low: [0, 3000, 50], high: [500, 8500, 50]},
    settings: {low: 0, high: 8000, gamma: 1, height: 1.6},
  },
  population: {
    button: 'Population',
    title: 'Where people live',
    kicker: () => 'PEOPLE PER SQUARE MILE IN 2025',
    subtitle: () => 'Everyone on Earth, counted on a 1 km grid',
    legend: 'HEIGHT · PEOPLE PER SQUARE MILE',
    unit: 'people/km²',
    format: (perKm) => compact.format(perKm * 2.58999), // per square mile
    source: [
      'Population: GHS-POP R2023A (EU Joint Research Centre), 2025 estimate, 30″ grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e9e2ec', '#c3b0d8', '#8f73c2', '#5a3a9c', '#2a1260'],
    ranges: {low: [0, 1000, 10], high: [100, 60000, 100]},
    settings: {low: 0, high: 8000, gamma: 0.7, height: 3},
  },
  lights: {
    button: 'Night lights',
    title: 'Lights at night',
    kicker: () => 'THE EARTH FROM SPACE AFTER DARK, 2016',
    subtitle: () =>
      'How bright each place looked on cloud-free nights through the year; the brightest city centres max out the scale',
    legend: 'HEIGHT · BRIGHTNESS AT NIGHT',
    unit: 'brightness',
    format: (v) => `${Math.round(v / 25.5)}%`, // of the brightest
    source: [
      'Night lights: Black Marble 2016 (NASA), VIIRS day-night band, 3 km grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#14172a', '#3a2c3e', '#9a6026', '#f2b445', '#fff5d6'],
    labels: false, // every city maxes out the scale
    night: true,
    ranges: {low: [0, 1000, 10], high: [100, 2550, 10]},
    settings: {low: 0, high: 2550, gamma: 1, height: 2.5},
  },
  travel: {
    button: 'Travel time',
    title: 'Far from everywhere',
    kicker: () => 'TRAVEL TIME TO THE NEAREST CITY, 2015',
    subtitle: () =>
      'The fastest way by road, rail, river or on foot to a city of at least 50,000 people',
    legend: 'HEIGHT · TIME TO THE NEAREST CITY',
    unit: 'min',
    format: hours,
    source: [
      'Travel time: Nelson 2019 on the Weiss et al. 2018 friction surface, 30″ grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e6efe9', '#9cc7b4', '#4f9a8a', '#22646b', '#123a4a'],
    labels: false, // every city is 0 minutes from itself
    ranges: {low: [0, 600, 5], high: [60, 10000, 30]},
    settings: {low: 0, high: 2880, gamma: 0.7, height: 3},
  },
  rain: {
    button: 'Rain',
    title: 'Rain',
    kicker: () =>
      `RAIN AND SNOW, ${formatDate(meta.start)} – ${formatDate(meta.end)}`.toUpperCase(),
    subtitle: () =>
      "Everything that fell in the open-window map's year, snow counted as its water",
    legend: 'HEIGHT · INCHES OF RAIN AND SNOW',
    unit: 'mm',
    format: (mm) => `${round2.format(mm / 25.4)} in`,
    source: [
      'Rain: ERA5-Land monthly means (ECMWF), 0.1°, Nov 2025 to Oct 2026.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e8eef4', '#a9c6e0', '#5b93c7', '#2a5f9e', '#0f2f63'],
    ranges: {low: [0, 1000, 10], high: [500, 10000, 50]},
    settings: {low: 0, high: 4000, gamma: 0.9, height: 3},
  },
};
for (const [key, map] of Object.entries(MAPS)) {
  map.max = key === 'windows' ? 100 : layers.layers[key].max;
}
for (const map of Object.values(MAPS)) {
  map.rampColors = map.ramp.map((hex) => new THREE.Color(hex));
}

const startMap = MAPS[query.get('map')] ? query.get('map') : 'windows';
const params = {
  map: startMap,
  period: 'all',
  labels: true,
  columns: 650, // thousands of columns the tracer gets
  fit: false, // stretch floor and top to this period's 5th and 99.5th percentiles
  ...MAPS[startMap].settings, // low, high, gamma (>1 keeps the merely-okay low), height
  sunElevation: 13,
  sunAzimuth: 294, // degrees clockwise from north the light comes from
  sunRadius: 5.72, // degrees; the real sun is 0.27, bigger gives softer shadows
  sunIntensity: 4.5,
  skyIntensity: 0.85,
  bounces: 3,
  exposure: 0.95,
  maxSamples: 2048,
  denoise: true,
  pixelRatio: Math.min(devicePixelRatio, 2),
};
const current = () => MAPS[params.map];

// Where the labels point: mild highlands and coasts, and the hot, cold and
// muggy places that make the contrast. Names on the left sit out over the
// water.
const LEFT = new Set(['San Francisco', 'Lima', 'Lisbon', 'Cape Town']);
const PLACES = {
  'San Francisco': [37.77, -122.42],
  'Mexico City': [19.43, -99.13],
  Bogotá: [4.71, -74.07],
  Lima: [-12.05, -77.04],
  Lisbon: [38.72, -9.14],
  London: [51.51, -0.13],
  Nairobi: [-1.29, 36.82],
  'Cape Town': [-33.92, 18.42],
  Dubai: [25.2, 55.27],
  Kunming: [25.04, 102.71],
  Singapore: [1.35, 103.82],
  Tokyo: [35.68, 139.69],
  Sydney: [-33.87, 151.21],
};

// Equal Earth (Šavrič, Patterson and Jenny 2018), as in build/export.py,
// giving grid cells (x right, y down) for a place.
const [A1, A2, A3, A4] = [1.340264, -0.081106, 0.000893, 0.003796];
function toGrid(lat, lon) {
  const t = Math.asin((Math.sqrt(3) / 2) * Math.sin((lat * Math.PI) / 180));
  const x =
    (2 * Math.sqrt(3) * ((lon * Math.PI) / 180) * Math.cos(t)) /
    (3 * (9 * A4 * t ** 8 + 7 * A3 * t ** 6 + 3 * A2 * t ** 2 + A1));
  const y = A4 * t ** 9 + A3 * t ** 7 + A2 * t ** 3 + A1 * t;
  return [
    (x + projection.xMax) / projection.cell,
    (projection.yMax - y) / projection.cell,
  ];
}

// --- scene -----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({antialias: false});
renderer.setPixelRatio(params.pixelRatio);
document.body.append(renderer.domElement);
const tracer = createPathTracer(renderer);

const overlay = document.createElement('canvas');
overlay.className = 'overlay';
document.body.append(overlay);
const ctx = overlay.getContext('2d');

const camera = new THREE.PerspectiveCamera(20, 1, 1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
// No damping: its glide after a drag keeps nudging the camera, and every
// nudge restarts the render.
controls.maxPolarAngle = Math.PI * 0.47;
controls.zoomToCursor = true;
controls.addEventListener('change', () => moving());
controls.addEventListener('start', () => setMoved(true));
controls.addEventListener('end', () => refine());

// While the camera moves, trace a quick preview (a fraction of the pixels,
// one bounce) so dragging and zooming keep up; full quality resumes once it
// has been still for a moment, drawn a band of rows at a time so the GPU is
// never more than a few milliseconds from the next frame.
tracer.budgetMs = 20;
tracer.previewScale = 0.3;
tracer.denoise = params.denoise;
let lastMove = -Infinity;
function moving() {
  lastMove = performance.now();
  tracer.reset();
}

// WASD or the arrow keys slide the view across the map, faster when it's
// farther away.
const held = new Set();
const PAN_KEYS = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};
let lastFrame = performance.now();
function pan(dt) {
  if (!held.size) return;
  let [right, ahead] = [0, 0];
  for (const key of held) {
    right += PAN_KEYS[key][0];
    ahead += PAN_KEYS[key][1];
  }
  const forward = controls.target.clone().sub(camera.position).setY(0);
  if (forward.lengthSq() < 1e-9) forward.set(0, 0, -1);
  forward.normalize();
  const side = new THREE.Vector3(-forward.z, 0, forward.x);
  const speed = camera.position.distanceTo(controls.target) * 0.2 * dt;
  const step = forward
    .multiplyScalar(ahead * speed)
    .addScaledVector(side, right * speed);
  // Keep the point the camera looks at over the map.
  const to = controls.target.clone().add(step);
  to.x = THREE.MathUtils.clamp(to.x, -WORLD / 2, WORLD / 2);
  to.z = THREE.MathUtils.clamp(to.z, (-ny * CELL) / 2, (ny * CELL) / 2);
  step.subVectors(to, controls.target);
  controls.target.add(step);
  camera.position.add(step);
  controls.update();
  moving();
}

// A low, three-quarter view from the south, framed to the window.
function home() {
  const aspect = innerWidth / innerHeight;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitWidth = (WORLD * 0.51) / (Math.tan(half) * aspect);
  const fitHeight = (ny * CELL * 0.57) / Math.tan(half);
  const distance = Math.max(fitWidth, fitHeight);
  const tilt = THREE.MathUtils.degToRad(42); // from straight down
  const target = new THREE.Vector3(0, 0, -2.5);
  const position = new THREE.Vector3(
    target.x,
    Math.cos(tilt) * distance,
    target.z + Math.sin(tilt) * distance,
  );
  return {target, position};
}

// Camera moves: instant, or a short eased glide that the render loop runs.
let flight = null;
function moveTo({target, position}, seconds = 0) {
  flight = {
    from: {target: controls.target.clone(), position: camera.position.clone()},
    to: {target, position},
    start: performance.now(),
    ms: seconds * 1000,
  };
  fly();
}
function fly() {
  if (!flight) return;
  const k = flight.ms
    ? Math.min((performance.now() - flight.start) / flight.ms, 1)
    : 1;
  const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2; // ease in-out
  controls.target.lerpVectors(flight.from.target, flight.to.target, e);
  camera.position.lerpVectors(flight.from.position, flight.to.position, e);
  controls.update();
  moving();
  if (k === 1) {
    flight = null;
    refine();
  }
}
function resetView(seconds = 0) {
  moveTo(home(), seconds);
  setMoved(false);
}

// Day: sun and sky over a pale table. Night (the night lights map): a faint
// moon under a deep blue sky, dark ground, and columns that glow by their
// own color, lighting what's around them. ink and halo are the page's text
// and the ground as rendered, which text is outlined in.
const DAY = {
  sun: '#fff0da',
  sunScale: 1,
  skyScale: 1,
  zenith: '#6d9be0',
  horizon: '#dce7f3',
  ground: '#f3ebdf',
  base: '#f0e3cd',
  glow: 0,
  exposure: 1,
  ink: '#2b2723',
  halo: '#edebe9',
};
const NIGHT = {
  sun: '#b9c9ff',
  // The land is an ordinary pale surface: it's dark because little light
  // reaches it, so the cities' glow lights it up as it would. The sea
  // (the ground between) is dark water that mirrors a little.
  sunScale: 0.05,
  skyScale: 0.4,
  // A high moon behind the map, so the sea in view mirrors it in a broad
  // glint, as oceans do in photos from orbit.
  elevation: 40,
  azimuth: 0,
  zenith: '#0a1230',
  horizon: '#1d2a52',
  ground: '#262d42', // the sea: dark, slightly glossy water
  waterF0: 0.04,
  waterRough: 0.18,
  base: '#000000', // sides glow from the top down
  glow: 10,
  glowAlbedo: '#a4aac4',
  exposure: 1.2,
  ink: '#e9e4d8',
  halo: '#020313',
};
const look = () => (current().night ? NIGHT : DAY);

const color = (hex) => new THREE.Color(hex); // hex is sRGB; this is linear
function setLighting() {
  tracer.forgetHistory();
  const L = look();
  document.body.classList.toggle('dark', L === NIGHT);
  const u = tracer.uniforms;
  const el = THREE.MathUtils.degToRad(L.elevation ?? params.sunElevation);
  const az = THREE.MathUtils.degToRad(L.azimuth ?? params.sunAzimuth);
  u.uSunDir.value.set(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  );
  u.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(params.sunRadius));
  const sun = color(L.sun).multiplyScalar(params.sunIntensity * L.sunScale);
  const sky = params.skyIntensity * L.skyScale;
  const zenith = color(L.zenith).multiplyScalar(sky);
  const horizon = color(L.horizon).multiplyScalar(sky);
  u.uSun.value.set(sun.r, sun.g, sun.b);
  u.uSkyZenith.value.set(zenith.r, zenith.g, zenith.b);
  u.uSkyHorizon.value.set(horizon.r, horizon.g, horizon.b);
  u.uGround.value = color(L.ground);
  u.uBase.value = color(L.base);
  u.uGlow.value = L.glow;
  u.uWaterF0.value = L.waterF0 ?? 0;
  u.uWaterRough.value = L.waterRough ?? 0;
  if (L.glowAlbedo) {
    const a = color(L.glowAlbedo);
    u.uGlowAlbedo.value.set(a.r, a.g, a.b);
  }
  u.uBounces.value = params.bounces;
  tracer.reset();
}

// The map's ramp, from the shortest column's color to the tallest's.
function ramp(t, out) {
  const colors = current().rampColors;
  const x = Math.min(Math.max(t, 0), 1) * (colors.length - 1);
  const i = Math.min(Math.floor(x), colors.length - 2);
  return out.copy(colors[i]).lerp(colors[i + 1], x - i);
}

// --- data ------------------------------------------------------------------

// The open-window maps keep their value in R (255 off land); the others are
// 16-bit, high byte in R and low in G (65535 off land). Either way a map
// decodes to one number per cell, NO_VALUE off land, on its own grid.
const decoded = new Map();
async function loadMap(map, period) {
  const file = map === 'windows' ? period : map;
  if (!decoded.has(file)) {
    const {width, height} = map === 'windows' ? meta : layers.layers[map];
    const blob = await fetch(`data/${file}.png`).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const c = new OffscreenCanvas(width, height).getContext('2d', {
      willReadFrequently: true,
    });
    c.drawImage(bitmap, 0, 0);
    const rgba = c.getImageData(0, 0, width, height).data;
    const values = new Uint16Array(width * height);
    const noData = meta.encoding.noData;
    for (let i = 0; i < values.length; i++) {
      const [r, g] = [rgba[i * 4], rgba[i * 4 + 1]];
      if (map === 'windows') values[i] = r === noData ? NO_VALUE : r;
      else values[i] = (r << 8) | g;
    }
    decoded.set(file, {values, width, height, cell: WORLD / width});
  }
  return decoded.get(file);
}

// Each block's average over a window of the map, or NaN where it's mostly sea.
function blocks({values, width}, gx0, gy0, w, h, size) {
  const out = new Float32Array(w * h).fill(NaN);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sum = 0;
      let n = 0;
      const [x0, y0] = [gx0 + bx * size, gy0 + by * size];
      for (let y = y0; y < y0 + size; y++) {
        for (let x = x0; x < x0 + size; x++) {
          const v = values[y * width + x];
          if (v !== NO_VALUE) [sum, n] = [sum + v, n + 1];
        }
      }
      if (n * 2 >= size * size) out[by * w + bx] = sum / n;
    }
  }
  return out;
}

const shapeOf = (v) =>
  Math.min(Math.max((v - params.low) / (params.high - params.low), 0), 1);
const heightOf = (t) => 0.03 + params.height * t ** params.gamma;

// The part of the map the camera sees, in scene units [x0, z0, x1, z1], with
// a margin for columns leaning in from outside it; the whole map whenever the
// view reaches the horizon.
const raycaster = new THREE.Raycaster();
function viewRegion() {
  const half = [WORLD / 2, (ny * CELL) / 2];
  const whole = [-half[0], -half[1], half[0], half[1]];
  const xs = [];
  const zs = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, 1],
  ]) {
    raycaster.setFromCamera(new THREE.Vector2(sx, sy), camera);
    const {origin: o, direction: d} = raycaster.ray;
    if (d.y > -0.05) return whole;
    const t = o.y / -d.y;
    xs.push(o.x + d.x * t);
    zs.push(o.z + d.z * t);
  }
  const span = Math.max(...xs) - Math.min(...xs);
  const margin = span * 0.15 + heightOf(1) * 2;
  return [
    Math.max(Math.min(...xs) - margin, whole[0]),
    Math.max(Math.min(...zs) - margin, whole[1]),
    Math.min(Math.max(...xs) + margin, whole[2]),
    Math.min(Math.max(...zs) + margin, whole[3]),
  ];
}

let labels = [];
let grid = null; // the columns as built, for clicks and for knowing what's covered
let building = 0;
// Builds the columns for the view. With force false (after a camera move)
// it keeps what's there if that already covers the view at the right detail.
async function build(force = true) {
  const ticket = ++building;
  const map = await loadMap(params.map, params.period);
  if (ticket !== building) return; // a newer build started meanwhile
  const {width: W, height: H, cell} = map;
  const [x0, z0, x1, z1] = viewRegion();
  const inView = ((x1 - x0) / cell) * ((z1 - z0) / cell);
  const block = Math.max(
    1,
    Math.ceil(Math.sqrt(inView / (params.columns * 1000))),
  );
  const size = block * cell;
  const left = -WORLD / 2;
  const top = (-H * cell) / 2;
  const gx0 = Math.max(0, Math.floor((x0 - left) / size) * block);
  const gy0 = Math.max(0, Math.floor((z0 - top) / size) * block);
  const w = Math.floor(
    (Math.min(W, Math.ceil((x1 - left) / cell)) - gx0) / block,
  );
  const h = Math.floor(
    (Math.min(H, Math.ceil((z1 - top) / cell)) - gy0) / block,
  );
  if (
    !force &&
    grid?.block === block &&
    grid.gx0 <= gx0 &&
    grid.gy0 <= gy0 &&
    grid.gx0 + grid.w * block >= gx0 + w * block &&
    grid.gy0 + grid.h * block >= gy0 + h * block
  )
    return;
  const values = blocks(map, gx0, gy0, w, h, block);
  if (params.fit) {
    const land = values.filter((v) => !isNaN(v)).sort((a, b) => a - b);
    params.low = Math.round(land[Math.floor(land.length * 0.05)]);
    params.high = Math.round(land[Math.floor(land.length * 0.995)]);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  // The window, north up, so row 0 is its far edge.
  const origin = new THREE.Vector3(left + gx0 * cell, 0, top + gy0 * cell);
  const data = new Float32Array(w * h * 4);
  const tint = new THREE.Color();
  for (let i = 0; i < w * h; i++) {
    if (isNaN(values[i])) continue;
    const t = shapeOf(values[i]);
    ramp(t ** (params.gamma * 0.6), tint);
    data.set([tint.r, tint.g, tint.b, heightOf(t) / size], i * 4);
  }
  // A new map or column shape shouldn't borrow the last picture's colors;
  // finer columns for a new view can.
  if (force) tracer.forgetHistory();
  tracer.setColumns(data, w, h, size, origin);
  grid = {w, h, size, origin, data, block, gx0, gy0};

  // Each label points at the middle of its place's column top and quotes the
  // cell's own value, not the block average. A coastal city whose own cell is
  // sea borrows the nearest land cell. Places outside the window get none.
  const scale = W / nx; // this map's cells per open-window cell
  labels = Object.entries(PLACES).flatMap(([name, [lat, lon]]) => {
    const [cx, cy] = toGrid(lat, lon).map((v) => Math.floor(v * scale));
    let [gx, gy] = [cx, cy];
    let best = Infinity;
    const reach = 3 * scale;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const v = map.values[(cy + dy) * W + cx + dx];
        if (v !== NO_VALUE && dx * dx + dy * dy < best) {
          best = dx * dx + dy * dy;
          [gx, gy] = [cx + dx, cy + dy];
        }
      }
    }
    const bx = Math.floor((gx - gx0) / block);
    const by = Math.floor((gy - gy0) / block);
    if (bx < 0 || by < 0 || bx >= w || by >= h) return [];
    const tip = new THREE.Vector3(
      origin.x + (bx + 0.5) * size,
      data[(by * w + bx) * 4 + 3] * size,
      origin.z + (by + 0.5) * size,
    );
    return [{name, value: map.values[gy * W + gx], tip}];
  });
}

// After the camera settles, rebuild if the view needs other columns.
let refineTimer = 0;
function refine() {
  clearTimeout(refineTimer);
  refineTimer = setTimeout(() => build(false), 150);
}

// Where a ray from the camera through a point on screen first meets a
// column (or the ground), marching down from the tallest column's height.
function pick(clientX, clientY) {
  const ndc = new THREE.Vector2(
    (clientX / innerWidth) * 2 - 1,
    -(clientY / innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  const {origin: o, direction: d} = raycaster.ray;
  if (d.y >= 0) return null;
  const top = heightOf(1);
  const t0 = Math.max(0, (o.y - top) / -d.y);
  const t1 = o.y / -d.y;
  const p = new THREE.Vector3();
  for (let t = t0; t <= t1; t += grid.size * 0.25) {
    p.copy(d).multiplyScalar(t).add(o);
    const bx = Math.floor((p.x - grid.origin.x) / grid.size);
    const by = Math.floor((p.z - grid.origin.z) / grid.size);
    if (bx < 0 || by < 0 || bx >= grid.w || by >= grid.h) continue;
    if (p.y <= grid.data[(by * grid.w + bx) * 4 + 3] * grid.size) return p;
  }
  return p.copy(d).multiplyScalar(t1).add(o); // the ground, out at sea
}

// Double-click: glide there and halve the distance to it, keeping the angle.
renderer.domElement.addEventListener('dblclick', (e) => {
  const hit = grid && pick(e.clientX, e.clientY);
  if (!hit) return;
  const offset = camera.position.clone().sub(controls.target);
  const distance = Math.max(offset.length() * 0.5, 3);
  const position = hit.clone().add(offset.setLength(distance));
  moveTo({target: hit, position}, 0.7);
  setMoved(true);
});

// --- overlay ---------------------------------------------------------------

// Splits text into lines no wider than maxWidth in the context's font.
function wrap(c, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

// Text with a soft outline in the ground's color, so it stays readable over
// columns when zoomed in.
function halo(c, u, text, x, y) {
  c.save();
  c.lineWidth = 5 * u;
  c.strokeStyle = look().halo;
  c.lineJoin = 'round';
  c.globalAlpha *= 0.85;
  c.strokeText(text, x, y);
  c.restore();
  c.fillText(text, x, y);
}

const projected = new THREE.Vector3();
function drawOverlay(c, w, h) {
  const map = current();
  const u = Math.min(w, h * 1.6) / 1000; // one unit of type scale
  c.clearRect(0, 0, w, h);
  c.fillStyle = look().ink;
  c.textBaseline = 'alphabetic';

  // Title block, top left. Once the camera has left the home view only the
  // title and legend stay, so the map has the screen.
  const pad = 36 * u;
  const full = !moved || c !== ctx;
  c.font = `200 ${36 * u}px ${FONT}`;
  halo(c, u, map.title, pad, pad + 30 * u);
  if (full) {
    c.font = `400 ${9.5 * u}px ${FONT}`;
    c.letterSpacing = `${2.4 * u}px`;
    halo(c, u, map.kicker(params.period), pad + 2 * u, pad + 50 * u);
    c.letterSpacing = '0px';
    c.font = `300 ${11.5 * u}px ${FONT}`;
    c.globalAlpha = 0.75;
    const lines = wrap(c, map.subtitle(params.period), 470 * u);
    lines.forEach((line, i) =>
      halo(c, u, line, pad + 2 * u, pad + (67 + 15 * i) * u),
    );
    c.globalAlpha = 1;
  }

  // Legend, bottom left: the ramp with the floor and top it stands for.
  const lx = pad + 3 * u;
  const ly = h - pad - 20 * u;
  const lw = 200 * u;
  const lh = 5 * u;
  const gradient = c.createLinearGradient(lx, 0, lx + lw, 0);
  map.ramp.forEach((col, i) =>
    gradient.addColorStop(i / (map.ramp.length - 1), col),
  );
  c.fillStyle = gradient;
  c.fillRect(lx, ly, lw, lh);
  c.fillStyle = look().ink;
  c.font = `300 ${11 * u}px ${FONT}`;
  halo(
    c,
    u,
    `${map.format(params.low)}${params.low > 0 ? ' or less' : ''}`,
    lx,
    ly + lh + 15 * u,
  );
  c.textAlign = 'right';
  halo(
    c,
    u,
    `${map.format(params.high)}${params.high < map.max ? ' or more' : ''}`,
    lx + lw,
    ly + lh + 15 * u,
  );
  c.textAlign = 'left';
  c.font = `400 ${10 * u}px ${FONT}`;
  c.letterSpacing = `${2 * u}px`;
  halo(c, u, map.legend, lx, ly - 9 * u);
  c.letterSpacing = '0px';

  // Source, bottom right, at the home view.
  if (full) {
    c.textAlign = 'right';
    c.globalAlpha = 0.6;
    c.font = `300 ${10 * u}px ${FONT}`;
    halo(c, u, map.source[0], w - pad, h - pad - 13 * u);
    halo(c, u, map.source[1], w - pad, h - pad);
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }

  if (!params.labels || map.labels === false) return;
  // City labels: a dot on the column's top and a fine leader to the name.
  for (const {name, value, tip} of labels) {
    projected.copy(tip).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.2) continue;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    // Leaders on the left run straight out over the water; the rest rise.
    const side = LEFT.has(name) ? -1 : 1;
    const top = side < 0 ? y : y - 30 * u;
    c.strokeStyle = look().ink;
    c.lineWidth = Math.max(0.75, 0.8 * u);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, top);
    c.lineTo(x + side * (side < 0 ? 30 : 8) * u, top);
    c.stroke();
    c.beginPath();
    c.arc(x, y, 2.2 * u, 0, Math.PI * 2);
    c.fill();
    const text = `${name}  ${value === NO_VALUE ? '–' : map.format(value)}`;
    c.font = `300 ${12 * u}px ${FONT}`;
    c.lineWidth = 4 * u;
    c.strokeStyle = look().halo;
    c.lineJoin = 'round';
    c.textAlign = side < 0 ? 'right' : 'left';
    const tx = x + side * (side < 0 ? 34 : 11) * u;
    c.strokeText(text, tx, top + 4 * u);
    c.fillText(text, tx, top + 4 * u);
    c.textAlign = 'left';
  }
}

// --- map buttons -----------------------------------------------------------

// The maps as a row of tabs, top right; number keys switch too. At the
// bottom, a line on how to move, which becomes a reset button (or Escape)
// once the camera has moved.
const nav = document.createElement('nav');
nav.className = 'maps';
const buttons = Object.entries(MAPS).map(([key, map], i) => {
  const b = document.createElement('button');
  b.textContent = map.button;
  b.title = `Key ${i + 1}`;
  b.onclick = () => (switchMap(key), b.blur());
  nav.append(b);
  return [key, b];
});
const help = document.createElement('div');
help.className = 'help';
const hint = document.createElement('span');
hint.textContent =
  'Drag to turn · scroll to zoom · WASD to move · double-click to fly in';
const resetButton = document.createElement('button');
resetButton.textContent = 'Reset view';
resetButton.onclick = () => (resetView(0.7), resetButton.blur());
help.append(hint, resetButton);
document.body.append(nav, help);

let moved = false;
function setMoved(on) {
  moved = on;
  resetButton.hidden = !on;
  hint.hidden = on;
}

function showActive() {
  for (const [key, b] of buttons)
    b.classList.toggle('active', key === params.map);
}

function switchMap(key) {
  if (key === params.map) return;
  const {low, high, gamma, height} = params;
  Object.assign(current().settings, {low, high, gamma, height});
  params.map = key;
  Object.assign(params, current().settings);
  const url = new URL(location.href);
  if (key === 'windows') url.searchParams.delete('map');
  else url.searchParams.set('map', key);
  history.replaceState(null, '', url);
  showActive();
  fitControllers();
  setLighting(); // day or night
  build();
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui') || e.metaKey || e.ctrlKey) return;
  const keys = Object.keys(MAPS);
  if (e.key >= '1' && e.key <= String(keys.length)) switchMap(keys[e.key - 1]);
  if (e.key === 'Escape') resetView(0.7);
  const key = e.key.toLowerCase();
  if (PAN_KEYS[key]) {
    e.preventDefault();
    held.add(key);
    setMoved(true);
  }
});
addEventListener('keyup', (e) => {
  if (held.delete(e.key.toLowerCase()) && !held.size) refine();
});
addEventListener('blur', () => held.clear());

// --- controls --------------------------------------------------------------

const gui = new GUI({title: 'Settings'});
const rebuild = () => build();
const manual = () => ((params.fit = false), rebuild());
const periodController = gui
  .add(params, 'period', meta.periods)
  .onChange(rebuild);
gui.add(params, 'labels');
gui.add(tracer, 'samples').listen().disable();
const shape = gui.addFolder('Columns').close();
shape
  .add(params, 'columns', 100, 3000, 50)
  .name('columns (thousands)')
  .onFinishChange(rebuild);
shape.add(params, 'fit').name('fit to data').onChange(rebuild);
const lowController = shape.add(params, 'low', 0, 1, 1).onFinishChange(manual);
const highController = shape
  .add(params, 'high', 0, 1, 1)
  .onFinishChange(manual);
shape.add(params, 'gamma', 0.2, 5, 0.1).listen().onFinishChange(rebuild);
shape.add(params, 'height', 0.25, 20, 0.25).listen().onFinishChange(rebuild);
// The floor and top sliders in the current map's units.
function fitControllers() {
  const {ranges, unit} = current();
  for (const [c, key, name] of [
    [lowController, 'low', 'floor'],
    [highController, 'high', 'top'],
  ]) {
    const [min, max, step] = ranges[key];
    c.min(min).max(max).step(step).name(`${name} (${unit})`).updateDisplay();
  }
  periodController.show(params.map === 'windows');
}
const light = gui.addFolder('Light').close();
light
  .add(params, 'sunElevation', 3, 60, 1)
  .name('sun elevation')
  .onChange(setLighting);
light
  .add(params, 'sunAzimuth', 0, 360, 1)
  .name('sun azimuth')
  .onChange(setLighting);
light
  .add(params, 'sunRadius', 0.27, 8, 0.01)
  .name('sun size (°)')
  .onChange(setLighting);
light.add(params, 'sunIntensity', 0, 10, 0.1).name('sun').onChange(setLighting);
light.add(params, 'skyIntensity', 0, 3, 0.05).name('sky').onChange(setLighting);
light.add(params, 'bounces', 0, 6, 1).onChange(setLighting);
light.add(params, 'exposure', 0.2, 3, 0.05);
const quality = gui.addFolder('Quality').close();
quality.add(params, 'maxSamples', 16, 16384, 1).name('max samples');
quality
  .add(params, 'denoise')
  .onChange((on) => ((tracer.denoise = on), tracer.reset()));
quality
  .add(params, 'pixelRatio', 0.25, 3, 0.25)
  .name('pixel ratio')
  .onChange(() => (renderer.setPixelRatio(params.pixelRatio), resize()));
gui.add({reset: () => resetView(0.7)}, 'reset').name('reset view');
gui.add({save}, 'save').name('save PNG');
gui.close();

// The image as it stands, at the render's own resolution, with the overlay.
function save() {
  tracer.show(params.exposure * look().exposure);
  const out = document.createElement('canvas');
  [out.width, out.height] = [overlay.width, overlay.height];
  const c = out.getContext('2d');
  c.drawImage(renderer.domElement, 0, 0);
  drawOverlay(c, out.width, out.height);
  const a = document.createElement('a');
  a.href = out.toDataURL('image/png');
  const name =
    params.map === 'windows' ? `windows-open-${params.period}` : params.map;
  a.download = `${name}.png`;
  a.click();
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  [overlay.width, overlay.height] = [size.x, size.y];
  tracer.resize(size.x, size.y);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => (resize(), resetView()));

await Promise.all(
  ['200', '300', '400'].map((weight) =>
    document.fonts.load(`${weight} 20px ${FONT}`),
  ),
);
showActive();
fitControllers();
resize();
resetView();
setLighting();
await build();
renderer.setAnimationLoop(() => {
  // Idle while another window has focus, so a background tab or window
  // doesn't keep the GPU busy.
  if (!NO_PAUSE && !document.hasFocus()) return;
  const now = performance.now();
  pan(Math.min((now - lastFrame) / 1000, 0.1));
  lastFrame = now;
  fly();
  controls.update();
  if (now - lastMove < 200) tracer.preview(camera);
  else if (tracer.samples < params.maxSamples) tracer.step(camera);
  tracer.show(params.exposure * look().exposure);
  drawOverlay(ctx, overlay.width, overlay.height);
});
