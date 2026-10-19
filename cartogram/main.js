import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import * as geo from 'https://cdn.jsdelivr.net/npm/d3-geo@3/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';
import {interpolateViridis} from 'https://cdn.jsdelivr.net/npm/d3-scale-chromatic@3/+esm';
import {buildMap} from './geometry.js';
import {featureAreas} from './cartogram.js';

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
const statusEl = document.getElementById('status');

const loadJson = (url) => fetch(url).then((r) => r.json());
const [worldTopo, usTopo, worldData, countyData] = await Promise.all([
  loadJson('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'),
  loadJson('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'),
  loadJson('./data/world.json'),
  loadJson('./data/counties.json'),
]);

const stateNames = Object.fromEntries(
  usTopo.objects.states.geometries.map((g) => [g.id, g.properties.name]),
);

const regions = {
  World: () => {
    const geoms = worldTopo.objects.countries.geometries.filter(
      (g) => g.properties.name !== 'Antarctica',
    );
    // The raw projection, so longitudes past 180° land past the right edge.
    const fitted = geo.geoEqualEarth().fitSize([1000, 500], {type: 'Sphere'});
    const k = fitted.scale();
    const [tx, ty] = fitted.translate();
    const rad = Math.PI / 180;
    const projection = ([lon, lat]) => {
      const [x, y] = geo.geoEqualEarthRaw(lon * rad, lat * rad);
      return [tx + k * x, ty - k * y];
    };
    return {
      ...buildMap(worldTopo, geoms, projection, (g) => g.properties.name),
      data: worldData,
      noun: 'country',
    };
  },
  // Albers USA moves Alaska and Hawaii into insets off the lower left.
  'United States': () => {
    const projection = geo
      .geoAlbersUsa()
      .fitSize([1000, 600], topojson.feature(usTopo, usTopo.objects.nation));
    return {
      ...buildMap(
        usTopo,
        usTopo.objects.counties.geometries,
        projection,
        (g) => `${g.properties.name}, ${stateNames[g.id.slice(0, 2)]}`,
      ),
      data: countyData,
      noun: 'county',
    };
  },
};
// Default "skip" thresholds. Tiny urban counties like Manhattan matter a lot
// by population, so the US skips none.
const defaultTiny = {World: 0.01, 'United States': 0};

// Settings, also kept in the URL hash so a map can be shared.
const params = {
  region: 'World',
  metric: 'Median income',
  perPerson: false,
  power: 1,
  morph: 1,
  colors: 'By value',
  labels: true,
  resolution: 512,
  passes: 10,
  tiny: null,
};
const hash = new URLSearchParams(location.hash.slice(1));
for (const key of ['region', 'metric', 'colors'])
  if (hash.has(key)) params[key] = hash.get(key);
if (hash.has('perPerson')) params.perPerson = hash.get('perPerson') === '1';
if (hash.has('power')) params.power = +hash.get('power');
if (hash.has('tiny')) params.tiny = +hash.get('tiny');
if (!regions[params.region]) params.region = 'World';
params.tiny ??= defaultTiny[params.region];

let map; // current region: points, features, data
let base; // original projected points
let target; // cartogram points (or partial progress)
let display; // what's drawn, eased toward the mix of base and target
let weights;
let tiny; // features left at their true size for being so small
let values;
let worker;
let lastHash;
// A pasted or edited link changes the hash without reloading.
addEventListener(
  'hashchange',
  () => location.hash.slice(1) !== lastHash && location.reload(),
);
const cache = new Map();

const fmt = (v) =>
  v === null
    ? 'no data'
    : v >= 1e5
      ? Intl.NumberFormat('en', {
          notation: 'compact',
          maximumSignificantDigits: 3,
        }).format(v)
      : Intl.NumberFormat('en', {maximumSignificantDigits: 3}).format(v);

const metricInfo = () => map.data.metrics.find((m) => m.name === params.metric);

const computeWeights = () => {
  const mi = map.data.metrics.indexOf(metricInfo());
  const pi = map.data.metrics.findIndex((m) => m.key === 'population');
  const usePop = params.perPerson && mi !== pi;
  values = map.features.map((f) => map.data.values[f.id]?.[mi] ?? null);
  const raw = map.features.map((f, i) => {
    const pop = map.data.values[f.id]?.[pi];
    if (values[i] === null || (usePop && !pop)) return null;
    return Math.max(0, (usePop ? values[i] * pop : values[i]) ** params.power);
  });
  // Features without data, or too tiny to bother with, keep their true size
  // relative to the rest.
  const areas = featureAreas(
    base,
    map.features.map((f) => f.polys),
  );
  const totalArea = areas.reduce((a, b) => a + b, 0);
  tiny = areas.map((a) => a / totalArea < params.tiny / 100);
  raw.forEach((w, i) => {
    if (tiny[i]) raw[i] = null;
  });
  let sumW = 0;
  let sumA = 0;
  raw.forEach((w, i) => {
    if (w === null) return;
    sumW += w;
    sumA += areas[i];
  });
  const floor = Math.max(...raw) * 1e-3;
  weights = raw.map((w, i) => Math.max(floor, w ?? (areas[i] * sumW) / sumA));
};

