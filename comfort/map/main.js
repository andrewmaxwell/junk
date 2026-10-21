import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {
  geoConicConformal,
  geoContains,
  geoPath,
} from 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
import {interpolateViridis} from 'https://cdn.jsdelivr.net/npm/d3-scale-chromatic@3.1.0/+esm';
import {color as d3color} from 'https://cdn.jsdelivr.net/npm/d3-color@3.1.0/+esm';
import {
  mesh,
  merge,
} from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import {ACTIVITIES, FACTOR_LABELS} from '../js/comfort.js';
import {fetchLocationName, searchPlaces} from '../js/weather.js';

const STATES_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
// Alaska, Hawaii and the territories: the map is the Lower 48 only.
const NOT_LOWER_48 = new Set(['02', '15', '60', '66', '69', '72', '78']);

// Each factor's colour on the limiting-factor view, picked to read as what it
// is rather than to be evenly spaced: heat warm, cold blue, rain teal.
const FACTOR_COLORS = {
  heat: '#e8603c',
  cold: '#4a90e2',
  rain: '#2bb3a3',
  wind: '#a7b0bd',
  sun: '#f2c14e',
  air: '#9c7a5b',
  dark: '#7b68ee',
  storm: '#d14f9a',
  ice: '#b5ecff',
  gale: '#6f7785',
};
const GOOD_COLOR = interpolateViridis(0.85);

const VIEWS = {
  comfort: 'Comfortable hours',
  limiter: 'Limiting factor',
};

const MONTHS = Array.from({length: 12}, (_, i) =>
  new Date(2026, i, 15).toLocaleDateString(undefined, {month: 'short'}),
);
const MONTH_NAMES = Array.from({length: 12}, (_, i) =>
  new Date(2026, i, 15).toLocaleDateString(undefined, {month: 'long'}),
);
// The range is one year to the day, so it holds each calendar day once and
// every day has the same number of waking hours: a month's weight in the year
// is its length.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const MIN_ZOOM = 1;
const MAX_ZOOM = 32;
const FADE_MS = 280;
const PLAY_HOLD_MS = 900;

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const readout = document.getElementById('readout');
const subtitle = document.getElementById('subtitle');
const legend = document.getElementById('legend');
const status = document.getElementById('status');
const profileEl = document.getElementById('profile');

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );
const percent = (fraction) => `${Math.round(fraction * 100)}%`;

let meta;
let us;
try {
  [meta, us] = await Promise.all([
    fetch('./data/meta.json').then((r) => {
      if (!r.ok) throw new Error(`map data (${r.status})`);
      return r.json();
    }),
    fetch(STATES_URL).then((r) => {
      if (!r.ok) throw new Error(`state borders (${r.status})`);
      return r.json();
    }),
  ]);
} catch (error) {
  subtitle.textContent = `Couldn't load the ${error.message.replace(/^Failed to fetch$/, 'map')}. Check your connection and reload.`;
  throw error;
}

const states = {
  ...us.objects.states,
  geometries: us.objects.states.geometries.filter(
    (state) => !NOT_LOWER_48.has(state.id),
  ),
};
const lower48 = merge(us, states.geometries);
const borders = mesh(us, states, (a, b) => a !== b);

// --- The HRRR grid -------------------------------------------------------------
//
// The data images are the model's own 3 km Lambert conformal grid, north up,
// one pixel per cell. Rather than resample them, the page draws them as they
// are and puts the borders on top in the same projection, configured so that
// each cell's centre lands in the middle of its pixel.

const {nx, ny, projection: grid, encoding} = meta;
const gridProjection = geoConicConformal()
  .parallels([grid.lat1, grid.lat2])
  .rotate([-grid.lon0, 0])
  .scale(grid.radius / grid.dx)
  .translate([0, 0]);
{
  const [x0, y0] = gridProjection([grid.firstLon, grid.firstLat]);
  gridProjection.translate([0.5 - x0, ny - 0.5 - y0]);
}
const gridPath = geoPath(gridProjection);
const [[cropX0, cropY0], [cropX1, cropY1]] = gridPath.bounds(lower48);
const outline = new Path2D(gridPath(lower48));
const borderPath = new Path2D(gridPath(borders));

const inLower48 = (lat, lon) => geoContains(lower48, [lon, lat]);

// --- Data ------------------------------------------------------------------------

// Each image decoded to raw RGBA, exactly as written: no colour management and
// no premultiplication, since these are numbers rather than colours.
const images = new Map();
function loadImage(period, activity) {
  const key = `${period}-${activity}`;
  if (!images.has(key)) {
    const promise = fetch(`./data/${key}.png`)
      .then((r) => {
        if (!r.ok) throw new Error(`${key}.png (${r.status})`);
        return r.blob();
      })
      .then((blob) =>
        createImageBitmap(blob, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        }),
      )
      .then((bitmap) => {
        const scratch = new OffscreenCanvas(nx, ny);
        const sctx = scratch.getContext('2d', {willReadFrequently: true});
        sctx.drawImage(bitmap, 0, 0);
        return sctx.getImageData(0, 0, nx, ny).data;
      });
    // A failed load is forgotten, so the next attempt fetches again.
    promise.catch(() => images.delete(key));
    images.set(key, promise);
  }
  return images.get(key);
}

