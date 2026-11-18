// The world as a field of columns, path traced: night lights (the default,
// glowing under a moon), the share of the year's hours you could have left
// the windows open (ERA5-Land, about 9 km, hourly, reduced by build/fetch.py
// and resampled onto an Equal Earth grid by build/export.py), and elevation,
// population, travel time, rain and household size (build/layers.py, on the
// same projection, most of them twice as fine). The tracer is the Comfort
// spike map's, and the picture sharpens as samples add up. The caption, labels and legend are
// drawn on a 2D canvas over it; "save PNG" saves the map alone.
//
// Columns are sized to look a few pixels wide where they stand: a finer grid
// near the camera inside a coarser one for the rest of the view. How many
// pixels follows how fast this device draws (see the level of detail below).
//
// Rendering pauses while the window isn't focused, since it keeps the GPU
// busy; ?noPause turns that off. ?map=<name> opens another map.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {createPathTracer} from './pathtracer.js';

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
// ?glide: a slow loop over Europe at night with nothing else on screen, for
// the homepage's hover clip (see recordPreviews.js).
const GLIDE = query.has('glide');
const NO_PAUSE = query.has('noPause') || GLIDE;

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
// words around it. settings are the column shape, kept per map. ranges are
// the floor slider's [min, max, step] and the top's [min, step]; the top's max
// (and default) is the map's highest value.
const hours = (minutes) =>
  minutes < 60
    ? `${Math.round(minutes)} min`
    : minutes < 48 * 60
      ? `${round2.format(minutes / 60)} h`
      : `${round2.format(minutes / 1440)} days`;
const MAPS = {
  lights: {
    button: 'Night lights',
    kicker: () => 'THE EARTH FROM SPACE AFTER DARK, 2023',
    subtitle: () =>
      'How much light each place sent up on cloud-free nights through the year, measured by satellite; height on a log scale',
    legend: 'HEIGHT · LIGHT AT NIGHT, nW/cm²·sr, LOG SCALE',
    unit: 'nW/cm²·sr ×10',
    format: (v) => round2.format(v / 10),
    readout: ' nW/cm²·sr', // after the value, on hover
    source: [
      'Night lights: Black Marble VNP46A4 (NASA), VIIRS day-night band, 2023, 500 m.',
      'In Equal Earth projection.',
    ],
    ramp: ['#14172a', '#3a2c3e', '#9a6026', '#f2b445', '#fff5d6'],
    log: true, // a city centre can be 1,000 times a village
    // Zoomed out, a column is its cells' root mean square: a plain average
    // shrinks a city to a stub among its dark neighbours, and the brightest
    // cell makes every block with a lit village tall.
    power: 2,
    night: true,
    ranges: {low: [0, 100, 1], high: [100, 10]},
    settings: {low: 3, gamma: 1.5, height: 1.8},
  },
  windows: {
    button: 'Open windows',
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
    readout: ' of hours open', // after the value, on hover
    source: [
      'Weather: ERA5-Land reanalysis, 0.1°, hourly. Dust and smoke: CAMS PM10 and PM2.5 over AQI 100.',
      'All 24 hours of the day, in Equal Earth projection.',
    ],
    ramp: ['#f3e2c4', '#f0b56a', '#e8763a', '#cf3f22', '#9a1b14'],
    ranges: {low: [0, 90, 1], high: [10, 1]},
    settings: {low: 0, gamma: 1.6, height: 2},
  },
  elevation: {
    button: 'Elevation',
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
    readout: '', // after the value, on hover
    source: [
      'Elevation: ETOPO 2022 (NOAA), 60″ grid, highest point per 5 km cell.',
      'In Equal Earth projection.',
    ],
    ramp: ['#8fb07a', '#d6cf9a', '#c09062', '#8c6b58', '#f7f4ef'],
    ranges: {low: [0, 3000, 50], high: [500, 50]},
    settings: {low: 0, gamma: 1, height: 2},
  },
  population: {
    button: 'Population',
    kicker: () => 'PEOPLE PER SQUARE MILE IN 2025',
    subtitle: () => 'Everyone on Earth, counted on a 1 km grid',
    legend: 'HEIGHT · PEOPLE PER SQUARE MILE',
    unit: 'people per ½ km²', // halved to fit 16 bits; the densest is 108,000/km²
    format: (v) => compact.format(v * 2 * 2.58999), // per square mile
    readout: ' people per sq mi', // after the value, on hover
    source: [
      'Population: GHS-POP R2023A (EU Joint Research Centre), 2025 estimate, 30″ grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e9e2ec', '#c3b0d8', '#8f73c2', '#5a3a9c', '#2a1260'],
    ranges: {low: [0, 500, 5], high: [50, 50]},
    power: 2, // zoomed out, root mean square, as for night lights
    settings: {low: 0, gamma: 0.65, height: 2.5},
  },
  travel: {
    button: 'Travel time',
    kicker: () => 'TRAVEL TIME TO THE NEAREST CITY, 2015',
    subtitle: () =>
      'The fastest way by road, rail, river or on foot to a city of at least 50,000 people',
    legend: 'HEIGHT · TIME TO THE NEAREST CITY',
    unit: 'min',
    format: hours,
    readout: ' to a city of 50,000', // after the value, on hover
    source: [
      'Travel time: Nelson 2019 on the Weiss et al. 2018 friction surface, 30″ grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e6efe9', '#9cc7b4', '#4f9a8a', '#22646b', '#123a4a'],
    labels: false, // every city is 0 minutes from itself
    ranges: {low: [0, 600, 5], high: [60, 30]},
    settings: {low: 0, gamma: 0.45, height: 3},
  },
  rain: {
    button: 'Rain',
    kicker: () =>
      `RAIN AND SNOW, ${formatDate(meta.start)} – ${formatDate(meta.end)}`.toUpperCase(),
    subtitle: () =>
      "Everything that fell in the open-window map's year, snow counted as its water",
    legend: 'HEIGHT · INCHES OF RAIN AND SNOW',
    unit: 'mm',
    format: (mm) => `${round2.format(mm / 25.4)} in`,
    readout: ' of rain and snow', // after the value, on hover
    // No place averages more than about 12 m a year (Mawsynram, India).
    // ERA5-Land passes that only on steep slopes it gets wrong, up to 25 m in
    // the Andes near Manizales (about 2 m in fact), so the top stops there
    // and those columns say so.
    top: 12000,
    doubt: ' · the model overshoots here',
    source: [
      'Rain: ERA5-Land monthly means (ECMWF), 0.1°, Nov 2025 to Oct 2026. It reads',
      'too wet on some steep tropical slopes and too dry at the very wettest spots.',
    ],
    ramp: ['#e8eef4', '#a9c6e0', '#5b93c7', '#2a5f9e', '#0f2f63'],
    ranges: {low: [0, 1000, 10], high: [500, 50]},
    settings: {low: 0, gamma: 0.65, height: 3},
  },
  household: {
    button: 'Household size',
    kicker: () => 'HOW MANY PEOPLE SHARE A HOME',
    subtitle: () =>
      "People in the average household within 15 km, from each country's finest recent census or survey",
    legend: 'HEIGHT · PEOPLE PER HOUSEHOLD',
    // The colors have their own fixed range (`colors`), so the legend's bar
    // is theirs; this line gives the heights'.
    colorLegend: 'COLOR · PEOPLE PER HOUSEHOLD',
    heightNote: () =>
      `Height: ${(params.low / 100).toFixed(0)} to ${(params.high / 100).toFixed(0)} people`,
    unit: 'people ×100',
    format: (v) => (v / 100).toFixed(1),
    readout: ' people per household', // after the value, on hover
    // Land with no value: no one lives there (under 1 person per km²), or
    // no census or survey covers it.
    empty: {0: 'No one lives here', 1: 'No data'},
    source: [
      'Households: CORESIDENCE (Galeano et al. 2024) and UN DESA 2026; US ACS 2020–2024, Canada 2021,',
      'Mexico 2020, China 2020 and India 2011 censuses. Where 1+ person per km² lives (GHS-POP). Hover for each source.',
    ],
    // Small households cool, big ones warm, with the neutral middle at about
    // 2.8, so a city's small homes stand apart from its suburbs' families.
    // On a log scale from 1 (living alone) to 8 (the tallest are 12.9, in
    // the Gambia): going from 2 to 3 people is as big a step as from 4 to 6.
    // On the old straight scale to 12.9, most of the US (2.1 to 3.1) was one
    // shade and nearly one height. Color follows the value straight (no lean
    // toward the top), and the relief is low, since color tells it better.
    ramp: ['#24577a', '#7fb3c2', '#f1e9d6', '#e48a4e', '#7a1f33'],
    colorCurve: 1,
    centered: true, // fitted, the middle color is the view's median
    weighted: true, // averaged by households (see blocks)
    log: true,
    // Colors run 1.5 to 6 on the same log scale, a narrower range than the
    // heights', so the US's 2.1 to 3.1 spans a quarter of the ramp instead of
    // a sixth, with the neutral middle at 3. Fixed, so a place keeps its
    // color as you zoom (fitting them to the view made them shift).
    colors: {low: 150, high: 600},
    ticks: [200, 300, 400],
    ranges: {low: [0, 500, 10], high: [300, 10]},
    settings: {low: 100, high: 800, gamma: 1, height: 0.8},
  },
};
// Each map's top is its highest value, so no column is cut off flat (unless
// the map sets a lower `top`, past which its data isn't to be believed); the
// top slider can't go past the highest value.
for (const [key, map] of Object.entries(MAPS)) {
  map.max = key === 'windows' ? 100 : layers.layers[key].max;
  map.settings.high ??= map.top ?? map.max;
  const [min, step] = map.ranges.high;
  map.ranges.high = [min, map.max, step];
}
for (const map of Object.values(MAPS)) {
  map.rampColors = map.ramp.map((hex) => new THREE.Color(hex));
}

