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

const loadJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} loading ${url}`);
  return res.json();
};
let worldTopo, usTopo, worldData, countyData;
try {
  [worldTopo, usTopo, worldData, countyData] = await Promise.all([
    loadJson('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json'),
    loadJson('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json'),
    loadJson('./data/world.json'),
    loadJson('./data/counties.json'),
  ]);
} catch (e) {
  statusEl.textContent = `Couldn't load the map data (${e.message}). Try reloading.`;
  throw e;
}

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
        (g) => {
          // Independent cities share names with counties (St. Louis city and
          // county, Richmond, Fairfax, ...).
          const city =
            ['24', '29', '51'].includes(g.id.slice(0, 2)) &&
            g.id.slice(2) >= '510';
          return `${g.properties.name}${city ? ' (city)' : ''}, ${stateNames[g.id.slice(0, 2)]}`;
        },
      ),
      data: countyData,
      noun: 'county',
    };
  },
};

// Settings, also kept in the URL hash so a map can be shared. Values from a
// link skip the controls' limits, so they're checked here.
const params = {
  region: 'World',
  metric: 'Median income',
  // Area reads as an amount, so rates and averages default to totals.
  perPerson: true,
  power: 1,
  morph: 1,
  colors: 'Size metric',
  labels: true,
  resolution: 512,
};
const ranges = {power: [0, 2]};
// Passes per cartogram, unless it's within 0.5% sooner. More rarely helps; a
// finer grid does.
const passes = 10;
// Besides any metric, colors can follow the size metric or just tell
// neighbors apart.
const colorModes = ['Size metric', 'Map colors'];
const resolutions = [256, 512, 1024];
const hash = new URLSearchParams(location.hash.slice(1));
if (Object.hasOwn(regions, hash.get('region')))
  params.region = hash.get('region');
if (hash.has('metric')) params.metric = hash.get('metric'); // checked in loadRegion
if (hash.has('colors')) params.colors = hash.get('colors'); // checked in loadRegion
if (resolutions.includes(+hash.get('resolution')))
  params.resolution = +hash.get('resolution');
for (const key of ['perPerson', 'labels']) {
  if (hash.has(key)) params[key] = hash.get(key) === '1';
}
for (const [key, [min, max]] of Object.entries(ranges)) {
  const v = parseFloat(hash.get(key));
  if (Number.isFinite(v)) params[key] = Math.min(max, Math.max(min, v));
}

const saveSettings = () => {
  const {region, metric, perPerson, power, colors, labels, resolution} = params;
  const settings = {
    region,
    metric,
    perPerson: +perPerson,
    power,
    colors,
    labels: +labels,
    resolution,
  };
  history.replaceState(null, '', `#${new URLSearchParams(settings)}`);
};
// replaceState doesn't fire this, so it only catches pasted or edited links.
addEventListener('hashchange', () => location.reload());

let map; // current region: points, features, data
let base; // original projected points
let target; // cartogram points (or partial progress)
let display; // what's drawn, eased toward the mix of base and target
let weights;
let baseAreas; // each feature's area on the real map
let values;
let worker;
const cache = new Map();

const fmt = (v) =>
  v >= 1e5
    ? Intl.NumberFormat('en', {
        notation: 'compact',
        maximumSignificantDigits: 3,
      }).format(v)
    : Intl.NumberFormat('en', {maximumSignificantDigits: 3}).format(v);

// "$81,600", "12% of adults 25-44", "83.3 years"
const withUnit = (v, unit) =>
  v === null
    ? 'no data'
    : unit.startsWith('$')
      ? `$${fmt(v)}${unit.slice(1)}`
      : unit.startsWith('%')
        ? `${fmt(v)}${unit}`
        : unit
          ? `${fmt(v)} ${unit}`
          : fmt(v);