// What a pixel says, or null where there is no data.
function readPixel(data, cell) {
  const p = cell * 4;
  if (data[p] === encoding.noData) return null;
  return {
    good: data[p] / encoding.shareScale,
    limiter:
      data[p + 1] === encoding.noFactor ? null : meta.factors[data[p + 1]],
  };
}

// A place's year, from the 9 km profile tiles: per activity and calendar month,
// the share of waking hours at Good or better and the share lost to each
// factor. See `build/export.js` for the layout.
const tiles = new Map();
function loadTile(tx, ty) {
  const key = `${tx}-${ty}`;
  if (!tiles.has(key)) {
    const promise = fetch(`./data/profile/${key}.bin`)
      .then((r) => {
        if (r.status === 404) return null; // all ocean
        if (!r.ok) throw new Error(`profile ${key} (${r.status})`);
        return new Response(
          r.body.pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
      })
      .then((buffer) => buffer && new Uint8Array(buffer));
    promise.catch(() => tiles.delete(key));
    tiles.set(key, promise);
  }
  return tiles.get(key);
}

async function loadProfile(gx, gy) {
  const {block, tile} = meta.profile;
  const bx = Math.floor(gx / block);
  const by = Math.floor(gy / block);
  const data = await loadTile(Math.floor(bx / tile), Math.floor(by / tile));
  if (!data) return null;
  const index = (by % tile) * tile + (bx % tile);
  const values = 1 + meta.factors.length;
  const read = (a, m, v) =>
    data[((a * 12 + m) * values + v) * tile * tile + index];
  if (read(0, 0, 0) === encoding.noData) return null;
  return Object.fromEntries(
    meta.activities.map((activity, a) => {
      const months = Array.from({length: 12}, (_, m) => ({
        good: read(a, m, 0) / encoding.shareScale,
        lost: Object.fromEntries(
          meta.factors.map((key, f) => [
            key,
            read(a, m, 1 + f) / encoding.shareScale,
          ]),
        ),
      }));
      const year =
        months.reduce((sum, {good}, m) => sum + good * DAYS_IN_MONTH[m], 0) /
        365;
      return [activity, {months, year}];
    }),
  );
}

// --- Colour ----------------------------------------------------------------------

const RAMP_STEPS = 256;
const ramp = Array.from({length: RAMP_STEPS}, (_, i) => {
  const c = d3color(interpolateViridis(i / (RAMP_STEPS - 1)));
  return [c.r, c.g, c.b];
});
const factorRgb = meta.factors.map((key) => {
  const c = d3color(FACTOR_COLORS[key]);
  return [c.r, c.g, c.b];
});

// One coloured raster per period for the current activity and view, kept so
// stepping back through months is instant. Changing activity or view starts
// a new set rather than holding every combination in memory.
let rasterSet = '';
let rasters = new Map();
function rasterFor(period) {
  const set = `${settings.activity}-${settings.view}`;
  if (set !== rasterSet) {
    rasterSet = set;
    rasters = new Map();
  }
  if (!rasters.has(period)) {
    const view = settings.view;
    const promise = loadImage(period, settings.activity).then((data) => {
      const raster = new OffscreenCanvas(nx, ny);
      const rctx = raster.getContext('2d');
      const image = rctx.createImageData(nx, ny);
      const px = image.data;
      const present = new Set();
      for (let p = 0; p < data.length; p += 4) {
        if (data[p] === encoding.noData) continue;
        let rgb;
        let alpha = 255;
        if (view === 'comfort') {
          rgb =
            ramp[
              Math.round((data[p] / encoding.shareScale) * (RAMP_STEPS - 1))
            ];
        } else {
          if (data[p + 1] === encoding.noFactor) continue;
          rgb = factorRgb[data[p + 1]];
          present.add(data[p + 1]);
          // Fainter where few hours were lost at all: a place that is Good
          // nine hours in ten should not shout its one complaint.
          alpha = Math.round(
            255 * (0.25 + 0.75 * (1 - data[p] / encoding.shareScale)),
          );
        }
        px[p] = rgb[0];
        px[p + 1] = rgb[1];
        px[p + 2] = rgb[2];
        px[p + 3] = alpha;
      }
      rctx.putImageData(image, 0, 0);
      return {raster, present, view};
    });
    promise.catch(() => rasters.delete(period));
    rasters.set(period, promise);
  }
  return rasters.get(period);
}

// --- State and URL -------------------------------------------------------------

const params = new URLSearchParams(location.search);
const settings = {
  activity: meta.activities.includes(params.get('a'))
    ? params.get('a')
    : 'walk',
  view: params.get('v') in VIEWS ? params.get('v') : 'comfort',
};
// 0 is the year. Opens on this month, the one people are deciding about.
let month =
  params.get('m') === 'year'
    ? 0
    : Number(params.get('m')) >= 1 && Number(params.get('m')) <= 12
      ? Math.round(Number(params.get('m')))
      : new Date().getMonth() + 1;
let place = null; // {lat, lon, gx, gy, name}

const periodKey = (m = month) => (m === 0 ? 'all' : String(m).padStart(2, '0'));

function saveUrl() {
  const next = new URLSearchParams();
  if (settings.activity !== 'walk') next.set('a', settings.activity);
  if (settings.view !== 'comfort') next.set('v', settings.view);
  next.set('m', month || 'year');
  if (place) next.set('p', `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`);
  if (place && zoom.k > 1.01) next.set('z', zoom.k.toFixed(1));
  const query = next.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

// --- Controls --------------------------------------------------------------------

const gui = new GUI({
  title: 'Show',
  container: document.getElementById('controls'),
});
gui
  .add(settings, 'activity', {Walking: 'walk', 'Sitting in the shade': 'sit'})
  .name('Activity')
  .onChange(() => update());
gui
  .add(
    settings,
    'view',
    Object.fromEntries(
      Object.entries(VIEWS).map(([key, label]) => [label, key]),
    ),
  )
  .name('Colour by')
  .onChange(() => update());

const monthsEl = document.getElementById('months');
const yearButton = document.getElementById('year');
const playButton = document.getElementById('play');
monthsEl.innerHTML = MONTHS.map(
  (name, i) =>
    `<span role="tab" aria-label="${MONTH_NAMES[i]}">${name.slice(0, window.innerWidth < 560 ? 1 : 3)}</span>`,
).join('');

function setMonth(m, {fromPlay = false} = {}) {
  if (!fromPlay) stopPlaying();
  if (m === month) return;
  month = m;
  update();
}

function syncTimeline() {
  yearButton.classList.toggle('on', month === 0);
  [...monthsEl.children].forEach((el, i) => {
    el.classList.toggle('on', month === i + 1);
    el.setAttribute('aria-selected', month === i + 1);
  });
}

yearButton.addEventListener('click', () => setMonth(0));
// Scrubbing: press anywhere on the strip and slide along it.
const monthAt = (event) => {
  const rect = monthsEl.getBoundingClientRect();
  const t = (event.clientX - rect.left) / rect.width;
  return Math.min(12, Math.max(1, Math.floor(t * 12) + 1));
};
monthsEl.addEventListener('pointerdown', (event) => {
  monthsEl.setPointerCapture(event.pointerId);
  setMonth(monthAt(event));
});
monthsEl.addEventListener('pointermove', (event) => {
  if (monthsEl.hasPointerCapture(event.pointerId)) setMonth(monthAt(event));
});
window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select')) return;
  if (event.key === 'ArrowRight') setMonth((month % 12) + 1);
  else if (event.key === 'ArrowLeft') setMonth(month <= 1 ? 12 : month - 1);
  else if (event.key === ' ' && event.target === document.body) {
    event.preventDefault();
    togglePlay();
  }
});