const setStatus = (text) => (statusEl.textContent = text);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const run = () => {
  computeWeights();
  location.hash = lastHash = new URLSearchParams({
    region: params.region,
    metric: params.metric,
    perPerson: params.perPerson ? 1 : 0,
    power: params.power,
    tiny: params.tiny,
    colors: params.colors,
  }).toString();
  updateHeader();
  const key = [
    params.region,
    params.metric,
    params.perPerson,
    params.power,
    params.tiny,
    params.resolution,
    params.passes,
  ].join('|');
  worker?.terminate();
  worker = null;
  if (cache.has(key)) {
    target = cache.get(key).points;
    setStatus(
      `${pct(cache.get(key).error.misplaced)} of the area is misplaced`,
    );
    return;
  }
  const start = performance.now();
  setStatus('Stretching…');
  worker = new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = ({data}) => {
    target = data.points;
    const err = `${pct(data.error.misplaced)} of the area is misplaced`;
    if (data.type === 'progress') {
      setStatus(
        `Stretching… pass ${data.pass + 1} of up to ${params.passes}, ${err}`,
      );
    } else {
      cache.set(key, data);
      setStatus(
        `Done in ${((performance.now() - start) / 1000).toFixed(1)}s, ${err}`,
      );
      worker = null;
    }
  };
  worker.postMessage({
    points: base,
    features: map.features.map((f) => f.polys),
    weights,
    passes: params.passes,
    res: params.resolution,
  });
};

const loadRegion = () => {
  map = regions[params.region]();
  base = map.points;
  target = base;
  display = Float64Array.from(base);
  const names = map.data.metrics.map((m) => m.name);
  if (!names.includes(params.metric)) params.metric = names[0];
  metricCtrl.options(names);
  metricCtrl.updateDisplay();
};

// Header: title, subtitle, and color legend.
const updateHeader = () => {
  const m = metricInfo();
  const label =
    params.perPerson && m.key !== 'population'
      ? `${m.name} × population`
      : m.name;
  // Lowercase for mid-sentence use, but leave acronyms like GDP alone.
  const what = label.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase());
  const power = params.power === 1 ? '' : ` ^ ${params.power}`;
  document.getElementById('title').textContent = `${params.region} by ${what}`;
  document.getElementById('subtitle').textContent =
    `Area of each ${map.noun} ∝ ${what}${power}${m.unit ? ` (${m.unit})` : ''}. Source: ${m.source}`;
  const legend = document.getElementById('legend');
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
  if (params.colors !== 'By value' || !sorted.length) {
    legend.innerHTML = '';
    return;
  }
  const stops = Array.from({length: 11}, (_, i) =>
    interpolateViridis(i / 10),
  ).join(',');
  legend.innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="ends"><span>${fmt(sorted[0])}</span><span>median ${fmt(sorted[sorted.length >> 1])}</span><span>${fmt(sorted[sorted.length - 1])}</span></div>`;
};

// Colors by rank, so a few outliers don't wash out everyone else.
const fillColors = () => {
  const css = getComputedStyle(document.documentElement);
  const missing = css.getPropertyValue('--missing');
  if (params.colors === 'Map colors') {
    const hues = [
      '#e8c07d',
      '#9fc490',
      '#e59d8b',
      '#a7b8de',
      '#d5a6c8',
      '#c6c27c',
    ];
    return map.features.map((f, i) =>
      values[i] === null ? missing : hues[f.hue],
    );
  }
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
  const rank = (v) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / Math.max(1, sorted.length - 1);
  };
  return values.map((v) =>
    v === null ? missing : interpolateViridis(rank(v)),
  );
};

// Rendering
let paths = [];
let hovered = -1;
let dirty = true;
let anim = null;
let view = {s: 1, ox: 0, oy: 0};

const resize = () => {
  const dpr = devicePixelRatio;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  dirty = true;
};
addEventListener('resize', resize);
resize();

const ringCentroid = (r) => {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
    const x0 = display[r[j] * 2];
    const y0 = display[r[j] * 2 + 1];
    const x1 = display[r[k] * 2];
    const y1 = display[r[k] * 2 + 1];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return {a: Math.abs(a / 2), x: cx / (3 * a), y: cy / (3 * a)};
};

const draw = () => {
  const dpr = devicePixelRatio;
  const W = innerWidth;
  const H = innerHeight;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let p = 0; p < display.length; p += 2) {
    x0 = Math.min(x0, display[p]);
    x1 = Math.max(x1, display[p]);
    y0 = Math.min(y0, display[p + 1]);
    y1 = Math.max(y1, display[p + 1]);
  }
  const top = W < 600 ? 20 : 110;
  const s = Math.min((W - 40) / (x1 - x0), (H - top - 50) / (y1 - y0));
  view = {
    s,
    ox: (W - s * (x1 + x0)) / 2,
    oy: top + (H - top - 30 - s * (y1 - y0)) / 2 - s * y0,
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const colors = fillColors();
  paths = map.features.map((f) => {
    const path = new Path2D();
    for (const r of f.polys.flat()) {
      for (let k = 0; k < r.length; k++) {
        const x = display[r[k] * 2] * s + view.ox;
        const y = display[r[k] * 2 + 1] * s + view.oy;
        if (k) path.lineTo(x, y);
        else path.moveTo(x, y);
      }
      path.closePath();
    }
    return path;
  });
  ctx.lineJoin = 'round';
  ctx.strokeStyle = css.getPropertyValue('--border');
  ctx.lineWidth = map.features.length > 1000 ? 0.3 : 0.7;
  paths.forEach((path, i) => {
    ctx.fillStyle = colors[i];
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  });
  if (hovered >= 0) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = css.getPropertyValue('--text');
    ctx.stroke(paths[hovered]);
  }

  if (params.labels) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = css.getPropertyValue('--bg');
    ctx.fillStyle = css.getPropertyValue('--text');
    map.features.forEach((f) => {
      let best = {a: 0};
      for (const rings of f.polys) {
        const c = ringCentroid(rings[0]);
        if (c.a > best.a) best = c;
      }
      const side = Math.sqrt(best.a) * s;
      const name = f.name.split(',')[0];
      const size = Math.min(
        15,
        side * 0.3,
        (side * 1.1) / (0.55 * name.length),
      );
      if (size < 8) return;
      ctx.font = `${size.toFixed(1)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      const x = best.x * s + view.ox;
      const y = best.y * s + view.oy;
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    });
  }
};

