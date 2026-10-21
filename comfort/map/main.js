import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {
  geoAlbers,
  geoPath,
} from 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
import {interpolateViridis} from 'https://cdn.jsdelivr.net/npm/d3-scale-chromatic@3.1.0/+esm';
import {color as d3color} from 'https://cdn.jsdelivr.net/npm/d3-color@3.1.0/+esm';
import {
  mesh,
  merge,
} from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import {ACTIVITIES, FACTOR_LABELS} from '../js/comfort.js';
import {fetchLocationName} from '../js/weather.js';

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

const VIEWS = {
  comfort: 'Comfortable hours',
  limiter: 'Limiting factor',
};

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const readout = document.getElementById('readout');
const subtitle = document.getElementById('subtitle');
const legend = document.getElementById('legend');

const [meta, stats, us] = await Promise.all([
  fetch('./data/meta.json').then((r) => r.json()),
  fetch('./data/stats.bin')
    .then((r) => r.arrayBuffer())
    .then((buffer) => new Uint16Array(buffer)),
  fetch(STATES_URL).then((r) => r.json()),
]);

const states = {
  ...us.objects.states,
  geometries: us.objects.states.geometries.filter(
    (state) => !NOT_LOWER_48.has(state.id),
  ),
};
const lower48 = merge(us, states.geometries);
const borders = mesh(us, states, (a, b) => a !== b);

// --- Data --------------------------------------------------------------------

const {cols, rows, step, bounds, months, activities, fields} = meta;
const fieldCount = fields.length;
const factors = fields.slice(3);
const pointCount = meta.cells.length / 2;
const stride = activities.length * months.length * fieldCount;

// Sums each point's per-month counts over the selected months.
function aggregate(point, activityKey, monthIndexes) {
  const a = activities.indexOf(activityKey);
  const totals = new Array(fieldCount).fill(0);
  for (const m of monthIndexes) {
    const base = point * stride + (a * months.length + m) * fieldCount;
    for (let f = 0; f < fieldCount; f++) totals[f] += stats[base + f];
  }
  const [hours, good, scoreSum] = totals;
  if (!hours) return null;
  const lost = totals.slice(3);
  const worst = lost.indexOf(Math.max(...lost));
  return {
    hours,
    good: good / hours,
    mean: scoreSum / hours,
    lost: lost.map((n) => n / hours),
    limiter: lost[worst] ? factors[worst] : null,
  };
}

// The selected view as a dense grid: comfort fraction for interpolation, and
// the limiter index, which is categorical and so only ever read nearest.
function gridFor(activityKey, monthIndexes) {
  const value = new Float32Array(cols * rows).fill(NaN);
  const limiter = new Int8Array(cols * rows).fill(-1);
  const loss = new Float32Array(cols * rows);
  for (let p = 0; p < pointCount; p++) {
    const summary = aggregate(p, activityKey, monthIndexes);
    if (!summary) continue;
    const cell = meta.cells[p * 2] * cols + meta.cells[p * 2 + 1];
    value[cell] = summary.good;
    limiter[cell] = summary.limiter ? factors.indexOf(summary.limiter) : -1;
    loss[cell] = 1 - summary.good;
  }
  return {value, limiter, loss};
}

const pointAt = new Map();
for (let p = 0; p < pointCount; p++)
  pointAt.set(meta.cells[p * 2] * cols + meta.cells[p * 2 + 1], p);

// --- Projection and per-pixel lookup ----------------------------------------

let projection;
let outline; // the Lower 48 as a Path2D, for hit-testing the pointer
let pixelGrid; // fractional grid coordinates of every canvas pixel, or NaN
let width;
let height;

function layout() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth;
  projection = geoAlbers().fitWidth(cssWidth * dpr, lower48);
  const [[, y0], [, y1]] = geoPath(projection).bounds(lower48);
  width = Math.round(cssWidth * dpr);
  height = Math.ceil(y1 + y0);
  canvas.width = width;
  canvas.height = height;
  canvas.style.height = `${height / dpr}px`;
  outline = new Path2D(geoPath(projection)(lower48));

  pixelGrid = new Float32Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 2;
      const lonLat = projection.invert([x + 0.5, y + 0.5]);
      pixelGrid[i] = lonLat ? (lonLat[0] - bounds.west) / step : NaN;
      pixelGrid[i + 1] = lonLat ? (lonLat[1] - bounds.south) / step : NaN;
    }
  }
}