const ordinal = (n) => {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n.toLocaleString('en')}${suffix}`;
};
const times = (r) => `${r >= 10 ? Math.round(r) : r.toPrecision(2)}×`;

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
  // Features without data keep their true size relative to the rest.
  const areas = baseAreas;
  let sumW = 0;
  let sumA = 0;
  raw.forEach((w, i) => {
    if (w === null) return;
    sumW += w;
    sumA += areas[i];
  });
  // A region can't shrink to nothing, so a true zero gets a sliver instead.
  // Positive values keep their exact ratios.
  const sliver = Math.max(...raw) * 1e-6;
  weights = raw.map((w, i) =>
    w === null ? (sumA ? (areas[i] * sumW) / sumA : areas[i]) : w || sliver,
  );
};

const setStatus = (text) => (statusEl.textContent = text);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const doneText = ({misplaced, converged, seconds}) => {
  const err = `${pct(misplaced)} of the area is misplaced`;
  return converged
    ? `Done in ${seconds.toFixed(1)}s, ${err}`
    : `Stopped at the ${passes}-pass limit after ${seconds.toFixed(1)}s, ${err}. A bigger grid under Accuracy gets closer.`;
};

const run = () => {
  computeWeights();
  saveSettings();
  updateHeader();
  const key = [
    params.region,
    params.metric,
    params.perPerson,
    params.power,
    params.resolution,
  ].join('|');
  worker?.terminate();
  worker = null;
  // With a cartogram already showing, glide straight to the new one rather
  // than snapping back toward the real map while the passes run: first to a
  // quick coarse preview, then to the end of each full pass, which only get
  // closer.
  const glide = target !== base;
  dirty = true; // new colors right away
  easeRate = glide ? 0.08 : 0.25;
  if (cache.has(key)) {
    target = cache.get(key).points;
    setStatus(doneText(cache.get(key)));
    return;
  }
  const start = performance.now();
  setStatus('Stretching…');
  worker = new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
  });
  worker.onerror = (e) => {
    setStatus(`Stretching failed: ${e.message}`);
    worker = null;
  };
  worker.onmessage = ({data}) => {
    if (!glide || data.type !== 'progress' || data.passDone) {
      target = data.points;
    }
    const err = `${pct(data.misplaced)} of the area is misplaced`;
    if (data.type === 'preview') {
      setStatus('Stretching…');
    } else if (data.type === 'progress') {
      setStatus(`Stretching… pass ${data.pass + 1} of up to ${passes}, ${err}`);
    } else {
      data.seconds = (performance.now() - start) / 1000;
      cache.set(key, data);
      setStatus(doneText(data));
      worker = null;
    }
  };
  worker.postMessage({
    points: base,
    features: map.features.map((f) => f.polys),
    weights,
    passes,
    res: params.resolution,
    preview: glide,
  });
};

const loadRegion = () => {
  map = regions[params.region]();
  base = map.points;
  baseAreas = featureAreas(
    base,
    map.features.map((f) => f.polys),
  );
  target = base;
  display = Float64Array.from(base);
  const names = map.data.metrics.map((m) => m.name);
  if (!names.includes(params.metric)) params.metric = names[0];
  metricCtrl.options(names);
  metricCtrl.updateDisplay();
  if (![...colorModes, ...names].includes(params.colors))
    params.colors = colorModes[0];
  colorsCtrl.options([...colorModes, ...names]);
  colorsCtrl.updateDisplay();
};

// The metric colors show, if any, and each feature's value of it.
const colorMetric = () =>
  params.colors === 'Size metric'
    ? metricInfo()
    : map.data.metrics.find((m) => m.name === params.colors);
const colorValues = () => {
  const mi = map.data.metrics.indexOf(colorMetric());
  return map.features.map((f) => map.data.values[f.id]?.[mi] ?? null);
};

// Header: title, subtitle, and color legend.
const updateHeader = () => {
  const m = metricInfo();
  const total = params.perPerson && m.key !== 'population';
  const label = total ? `${m.name} × population` : m.name;
  // Lowercase for mid-sentence use, but leave acronyms like GDP alone.
  const what = label.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase());
  const power = params.power === 1 ? '' : ` ^ ${params.power}`;
  document.getElementById('title').textContent = `${params.region} by ${what}`;
  document.getElementById('subtitle').textContent =
    `Area of each ${map.noun} ∝ ${what}${power}${m.unit && !total ? ` (${m.unit})` : ''}${
      // Rates of some group (children, adults 25-44) times everyone.
      total ? ', a rough total' : ''
    }. Source: ${m.source}`;
  const legend = document.getElementById('legend');
  const cm = colorMetric();
  const sorted =
    cm &&
    colorValues()
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
  if (!sorted?.length) {
    legend.innerHTML = '';
    return;
  }
  const stops = Array.from({length: 11}, (_, i) =>
    interpolateViridis(i / 10),
  ).join(',');
  legend.innerHTML = `<div class="label"></div>
    <div class="bar" style="background:linear-gradient(90deg,${stops})"></div>
    <div class="ends"><span>${fmt(sorted[0])}</span><span>median ${fmt(sorted[sorted.length >> 1])}</span><span>${fmt(sorted[sorted.length - 1])}</span></div>
    <div class="none"><i></i>no data</div>`;
  legend.querySelector('.label').textContent =
    `Color: ${cm.name}${cm.unit ? ` (${cm.unit})` : ''}, by percentile`;
};

// Colors by rank, so a few outliers don't wash out everyone else.
const fillColors = () => {
  const css = getComputedStyle(document.documentElement);
  const missing = css.getPropertyValue('--missing');
  const vals = colorValues();
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
  const sorted = vals.filter((v) => v !== null).sort((a, b) => a - b);
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
  return vals.map((v) => (v === null ? missing : interpolateViridis(rank(v))));
};

// Rendering
let paths = [];
let hovered = -1;
let dirty = true;
let anim = null;

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
  // Below the header and above the status line, and either beside the
  // settings panel or below it, whichever leaves the map bigger. On phones the
  // panel starts closed and floats over the map.
  const panel = gui.domElement.getBoundingClientRect();
  const top =
    document.querySelector('.head').getBoundingClientRect().bottom + 10;
  const boxes =
    W < 600
      ? [[20, 20, W - 20, H - 40]]
      : [
          [20, top, panel.left - 10, H - 40],
          [20, Math.max(top, panel.bottom + 10), W - 20, H - 40],
        ];
  const [l, t, r, b, s] = boxes
    .map((box) => [
      ...box,
      Math.min((box[2] - box[0]) / (x1 - x0), (box[3] - box[1]) / (y1 - y0)),
    ])
    .reduce((best, box) => (box[4] > best[4] ? box : best));
  const view = {
    s,
    ox: (l + r - s * (x1 + x0)) / 2,
    oy: (t + b - s * (y1 + y0)) / 2,
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

let easedTarget;
let easedMorph;
let settled = false;
let easeRate = 0.25;

const frame = () => {
  requestAnimationFrame(frame);
  if (anim) {
    params.morph = Math.max(0, Math.min(1, params.morph + anim * 0.015));
    if (params.morph === 0 || params.morph === 1) anim = null;
    morphCtrl.updateDisplay();
  }
  // Ease toward the target so progress updates and morphs look like rubber.
  // Once it settles, skip the work until the target or stretch changes.
  const m = params.morph;
  if (target !== easedTarget || m !== easedMorph) {
    easedTarget = target;
    easedMorph = m;
    settled = false;
  }
  let moved = 0;
  if (!settled && target.length === display.length) {
    for (let p = 0; p < display.length; p++) {
      const goal = base[p] + (target[p] - base[p]) * m;
      const d = (goal - display[p]) * easeRate;
      display[p] += d;
      moved = Math.max(moved, Math.abs(d));
    }
    settled = moved < 0.001;
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
  // Sizes relative to the whole map, so "1×" means drawn at its real size.
  const share = (list, j) => list[j] / list.reduce((a, b) => a + b, 0);
  const stretch = share(areas, i) / share(baseAreas, i);
  const aim = share(weights, i) / share(baseAreas, i);
  const sizeLine =
    values[i] === null
      ? 'No data, so drawn at real size'
      : `Drawn ${times(stretch)} its real size${
          Math.abs(stretch / aim - 1) > 0.1 ? ` (aiming for ${times(aim)})` : ''
        }`;
  const line = (metric, vals) => {
    const v = vals[i];
    const rank =
      v === null
        ? ''
        : `, ${ordinal(1 + vals.filter((w) => w > v).length)} highest of ${vals.filter((w) => w !== null).length.toLocaleString('en')}`;
    return `${metric.name}: ${withUnit(v, metric.unit)}<span>${rank}</span>`;
  };
  const m = metricInfo();
  const cm = colorMetric();
  tip.innerHTML = `<b></b>${line(m, values)}${cm && cm !== m ? `<br>${line(cm, colorValues())}` : ''}
    <br><span>${sizeLine}</span>`;
  tip.querySelector('b').textContent = f.name;
  tip.style.display = 'block';
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${x}px`;
  tip.style.top = `${Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8)}px`;
});
canvas.addEventListener('pointerleave', () => {
  hovered = -1;
  tip.style.display = 'none';
  dirty = true;
});

