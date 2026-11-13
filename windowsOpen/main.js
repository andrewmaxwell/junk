// The world as a field of columns, each as tall as the share of the year's
// hours you could have left the windows open there. The data is ERA5-Land
// (about 9 km, hourly) reduced by build/fetch.py and resampled onto an Equal
// Earth grid by build/export.py: red is the percent of open hours, 255 is sea.
// The picture is path traced with the Comfort spike map's tracer and sharpens
// as samples add up. Titles, labels and the legend are drawn on a 2D canvas
// over it, so "save PNG" can stack the two into one image.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {createPathTracer} from '../comfort/map/spikes/pathtracer.js';

const meta = await fetch('data/meta.json').then((r) => r.json());
const {width: nx, height: ny, projection} = meta;
const NO_DATA = meta.encoding.noData;
const WORLD = 100; // map width in scene units
const CELL = WORLD / nx;

const INK = '#2b2723';
const HALO = '#edebe9'; // the lit ground as rendered
const FONT = 'Jost';

const params = {
  period: 'all',
  labels: true,
  block: 3, // grid cells per column, each way
  fit: false, // stretch floor and top to this period's 5th and 99.5th percentiles
  low: 0, // percent of hours open that gets the shortest column
  high: 100, // percent that gets the tallest
  gamma: 1.6, // >1 keeps the merely-okay places low
  height: 4,
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

const MONTHS =
  'January February March April May June July August September October November December'.split(
    ' ',
  );

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

// A low, three-quarter view from the south, framed to the window.
function frame() {
  const aspect = innerWidth / innerHeight;
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const fitWidth = (WORLD * 0.53) / (Math.tan(half) * aspect);
  const fitHeight = (ny * CELL * 0.62) / Math.tan(half);
  const distance = Math.max(fitWidth, fitHeight);
  const tilt = THREE.MathUtils.degToRad(42); // from straight down
  controls.target.set(0, 0, -4);
  camera.position.set(
    controls.target.x,
    Math.cos(tilt) * distance,
    controls.target.z + Math.sin(tilt) * distance,
  );
  controls.update();
  tracer.reset();
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

// Pale gold through orange to deep red, by how high the column reaches.
const RAMP = ['#f3e2c4', '#f0b56a', '#e8763a', '#cf3f22', '#9a1b14'];
const RAMP_COLORS = RAMP.map(color);
function ramp(t, out) {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  return out.copy(RAMP_COLORS[i]).lerp(RAMP_COLORS[i + 1], x - i);
}

// --- data ------------------------------------------------------------------

const shares = new Map();
async function loadShare(key) {
  if (!shares.has(key)) {
    const blob = await fetch(`data/${key}.png`).then((r) => r.blob());
    const bitmap = await createImageBitmap(blob, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    });
    const c = new OffscreenCanvas(nx, ny).getContext('2d', {
      willReadFrequently: true,
    });
    c.drawImage(bitmap, 0, 0);
    const rgba = c.getImageData(0, 0, nx, ny).data;
    const share = new Uint8Array(nx * ny);
    for (let i = 0; i < share.length; i++) share[i] = rgba[i * 4];
    shares.set(key, share);
  }
  return shares.get(key);
}

// Each block's average share, or NaN where it's mostly sea.
function blocks(share, size) {
  const [w, h] = [Math.floor(nx / size), Math.floor(ny / size)];
  const out = new Float32Array(w * h).fill(NaN);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      let sum = 0;
      let n = 0;
      for (let y = by * size; y < (by + 1) * size; y++) {
        for (let x = bx * size; x < (bx + 1) * size; x++) {
          const v = share[y * nx + x];
          if (v !== NO_DATA) [sum, n] = [sum + v, n + 1];
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
async function build() {
  const share = await loadShare(params.period);
  const {w, h, values} = blocks(share, params.block);
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

  // Each label points at the middle of its place's column top and quotes the
  // cell's own value, not the block average. A coastal city whose own cell is
  // sea borrows the nearest land cell.
  labels = Object.entries(PLACES).map(([name, [lat, lon]]) => {
    const [cx, cy] = toGrid(lat, lon).map(Math.floor);
    let [gx, gy] = [cx, cy];
    let best = Infinity;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const v = share[(cy + dy) * nx + cx + dx];
        if (v !== NO_DATA && dx * dx + dy * dy < best) {
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
    return {name, value: share[gy * nx + gx], tip};
  });
}

// --- overlay ---------------------------------------------------------------

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}
function subtitle() {
  const {lowF, nightLowF, highF, dewF, rainMm, windMph} = meta.test;
  const when =
    params.period === 'all'
      ? `${formatDate(meta.start)} – ${formatDate(meta.end)}`
      : MONTHS[Number(params.period) - 1];
  return `Share of all hours ${lowF}–${highF}°F (${nightLowF}°F at night), dew point under ${dewF}°F, under ${rainMm} mm of rain, wind under ${windMph} mph and no dust or smoke  ·  ${when}`;
}

const projected = new THREE.Vector3();
function drawOverlay(c, w, h) {
  const u = Math.min(w, h * 1.6) / 1000; // one unit of type scale
  c.clearRect(0, 0, w, h);
  c.fillStyle = INK;
  c.textBaseline = 'alphabetic';

  // Title block, top left.
  const pad = 44 * u;
  c.font = `200 ${50 * u}px ${FONT}`;
  c.fillText('Windows open', pad, pad + 40 * u);
  c.font = `400 ${10.5 * u}px ${FONT}`;
  c.letterSpacing = `${2.6 * u}px`;
  const kicker =
    params.period === 'all'
      ? 'A YEAR OF OPEN-WINDOW WEATHER'
      : `OPEN-WINDOW WEATHER IN ${MONTHS[Number(params.period) - 1].toUpperCase()}`;
  c.fillText(`${kicker} AROUND THE WORLD`, pad + 3 * u, pad + 64 * u);
  c.letterSpacing = '0px';
  c.font = `300 ${12.5 * u}px ${FONT}`;
  c.globalAlpha = 0.75;
  c.fillText(subtitle(), pad + 3 * u, pad + 83 * u);
  c.globalAlpha = 1;

  // Legend, bottom left: the ramp with the floor and top it stands for.
  const lx = pad + 3 * u;
  const ly = h - pad - 30 * u;
  const lw = 200 * u;
  const lh = 5 * u;
  const gradient = c.createLinearGradient(lx, 0, lx + lw, 0);
  RAMP.forEach((col, i) => gradient.addColorStop(i / (RAMP.length - 1), col));
  c.fillStyle = gradient;
  c.fillRect(lx, ly, lw, lh);
  c.fillStyle = INK;
  c.font = `300 ${11 * u}px ${FONT}`;
  c.fillText(
    `${params.low}%${params.low > 0 ? ' or less' : ''}`,
    lx,
    ly + lh + 15 * u,
  );
  c.textAlign = 'right';
  c.fillText(`${params.high}%`, lx + lw, ly + lh + 15 * u);
  c.textAlign = 'left';
  c.font = `400 ${10 * u}px ${FONT}`;
  c.letterSpacing = `${2 * u}px`;
  c.fillText('HEIGHT · HOURS WITH THE WINDOWS OPEN', lx, ly - 9 * u);
  c.letterSpacing = '0px';

  // Source, bottom right.
  c.textAlign = 'right';
  c.globalAlpha = 0.6;
  c.font = `300 ${10.5 * u}px ${FONT}`;
  c.fillText(
    'Weather: ERA5-Land reanalysis, 0.1°, hourly. Dust and smoke: CAMS PM10 and PM2.5 over AQI 100.',
    w - pad,
    h - pad - 14 * u,
  );
  c.fillText(
    'All 24 hours of the day, in Equal Earth projection.',
    w - pad,
    h - pad,
  );
  c.globalAlpha = 1;
  c.textAlign = 'left';

  if (!params.labels) return;
  // City labels: a dot on the column's top and a fine leader to the name.
  for (const {name, value, tip} of labels) {
    projected.copy(tip).project(camera);
    if (projected.z > 1) continue;
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
    const text = `${name}  ${value === NO_DATA ? '–' : value + '%'}`;
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

// --- controls --------------------------------------------------------------

const gui = new GUI({title: 'Settings'});
const rebuild = () => build();
const manual = () => ((params.fit = false), rebuild());
gui.add(params, 'period', meta.periods).onChange(rebuild);
gui.add(params, 'labels');
gui.add(tracer, 'samples').listen().disable();
const shape = gui.addFolder('Columns').close();
shape.add(params, 'block', 1, 12, 1).name('cells per column').onChange(rebuild);
shape.add(params, 'fit').name('fit to period').onChange(rebuild);
shape
  .add(params, 'low', 0, 90, 1)
  .name('floor (% open)')
  .onFinishChange(manual);
shape
  .add(params, 'high', 10, 100, 1)
  .name('top (% open)')
  .onFinishChange(manual);
shape.add(params, 'gamma', 0.5, 5, 0.1).onFinishChange(rebuild);
shape.add(params, 'height', 0.5, 20, 0.25).onFinishChange(rebuild);
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
gui.add({reset: frame}, 'reset').name('reset view');
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
  a.download = `windows-open-${params.period}.png`;
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
addEventListener('resize', () => (resize(), frame()));

await Promise.all(
  ['200', '300', '400'].map((weight) =>
    document.fonts.load(`${weight} 20px ${FONT}`),
  ),
);
resize();
frame();
setLighting();
await build();
renderer.setAnimationLoop(() => {
  controls.update();
  if (tracer.samples < params.maxSamples) tracer.step(camera);
  tracer.show(params.exposure);
  drawOverlay(ctx, overlay.width, overlay.height);
});