const DEFAULT_MAP = 'lights';
const startMap = MAPS[query.get('map')] ? query.get('map') : DEFAULT_MAP;
const params = {
  map: startMap,
  period: 'all',
  labels: true,
  fit: false, // floor and top at the view's 5th and 99.5th percentiles
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
const LEFT = new Set([
  'San Francisco',
  'Lima',
  'Lisbon',
  'Cape Town',
  'Los Angeles',
  'São Paulo',
  'Lagos',
]);
// In order of priority: where labels would overlap, the later one is left
// out, so zooming in shows more of them.
const PLACES = {
  'St. Louis': [38.63, -90.2],
  London: [51.51, -0.13],
  Tokyo: [35.68, 139.69],
  'New York': [40.71, -74.01],
  'San Francisco': [37.77, -122.42],
  'Mexico City': [19.43, -99.13],
  'São Paulo': [-23.55, -46.63],
  Lagos: [6.52, 3.38],
  Cairo: [30.04, 31.24],
  Moscow: [55.76, 37.62],
  Delhi: [28.61, 77.21],
  Beijing: [39.9, 116.4],
  Sydney: [-33.87, 151.21],
  'Cape Town': [-33.92, 18.42],
  Nairobi: [-1.29, 36.82],
  Dubai: [25.2, 55.27],
  Singapore: [1.35, 103.82],
  Lima: [-12.05, -77.04],
  Bogotá: [4.71, -74.07],
  Lisbon: [38.72, -9.14],
  Kunming: [25.04, 102.71],
  Chicago: [41.88, -87.63],
  'Los Angeles': [34.05, -118.24],
  Paris: [48.86, 2.35],
  Mumbai: [19.08, 72.88],
  Shanghai: [31.23, 121.47],
  Jakarta: [-6.21, 106.85],
  'Buenos Aires': [-34.6, -58.38],
  Reykjavík: [64.15, -21.94],
  Anchorage: [61.22, -149.9],
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

// preserveDrawingBuffer keeps the picture readable after it's drawn, for
// "save PNG"; without it the browser may have cleared it by then.
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  preserveDrawingBuffer: true,
});
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
// Only a real drag, pinch or scroll leaves the home view: a tap or click
// that doesn't move the camera keeps the caption.
let dragging = false;
controls.addEventListener('change', () => {
  moving();
  if (dragging) setMoved(true);
});
controls.addEventListener('start', () => (dragging = true));
controls.addEventListener('end', () => ((dragging = false), refine()));