let playToken = 0;
function stopPlaying() {
  playToken++;
  playButton.textContent = '▶';
  playButton.setAttribute('aria-label', 'Play through the year');
}
async function togglePlay() {
  if (playButton.textContent === '❚❚') return stopPlaying();
  const token = ++playToken;
  playButton.textContent = '❚❚';
  playButton.setAttribute('aria-label', 'Pause');
  while (token === playToken) {
    const next = (month % 12) + 1;
    rasterFor(periodKey((next % 12) + 1)); // fetch one ahead
    try {
      await rasterFor(periodKey(next));
    } catch {
      return stopPlaying(); // update() says what failed
    }
    if (token !== playToken) return;
    setMonth(next, {fromPlay: true});
    await new Promise((resolve) => setTimeout(resolve, PLAY_HOLD_MS));
  }
}
playButton.addEventListener('click', togglePlay);

// --- Map view: zoom and pan --------------------------------------------------------

let fit; // canvas pixels per grid cell at zoom 1
const zoom = {k: 1, x: (cropX0 + cropX1) / 2, y: (cropY0 + cropY1) / 2};
const dpr = () => window.devicePixelRatio || 1;
const pixelsPerCell = () => fit * zoom.k;

function layout() {
  const cssWidth = canvas.parentElement.clientWidth;
  fit = (cssWidth * dpr()) / (cropX1 - cropX0);
  canvas.width = Math.round(cssWidth * dpr());
  canvas.height = Math.ceil((cropY1 - cropY0) * fit);
  canvas.style.height = `${canvas.height / dpr()}px`;
  clampView();
}

// Keep the map filling the canvas: no panning off into empty space.
function clampView() {
  zoom.k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.k));
  const s = pixelsPerCell();
  const halfW = canvas.width / 2 / s;
  const halfH = canvas.height / 2 / s;
  const clamp = (v, lo, hi) =>
    lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
  zoom.x = clamp(zoom.x, cropX0 + halfW, cropX1 - halfW);
  zoom.y = clamp(zoom.y, cropY0 + halfH, cropY1 - halfH);
  document.getElementById('zoomReset').hidden = zoom.k <= 1.01;
}

