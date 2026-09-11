// DOM/rendering only. Search state arrives from a dedicated module worker.
import { ITEM_SHAPES, CONTAINER_SHAPES } from './shapes.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'itemShape', 'containerShape', 'aspectField', 'aspect', 'aspectVal', 'nItems',
  'nDec', 'nInc', 'playBtn', 'resetBtn',
  'statAttempt', 'statTemp', 'statScale', 'statAttemptBest', 'statGlobalBest',
  'statEff', 'logList', 'bestEmpty', 'bestCaption', 'status', 'runInfo', 'liveTitle',
].map((id) => [id, $(id)]));

// One restart is worth a dozen tries in practice, and nobody wants to tune it.
const ATTEMPTS = 12;
const COUNT_MIN = Number(els.nItems.min);
const COUNT_MAX = Number(els.nItems.max);

for (const [select, table] of [[els.itemShape, ITEM_SHAPES], [els.containerShape, CONTAINER_SHAPES]]) {
  for (const [key, shape] of Object.entries(table)) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = shape.name;
    select.appendChild(option);
  }
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
  els.nItems.value = String(config.count);
  els.nDec.disabled = config.count <= COUNT_MIN;
  els.nInc.disabled = config.count >= COUNT_MAX;
}
syncControls();

const renderer = new Renderer($('cvs'));
const bestRenderer = new Renderer($('bestCvs'));
let worker;
let state = null;
let running = false;
let commandId = 0;
let frameId = null;
let errorMessage = '';

function queueRedraw() {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => { frameId = null; redraw(); });
}

function createWorker() {
  worker?.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    // Ignore snapshots queued before the most recent reset/pause/play command.
    if (data.commandId !== commandId) return;
    if (data.type === 'error') { fail(data.message); return; }
    state = data;
    running = data.running;
    queueRedraw();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail('The search worker could not run. Serve this folder over HTTP and press Reset to retry.');
  };
  worker.onmessageerror = () => fail('The search update could not be read. Press Reset to retry.');
}

function fail(message) {
  errorMessage = message;
  running = false;
  worker?.terminate();
  worker = null;
  queueRedraw();
}

function send(type, extra = {}) {
  commandId++;
  worker.postMessage({ type, commandId, ...extra });
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
  els.liveTitle.textContent = state?.done && state.best ? 'Search complete · best packing' : 'Current search';
  els.statAttempt.textContent = state ? `${Math.min(state.attemptIndex + (state.done ? 0 : 1), config.attempts)} / ${config.attempts}` : '—';
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
  els.runInfo.textContent = state ? `Seed ${state.seed} · ${(state.elapsedMs / 1000).toFixed(2)} s computing · ${state.iterations.toLocaleString()} iterations · ${state.acceptedHops}/${state.hops} hops accepted` : '';
  renderLog(state?.history || []);
}

// Rattlers are the interesting case, so say so plainly rather than printing a
// zero that reads like a missing value.
function describeLoose(loose) {
  const n = loose ? loose.filter(Boolean).length : 0;
  if (!loose) return 'wedge unknown';
  return n === 0 ? 'every piece wedged in' : `${n} piece${n === 1 ? '' : 's'} still loose`;
}

function renderLog(history) {
  if (els.logList.childElementCount === history.length) return;
  let bestIndex = -1;
  let bestScale = Infinity;
  history.forEach((h, i) => {
    if (h.scale != null && h.scale < bestScale) { bestScale = h.scale; bestIndex = i; }
  });
  els.logList.replaceChildren(...history.map((h, i) => {
    const li = document.createElement('li');
    const phase = h.polish ? 'Final polish' : `Attempt ${h.attempt}`;
    li.textContent = `${phase}: ${h.scale == null ? 'no feasible packing found' : `scale ${h.scale.toFixed(3)}`}`;
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
  const start = true;
  errorMessage = '';
  state = null;
  running = start;
  els.logList.replaceChildren();
  try {
    if (!worker) createWorker();
    send('reset', { config, start });
  } catch (error) { fail(error.message); }
  queueRedraw();
}

els.playBtn.addEventListener('click', () => {
  if (state?.done) { restart(); return; }
  running = !running;
  send(running ? 'play' : 'pause');
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
window.addEventListener('pagehide', () => { worker?.terminate(); worker = null; });
window.addEventListener('pageshow', (event) => { if (event.persisted) restart(); });
restart();