// While the camera moves, trace a quick preview (a fraction of the pixels,
// one bounce) so dragging and zooming keep up; full quality resumes once it
// has been still for a moment, drawn a band of rows at a time so the GPU is
// never more than a few milliseconds from the next frame.
tracer.budgetMs = 20;
tracer.previewScale = 0.3;
tracer.previewClamp = 1.5; // no fireflies from the glow while moving
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

// A low, three-quarter view from the south, framed to the window. On a tall,
// narrow screen (a phone) it looks from the west instead, so the map's long
// side runs up the screen (the Americas near, Asia far, north to the left)
// and the world fills the screen rather than a strip across its middle.
function home() {
  const aspect = innerWidth / innerHeight;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  if (isTall()) return homeTall(aspect);
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
const isTall = () => innerHeight > innerWidth * 1.15;
// The phone view, pulled back just far enough that the map's corners land
// inside the screen, leaving room for the caption above and legend below.
function homeTall(aspect) {
  const tilt = THREE.MathUtils.degToRad(40); // from straight down
  const target = new THREE.Vector3(2, 0, 0);
  const offset = new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0);
  const hx = WORLD / 2;
  const hz = (ny * CELL) / 2;
  const corners = [];
  for (const x of [-hx, hx])
    for (const z of [-hz, hz]) corners.push(new THREE.Vector3(x, 0, z));
  const probe = camera.clone();
  probe.aspect = aspect;
  probe.updateProjectionMatrix();
  const fits = (distance) => {
    probe.position.copy(target).addScaledVector(offset, distance);
    probe.lookAt(target);
    probe.updateMatrixWorld();
    return corners.every((p) => {
      const q = p.clone().project(probe);
      return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 0.8;
    });
  };
  let [near, far] = [10, 2000];
  for (let i = 0; i < 30; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return {target, position: target.clone().addScaledVector(offset, far)};
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
  bloom: 0.05, // a soft halo around the brightest light
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
  tracer.bloom = L.bloom ?? 0;
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
// Each file is decoded once; the cache holds the promise, so two builds
// asking at once share one download.
const decoded = new Map();
async function loadMap(map, period) {
  const file = map === 'windows' ? period : map;
  if (!decoded.has(file)) decoded.set(file, decode(map, file));
  const entry = await decoded.get(file);
  // A map averaged by households (`weighted`) needs how many people each
  // cell holds: the population map, on the same grid.
  if (MAPS[map]?.weighted && !entry.weights)
    entry.weights = (await loadMap('population')).values;
  return entry;
}
async function decode(map, file) {
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
  // A map with `sources` keeps, in blue, which one each cell's figure
  // comes from (the household map: which census or survey, and its year).
  const labels = map === 'windows' ? null : layers.layers[map].sources;
  let source = null;
  if (labels) {
    source = new Uint8Array(width * height);
    for (let i = 0; i < source.length; i++) source[i] = rgba[i * 4 + 2];
  }
  return {values, width, height, cell: WORLD / width, source, labels};
}

// Each block's power mean over a window of the map (the plain average for
// power 1; larger powers lean toward the block's brightest cell), or NaN
// where it's mostly sea.
// Values under `blank` are land without a number (see the household map's
// `empty`): they count as land but not toward the mean, and a block of land
// that's mostly without is -1, so the empty Sahara stays empty zoomed out.
//
// A map with `weights` (people per cell) is a ratio, people per household,
// so a block is its cells' people over their households, not the mean of
// their values: a city cell then counts for its hundred times the homes of
// a farm cell. `mass` is how much each block counts for when ranking them:
// its households, or for other maps its cells.
function blocks(
  {values, width, weights},
  gx0,
  gy0,
  w,
  h,
  size,
  power = 1,
  blank = 0,
) {
  const out = new Float32Array(w * h).fill(NaN);
  const mass = new Float32Array(w * h);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sum = 0;
      let homes = 0;
      let n = 0;
      let land = 0;
      const [x0, y0] = [gx0 + bx * size, gy0 + by * size];
      for (let y = y0; y < y0 + size; y++) {
        for (let x = x0; x < x0 + size; x++) {
          const i = y * width + x;
          const v = values[i];
          if (v === NO_VALUE) continue;
          land++;
          if (v < blank) continue;
          n++;
          if (weights) {
            const people = Math.max(weights[i], 1); // valued cells are lived in
            sum += people;
            homes += people / v;
          } else sum += power === 1 ? v : v ** power;
        }
      }
      if (land * 2 < size * size) continue;
      const k = by * w + bx;
      if (n * 2 <= land) out[k] = -1;
      else {
        out[k] = weights ? sum / homes : (sum / n) ** (1 / power);
        mass[k] = weights ? homes : n;
      }
    }
  }
  return {values: out, mass};
}
const blankBelow = (map) =>
  map.empty ? Math.max(...Object.keys(map.empty).map(Number)) + 1 : 0;
// What a cell's value says: the map's own words for land without a number,
// or null for a real value.
const emptyText = (v) => current().empty?.[v] ?? null;

// A value's place between the floor and the top, 0-1, on a log scale for
// maps that ask for one.
function shapeOf(v, {low, high} = params) {
  const f = current().log ? Math.log1p : (x) => x;
  const t = (f(v) - f(low)) / (f(high) - f(low));
  return Math.min(Math.max(t, 0), 1);
}
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

// --- level of detail -------------------------------------------------------