// Canvas pixels (device) to grid coordinates and back.
const toGrid = (px, py) => [
  zoom.x + (px - canvas.width / 2) / pixelsPerCell(),
  zoom.y + (py - canvas.height / 2) / pixelsPerCell(),
];
const eventPixel = (event) => {
  const rect = canvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) * dpr(),
    (event.clientY - rect.top) * dpr(),
  ];
};

function zoomAt(px, py, factor) {
  const [gx, gy] = toGrid(px, py);
  zoom.k *= factor;
  clampView();
  const s = pixelsPerCell();
  zoom.x = gx - (px - canvas.width / 2) / s;
  zoom.y = gy - (py - canvas.height / 2) / s;
  clampView();
  draw();
}

// A short eased glide, for buttons and search results rather than gestures.
let glide = 0;
function glideTo(target) {
  const from = {...zoom};
  const token = ++glide;
  const start = performance.now();
  const step = (now) => {
    if (token !== glide) return;
    const t = Math.min(1, (now - start) / 450);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    // Interpolate zoom geometrically so it feels even at every scale.
    zoom.k = from.k * (target.k / from.k) ** e;
    zoom.x = from.x + (target.x - from.x) * e;
    zoom.y = from.y + (target.y - from.y) * e;
    clampView();
    draw();
    if (t < 1) requestAnimationFrame(step);
    else saveUrl();
  };
  requestAnimationFrame(step);
}

document
  .getElementById('zoomIn')
  .addEventListener('click', () => glideTo({...zoom, k: zoom.k * 2}));
document
  .getElementById('zoomOut')
  .addEventListener('click', () => glideTo({...zoom, k: zoom.k / 2}));
document
  .getElementById('zoomReset')
  .addEventListener('click', () =>
    glideTo({k: 1, x: (cropX0 + cropX1) / 2, y: (cropY0 + cropY1) / 2}),
  );

// --- Drawing -----------------------------------------------------------------------

let shown = null; // the raster on screen
let fading = null; // {from, start} while crossfading to `shown`

function draw() {
  if (!canvas.width) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = pixelsPerCell();
  ctx.setTransform(
    s,
    0,
    0,
    s,
    canvas.width / 2 - zoom.x * s,
    canvas.height / 2 - zoom.y * s,
  );

  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = 'oklch(0.25 0.015 250)';
  ctx.fillRect(cropX0, cropY0, cropX1 - cropX0, cropY1 - cropY0);
  if (shown) {
    // Smooth while cells are smaller than a few pixels; past that, show them
    // as the 3 km squares they are. A categorical view is never smoothed, as
    // blending two factors' colours makes a third that means neither.
    ctx.imageSmoothingEnabled = shown.view === 'comfort' && s < 4;
    const t = fading
      ? Math.min(1, (performance.now() - fading.start) / FADE_MS)
      : 1;
    if (fading && t < 1) {
      ctx.drawImage(fading.from.raster, 0, 0);
      ctx.globalAlpha = t;
    }
    ctx.drawImage(shown.raster, 0, 0);
    ctx.globalAlpha = 1;
    if (fading && t >= 1) fading = null;
    if (fading) requestAnimationFrame(draw);
  }
  ctx.restore();

  const px = dpr() / s;
  ctx.lineWidth = 0.6 * px * Math.min(2, Math.sqrt(zoom.k));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke(borderPath);
  ctx.lineWidth = 1 * px;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.stroke(outline);

  if (place) {
    const [x, y] = [place.gx, place.gy];
    ctx.beginPath();
    ctx.arc(x, y, 7 * px, 0, Math.PI * 2);
    ctx.lineWidth = 4 * px;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.stroke();
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = 'white';
    ctx.stroke();
  }
}

// Brings the screen in line with the settings: fetches what is needed and
// fades it in, ignoring anything a newer call has superseded.
let updateToken = 0;
async function update() {
  const token = ++updateToken;
  syncTimeline();
  renderText();
  saveUrl();
  renderProfile();
  // Both activities for the readout, the shown one first.
  const period = periodKey();
  const loading = setTimeout(() => (status.textContent = 'Loading…'), 250);
  try {
    const [next] = await Promise.all([
      rasterFor(period),
      ...meta.activities.map((a) => loadImage(period, a)),
    ]);
    if (token !== updateToken) return;
    status.textContent = '';
    if (next !== shown) {
      fading = shown ? {from: shown, start: performance.now()} : null;
      shown = next;
    }
    draw();
    renderLegend();
  } catch (error) {
    if (token !== updateToken) return;
    status.textContent = `Couldn't load this month's map (${error.message}). Check your connection and try again.`;
  } finally {
    clearTimeout(loading);
  }
}

// --- Text --------------------------------------------------------------------------

const periodLabel = () => {
  if (month !== 0) return `in ${MONTH_NAMES[month - 1]}`;
  const format = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  return `over the year (${format(meta.start)} – ${format(meta.end)})`;
};

