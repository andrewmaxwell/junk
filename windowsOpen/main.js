// The world as a field of columns. The main map makes each as tall as the
// share of the year's hours you could have left the windows open there
// (ERA5-Land, about 9 km, hourly, reduced by build/fetch.py and resampled onto
// an Equal Earth grid by build/export.py). The other maps, from
// build/layers.py, use the same grid for elevation and population.
// The picture is path traced with the Comfort spike map's tracer and sharpens
// as samples add up. Titles, labels and the legend are drawn on a 2D canvas
// over it, so "save PNG" can stack the two into one image.
//
// Rendering pauses while the window isn't focused, since it keeps the GPU
// busy; ?noPause turns that off. ?map=elevation or ?map=population opens
// another map.
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

const INK = '#2b2723';
const HALO = '#edebe9'; // the lit ground as rendered
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
    max: 100,
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
      return `Height of the ground above sea level, averaged over about 10 km and ${scale}`;
    },
    legend: 'HEIGHT · ELEVATION',
    unit: 'm',
    format: (m) =>
      `${(Math.round((m * 3.28084) / 10) * 10).toLocaleString('en-US')} ft`,
    max: layers.layers.elevation.max,
    source: [
      'Elevation: ERA5-Land orography (ECMWF), 0.1°, the terrain its weather is computed over.',
      'In Equal Earth projection.',
    ],
    ramp: ['#8fb07a', '#d6cf9a', '#c09062', '#8c6b58', '#f7f4ef'],
    ranges: {low: [0, 3000, 50], high: [500, 6500, 50]},
    settings: {low: 0, high: 5000, gamma: 1, height: 1.2},
  },
  population: {
    button: 'Population',
    title: 'Where people live',
    kicker: () => 'PEOPLE PER SQUARE MILE IN 2025',
    subtitle: () =>
      'Everyone on Earth, from a 1 km grid averaged over about 10 km',
    legend: 'HEIGHT · PEOPLE PER SQUARE MILE',
    unit: 'people/km²',
    format: (perKm) => compact.format(perKm * 2.58999), // per square mile
    max: layers.layers.population.max,
    source: [
      'Population: GHS-POP R2023A (EU Joint Research Centre), 2025 estimate, 30″ grid.',
      'In Equal Earth projection.',
    ],
    ramp: ['#e9e2ec', '#c3b0d8', '#8f73c2', '#5a3a9c', '#2a1260'],
    ranges: {low: [0, 1000, 10], high: [100, 60000, 100]},
    settings: {low: 0, high: 8000, gamma: 0.7, height: 3},
  },
};
for (const map of Object.values(MAPS)) {
  map.rampColors = map.ramp.map((hex) => new THREE.Color(hex));
}

const startMap = MAPS[query.get('map')] ? query.get('map') : 'windows';
const params = {
  map: startMap,
  period: 'all',
  labels: true,
  block: 3, // grid cells per column, each way
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
controls.addEventListener('change', () => tracer.reset());
controls.addEventListener('start', () => setMoved(true));

// A low, three-quarter view from the south, framed to the window.
function home() {
  const aspect = innerWidth / innerHeight;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitWidth = (WORLD * 0.53) / (Math.tan(half) * aspect);
  const fitHeight = (ny * CELL * 0.62) / Math.tan(half);
  const distance = Math.max(fitWidth, fitHeight);
  const tilt = THREE.MathUtils.degToRad(42); // from straight down
  const target = new THREE.Vector3(0, 0, -4);
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
  tracer.reset();
  if (k === 1) flight = null;
}
function resetView(seconds = 0) {
  moveTo(home(), seconds);
  setMoved(false);
}

const color = (hex) => new THREE.Color(hex); // hex is sRGB; this is linear
function setLighting() {
  const u = tracer.uniforms;
  const el = THREE.MathUtils.degToRad(params.sunElevation);
  const az = THREE.MathUtils.degToRad(params.sunAzimuth);
  u.uSunDir.value.set(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    -Math.cos(az) * Math.cos(el),
  );
  u.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(params.sunRadius));
  const sun = color('#fff0da').multiplyScalar(params.sunIntensity);
  const zenith = color('#6d9be0').multiplyScalar(params.skyIntensity);
  const horizon = color('#dce7f3').multiplyScalar(params.skyIntensity);
  u.uSun.value.set(sun.r, sun.g, sun.b);
  u.uSkyZenith.value.set(zenith.r, zenith.g, zenith.b);
  u.uSkyHorizon.value.set(horizon.r, horizon.g, horizon.b);
  u.uGround.value = color('#f3ebdf');
  u.uBase.value = color('#f0e3cd');
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
// decodes to one number per cell, NO_VALUE off land.
const decoded = new Map();
async function loadValues(map, period) {
  const file = map === 'windows' ? period : map;
  if (!decoded.has(file)) {
    const blob = await fetch(`data/${file}.png`).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const c = new OffscreenCanvas(nx, ny).getContext('2d', {
      willReadFrequently: true,
    });
    c.drawImage(bitmap, 0, 0);
    const rgba = c.getImageData(0, 0, nx, ny).data;
    const values = new Uint16Array(nx * ny);
    const noData = meta.encoding.noData;
    for (let i = 0; i < values.length; i++) {
      const [r, g] = [rgba[i * 4], rgba[i * 4 + 1]];
      if (map === 'windows') values[i] = r === noData ? NO_VALUE : r;
      else values[i] = (r << 8) | g;
    }
    decoded.set(file, values);
  }
  return decoded.get(file);
}

// Each block's average, or NaN where it's mostly sea.
function blocks(values, size) {
  const [w, h] = [Math.floor(nx / size), Math.floor(ny / size)];
  const out = new Float32Array(w * h).fill(NaN);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sum = 0;
      let n = 0;
      for (let y = by * size; y < (by + 1) * size; y++) {
        for (let x = bx * size; x < (bx + 1) * size; x++) {
          const v = values[y * nx + x];
          if (v !== NO_VALUE) [sum, n] = [sum + v, n + 1];
        }
      }
      if (n * 2 >= size * size) out[by * w + bx] = sum / n;
    }
  }
  return {w, h, values: out};
}

