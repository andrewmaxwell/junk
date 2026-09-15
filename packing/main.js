// DOM/rendering only. Search state arrives from a pool of module workers.
import { ITEM_SHAPES, CONTAINER_SHAPES } from './shapes.js';
import { Renderer } from './render.js';
import { SearchPool, poolSize } from './pool.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'itemShape', 'containerShape', 'aspectField', 'aspect', 'aspectVal', 'nItems',
  'nDec', 'nInc', 'playBtn', 'resetBtn',
  'statAttempt', 'statTemp', 'statScale', 'statAttemptBest', 'statGlobalBest',
  'statEff', 'logList', 'bestEmpty', 'bestCaption', 'status', 'runInfo', 'liveTitle',
].map((id) => [id, $(id)]));

const stages = document.querySelectorAll('.stage');

// Restarts per worker. A dozen is plenty in practice, and nobody wants to tune it.
const ATTEMPTS = 12;
const COUNT_MIN = Number(els.nItems.min);
const COUNT_MAX = Number(els.nItems.max);

const option = (key, name) => {
  const el = document.createElement('option');
  el.value = key;
  el.textContent = name;
  return el;
};
for (const [select, table] of [[els.containerShape, CONTAINER_SHAPES], [els.itemShape, ITEM_SHAPES]]) {
  select.replaceChildren(...Object.entries(table).map(([key, shape]) => option(key, shape.name)));
}
// The controls live in the URL, so a refresh keeps the run and a link shares it.
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
function readUrl() {
  const params = new URLSearchParams(location.search);
  const pick = (key, table, fallback) => (table[params.get(key)] ? params.get(key) : fallback);
  const number = (key, fallback, lo, hi) => {
    // `Number(null)` is 0, so an absent parameter has to be rejected by hand.
    const value = Number(params.get(key) ?? NaN);
    return Number.isFinite(value) ? clamp(value, lo, hi) : fallback;
  };
  return {
    itemShape: pick('item', ITEM_SHAPES, 'square'),
    containerShape: pick('container', CONTAINER_SHAPES, 'circle'),
    aspect: number('aspect', 1, Number(els.aspect.min), Number(els.aspect.max)),
    count: Math.round(number('n', 12, COUNT_MIN, COUNT_MAX)),
    attempts: ATTEMPTS,
  };
}

function writeUrl() {
  const params = new URLSearchParams({
    container: config.containerShape,
    item: config.itemShape,
    n: String(config.count),
  });
  if (CONTAINER_SHAPES[config.containerShape].usesAspect) params.set('aspect', String(config.aspect));
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

let config = readUrl();

function syncControls() {
  els.itemShape.value = config.itemShape;
  els.containerShape.value = config.containerShape;
  els.aspect.value = String(config.aspect);
  els.aspectVal.textContent = config.aspect.toFixed(1);
  els.aspectField.style.display = CONTAINER_SHAPES[config.containerShape].usesAspect ? 'block' : 'none';
  // The sphere draws as a 2:1 map; every other container is framed square.
  const isMap = CONTAINER_SHAPES[config.containerShape].space === 'sphere';
  for (const stage of stages) stage.classList.toggle('map', isMap);
  els.nItems.value = String(config.count);
  els.nDec.disabled = config.count <= COUNT_MIN;
  els.nInc.disabled = config.count >= COUNT_MAX;
}
syncControls();

const renderer = new Renderer($('cvs'));
const bestRenderer = new Renderer($('bestCvs'));
let state = null;
let running = false;
let frameId = null;
let errorMessage = '';

function queueRedraw() {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => { frameId = null; redraw(); });
}

const pool = new SearchPool({
  size: poolSize(navigator.hardwareConcurrency),
  createWorker: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }),
  onUpdate: (merged) => {
    state = merged;
    running = merged.running;
    queueRedraw();
  },
  onError: fail,
});

function fail(message) {
  errorMessage = message;
  running = false;
  pool.terminate();
  queueRedraw();
}