// Columns aim to look `pixels` device pixels across where they stand (but
// never finer than the data), so those near the camera are finer than those
// far off. A view gets two grids: a detail grid out to the distance halfway
// (in ratio) between the nearest and farthest ground in view, and a main grid
// for everything, each sized for the near end of its range. `pixels` is set
// by hand (column size in Settings › Quality); the grids only get coarser
// than it asks when a grid would need more than MAX_CELLS.
const lod = {pixels: 1};
const MAX_CELLS = 6e6; // per grid, for the textures' memory

// What the camera sees, for planning: the ground reached by rays through a
// grid of points on the screen, clamped to the map (with the map's far
// corners when the view reaches its edge or the horizon), with distances.
function viewNow() {
  camera.updateMatrixWorld();
  const half = [WORLD / 2, (ny * CELL) / 2];
  const points = [];
  let horizon = false;
  const N = 12;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      raycaster.setFromCamera(
        new THREE.Vector2((i / N) * 2 - 1, (j / N) * 2 - 1),
        camera,
      );
      const {origin: o, direction: d} = raycaster.ray;
      if (d.y > -1e-4) {
        horizon = true;
        continue;
      }
      const t = o.y / -d.y;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (Math.abs(x) > half[0] || Math.abs(z) > half[1]) horizon = true;
      points.push(
        new THREE.Vector3(
          THREE.MathUtils.clamp(x, -half[0], half[0]),
          0,
          THREE.MathUtils.clamp(z, -half[1], half[1]),
        ),
      );
    }
  }
  if (horizon) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        points.push(new THREE.Vector3(sx * half[0], 0, sz * half[1]));
  }
  const dist = points.map((p) => p.distanceTo(camera.position));
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  return {
    points,
    dist,
    region: viewRegion(),
    pixelAngle:
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / size.y,
  };
}

// The grids a view wants for columns `pixels` wide, in the map's cells: the
// main grid's block size and window, and the detail grid's (or none).
function plan(map, view, pixels) {
  const {width: W, height: H, cell} = map;
  const left = -WORLD / 2;
  const top = (-H * cell) / 2;
  const {points, dist} = view;
  const near = Math.max(Math.min(...dist), 1e-3);
  const far = Math.max(...dist, near);
  const split = Math.sqrt(near * far);
  const blockAt = (d) => (pixels * d * view.pixelAngle) / cell;

  // The main grid: everything in view.
  const [x0, z0, x1, z1] = view.region;
  const fine = Math.max(1, Math.round(blockAt(near)));
  let block = fine * Math.max(1, Math.round(blockAt(split) / fine));
  const span = (lo, hi, size, n) => [
    Math.max(0, Math.floor(lo / size)),
    Math.min(Math.floor(n / (size / cell)), Math.ceil(hi / size)),
  ];
  let gx, gy;
  for (;;) {
    const size = block * cell;
    gx = span(x0 - left, x1 - left, size, W);
    gy = span(z0 - top, z1 - top, size, H);
    if ((gx[1] - gx[0]) * (gy[1] - gy[0]) <= MAX_CELLS) break;
    block += fine;
  }
  const main = {block, x: gx[0], y: gy[0], w: gx[1] - gx[0], h: gy[1] - gy[0]};

  // The detail grid: the ground nearer than the split, with a margin for
  // columns leaning in, in whole main-grid cells.
  let detail = null;
  const close = points.filter((p, i) => dist[i] <= split);
  if (block > fine && close.length) {
    const xs = close.map((p) => p.x);
    const zs = close.map((p) => p.z);
    const margin = (Math.max(...xs) - Math.min(...xs)) * 0.15 + heightOf(1) * 2;
    const size = block * cell;
    const [dx0, dx1] = span(
      Math.min(...xs) - margin - left,
      Math.max(...xs) + margin - left,
      size,
      W,
    );
    const [dy0, dy1] = span(
      Math.min(...zs) - margin - top,
      Math.max(...zs) + margin - top,
      size,
      H,
    );
    const x = Math.max(dx0, main.x);
    const y = Math.max(dy0, main.y);
    const w = Math.min(dx1, main.x + main.w) - x;
    const h = Math.min(dy1, main.y + main.h) - y;
    // The finest block that divides the main one and fits.
    for (let b = fine; b < block && w > 0 && h > 0; b++) {
      if (block % b) continue;
      const scale = block / b;
      if (w * h * scale * scale > MAX_CELLS) continue;
      detail = {block: b, scale, x, y, w, h};
      break;
    }
  }
  return {main, detail};
}

// Whether grids built for plan `have` serve plan `want` as well or better:
// they cover its windows in columns at least as fine.
function serves(have, want) {
  const covers = (a, b) =>
    a.x * a.block <= b.x * b.block &&
    a.y * a.block <= b.y * b.block &&
    (a.x + a.w) * a.block >= (b.x + b.w) * b.block &&
    (a.y + a.h) * a.block >= (b.y + b.h) * b.block;
  if (have.main.block > want.main.block || !covers(have.main, want.main))
    return false;
  if (!want.detail) return true;
  const fineHave = have.detail ?? have.main;
  return (
    fineHave.block <= want.detail.block &&
    (covers(fineHave, want.detail) ||
      (have.main.block <= want.detail.block && covers(have.main, want.detail)))
  );
}

let labels = [];
let fitMid = null; // the view's median, when a centered map is fitted
let colorRange = null; // then its colors' floor and top
// The blocks in view sorted by value, with the running total of how much
// they count for (households, on the household map), for the fit and for
// placing a value among them.
let inView = {values: [], below: [], total: 0};
function ranked({values, mass}) {
  const order = [...values.keys()]
    .filter((i) => values[i] >= 0 && mass[i] > 0)
    .sort((a, b) => values[a] - values[b]);
  const below = new Float64Array(order.length);
  let total = 0;
  order.forEach((i, j) => {
    below[j] = total;
    total += mass[i];
  });
  return {values: order.map((i) => values[i]), below, total};
}
// The value with share q of the mass below it.
function quantile({values, below, total}, q) {
  let [lo, hi] = [0, values.length - 1];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (below[mid] <= q * total) lo = mid;
    else hi = mid - 1;
  }
  return values[lo];
}
// The share of the mass in view below a value.
function shareBelow({values, below, total}, v) {
  let [lo, hi] = [0, values.length];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return total ? (lo < values.length ? below[lo] : total) / total : 0;
}
let grid = null; // the columns as built, for clicks and for knowing what's covered
let building = 0;

