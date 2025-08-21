// main.js — wires up Sim + Renderer + UI; exports nothing.

import {Renderer} from './Renderer.js';
import {Sim} from './Sim.js';
import {examples} from './examples.js';

// ---- Screen & physics constants ----
const W = 120; // screen width (columns)
const H = 24; // screen height (rows)
const dt = 0.01; // timestep
const restitution = 0.5;
const friction = 0.5;

// ---------- DOM refs ----------
const preEl = /** @type {HTMLPreElement}     */ (
  document.getElementById('output')
);
const shapeEl = /** @type {HTMLTextAreaElement}*/ (
  document.getElementById('shapeInput')
);
const rpmEl = /** @type {HTMLInputElement}   */ (
  document.getElementById('rpmInput')
);
const tiltEl = /** @type {HTMLInputElement}   */ (
  document.getElementById('tiltInput')
);
const goEl = /** @type {HTMLButtonElement}  */ (
  document.getElementById('goBtn')
);
const selEl = /** @type {HTMLSelectElement}  */ (
  document.getElementById('exampleSelect')
);

// Populate examples <select> (labels only)
selEl.innerHTML = '';
for (const ex of examples) {
  const opt = document.createElement('option');
  opt.value = ex.label;
  opt.textContent = ex.label;
  selEl.appendChild(opt);
}

// Renderer & Sim (initialized from default example)
const renderer = new Renderer(W, H, preEl);
let sim;

// Build & run the current shape
function runSim() {
  const rpm = parseFloat(rpmEl.value);
  const tilt = parseFloat(tiltEl.value);
  const shape = shapeEl.value;
  sim = new Sim(
    shape,
    Number.isFinite(rpm) ? rpm : 4000,
    Number.isFinite(tilt) ? tilt : 5,
  );
  renderer.cam = 0; // recenter camera smoothly
}

// Helper: load example into controls & (optionally) run immediately
function applyExample(ex) {
  shapeEl.value = ex.text;
  rpmEl.value = String(ex.rpm);
  tiltEl.value = String(ex.tilt);
  runSim();
}

// Selecting an example populates and RUNS it immediately
selEl.addEventListener('change', () => {
  const ex = examples.find((e) => e.label === selEl.value);
  if (ex) applyExample(ex);
});

// Go! button: rebuild sim from the current editor content
goEl.addEventListener('click', runSim);

// Use Tippe Top 2 by default and run it immediately
const ex = examples.find((e) => e.label === 'Tippe Top 2') || examples[0];
selEl.value = ex.label;
applyExample(ex);

// Animation loop
function frame() {
  sim.stepFrame(dt, restitution, friction); // physics only
  renderer.render(sim); // draw
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