function renderText() {
  const activity = ACTIVITIES[settings.activity];
  const [start, end] = meta.wakingHours;
  const hours = `${start} AM – ${end - 12} PM`;
  subtitle.textContent =
    settings.view === 'comfort'
      ? `Share of waking hours (${hours} local) that scored Good or better ` +
        `(${meta.goodScore}+) ${activity.phrase}, ${periodLabel()}.`
      : `What most often kept waking hours below Good ${activity.phrase}, ` +
        `${periodLabel()}. Fainter means fewer hours lost.`;
}

function renderLegend() {
  if (shown?.view === 'comfort') {
    const stops = Array.from({length: 11}, (_, i) =>
      interpolateViridis(i / 10),
    );
    legend.innerHTML =
      `<div class="ramp" style="background: linear-gradient(to right, ${stops.join(',')})"></div>` +
      `<div class="ticks">${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => `<span>${percent(t)}</span>`)
        .join('')}</div>`;
  } else if (shown) {
    legend.innerHTML = `<div class="swatches">${meta.factors
      .filter((key, i) => shown.present.has(i))
      .map(
        (key) =>
          `<span class="swatch"><i style="background:${FACTOR_COLORS[key]}"></i>${FACTOR_LABELS[key]}</span>`,
      )
      .join('')}</div>`;
  }
}

// --- Place names -----------------------------------------------------------------

// Names are looked up for a ~10 km square, not per 3 km cell, so moving the
// pointer across a town does not fire a request per pixel.
const placeNames = new Map();
const nameKey = (lat, lon) => `${lat.toFixed(1)},${lon.toFixed(1)}`;
function placeName(lat, lon) {
  const key = nameKey(lat, lon);
  if (!placeNames.has(key)) placeNames.set(key, fetchLocationName(lat, lon));
  return placeNames.get(key);
}

// --- Hover readout -----------------------------------------------------------------

let hoverTimer;
let lastHover;
async function showReadout(event) {
  lastHover = event;
  const [px, py] = eventPixel(event);
  const [gxf, gyf] = toGrid(px, py);
  const gx = Math.floor(gxf);
  const gy = Math.floor(gyf);
  const [lon, lat] = gridProjection.invert([gx + 0.5, gy + 0.5]);
  if (gx < 0 || gy < 0 || gx >= nx || gy >= ny || !inLower48(lat, lon))
    return hideReadout();
  const period = periodKey();
  const both = meta.activities.map((a) => images.get(`${period}-${a}`));
  if (both.some((p) => !p)) return hideReadout();
  const data = await Promise.all(both);
  if (event !== lastHover) return;
  const cell = gy * nx + gx;

  const rowsHtml = meta.activities
    .map((activityKey, i) => {
      const summary = readPixel(data[i], cell);
      if (!summary) return '';
      const active = activityKey === settings.activity;
      return (
        `<tr class="${active ? 'active' : 'dim'}"><td>${ACTIVITIES[activityKey].short}</td>` +
        `<td>${percent(summary.good)} Good+</td></tr>` +
        `<tr class="dim"><td colspan="2">Main cost: ${summary.limiter ? FACTOR_LABELS[summary.limiter] : 'none'}</td></tr>`
      );
    })
    .join('');
  if (!rowsHtml) return hideReadout();

  const key = nameKey(lat, lon);
  const known = placeNames.has(key);
  readout.innerHTML =
    `<div class="place">${known ? escapeHtml(await placeName(lat, lon)) : '…'}</div>` +
    `<div class="coords">${lat.toFixed(2)}°, ${lon.toFixed(2)}° · ${month ? MONTH_NAMES[month - 1] : 'Year'}</div>` +
    `<table>${rowsHtml}</table>` +
    `<div class="hint">Click for this place's year</div>`;
  if (event !== lastHover) return;
  readout.style.display = 'block';

  // Keep it on the map, flipping to the other side of the cursor near an edge.
  const rect = canvas.getBoundingClientRect();
  const left = event.clientX - rect.left;
  const top = event.clientY - rect.top;
  const flipX = left + readout.offsetWidth + 24 > rect.width;
  const flipY = top + readout.offsetHeight + 24 > rect.height;
  readout.style.left = `${Math.max(4, flipX ? left - readout.offsetWidth - 14 : left + 14)}px`;
  readout.style.top = `${Math.max(4, flipY ? top - readout.offsetHeight - 14 : top + 14)}px`;

  if (!known) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(async () => {
      await placeName(lat, lon);
      if (event === lastHover) showReadout(event);
    }, 350);
  }
}

function hideReadout() {
  lastHover = null;
  readout.style.display = 'none';
}

// --- Gestures ----------------------------------------------------------------------

const pointers = new Map(); // id -> [x, y] in device pixels
let gesture = null; // {moved, startX, startY, pinch?}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, eventPixel(event));
  glide++; // a gesture interrupts any glide
  if (pointers.size === 1) {
    const [x, y] = eventPixel(event);
    gesture = {moved: false, startX: x, startY: y};
  } else if (pointers.size === 2) {
    gesture = {moved: true, pinch: pinchState()};
    hideReadout();
  }
});