// Each column's color and height (in its own cells) for a window of the map,
// as the tracer takes them.
function columnValues(map, {block, x, y, w, h}) {
  return blocks(
    map,
    x * block,
    y * block,
    w,
    h,
    block,
    current().power,
    blankBelow(current()),
  );
}
function columnData(map, win, {values} = columnValues(map, win)) {
  const {block, w, h} = win;
  const size = block * map.cell;
  const data = new Float32Array(w * h * 4);
  const tint = new THREE.Color();
  for (let i = 0; i < w * h; i++) {
    if (isNaN(values[i])) continue;
    if (values[i] < 0) {
      // Land without a number: the lowest stub, in plain grey.
      data.set([BLANK.r, BLANK.g, BLANK.b, heightOf(0) / size], i * 4);
      continue;
    }
    const t = shapeOf(values[i]);
    const c = colorRange ? shapeOf(values[i], colorRange) : t;
    ramp(c ** (current().colorCurve ?? params.gamma * 0.6), tint);
    data.set([tint.r, tint.g, tint.b, heightOf(t) / size], i * 4);
  }
  return {data, values};
}

const BLANK = new THREE.Color('#d9d4cc');

// Builds the columns for the view. `why` is 'scene' (a new map, column shape
// or column size: always rebuild) or 'view' (the camera settled: keep the
// columns there if they cover the view at least as finely).
async function build(why = 'scene') {
  const ticket = ++building;
  const map = await loadMap(params.map, params.period);
  if (ticket !== building) return; // a newer build started meanwhile
  const view = viewNow();
  const want = plan(map, view, lod.pixels);
  // Fitted to the view, the floor and top follow every move.
  if (
    why === 'view' &&
    !params.fit &&
    grid?.source === map &&
    serves(grid, want)
  )
    return;
  const {width: W, height: H, cell} = map;
  const {main, detail} = want;
  const size = main.block * cell;
  const left = -WORLD / 2;
  const top = (-H * cell) / 2;
  const columns = columnValues(map, main);
  // Fitted, the floor and top are the view's 5th and 99.5th percentiles,
  // set before the columns are shaped from them. A map with a two-sided
  // ramp (`centered`) instead puts the view's median in the middle, as far
  // (on its scale) from the floor as from the top, so its neutral color
  // means typical for what's in view.
  // Only the colors follow the view on a centered map: its heights stay on
  // the map's own scale, so they don't jump as the view changes.
  fitMid = null;
  colorRange = current().colors ?? null;
  inView = ranked(columns);
  if (params.fit) {
    const land = inView.values;
    const at = (q) => quantile(inView, q);
    if (land.length && current().centered) {
      const mid = at(0.5);
      const reach = Math.max(mid / Math.max(at(0.05), 1), at(0.95) / mid);
      const low = Math.round(mid / reach);
      colorRange = {low, high: Math.max(Math.round(mid * reach), low + 1)};
      fitMid = mid;
    } else if (land.length) {
      params.low = Math.round(at(0.05));
      params.high = Math.max(Math.round(at(0.995)), params.low + 1);
    }
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
  const {data} = columnData(map, main, columns);
  let fine = null;
  if (detail) {
    // The main grid's cells under the detail grid stand empty.
    for (let y = detail.y; y < detail.y + detail.h; y++)
      for (let x = detail.x; x < detail.x + detail.w; x++)
        data[((y - main.y) * main.w + x - main.x) * 4 + 3] = 0;
    const {data: fineData} = columnData(map, {
      block: detail.block,
      x: detail.x * detail.scale,
      y: detail.y * detail.scale,
      w: detail.w * detail.scale,
      h: detail.h * detail.scale,
    });
    fine = {
      data: fineData,
      width: detail.w * detail.scale,
      height: detail.h * detail.scale,
      x: detail.x - main.x,
      y: detail.y - main.y,
      scale: detail.scale,
      size: detail.block * cell,
    };
  }

  // The window, north up, so row 0 is its far edge.
  const origin = new THREE.Vector3(
    left + main.x * size,
    0,
    top + main.y * size,
  );
  // A new map or column shape shouldn't borrow the last picture's colors;
  // finer columns for a new view can.
  if (why === 'scene') tracer.forgetHistory();
  tracer.setColumns(data, main.w, main.h, size, origin, fine);
  grid = {
    main,
    detail,
    view,
    size,
    origin,
    data,
    fine,
    source: map,
  };

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
    const [x, z] = [left + (gx + 0.5) * cell, top + (gy + 0.5) * cell];
    const column = columnAt(x, z);
    if (!column) return [];
    const tip = new THREE.Vector3(column.x, column.height, column.z);
    return [{name, value: map.values[gy * W + gx], tip}];
  });
}

// The column standing at a point of the ground (x, z), from whichever grid
// has it: the middle of its top, or null outside the grids.
function columnAt(x, z) {
  const {origin, size, main, data, fine} = grid;
  let bx = Math.floor((x - origin.x) / size);
  let by = Math.floor((z - origin.z) / size);
  if (bx < 0 || by < 0 || bx >= main.w || by >= main.h) return null;
  if (
    fine &&
    bx >= fine.x &&
    by >= fine.y &&
    bx < fine.x + fine.width / fine.scale &&
    by < fine.y + fine.height / fine.scale
  ) {
    const fx = Math.floor((x - origin.x - fine.x * size) / fine.size);
    const fy = Math.floor((z - origin.z - fine.y * size) / fine.size);
    return {
      x: origin.x + fine.x * size + (fx + 0.5) * fine.size,
      z: origin.z + fine.y * size + (fy + 0.5) * fine.size,
      height: fine.data[(fy * fine.width + fx) * 4 + 3] * fine.size,
      size: fine.size,
    };
  }
  return {
    x: origin.x + (bx + 0.5) * size,
    z: origin.z + (by + 0.5) * size,
    height: data[(by * main.w + bx) * 4 + 3] * size,
    size,
  };
}

