import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {
  geoConicConformal,
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

const [meta, us] = await Promise.all([
  fetch('./data/meta.json').then((r) => r.json()),
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

// --- Data ------------------------------------------------------------------------

// Each image decoded to raw RGBA, exactly as written: no colour management and
// no premultiplication, since these are numbers rather than colours.
const images = new Map();
function loadImage(period, activity) {
  const key = `${period}-${activity}`;
  if (!images.has(key)) {
    images.set(
      key,
      fetch(`./data/${key}.png`)
        .then((r) => r.blob())
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
        }),
    );
  }
  return images.get(key);
}

// What a pixel says, or null where there is no data.
function readPixel(data, cell) {
  const p = cell * 4;
  if (data[p] === encoding.noData && data[p + 1] === encoding.noData)
    return null;
  return {
    good: data[p] / encoding.goodScale,
    mean: data[p + 1],
    limiter:
      data[p + 2] === encoding.noFactor ? null : meta.factors[data[p + 2]],
  };
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

// --- Controls --------------------------------------------------------------------

const months = meta.periods.filter((p) => p !== 'all');
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

const selectedPeriod = () =>
  settings.month === 0 ? 'all' : months[settings.month - 1];

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

// --- Rendering -------------------------------------------------------------------

let scale; // canvas pixels per grid cell
let current; // what is on screen, for the readout
const raster = new OffscreenCanvas(nx, ny);
const rasterCtx = raster.getContext('2d');

function layout() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth;
  scale = (cssWidth * dpr) / (cropX1 - cropX0);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.ceil((cropY1 - cropY0) * scale);
  canvas.style.height = `${canvas.height / dpr}px`;
}

// Canvas pixels to grid coordinates and back go through one transform.
const toGrid = () =>
  ctx.setTransform(scale, 0, 0, scale, -cropX0 * scale, -cropY0 * scale);

let renderToken = 0;
async function render() {
  if (!canvas.width || !canvas.height) return; // laid out while hidden
  const token = ++renderToken;
  const period = selectedPeriod();
  const [data, ...both] = await Promise.all([
    loadImage(period, settings.activity),
    ...meta.activities.map((a) => loadImage(period, a)),
  ]);
  if (token !== renderToken) return; // a newer render has started

  let low = 0;
  let high = encoding.goodScale;
  if (settings.stretch) {
    low = Infinity;
    high = -Infinity;
    for (let p = 0; p < data.length; p += 4) {
      if (data[p] === encoding.noData) continue;
      low = Math.min(low, data[p]);
      high = Math.max(high, data[p]);
    }
    if (high - low < 10) high = low + 10;
  }
  current = {
    byActivity: Object.fromEntries(meta.activities.map((a, i) => [a, both[i]])),
    low: low / encoding.goodScale,
    high: high / encoding.goodScale,
  };

  const image = rasterCtx.createImageData(nx, ny);
  const px = image.data;
  const present = new Set();
  for (let p = 0; p < data.length; p += 4) {
    if (data[p] === encoding.noData && data[p + 1] === encoding.noData)
      continue;
    let rgb;
    let alpha = 255;
    if (settings.view === 'comfort') {
      const t = Math.min(1, Math.max(0, (data[p] - low) / (high - low)));
      rgb = ramp[Math.round(t * (RAMP_STEPS - 1))];
    } else {
      if (data[p + 2] === encoding.noFactor) continue;
      rgb = factorRgb[data[p + 2]];
      present.add(data[p + 2]);
      // Fainter where few hours were lost at all: a place that is Good nine
      // hours in ten should not shout its one complaint.
      alpha = Math.round(
        255 * (0.25 + 0.75 * (1 - data[p] / encoding.goodScale)),
      );
    }
    px[p] = rgb[0];
    px[p + 1] = rgb[1];
    px[p + 2] = rgb[2];
    px[p + 3] = alpha;
  }
  rasterCtx.putImageData(image, 0, 0);
  current.present = present;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  toGrid();
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = 'oklch(0.25 0.015 250)';
  ctx.fillRect(cropX0, cropY0, cropX1 - cropX0, cropY1 - cropY0);
  // Smooth when enlarging a continuous field; a categorical one must not blend
  // two factors' colours into a third that means neither.
  ctx.imageSmoothingEnabled = settings.view === 'comfort';
  ctx.drawImage(raster, 0, 0);
  ctx.restore();

  const dpr = window.devicePixelRatio || 1;
  ctx.lineWidth = (0.6 * dpr) / scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke(borderPath);
  ctx.lineWidth = (1 * dpr) / scale;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.stroke(outline);

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
    legend.innerHTML = `<div class="swatches">${meta.factors
      .filter((key, i) => current.present.has(i))
      .map(
        (key) =>
          `<span class="swatch"><i style="background:${FACTOR_COLORS[key]}"></i>${FACTOR_LABELS[key]}</span>`,
      )
      .join('')}</div>`;
  }
}

// --- Readout -----------------------------------------------------------------------

const placeNames = new Map();
let placeTimer;

function showReadout(event) {
  if (!current) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const x = (event.clientX - rect.left) * dpr;
  const y = (event.clientY - rect.top) * dpr;
  toGrid();
  if (!ctx.isPointInPath(outline, x, y)) return hideReadout();

  const gx = Math.floor(x / scale + cropX0);
  const gy = Math.floor(y / scale + cropY0);
  if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) return hideReadout();
  const cell = gy * nx + gx;
  const [lon, lat] = gridProjection.invert([gx + 0.5, gy + 0.5]);

  // Names are looked up for a ~10 km square, not per 3 km cell, so moving the
  // pointer across a town does not fire a request per pixel.
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const rowsHtml = meta.activities
    .map((activityKey) => {
      const summary = readPixel(current.byActivity[activityKey], cell);
      if (!summary) return '';
      const active = activityKey === settings.activity;
      return (
        `<tr class="${active ? 'active' : 'dim'}"><td>${ACTIVITIES[activityKey].short}</td>` +
        `<td>${percent(summary.good)} Good+</td><td>avg ${summary.mean}</td></tr>` +
        `<tr class="dim"><td colspan="3">Main cost: ${summary.limiter ? FACTOR_LABELS[summary.limiter] : 'none'}</td></tr>`
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