function pinchState() {
  const [[x1, y1], [x2, y2]] = [...pointers.values()];
  return {
    distance: Math.hypot(x2 - x1, y2 - y1),
    mid: [(x1 + x2) / 2, (y1 + y2) / 2],
  };
}

canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) {
    if (event.pointerType === 'mouse') showReadout(event);
    return;
  }
  const previous = pointers.get(event.pointerId);
  const current = eventPixel(event);
  pointers.set(event.pointerId, current);
  if (gesture?.pinch) {
    const next = pinchState();
    const s = pixelsPerCell();
    // Pan with the midpoint, then zoom about it.
    zoom.x -= (next.mid[0] - gesture.pinch.mid[0]) / s;
    zoom.y -= (next.mid[1] - gesture.pinch.mid[1]) / s;
    zoomAt(next.mid[0], next.mid[1], next.distance / gesture.pinch.distance);
    gesture.pinch = next;
    return;
  }
  if (!gesture) return;
  const travelled = Math.hypot(
    current[0] - gesture.startX,
    current[1] - gesture.startY,
  );
  if (!gesture.moved && travelled < 6 * dpr()) return;
  if (!gesture.moved) {
    gesture.moved = true;
    canvas.classList.add('dragging');
    hideReadout();
  }
  const s = pixelsPerCell();
  zoom.x -= (current[0] - previous[0]) / s;
  zoom.y -= (current[1] - previous[1]) / s;
  clampView();
  draw();
});

function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    if (gesture && !gesture.moved && event.type === 'pointerup') {
      const [gx, gy] = toGrid(...eventPixel(event));
      const [lon, lat] = gridProjection.invert([gx, gy]);
      if (inLower48(lat, lon)) selectPlace(lat, lon);
      else selectPlace(null);
    } else if (gesture?.moved) saveUrl();
    gesture = null;
    canvas.classList.remove('dragging');
  } else if (pointers.size === 1) {
    // One finger lifted from a pinch: carry on as a pan from here.
    const [x, y] = [...pointers.values()][0];
    gesture = {moved: true, startX: x, startY: y};
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (event) => {
  if (event.pointerType === 'mouse') hideReadout();
});
canvas.addEventListener(
  'wheel',
  (event) => {
    // Plain scrolling scrolls the page, which the map would otherwise trap;
    // trackpad pinches arrive as wheel events with ctrlKey set.
    if (!event.ctrlKey && !event.metaKey) {
      showHint(
        `${/Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'} + scroll to zoom`,
      );
      return;
    }
    event.preventDefault();
    glide++;
    const [x, y] = eventPixel(event);
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    zoomAt(x, y, Math.exp(-delta * (event.metaKey ? 0.002 : 0.01)));
    showReadout(event);
    clearTimeout(wheelSave);
    wheelSave = setTimeout(saveUrl, 300);
  },
  {passive: false},
);
let wheelSave;
const hint = document.getElementById('hint');
let hintTimer;
function showHint(text) {
  hint.textContent = text;
  hint.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.remove('show'), 1200);
}
canvas.addEventListener('dblclick', (event) => {
  const [x, y] = eventPixel(event);
  const [gx, gy] = toGrid(x, y);
  glideTo({k: zoom.k * 2, x: gx, y: gy});
});

// --- Place profile -----------------------------------------------------------------

let profile = null; // {place, data} once loaded
let profileToken = 0;
let hoverMonth = null;

async function selectPlace(lat, lon, {name, fly = false, scroll = true} = {}) {
  hideReadout();
  if (lat === null) {
    place = null;
    profile = null;
    profileToken++;
    saveUrl();
    draw();
    renderProfile();
    return;
  }
  const [gx, gy] = gridProjection([lon, lat]);
  place = {lat, lon, gx, gy, name: name ?? null};
  const token = ++profileToken;
  profile = null;
  hoverMonth = null;
  if (fly) glideTo({k: Math.max(zoom.k, 4), x: gx, y: gy});
  draw();
  saveUrl();
  renderProfile();
  if (scroll && window.innerWidth < 700)
    profileEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});

  const [data] = await Promise.all([
    loadProfile(Math.floor(gx), Math.floor(gy)).catch((error) => ({error})),
    name
      ? null
      : placeName(lat, lon).then((found) => {
          if (token === profileToken) place.name = found;
        }),
  ]);
  if (token !== profileToken) return;
  profile = {data};
  renderProfile();
}

const EXAMPLES = {
  'San Diego, CA': [32.72, -117.16],
  'Phoenix, AZ': [33.45, -112.07],
  'Seattle, WA': [47.61, -122.33],
  'Denver, CO': [39.74, -104.99],
  'Chicago, IL': [41.88, -87.63],
  'Miami, FL': [25.77, -80.19],
};

function renderEmptyProfile() {
  profileEl.innerHTML =
    '<h2>Pick a place</h2>' +
    '<p class="caption muted">Click anywhere on the map, or search a town, to see its year month by month: how often it was nice, and what spoiled the rest.</p>' +
    `<div class="examples">${Object.keys(EXAMPLES)
      .map((name) => `<button>${name}</button>`)
      .join('')}</div>`;
  profileEl.querySelectorAll('.examples button').forEach((button) =>
    button.addEventListener('click', () => {
      const [lat, lon] = EXAMPLES[button.textContent];
      selectPlace(lat, lon, {name: button.textContent, fly: true});
    }),
  );
}

