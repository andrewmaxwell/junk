// DOM/rendering only. Search state arrives from a pool of module workers.
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {ITEM_SHAPES, CONTAINER_SHAPES} from './shapes.js';
import {Renderer} from './render.js';
import {SearchPool, poolSize} from './pool.js';
import {LIMITS, readParams, writeParams} from './params.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(
  [
    'statAttempt',
    'statTemp',
    'statScale',
    'statAttemptBest',
    'statGlobalBest',
    'statEff',
    'logList',
    'bestEmpty',
    'bestCaption',
    'status',
    'runInfo',
    'liveTitle',
  ].map((id) => [id, $(id)]),
);

const stages = document.querySelectorAll('.stage');

// Restarts per worker. A dozen is plenty in practice, and nobody wants to tune it.
const ATTEMPTS = 12;

// The controls edit this object directly; it is also what the URL records.
const settings = readParams(location.search);

const gui = new GUI({title: 'Packing Explorer'});
if (innerWidth < 600) gui.close();
// lil-gui takes options as {label: value}.
const choices = (table) =>
  Object.fromEntries(
    Object.entries(table).map(([key, shape]) => [shape.name, key]),
  );
gui
  .add(settings, 'containerShape', choices(CONTAINER_SHAPES))
  .name('container')
  .onChange(() => restart());
const aspectCtrl = gui
  .add(settings, 'aspect', LIMITS.aspect.min, LIMITS.aspect.max, 0.1)
  .name('aspect (w:h)')
  .onFinishChange(() => restart());
gui
  .add(settings, 'itemShape', choices(ITEM_SHAPES))
  .name('item')
  .onChange(() => restart());
gui
  .add(settings, 'count', LIMITS.count.min, LIMITS.count.max, 1)
  .name('shapes')
  .onFinishChange(() => restart());
const actions = {toggle, reset: () => restart()};
const playCtrl = gui.add(actions, 'toggle');
gui.add(actions, 'reset').name('reset');

// Only the parts that depend on the container; the GUI shows its own values.
function syncControls() {
  const container = CONTAINER_SHAPES[settings.containerShape];
  aspectCtrl.show(Boolean(container.usesAspect));
  // The sphere draws as a 2:1 map; every other container is framed square.
  for (const stage of stages)
    stage.classList.toggle('map', container.space === 'sphere');
}

const renderer = new Renderer($('cvs'));
const bestRenderer = new Renderer($('bestCvs'));
let state = null;
let running = false;
let frameId = null;
let errorMessage = '';

function queueRedraw() {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => {
    frameId = null;
    redraw();
  });
}

const pool = new SearchPool({
  size: poolSize(navigator.hardwareConcurrency),
  createWorker: () =>
    new Worker(new URL('./worker.js', import.meta.url), {type: 'module'}),
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

const fmt = (value) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(3);
function redraw() {
  renderer.resize();
  bestRenderer.resize();
  renderer.draw(state?.live);
  bestRenderer.draw(state?.best);
  els.bestEmpty.hidden = Boolean(state?.best);
  els.bestCaption.textContent = state?.best
    ? `Scale ${fmt(state.best.scale)} · ${(state.efficiency * 100).toFixed(1)}% filled · ${describeLoose(state.best.loose)}`
    : 'Waiting for a feasible arrangement.';
  els.liveTitle.textContent =
    state?.done && state.best
      ? 'Search complete · best packing'
      : state?.workers > 1
        ? `Current search · worker ${state.watched + 1} of ${state.workers}`
        : 'Current search';
  els.statAttempt.textContent = state
    ? `${state.attemptsDone} / ${state.attemptsTotal}`
    : '—';
  els.statTemp.textContent =
    state && !state.done ? `${Math.round(state.temperature * 100)}%` : '—';
  els.statScale.textContent = state && !state.done ? fmt(state.scale) : '—';
  els.statAttemptBest.textContent = fmt(state?.attemptBestScale);
  els.statGlobalBest.textContent = fmt(state?.best?.scale);
  els.statEff.textContent =
    state?.efficiency != null ? `${(state.efficiency * 100).toFixed(1)}%` : '—';
  setPlayControl(
    state?.done ? 'run again' : running ? 'pause' : 'resume',
    !state || Boolean(errorMessage),
  );
  els.status.textContent =
    errorMessage ||
    (!state
      ? 'Preparing the search…'
      : state.done
        ? state.best
          ? 'Search finished. Try another run to explore different arrangements.'
          : 'No feasible packing found. Try another run.'
        : running
          ? 'Trying smaller containers and new arrangements…'
          : 'Search paused.');
  els.runInfo.textContent = state
    ? `Seed ${state.seed} · ${state.workers} worker${state.workers === 1 ? '' : 's'} · ${(state.elapsedMs / 1000).toFixed(2)} s CPU · ${state.iterations.toLocaleString()} iterations · ${state.acceptedHops}/${state.hops} hops accepted`
    : '';
  renderLog(state?.history || [], state?.workers ?? 1);
}

// Rattlers are the interesting case, so say so plainly rather than printing a
// zero that reads like a missing value.
function describeLoose(loose) {
  if (!loose) return 'wedge unknown';
  const n = loose.filter(Boolean).length;
  return n === 0
    ? 'every piece wedged in'
    : `${n} piece${n === 1 ? '' : 's'} still loose`;
}

function renderLog(history, workers) {
  if (els.logList.childElementCount === history.length) return;
  let bestIndex = -1;
  let bestScale = Infinity;
  history.forEach((h, i) => {
    if (h.scale != null && h.scale < bestScale) {
      bestScale = h.scale;
      bestIndex = i;
    }
  });
  els.logList.replaceChildren(
    ...history.map((h, i) => {
      const li = document.createElement('li');
      const phase = h.polish ? 'Final polish' : `Attempt ${h.attempt}`;
      const who = workers > 1 ? `Worker ${h.worker + 1} · ` : '';
      li.textContent = `${who}${phase}:${h.scale == null ? 'no feasible packing found' : `scale ${h.scale.toFixed(3)}`}`;
      if (i === bestIndex) li.className = 'best';
      return li;
    }),
  );
}

// Renaming a lil-gui controller rewrites its DOM, so only do it on a change.
let playLabel = null;
let playDisabled = null;
function setPlayControl(label, disabled) {
  if (label !== playLabel) playCtrl.name((playLabel = label));
  if (disabled !== playDisabled) playCtrl.disable((playDisabled = disabled));
}

// Every parameter change starts a fresh run immediately; there is nothing to
// look at until the search has run anyway.
function restart() {
  syncControls();
  history.replaceState(null, '', location.pathname + writeParams(settings));
  errorMessage = '';
  state = null;
  running = true;
  els.logList.replaceChildren();
  try {
    pool.reset({...settings, attempts: ATTEMPTS});
  } catch (error) {
    fail(error.message);
  }
  queueRedraw();
}

function toggle() {
  if (state?.done) {
    restart();
    return;
  }
  running = !running;
  if (running) pool.play();
  else pool.pause();
  queueRedraw();
}

window.addEventListener('resize', queueRedraw);
window.addEventListener('pagehide', () => pool.terminate());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) restart();
});
restart();
