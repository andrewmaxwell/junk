// main.js — wire up Sim + Renderer. Export nothing.

import {Renderer} from './Renderer.js';
import {Sim} from './Sim.js';

// ---- Build flags / defaults ----
const W = 128; // width
const H = 32; // height
const dt = 0.01; // timestep
const restitution = 0.5;
const friction = 0.5;
const rpm = 4000;
const tilt = 5;

/* ---- Input pattern (replaces fgets) ---- */
const INPUT = String.raw`
..
. 
. 
. 
. 
. 
. 
. 
. 
. 
. 
.
.
.             .
.             .
.             .
.             .
.#.#.#.#.#.#.#
#.#.#.#.#.#.# 
.#.#.#.#.#.
#.#.#.#.`;

// ---------- Run ----------
const renderer = new Renderer(W, H);
const sim = new Sim(INPUT, rpm, tilt);

function frame() {
  sim.stepFrame(dt, restitution, friction); // physics only
  renderer.render(sim); // clear + project + z-buffer + camera + present
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