const fmt = (value) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(3);
function redraw() {
  renderer.resize();
  bestRenderer.resize();
  renderer.draw(state?.live);
  bestRenderer.draw(state?.best);
  els.bestEmpty.hidden = Boolean(state?.best);
  els.bestCaption.textContent = state?.best
    ? `Scale ${fmt(state.best.scale)} · ${(state.efficiency * 100).toFixed(1)}% filled · ${describeLoose(state.best.loose)}`
    : 'Waiting for a feasible arrangement.';
  els.liveTitle.textContent = state?.done && state.best ? 'Search complete · best packing'
    : state?.workers > 1 ? `Current search · worker ${state.watched + 1} of ${state.workers}` : 'Current search';
  els.statAttempt.textContent = state ? `${state.attemptsDone} / ${state.attemptsTotal}` : '—';
  els.statTemp.textContent = state && !state.done ? `${Math.round(state.temperature * 100)}%` : '—';
  els.statScale.textContent = state && !state.done ? fmt(state.scale) : '—';
  els.statAttemptBest.textContent = fmt(state?.attemptBestScale);
  els.statGlobalBest.textContent = fmt(state?.best?.scale);
  els.statEff.textContent = state?.efficiency != null ? `${(state.efficiency * 100).toFixed(1)}%` : '—';
  els.playBtn.disabled = !state || Boolean(errorMessage);
  els.playBtn.textContent = state?.done ? 'Run again' : running ? 'Pause' : 'Resume';
  els.status.textContent = errorMessage || (!state ? 'Preparing the search…' : state.done
    ? state.best ? 'Search finished. Try another run to explore different arrangements.' : 'No feasible packing found. Try another run.'
    : running ? 'Trying smaller containers and new arrangements…' : 'Search paused.');
  els.runInfo.textContent = state ? `Seed ${state.seed} · ${state.workers} worker${state.workers === 1 ? '' : 's'} · ${(state.elapsedMs / 1000).toFixed(2)} s CPU · ${state.iterations.toLocaleString()} iterations · ${state.acceptedHops}/${state.hops} hops accepted` : '';
  renderLog(state?.history || [], state?.workers ?? 1);
}

// Rattlers are the interesting case, so say so plainly rather than printing a
// zero that reads like a missing value.
function describeLoose(loose) {
  if (!loose) return 'wedge unknown';
  const n = loose.filter(Boolean).length;
  return n === 0 ? 'every piece wedged in' : `${n} piece${n === 1 ? '' : 's'} still loose`;
}

function renderLog(history, workers) {
  if (els.logList.childElementCount === history.length) return;
  let bestIndex = -1;
  let bestScale = Infinity;
  history.forEach((h, i) => {
    if (h.scale != null && h.scale < bestScale) { bestScale = h.scale; bestIndex = i; }
  });
  els.logList.replaceChildren(...history.map((h, i) => {
    const li = document.createElement('li');
    const phase = h.polish ? 'Final polish' : `Attempt ${h.attempt}`;
    const who = workers > 1 ? `Worker ${h.worker + 1} · ` : '';
    li.textContent = `${who}${phase}:${h.scale == null ? 'no feasible packing found' : `scale ${h.scale.toFixed(3)}`}`;
    if (i === bestIndex) li.className = 'best';
    return li;
  }));
}

// Every parameter change starts a fresh run immediately; there is nothing to
// look at until the search has run anyway.
function restart(patch = {}) {
  config = { ...config, ...patch };
  syncControls();
  writeUrl();
  errorMessage = '';
  state = null;
  running = true;
  els.logList.replaceChildren();
  try {
    pool.reset(config);
  } catch (error) { fail(error.message); }
  queueRedraw();
}

els.playBtn.addEventListener('click', () => {
  if (state?.done) { restart(); return; }
  running = !running;
  if (running) pool.play();
  else pool.pause();
  queueRedraw();
});
els.resetBtn.addEventListener('click', () => restart());
els.itemShape.addEventListener('change', () => restart({ itemShape: els.itemShape.value }));
els.containerShape.addEventListener('change', () => restart({ containerShape: els.containerShape.value }));

const setCount = (value) => {
  const count = clamp(Math.round(value), COUNT_MIN, COUNT_MAX);
  if (count === config.count) { syncControls(); return; }
  restart({ count });
};
els.nDec.addEventListener('click', () => setCount(config.count - 1));
els.nInc.addEventListener('click', () => setCount(config.count + 1));
els.nItems.addEventListener('change', () => setCount(Number(els.nItems.value)));

els.aspect.addEventListener('input', () => { els.aspectVal.textContent = Number(els.aspect.value).toFixed(1); });
els.aspect.addEventListener('change', () => restart({ aspect: Number(els.aspect.value) }));

window.addEventListener('resize', queueRedraw);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', queueRedraw);
window.addEventListener('pagehide', () => pool.terminate());
window.addEventListener('pageshow', (event) => { if (event.persisted) restart(); });
restart();