// After the camera settles, rebuild if the view needs other columns, and
// keep the view in the URL so a link reopens it.
let refineTimer = 0;
function refine() {
  clearTimeout(refineTimer);
  refineTimer = setTimeout(() => {
    build('view');
    saveView();
  }, 150);
}
const round = (v) => +v.toFixed(3);
function saveView() {
  const url = new URL(location.href);
  if (moved) {
    const {target: t} = controls;
    const p = camera.position;
    url.searchParams.set(
      'view',
      [t.x, t.y, t.z, p.x, p.y, p.z].map(round).join(','),
    );
  } else url.searchParams.delete('view');
  history.replaceState(null, '', url);
}
// The view a link asked for (target, then camera position), or null.
function linkedView() {
  const v = (query.get('view') || '').split(',').map(Number);
  if (v.length !== 6 || v.some((n) => !Number.isFinite(n))) return null;
  return {
    target: new THREE.Vector3(v[0], v[1], v[2]),
    position: new THREE.Vector3(v[3], v[4], v[5]),
  };
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
  const step = (grid.fine?.size ?? grid.size) * 0.25;
  for (let t = t0; t <= t1; t += step) {
    p.copy(d).multiplyScalar(t).add(o);
    const column = columnAt(p.x, p.z);
    if (column && p.y <= column.height) return p;
  }
  return p.copy(d).multiplyScalar(t1).add(o); // the ground, out at sea
}

// --- hover readout ---------------------------------------------------------