// Bilinear, but over whichever corners have data, so the coast does not fade
// into the missing cells offshore before the clip trims it.
function sample(values, gx, gy) {
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  if (x0 < 0 || y0 < 0 || x0 >= cols - 1 || y0 >= rows - 1) return NaN;
  const fx = gx - x0;
  const fy = gy - y0;
  let total = 0;
  let weight = 0;
  for (const [dx, dy, w] of [
    [0, 0, (1 - fx) * (1 - fy)],
    [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy],
    [1, 1, fx * fy],
  ]) {
    const v = values[(y0 + dy) * cols + x0 + dx];
    if (!Number.isNaN(v)) {
      total += v * w;
      weight += w;
    }
  }
  return weight > 1e-6 ? total / weight : NaN;
}

const nearestCell = (gx, gy) => {
  const col = Math.round(gx);
  const row = Math.round(gy);
  return col < 0 || row < 0 || col >= cols || row >= rows
    ? -1
    : row * cols + col;
};

// --- Colour ----------------------------------------------------------------

const RAMP_STEPS = 256;
const ramp = Array.from({length: RAMP_STEPS}, (_, i) => {
  const c = d3color(interpolateViridis(i / (RAMP_STEPS - 1)));
  return [c.r, c.g, c.b];
});
const factorRgb = factors.map((key) => {
  const c = d3color(FACTOR_COLORS[key]);
  return [c.r, c.g, c.b];
});

// --- Controls ----------------------------------------------------------------

const monthName = (key) =>
  new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

const settings = {
  activity: 'walk',
  view: 'comfort',
  month: 0, // 0 is the whole period, then one per month
  stretch: true,
};

const selectedMonths = () =>
  settings.month === 0 ? months.map((_, i) => i) : [settings.month - 1];

const periodLabel = () => {
  if (settings.month !== 0) return monthName(months[settings.month - 1]);
  const format = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  return `${format(meta.start)} – ${format(meta.end)}`;
};

const gui = new GUI({title: 'Comfort map'});
gui
  .add(settings, 'activity', {Walking: 'walk', 'Sitting in the shade': 'sit'})
  .name('Activity')
  .onChange(render);
gui
  .add(
    settings,
    'view',
    Object.fromEntries(
      Object.entries(VIEWS).map(([key, label]) => [label, key]),
    ),
  )
  .name('View')
  .onChange(render);
const monthControl = gui
  .add(settings, 'month', 0, months.length, 1)
  .name('Month (0 = all)')
  .onChange(render);
if (months.length < 2) monthControl.disable();
gui.add(settings, 'stretch').name('Stretch colours to data').onChange(render);

// --- Rendering ---------------------------------------------------------------

let current;
const raster = document.createElement('canvas');