const shapeOf = (v) =>
  Math.min(Math.max((v - params.low) / (params.high - params.low), 0), 1);
const heightOf = (t) => 0.03 + params.height * t ** params.gamma;

let labels = [];
let grid = null; // the columns as built, for finding what a click hits
let building = 0;
async function build() {
  const ticket = ++building;
  const cells = await loadValues(params.map, params.period);
  if (ticket !== building) return; // a newer build started meanwhile
  const {w, h, values} = blocks(cells, params.block);
  if (params.fit) {
    const land = values.filter((v) => !isNaN(v)).sort((a, b) => a - b);
    params.low = Math.round(land[Math.floor(land.length * 0.05)]);
    params.high = Math.round(land[Math.floor(land.length * 0.995)]);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }

  // The grid, north up, so row 0 is the far edge of the map.
  const size = params.block * CELL;
  const origin = new THREE.Vector3((-w * size) / 2, 0, (-h * size) / 2);
  const data = new Float32Array(w * h * 4);
  const tint = new THREE.Color();
  for (let i = 0; i < w * h; i++) {
    if (isNaN(values[i])) continue;
    const t = shapeOf(values[i]);
    ramp(t ** (params.gamma * 0.6), tint);
    data.set([tint.r, tint.g, tint.b, heightOf(t) / size], i * 4);
  }
  tracer.setColumns(data, w, h, size, origin);
  grid = {w, h, size, origin, data};

  // Each label points at the middle of its place's column top and quotes the
  // cell's own value, not the block average. A coastal city whose own cell is
  // sea borrows the nearest land cell.
  labels = Object.entries(PLACES).map(([name, [lat, lon]]) => {
    const [cx, cy] = toGrid(lat, lon).map(Math.floor);
    let [gx, gy] = [cx, cy];
    let best = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const v = cells[(cy + dy) * nx + cx + dx];
        if (v !== NO_VALUE && dx * dx + dy * dy < best) {
          best = dx * dx + dy * dy;
          [gx, gy] = [cx + dx, cy + dy];
        }
      }
    }
    const [bx, by] = [
      Math.floor(gx / params.block),
      Math.floor(gy / params.block),
    ];
    const top = data[(by * w + bx) * 4 + 3] * size;
    const tip = new THREE.Vector3(
      origin.x + (bx + 0.5) * size,
      top,
      origin.z + (by + 0.5) * size,
    );
    return {name, value: cells[gy * nx + gx], tip};
  });
}

// Where a ray from the camera through a point on screen first meets a
// column (or the ground), marching down from the tallest column's height.
const raycaster = new THREE.Raycaster();
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

