// The only browser module that creates/runs a solver. Small batches let pause
// and reset messages interrupt the search; snapshots are capped at ~30 Hz.
import { PackingSolver } from './solver.js';
import { findLoose } from './freedom.js';

let solver;
let running = false;
let timer = null;
let commandId = 0;
let lastPublish = -Infinity;
let elapsedMs = 0;
// `solver.best` is replaced wholesale whenever a probe succeeds, so identity is
// enough to tell a new best from a republished one and skip the rescan.
let scannedBest = null;
let scannedLoose = null;

function looseInBest() {
  if (!solver.best) return null;
  if (solver.best !== scannedBest) {
    scannedBest = solver.best;
    scannedLoose = findLoose(solver.best.items, solver.best.container,
      { tolerance: solver.config.feasibleTolerance });
  }
  return scannedLoose;
}

function publish() {
  const live = solver.snapshot();
  // Feasibility colouring is calculated in the worker, never in the renderer.
  // `isSettled` compares against the solver's own items, so it is only valid
  // for the live layout; every piece of `best` is feasible by construction.
  live.settled = live.items.map((item) => live.final || solver.isSettled(item, live.container));
  live.loose = findLoose(live.items, live.container,
    { tolerance: solver.config.feasibleTolerance });
  const best = solver.best && { ...solver.best, loose: looseInBest() };
  self.postMessage({
    type: 'state', commandId, running, done: solver.done,
    config: solver.config, seed: solver.seed, elapsedMs,
    attemptIndex: solver.attemptIndex, history: solver.history,
    scale: solver.scale, attemptBestScale: solver.attemptRecord?.scale ?? null,
    temperature: solver.temperatureFraction, efficiency: solver.efficiency,
    best, live, iterations: solver.totalIterations,
    hops: solver.hops, acceptedHops: solver.acceptedHops,
  });
  lastPublish = performance.now();
}

function fail(error) {
  running = false;
  clearTimeout(timer);
  timer = null;
  self.postMessage({ type: 'error', commandId, message: error.message || String(error) });
}

function tick() {
  timer = null;
  if (!running || !solver) return;
  try {
    const start = performance.now();
    do {
      solver.step();
    } while (!solver.done && performance.now() - start < 8);
    elapsedMs += performance.now() - start;
    running = !solver.done;
    if (!running || performance.now() - lastPublish >= 33) publish();
    if (running) timer = setTimeout(tick, 0);
  } catch (error) {
    fail(error);
  }
}

self.onmessage = ({ data }) => {
  clearTimeout(timer);
  timer = null;
  commandId = data.commandId;
  try {
    if (data.type === 'reset') {
      solver = new PackingSolver(data.config);
      scannedBest = null;
      elapsedMs = 0;
      running = Boolean(data.start);
    } else if (data.type === 'play' && solver) {
      running = !solver.done;
    } else if (data.type === 'pause') {
      running = false;
    }
    if (solver) publish();
    if (running) timer = setTimeout(tick, 0);
  } catch (error) {
    fail(error);
  }
};