// Equal Earth backwards: latitude and longitude, in degrees, of a point in
// the open-window grid's cells (Newton's method for the latitude).
function toLatLon(gx, gy) {
  const x = gx * projection.cell - projection.xMax;
  const y = projection.yMax - gy * projection.cell;
  let t = y / A1;
  for (let i = 0; i < 8; i++) {
    const f = A1 * t + A2 * t ** 3 + A3 * t ** 7 + A4 * t ** 9 - y;
    t -= f / (A1 + 3 * A2 * t ** 2 + 7 * A3 * t ** 6 + 9 * A4 * t ** 8);
  }
  const lat = Math.asin(Math.sin(t) / (Math.sqrt(3) / 2));
  const lon =
    (3 * x * (9 * A4 * t ** 8 + 7 * A3 * t ** 6 + 3 * A2 * t ** 2 + A1)) /
    (2 * Math.sqrt(3) * Math.cos(t));
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

// Cities of 100,000 or more (GeoNames, via build/cities.py), loaded on the
// first hover: [name, country, lat, lon].
let cities = null;
function nearestCity(lat, lon, withinKm = 150) {
  if (!cities) return null;
  const rad = Math.PI / 180;
  let best = null;
  let bestKm = withinKm;
  for (const city of cities) {
    const dLat = (city[2] - lat) * rad;
    const dLon = (city[3] - lon) * rad;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * rad) * Math.cos(city[2] * rad) * Math.sin(dLon / 2) ** 2;
    const km = 12742 * Math.asin(Math.sqrt(a));
    if (km < bestKm) [best, bestKm] = [city, km];
  }
  return best;
}
const degrees = (v, pos, neg) =>
  `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;

// A small label by the mouse: the nearest city (or the coordinates) and the
// value of the cell under it. Hidden over the sea and while dragging.
const readout = document.createElement('div');
readout.className = 'readout';
readout.hidden = true;
document.body.append(readout);
let hover = null;
let hoverFrame = 0;
function showReadout() {
  hoverFrame = 0;
  if (!hover || !grid) return (readout.hidden = true);
  const hit = pick(hover.x, hover.y);
  const src = grid.source;
  const cx = hit && Math.floor((hit.x + WORLD / 2) / src.cell);
  const cy =
    hit && Math.floor((hit.z + (src.height * src.cell) / 2) / src.cell);
  const inside = hit && cx >= 0 && cy >= 0 && cx < src.width && cy < src.height;
  const value = inside ? src.values[cy * src.width + cx] : NO_VALUE;
  if (value === NO_VALUE) return (readout.hidden = true);
  const [lat, lon] = toLatLon(
    (hit.x + WORLD / 2) / CELL,
    (hit.z + (ny * CELL) / 2) / CELL,
  );
  const city = nearestCity(lat, lon);
  const place = city
    ? `${city[0]}, ${city[1]}`
    : `${degrees(lat, 'N', 'S')} ${degrees(lon, 'E', 'W')}`;
  const map = current();
  readout.replaceChildren(place, document.createElement('br'));
  const b = document.createElement('b');
  b.textContent = emptyText(value) ?? map.format(value) + map.readout;
  if (map.top && value > map.top) b.textContent += map.doubt;
  readout.append(b);
  // Where it stands among the households in view.
  if (map.weighted && !emptyText(value) && inView.total) {
    const below = shareBelow(inView, value);
    const rank = document.createElement('small');
    rank.textContent =
      below >= 0.5
        ? `bigger than ${Math.round(below * 100)}% of the homes in view`
        : `smaller than ${Math.round((1 - below) * 100)}% of the homes in view`;
    readout.append(document.createElement('br'), rank);
  }
  const from = src.source?.[cy * src.width + cx];
  if (from) {
    const note = document.createElement('small');
    note.textContent = src.labels[from];
    readout.append(document.createElement('br'), note);
  }
  // Beside the pointer, kept on screen: to the left of it near the right
  // edge, above it near the bottom (a finger covers what's below).
  readout.hidden = false;
  const {offsetWidth: rw, offsetHeight: rh} = readout;
  const gap = hover.touch ? 24 : 14;
  const x =
    hover.x + gap + rw > innerWidth - 8 ? hover.x - gap - rw : hover.x + gap;
  const y =
    hover.touch || hover.y + gap + rh > innerHeight - 8
      ? hover.y - gap - rh
      : hover.y + gap;
  readout.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
function loadCities() {
  if (cities) return;
  cities = [];
  fetch('data/cities.json')
    .then((r) => r.json())
    .then((list) => ((cities = list), hover && showReadout()));
}
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) {
    if (e.pointerType === 'mouse') readout.hidden = true;
    return;
  }
  loadCities();
  hover = {x: e.clientX, y: e.clientY};
  hoverFrame ||= requestAnimationFrame(showReadout);
});
// On a touch screen a tap shows the readout, until the next touch. A touch
// that turns into a drag or pinch, or lasts long, isn't a tap.
let touchStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  touchStart = e.isPrimary
    ? {x: e.clientX, y: e.clientY, t: performance.now()}
    : null;
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const tap =
    touchStart &&
    e.isPrimary &&
    Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) < 10 &&
    performance.now() - touchStart.t < 400;
  touchStart = null;
  if (!tap) return;
  loadCities();
  hover = {x: e.clientX, y: e.clientY, touch: true};
  showReadout();
});
// A finger leaves the canvas as it lifts, so only the mouse leaving hides it.
for (const type of ['pointerleave', 'pointerdown', 'wheel']) {
  renderer.domElement.addEventListener(type, (e) => {
    if (type === 'pointerleave' && e.pointerType !== 'mouse') return;
    hover = null;
    readout.hidden = true;
  });
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

// Narrower or shorter than this (in CSS pixels, as in index.html's media
// query), the page is laid out for a phone: the caption goes under the tabs
// with the sources, and the legend sits above the buttons at the bottom.
const isPhone = () => innerWidth <= 600 || innerHeight <= 500;
const TOUCH_HINT =
  'Drag to turn · two fingers to zoom and slide · tap a column for its value';
const projected = new THREE.Vector3();
const legendTint = new THREE.Color();
function drawOverlay(c, w, h) {
  const map = current();
  const dpr = w / innerWidth;
  const narrow = isPhone();
  // One unit of type scale, in device pixels: it grows with the window but
  // never drops below a CSS pixel, so text stays readable on a phone.
  const u =
    dpr * Math.max(Math.min(innerWidth, innerHeight * 1.6) / 1000, 0.95);
  c.clearRect(0, 0, w, h);
  if (GLIDE) return;
  c.fillStyle = look().ink;
  c.textBaseline = 'alphabetic';

  // Caption, top left: what the map shows, in small type, since the tabs
  // name it. It hides once the camera leaves the home view, so the map has
  // the screen.
  const pad = narrow ? 14 * dpr : 36 * u;
  const top = narrow ? nav.getBoundingClientRect().bottom * dpr + 6 * u : pad;
  const full = !moved;
  let captionBottom = 0;
  if (full) {
    c.font = `400 ${9.5 * u}px ${FONT}`;
    c.letterSpacing = `${2.4 * u}px`;
    const width = narrow ? w - 2 * pad - 4 * u : 470 * u;
    let y = top + 12 * u;
    for (const line of wrap(c, map.kicker(params.period), width)) {
      halo(c, u, line, pad + 2 * u, y);
      y += 14 * u;
    }
    c.letterSpacing = '0px';
    c.font = `300 ${11.5 * u}px ${FONT}`;
    c.globalAlpha = 0.75;
    y += 3 * u;
    for (const line of wrap(c, map.subtitle(params.period), width)) {
      halo(c, u, line, pad + 2 * u, y);
      y += 15 * u;
    }
    if (narrow) {
      c.font = `300 ${10 * u}px ${FONT}`;
      c.globalAlpha = 0.6;
      y += 3 * u;
      for (const line of wrap(c, map.source.join(' '), width)) {
        halo(c, u, line, pad + 2 * u, y);
        y += 13 * u;
      }
      c.font = `400 ${10 * u}px ${FONT}`;
      c.globalAlpha = 0.85;
      y += 4 * u;
      halo(c, u, TOUCH_HINT, pad + 2 * u, y);
    }
    captionBottom = y;
    c.globalAlpha = 1;
  }

  // Legend, bottom left: the ramp with the floor and top it stands for. On a
  // phone it sits above the reset and settings buttons.
  let bottom = h - pad;
  if (narrow) {
    const guiTop = gui._closed
      ? gui.domElement.getBoundingClientRect().top
      : innerHeight - 50;
    bottom = Math.min(guiTop, help.getBoundingClientRect().top) * dpr - 8 * u;
  }
  const lx = pad + 3 * u;
  const ly = bottom - 20 * u;
  const lw = 200 * u;
  const lh = 5 * u;
  // The bar runs from floor to top as the columns' heights do, colored as
  // the columns are (their color leans toward the top of the ramp).
  const range = colorRange ?? params;
  const gradient = c.createLinearGradient(lx, 0, lx + lw, 0);
  for (let i = 0; i <= 32; i++) {
    ramp((i / 32) ** (map.colorCurve ?? params.gamma * 0.6), legendTint);
    gradient.addColorStop(i / 32, `#${legendTint.getHexString()}`);
  }
  c.fillStyle = gradient;
  c.fillRect(lx, ly, lw, lh);
  c.fillStyle = look().ink;
  c.font = `300 ${11 * u}px ${FONT}`;
  // In-between values, for maps that name some, under a small tick each;
  // the ends then say "≤" and "+" to leave them room.
  const ticks = fitMid === null ? (map.ticks ?? []) : [fitMid];
  c.textAlign = 'center';
  for (const v of ticks) {
    const t = shapeOf(v, range);
    if (t <= 0.15 || t >= 0.85) continue;
    c.fillRect(lx + t * lw - 0.5 * u, ly + lh, u, 3 * u);
    halo(c, u, map.format(v), lx + t * lw, ly + lh + 15 * u);
  }
  const [less, more] = ticks.length ? ['≤ ', '+'] : ['', ' or more'];
  c.textAlign = 'left';
  halo(
    c,
    u,
    range.low > 0
      ? ticks.length
        ? less + map.format(range.low)
        : `${map.format(range.low)} or less`
      : map.format(range.low),
    lx,
    ly + lh + 15 * u,
  );
  c.textAlign = 'right';
  halo(
    c,
    u,
    `${map.format(range.high)}${range.high < map.max ? more : ''}`,
    lx + lw,
    ly + lh + 15 * u,
  );
  c.textAlign = 'left';
  c.font = `400 ${10 * u}px ${FONT}`;
  c.letterSpacing = `${2 * u}px`;
  halo(c, u, colorRange ? map.colorLegend : map.legend, lx, ly - 9 * u);
  if (colorRange) {
    // The heights, which keep the map's own scale.
    c.letterSpacing = '0px';
    c.font = `300 ${10 * u}px ${FONT}`;
    c.globalAlpha = 0.75;
    halo(c, u, map.heightNote(), lx, ly - 25 * u);
    c.globalAlpha = 1;
  }
  c.letterSpacing = '0px';

  // Source, bottom right, at the home view.
  if (full && !narrow) {
    c.textAlign = 'right';
    c.globalAlpha = 0.6;
    c.font = `300 ${10 * u}px ${FONT}`;
    halo(c, u, map.source[0], w - pad, h - pad - 13 * u);
    halo(c, u, map.source[1], w - pad, h - pad);
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }

  if (!params.labels || map.labels === false) return;
  // City labels: a dot on the column's top and a fine leader to the name,
  // skipping any whose name would overlap one already drawn.
  const taken = [];
  c.font = `300 ${12 * u}px ${FONT}`;
  for (const {name, value, tip} of labels) {
    projected.copy(tip).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.2) continue;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    // Leaders on the left run straight out over the water (when north is
    // up); the rest rise. A label that would run off the screen tries the
    // other side, and is left out if it doesn't fit there either.
    const text = `${name}  ${value === NO_VALUE || emptyText(value) ? '–' : map.format(value)}`;
    const tw = c.measureText(text).width;
    const layout = (side) => {
      const top = side < 0 ? y : y - 30 * u;
      const tx = x + side * (side < 0 ? 34 : 11) * u;
      const box = [
        Math.min(x, side < 0 ? tx - tw : tx) - 4 * u,
        top - 10 * u,
        Math.max(x, side < 0 ? tx : tx + tw) + 4 * u,
        Math.max(y, top + 8 * u) + 3 * u,
      ];
      return {side, top, tx, box};
    };
    const preferred = LEFT.has(name) && !isTall() ? -1 : 1;
    const onScreen = ({box}) =>
      box[0] >= 0 &&
      box[2] <= w &&
      box[1] >= captionBottom &&
      box[3] <= ly - 20 * u;
    const fit = [layout(preferred), layout(-preferred)].find(onScreen);
    if (!fit) continue;
    const {side, top, tx, box} = fit;
    const hits = (b) =>
      box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3];
    if (taken.some(hits)) continue;
    taken.push(box);
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
    c.lineWidth = 4 * u;
    c.strokeStyle = look().halo;
    c.lineJoin = 'round';
    c.textAlign = side < 0 ? 'right' : 'left';
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
  const {low, high, gamma, height, fit} = params;
  Object.assign(current().settings, {low, high, gamma, height, fit});
  params.map = key;
  Object.assign(params, {fit: false}, current().settings);
  fitMid = colorRange = null; // the last map's, until this one is built
  const url = new URL(location.href);
  if (key === DEFAULT_MAP) url.searchParams.delete('map');
  else url.searchParams.set('map', key);
  history.replaceState(null, '', url);
  hover = null; // the readout would quote the last map
  readout.hidden = true;
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
shape.add(params, 'fit').name('fit to view').listen().onChange(rebuild);
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
  .add(lod, 'pixels', 1, 16, 0.5)
  .name('column size (px)')
  .onFinishChange(() => build());
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