const frame = () => {
  requestAnimationFrame(frame);
  if (anim) {
    params.morph = Math.max(0, Math.min(1, params.morph + anim * 0.015));
    if (params.morph === 0 || params.morph === 1) anim = null;
    morphCtrl.updateDisplay();
  }
  // Ease toward the target so progress updates and morphs look like rubber.
  let moved = 0;
  const m = params.morph;
  if (target.length === display.length) {
    for (let p = 0; p < display.length; p++) {
      const goal = base[p] + (target[p] - base[p]) * m;
      const d = (goal - display[p]) * 0.25;
      display[p] += d;
      moved = Math.max(moved, Math.abs(d));
    }
  }
  if (moved > 0.01 || dirty) {
    dirty = false;
    draw();
  }
};

canvas.addEventListener('pointermove', (e) => {
  const dpr = devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const i = paths.findIndex((p) =>
    ctx.isPointInPath(p, e.clientX * dpr, e.clientY * dpr, 'evenodd'),
  );
  if (i !== hovered) {
    hovered = i;
    dirty = true;
  }
  if (i < 0) {
    tip.style.display = 'none';
    return;
  }
  const f = map.features[i];
  const areas = featureAreas(
    display,
    map.features.map((g) => g.polys),
  );
  const total = areas.reduce((a, b) => a + b, 0);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const m = metricInfo();
  tip.innerHTML = `<b></b>${fmt(values[i])} ${values[i] === null ? '' : m.unit}<br>
    <span>${
      tiny[i]
        ? 'Too small to resize'
        : `${pct(areas[i] / total)} of the map (target ${pct(weights[i] / totalW)})`
    }</span>`;
  tip.querySelector('b').textContent = f.name;
  tip.style.display = 'block';
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${e.clientY + 14}px`;
});
canvas.addEventListener('pointerleave', () => {
  hovered = -1;
  tip.style.display = 'none';
  dirty = true;
});
matchMedia('(prefers-color-scheme: dark)').addEventListener(
  'change',
  () => (dirty = true),
);

// Controls
const gui = new GUI({title: 'Stretchy Maps'});
gui
  .add(params, 'region', Object.keys(regions))
  .name('Map')
  .onChange(() => {
    params.tiny = defaultTiny[params.region];
    tinyCtrl.updateDisplay();
    loadRegion();
    run();
  });
const metricCtrl = gui
  .add(params, 'metric', [])
  .name('Metric')
  .onFinishChange(run);
gui.add(params, 'perPerson').name('× population').onChange(run);
gui.add(params, 'power', 0, 2, 0.05).name('Area ∝ value ^').onFinishChange(run);
const tinyCtrl = gui
  .add(params, 'tiny', 0, 0.2, 0.001)
  .name('Skip under % of map')
  .onFinishChange(run);
const morphCtrl = gui
  .add(params, 'morph', 0, 1, 0.01)
  .name('Stretch')
  .onChange(() => (anim = null));
gui
  .add({play: () => (anim = params.morph > 0.5 ? -1 : 1)}, 'play')
  .name('Animate stretch');
gui
  .add(params, 'colors', ['By value', 'Map colors'])
  .name('Colors')
  .onChange(() => {
    updateHeader();
    dirty = true;
  });
gui
  .add(params, 'labels')
  .name('Labels')
  .onChange(() => (dirty = true));
const adv = gui.addFolder('Accuracy').close();
adv.add(params, 'resolution', [256, 512, 1024]).name('Grid size').onChange(run);
adv.add(params, 'passes', 1, 20, 1).name('Max passes').onFinishChange(run);
if (innerWidth < 600) gui.close();

loadRegion();
run();
frame();