function renderProfile() {
  if (!place) return renderEmptyProfile();
  const title =
    place.name ?? `${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}°`;
  const head =
    `<header><div><h2>${escapeHtml(title)}</h2>` +
    `<div class="coords">${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}° · the 9 km around this point</div></div>` +
    `<button class="close" aria-label="Close">✕</button></header>`;

  let body;
  if (!profile)
    body = '<p class="caption muted">Loading this place’s year…</p>';
  else if (profile.data?.error)
    body = `<p class="caption">Couldn’t load this place (${escapeHtml(profile.data.error.message)}). Tap it again to retry.</p>`;
  else if (!profile.data)
    body =
      '<p class="caption">No data here: this point is off the edge of the model grid.</p>';
  else body = profileBody(profile.data);

  profileEl.innerHTML = head + body;
  profileEl
    .querySelector('.close')
    .addEventListener('click', () => selectPlace(null));
  const svg = profileEl.querySelector('svg');
  if (!svg) return;
  svg.querySelectorAll('.col').forEach((col) => {
    const m = Number(col.dataset.month);
    col.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hoverMonth = m;
      profileEl.querySelector('.caption').innerHTML = profileCaption(
        profile.data,
      );
    });
    col.addEventListener('pointerleave', () => {
      hoverMonth = null;
      profileEl.querySelector('.caption').innerHTML = profileCaption(
        profile.data,
      );
    });
    col.addEventListener('click', () => setMonth(month === m ? 0 : m));
  });
}

const CHART = {height: 190, left: 38, right: 4, top: 10, bottom: 24};

function profileBody(data) {
  const activity = settings.activity;
  const other = meta.activities.find((a) => a !== activity);
  const summary = [activity, other]
    .map(
      (a) =>
        `<div class="stat ${a === activity ? '' : 'dim'}"><b>${percent(data[a].year)}</b>` +
        `<span>Good+ ${ACTIVITIES[a].short.toLowerCase()}, over the year</span></div>`,
    )
    .join('');

  // Drawn at the panel's own width so the labels stay at their CSS size.
  const width = Math.max(260, profileEl.clientWidth - 32);
  const {height, left, right, top, bottom} = CHART;
  const plotH = height - top - bottom;
  const step = (width - left - right) / 12;
  const barW = step * 0.72;
  const y = (v) => top + plotH * (1 - v);
  let svg = '';
  for (const v of [0, 0.5, 1]) {
    svg +=
      `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,0.08)"/>` +
      `<text x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${percent(v)}</text>`;
  }
  // Each month one bar of all its waking hours: Good at the bottom, then the
  // hours lost to each factor, biggest first.
  data[activity].months.forEach(({good, lost}, m) => {
    const x = left + m * step + (step - barW) / 2;
    const on = month === m + 1;
    let level = 0;
    let rects = `<rect x="${x}" y="${y(good)}" width="${barW}" height="${plotH * good}" fill="${GOOD_COLOR}"/>`;
    level = good;
    Object.entries(lost)
      .filter(([, share]) => share > 0)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, share]) => {
        rects += `<rect x="${x}" y="${y(level + share)}" width="${barW}" height="${plotH * share}" fill="${FACTOR_COLORS[key]}" opacity="0.85"/>`;
        level += share;
      });
    svg +=
      `<g class="col" data-month="${m + 1}">` +
      `<rect x="${left + m * step}" y="0" width="${step}" height="${height}" fill="${on ? 'rgba(255,255,255,0.07)' : 'transparent'}"/>` +
      rects +
      `<text x="${left + m * step + step / 2}" y="${height - 7}" text-anchor="middle" class="${on ? 'on' : ''}">${step < 30 ? MONTHS[m][0] : MONTHS[m]}</text></g>`;
  });
  // The other activity as a line, so the two compare at a glance.
  const points = data[other].months
    .map(({good}, m) => `${left + m * step + step / 2},${y(good)}`)
    .join(' ');
  svg +=
    `<polyline points="${points}" fill="none" stroke="white" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.8" pointer-events="none"/>` +
    data[other].months
      .map(
        ({good}, m) =>
          `<circle cx="${left + m * step + step / 2}" cy="${y(good)}" r="2.5" fill="white" pointer-events="none"/>`,
      )
      .join('');

  const used = meta.factors.filter((key) =>
    data[activity].months.some(({lost}) => lost[key] >= 0.01),
  );
  const key =
    `<div class="swatches"><span class="swatch"><i style="background:${GOOD_COLOR}"></i>Good+ ${ACTIVITIES[activity].short.toLowerCase()}</span>` +
    used
      .map(
        (k) =>
          `<span class="swatch"><i style="background:${FACTOR_COLORS[k]}"></i>${FACTOR_LABELS[k]}</span>`,
      )
      .join('') +
    `<span class="swatch"><i style="background:none;border:1.5px dashed white;height:0;border-width:1.5px 0 0"></i>Good+ ${ACTIVITIES[other].short.toLowerCase()}</span></div>`;

  return (
    `<div class="summary">${summary}</div>` +
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Share of good hours by month">${svg}</svg>` +
    `<div class="caption">${profileCaption(data)}</div>${key}`
  );
}