// The map as it stands, at the render's own resolution, without the
// labels and text.
function save() {
  tracer.show(params.exposure * look().exposure);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
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
addEventListener('resize', () => (resize(), moved ? refine() : resetView()));

await Promise.all(
  ['200', '300', '400'].map((weight) =>
    document.fonts.load(`${weight} 20px ${FONT}`),
  ),
);
showActive();
fitControllers();
resize();
resetView();
const linked = linkedView();
if (linked) {
  moveTo(linked);
  setMoved(true);
}
// The glide circles a point over Europe once every 4 seconds (the clip's
// length, so it loops), from a third of the home view's distance. Each frame
// is a few samples at the clip's own resolution, which the denoiser and its
// history keep clean.
let glide = null;
if (GLIDE) {
  document.body.classList.add('glide');
  tracer.previewScale = 0.8; // the clip is scaled to 80% anyway
  tracer.previewBounces = 1;
  resize();
  const [gx, gy] = toGrid(48, 12);
  const center = new THREE.Vector3(
    gx * CELL - WORLD / 2,
    0,
    gy * CELL - (ny * CELL) / 2,
  );
  const {target, position} = home();
  const offset = position.sub(target).multiplyScalar(0.3);
  glide = {center, offset, radius: 1.2, samples: 3};
  moveTo({target: center, position: center.clone().add(offset)});
}
function glideStep(now) {
  const a = (now / 4000) * 2 * Math.PI;
  const t = glide.center
    .clone()
    .add(
      new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(
        glide.radius,
      ),
    );
  controls.target.copy(t);
  camera.position.copy(t).add(glide.offset);
  controls.update();
  moving();
}

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
  if (glide) glideStep(now);
  controls.update();
  if (glide) for (let i = 0; i < glide.samples; i++) tracer.preview(camera);
  else if (now - lastMove < 200) tracer.preview(camera);
  else if (tracer.samples < params.maxSamples) tracer.step(camera);
  tracer.show(params.exposure * look().exposure);
  drawOverlay(ctx, overlay.width, overlay.height);
});