// Controls
const gui = new GUI({title: 'Stretchy Maps'});
gui
  .add(params, 'region', Object.keys(regions))
  .name('Map')
  .onChange(() => {
    loadRegion();
    run();
  });
const metricCtrl = gui
  .add(params, 'metric', [])
  .name('Metric')
  .onFinishChange(run);
gui.add(params, 'perPerson').name('× population').onChange(run);
gui
  .add(params, 'power', ...ranges.power, 0.05)
  .name('Area ∝ value ^')
  .onFinishChange(run);
const morphCtrl = gui
  .add(params, 'morph', 0, 1, 0.01)
  .name('Stretch')
  .onChange(() => (anim = null));
gui
  .add({play: () => (anim = params.morph > 0.5 ? -1 : 1)}, 'play')
  .name('Animate stretch');
const colorsCtrl = gui
  .add(params, 'colors', colorModes)
  .name('Color by')
  .onChange(() => {
    saveSettings();
    updateHeader();
    dirty = true;
  });
gui
  .add(params, 'labels')
  .name('Labels')
  .onChange(() => {
    saveSettings();
    dirty = true;
  });
const adv = gui.addFolder('Accuracy').close();
adv.add(params, 'resolution', resolutions).name('Grid size').onChange(run);
if (innerWidth < 600) gui.close();
// Refit the map once the panel finishes opening or closing.
gui.domElement.addEventListener('transitionend', () => (dirty = true));

loadRegion();
run();
frame();