// One or two sentences: the month under the pointer or on the map, otherwise
// the best and worst of the year.
function profileCaption(data) {
  const activity = settings.activity;
  const {months} = data[activity];
  const phrase = ACTIVITIES[activity].phrase;
  const focus = hoverMonth ?? (month || null);
  const costs = (lost) =>
    Object.entries(lost)
      .filter(([, share]) => share >= 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(
        ([key, share]) =>
          `${FACTOR_LABELS[key].toLowerCase()} ${percent(share)}`,
      )
      .join(', ');
  if (focus) {
    const {good, lost} = months[focus - 1];
    const lostText = costs(lost);
    return (
      `<b>${MONTH_NAMES[focus - 1]}:</b> ${percent(good)} of waking hours Good or better ${phrase}.` +
      (lostText ? ` <span class="muted">Hours lost to ${lostText}.</span>` : '')
    );
  }
  const order = months
    .map((m, i) => ({...m, i}))
    .sort((a, b) => b.good - a.good);
  const best = order[0];
  const worst = order.at(-1);
  const worstCost = Object.entries(worst.lost).sort((a, b) => b[1] - a[1])[0];
  return (
    `Best ${phrase} in <b>${MONTH_NAMES[best.i]}</b> (${percent(best.good)} of waking hours Good+), ` +
    `worst in <b>${MONTH_NAMES[worst.i]}</b> (${percent(worst.good)})` +
    (worstCost?.[1] > 0
      ? `, mostly from ${FACTOR_LABELS[worstCost[0]].toLowerCase()}.`
      : '.') +
    ` <span class="muted">Tap a month to see it on the map.</span>`
  );
}

// --- Search ------------------------------------------------------------------------

const searchInput = document.querySelector('#search input');
const resultsEl = document.getElementById('results');
let searchTimer;
let searchToken = 0;
let results = [];
let highlighted = 0;

function renderResults(note) {
  if (note) {
    resultsEl.innerHTML = `<li class="note">${escapeHtml(note)}</li>`;
    return;
  }
  resultsEl.innerHTML = results
    .map(
      (r, i) =>
        `<li role="option" data-i="${i}" aria-selected="${i === highlighted}">${escapeHtml(r.name)}<small>${escapeHtml(r.detail)}</small></li>`,
    )
    .join('');
}

function choose(result) {
  searchInput.value = '';
  results = [];
  resultsEl.innerHTML = '';
  searchInput.blur();
  const detail = result.detail.split(',')[0];
  selectPlace(result.lat, result.lon, {
    name: detail ? `${result.name}, ${detail}` : result.name,
    fly: true,
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = searchInput.value;
  const token = ++searchToken;
  if (query.trim().length < 2) {
    results = [];
    resultsEl.innerHTML = '';
    return;
  }
  searchTimer = setTimeout(async () => {
    let found;
    try {
      found = await searchPlaces(query, {count: 10});
    } catch {
      if (token === searchToken)
        renderResults("Search isn't responding. Try again in a moment.");
      return;
    }
    if (token !== searchToken) return;
    results = found.filter((r) => inLower48(r.lat, r.lon)).slice(0, 6);
    highlighted = 0;
    if (results.length) renderResults();
    else
      renderResults(
        found.length
          ? 'Only the Lower 48 is mapped.'
          : `Nothing found for “${query.trim()}”.`,
      );
  }, 250);
});
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!results.length) return;
    highlighted =
      (highlighted + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
      results.length;
    renderResults();
  } else if (event.key === 'Enter' && results[highlighted]) {
    choose(results[highlighted]);
  } else if (event.key === 'Escape') {
    searchInput.value = '';
    resultsEl.innerHTML = '';
  }
});
resultsEl.addEventListener('pointerdown', (event) => {
  const li = event.target.closest('li[data-i]');
  if (!li) return;
  event.preventDefault(); // keep focus until chosen
  choose(results[Number(li.dataset.i)]);
});
searchInput.addEventListener('blur', () =>
  setTimeout(() => (resultsEl.innerHTML = ''), 150),
);

// --- Start -------------------------------------------------------------------------

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    layout();
    draw();
    renderProfile();
  }, 150);
});

layout();
const [startLat, startLon] = (params.get('p') ?? '').split(',').map(Number);
if (
  Number.isFinite(startLat) &&
  Number.isFinite(startLon) &&
  inLower48(startLat, startLon)
) {
  const [gx, gy] = gridProjection([startLon, startLat]);
  Object.assign(zoom, {k: Number(params.get('z')) || 1, x: gx, y: gy});
  clampView();
  selectPlace(startLat, startLon, {scroll: false});
}
update();