function render() {
  if (!width || !height) return; // laid out while hidden; the resize redraws
  const grid = gridFor(settings.activity, selectedMonths());
  let low = 0;
  let high = 1;
  if (settings.stretch) {
    const present = grid.value.filter((v) => !Number.isNaN(v));
    low = Math.min(...present);
    high = Math.max(...present);
    if (high - low < 0.05) high = low + 0.05;
  }
  current = {grid, low, high};

  raster.width = width;
  raster.height = height;
  const rctx = raster.getContext('2d');
  const image = rctx.createImageData(width, height);
  const px = image.data;
  for (let i = 0, n = width * height; i < n; i++) {
    const gx = pixelGrid[i * 2];
    if (Number.isNaN(gx)) continue;
    const gy = pixelGrid[i * 2 + 1];
    let rgb;
    let alpha = 255;
    if (settings.view === 'comfort') {
      const v = sample(grid.value, gx, gy);
      if (Number.isNaN(v)) continue;
      const t = Math.min(1, Math.max(0, (v - low) / (high - low)));
      rgb = ramp[Math.round(t * (RAMP_STEPS - 1))];
    } else {
      const cell = nearestCell(gx, gy);
      if (cell < 0 || grid.limiter[cell] < 0) continue;
      rgb = factorRgb[grid.limiter[cell]];
      // Fainter where few hours were lost at all: a place that is Good nine
      // hours in ten should not shout its one complaint.
      alpha = Math.round(255 * (0.25 + 0.75 * sample(grid.loss, gx, gy)));
    }
    px[i * 4] = rgb[0];
    px[i * 4 + 1] = rgb[1];
    px[i * 4 + 2] = rgb[2];
    px[i * 4 + 3] = alpha;
  }
  rctx.putImageData(image, 0, 0);

  const path = geoPath(projection, ctx);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  path(lower48);
  ctx.clip();
  ctx.fillStyle = 'oklch(0.25 0.015 250)';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(raster, 0, 0);
  ctx.restore();

  const dpr = window.devicePixelRatio || 1;
  ctx.lineWidth = 0.6 * dpr;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  path(borders);
  ctx.stroke();
  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.beginPath();
  path(lower48);
  ctx.stroke();

  renderText();
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`;

function renderText() {
  const activity = ACTIVITIES[settings.activity];
  const [start, end] = meta.wakingHours;
  const hours = `${start} AM – ${end - 12} PM`;
  subtitle.textContent =
    settings.view === 'comfort'
      ? `Share of waking hours (${hours} local) scoring Good or better ` +
        `(${meta.goodScore}+) ${activity.phrase}, ${periodLabel()}.`
      : `What most often kept waking hours below Good ${activity.phrase}, ` +
        `${periodLabel()}. Fainter means fewer hours lost.`;

  if (settings.view === 'comfort') {
    const {low, high} = current;
    const stops = Array.from({length: 11}, (_, i) =>
      interpolateViridis(i / 10),
    );
    legend.innerHTML =
      `<div class="ramp" style="background: linear-gradient(to right, ${stops.join(',')})"></div>` +
      `<div class="ticks">${[0, 0.25, 0.5, 0.75, 1]
        .map((t) => `<span>${percent(low + t * (high - low))}</span>`)
        .join('')}</div>`;
  } else {
    const present = new Set(current.grid.limiter);
    legend.innerHTML = `<div class="swatches">${factors
      .filter((key, i) => present.has(i))
      .map(
        (key) =>
          `<span class="swatch"><i style="background:${FACTOR_COLORS[key]}"></i>${FACTOR_LABELS[key]}</span>`,
      )
      .join('')}</div>`;
  }
}

// --- Readout -----------------------------------------------------------------

const placeNames = new Map();
let placeTimer;

function showReadout(event) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = Math.floor((event.clientX - rect.left) * dpr);
  const y = Math.floor((event.clientY - rect.top) * dpr);
  if (x < 0 || y < 0 || x >= width || y >= height) return hideReadout();

  const i = (y * width + x) * 2;
  const point = pointAt.get(nearestCell(pixelGrid[i], pixelGrid[i + 1]));
  if (point === undefined || !ctx.isPointInPath(outline, x, y))
    return hideReadout();

  const lat = bounds.south + meta.cells[point * 2] * step;
  const lon = bounds.west + meta.cells[point * 2 + 1] * step;
  const key = `${lat},${lon}`;
  const monthIndexes = selectedMonths();
  const rowsHtml = activities
    .map((activityKey) => {
      const summary = aggregate(point, activityKey, monthIndexes);
      if (!summary) return '';
      const active = activityKey === settings.activity;
      const why = summary.limiter
        ? `${FACTOR_LABELS[summary.limiter]} ${percent(summary.lost[factors.indexOf(summary.limiter)])}`
        : 'none';
      return (
        `<tr class="${active ? 'active' : 'dim'}"><td>${ACTIVITIES[activityKey].short}</td>` +
        `<td>${percent(summary.good)} Good+</td><td>avg ${Math.round(summary.mean)}</td></tr>` +
        `<tr class="dim"><td colspan="3">Main cost: ${why} of hours</td></tr>`
      );
    })
    .join('');

  readout.innerHTML =
    `<div class="place">${placeNames.get(key) ?? '…'}</div>` +
    `<div class="coords">${lat.toFixed(2)}°, ${lon.toFixed(2)}°</div>` +
    `<table>${rowsHtml}</table>`;
  readout.style.display = 'block';

  // Keep it on the canvas, flipping to the other side of the cursor near an edge.
  const left = event.clientX - rect.left;
  const top = event.clientY - rect.top;
  const flipX = left + readout.offsetWidth + 24 > rect.width;
  const flipY = top + readout.offsetHeight + 24 > rect.height;
  readout.style.left = `${flipX ? left - readout.offsetWidth - 14 : left + 14}px`;
  readout.style.top = `${flipY ? top - readout.offsetHeight - 14 : top + 14}px`;

  if (!placeNames.has(key)) {
    clearTimeout(placeTimer);
    placeTimer = setTimeout(async () => {
      placeNames.set(key, await fetchLocationName(lat, lon));
      showReadout(event);
    }, 350);
  }
}

function hideReadout() {
  readout.style.display = 'none';
}

canvas.addEventListener('pointermove', showReadout);
canvas.addEventListener('pointerdown', showReadout);
canvas.addEventListener('pointerleave', hideReadout);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    layout();
    render();
  }, 200);
});

layout();
render();