const projected = new THREE.Vector3();
function drawOverlay(c, w, h) {
  const map = current();
  const u = Math.min(w, h * 1.6) / 1000; // one unit of type scale
  c.clearRect(0, 0, w, h);
  c.fillStyle = INK;
  c.textBaseline = 'alphabetic';

  // Title block, top left.
  const pad = 44 * u;
  c.font = `200 ${50 * u}px ${FONT}`;
  c.fillText(map.title, pad, pad + 40 * u);
  c.font = `400 ${10.5 * u}px ${FONT}`;
  c.letterSpacing = `${2.6 * u}px`;
  c.fillText(map.kicker(params.period), pad + 3 * u, pad + 64 * u);
  c.letterSpacing = '0px';
  c.font = `300 ${12.5 * u}px ${FONT}`;
  c.globalAlpha = 0.75;
  const lines = wrap(c, map.subtitle(params.period), 560 * u);
  lines.forEach((line, i) =>
    c.fillText(line, pad + 3 * u, pad + (83 + 17 * i) * u),
  );
  c.globalAlpha = 1;
  if (c === ctx) {
    // The map buttons sit under the subtitle, in CSS pixels.
    const css = innerWidth / w;
    nav.style.left = `${(pad + 3 * u) * css}px`;
    nav.style.top = `${(pad + (83 + 17 * (lines.length - 1) + 16) * u) * css}px`;
    nav.style.fontSize = `${Math.max(11, 12 * u * css)}px`;
  }

  // Legend, bottom left: the ramp with the floor and top it stands for.
  const lx = pad + 3 * u;
  const ly = h - pad - 30 * u;
  const lw = 200 * u;
  const lh = 5 * u;
  const gradient = c.createLinearGradient(lx, 0, lx + lw, 0);
  map.ramp.forEach((col, i) =>
    gradient.addColorStop(i / (map.ramp.length - 1), col),
  );
  c.fillStyle = gradient;
  c.fillRect(lx, ly, lw, lh);
  c.fillStyle = INK;
  c.font = `300 ${11 * u}px ${FONT}`;
  c.fillText(
    `${map.format(params.low)}${params.low > 0 ? ' or less' : ''}`,
    lx,
    ly + lh + 15 * u,
  );
  c.textAlign = 'right';
  c.fillText(
    `${map.format(params.high)}${params.high < map.max ? ' or more' : ''}`,
    lx + lw,
    ly + lh + 15 * u,
  );
  c.textAlign = 'left';
  c.font = `400 ${10 * u}px ${FONT}`;
  c.letterSpacing = `${2 * u}px`;
  c.fillText(map.legend, lx, ly - 9 * u);
  c.letterSpacing = '0px';

  // Source, bottom right.
  c.textAlign = 'right';
  c.globalAlpha = 0.6;
  c.font = `300 ${10.5 * u}px ${FONT}`;
  c.fillText(map.source[0], w - pad, h - pad - 14 * u);
  c.fillText(map.source[1], w - pad, h - pad);
  c.globalAlpha = 1;
  c.textAlign = 'left';

  if (!params.labels) return;
  // City labels: a dot on the column's top and a fine leader to the name.
  for (const {name, value, tip} of labels) {
    projected.copy(tip).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.2) continue;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    // Leaders on the left run straight out over the water; the rest rise.
    const side = LEFT.has(name) ? -1 : 1;
    const top = side < 0 ? y : y - 30 * u;
    c.strokeStyle = INK;
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
    c.strokeStyle = HALO;
    c.lineJoin = 'round';
    c.textAlign = side < 0 ? 'right' : 'left';
    const tx = x + side * (side < 0 ? 34 : 11) * u;
    c.strokeText(text, tx, top + 4 * u);
    c.fillText(text, tx, top + 4 * u);
    c.textAlign = 'left';
  }
}

// --- map buttons -----------------------------------------------------------

// One button per map under the subtitle, then a reset button that shows once
// the camera has moved (and a hint until it has). Keys 1-3 switch maps too,
// and Escape resets the view.
const nav = document.createElement('nav');
nav.className = 'maps';
const buttons = Object.entries(MAPS).map(([key, map]) => {
  const b = document.createElement('button');
  b.textContent = map.button;
  b.onclick = () => (switchMap(key), b.blur());
  nav.append(b);
  return [key, b];
});
const resetButton = document.createElement('button');
resetButton.className = 'reset';
resetButton.textContent = 'Reset view';
resetButton.onclick = () => resetView(0.7);
const hint = document.createElement('span');
hint.className = 'hint';
hint.textContent = 'Double-click to zoom in';
nav.append(resetButton, hint);
document.body.append(nav);

function setMoved(moved) {
  resetButton.hidden = !moved;
  hint.hidden = moved;
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
  build();
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui')) return;
  const keys = Object.keys(MAPS);
  if (e.key >= '1' && e.key <= String(keys.length)) switchMap(keys[e.key - 1]);
  if (e.key === 'Escape') resetView(0.7);
});

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
shape.add(params, 'block', 1, 12, 1).name('cells per column').onChange(rebuild);
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
  .add(params, 'pixelRatio', 0.25, 3, 0.25)
  .name('pixel ratio')
  .onChange(() => (renderer.setPixelRatio(params.pixelRatio), resize()));
gui.add({reset: () => resetView(0.7)}, 'reset').name('reset view');
gui.add({save}, 'save').name('save PNG');
gui.close();

// The image as it stands, at the render's own resolution, with the overlay.
function save() {
  tracer.show(params.exposure);
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
  fly();
  controls.update();
  if (tracer.samples < params.maxSamples) tracer.step(camera);
  tracer.show(params.exposure);
  drawOverlay(ctx, overlay.width, overlay.height);
});
