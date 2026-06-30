// Orchestration: load OSM data, run the neighborhood analysis, and wire up the
// canvas, the algorithm toggle, and the mouse controls. The interesting code
// lives in the modules this imports:
//   config.js        tunables (palette, distances, resolution)
//   geometry.js      geometry helpers + spatial indexes
//   louvain.js       community detection
//   neighborhoods.js the algorithms (analyze: components, communities, coloring)
//   render.js        canvas drawing, view transform, mouse controls

import {analyze} from './neighborhoods.js';
import {draw, fitView, installControls} from './render.js';

const statusEl = document.getElementById('status');
const algoEl = document.getElementById('algo');
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');

main();

async function main() {
  statusEl.textContent = 'loading map…';
  const map = await fetch('map.json').then((r) => r.json());

  statusEl.textContent = 'analyzing neighborhoods…';
  const {edges, span, renders} = analyze(map);

  // --- View transform + throttled redraw ---
  const view = {k: 1, ox: 0, oy: 0};
  const scene = {edges, colorByEdge: renders[0].colorByEdge, view};
  let pending = false;
  const requestDraw = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      draw(ctx, scene);
    });
  };

  // --- Algorithm cycle (button + "A" key) ---
  let algo = 0;
  const applyAlgo = () => {
    const r = renders[algo];
    scene.colorByEdge = r.colorByEdge;
    algoEl.textContent = `▣ ${r.name} — ${r.count} neighborhoods (click / press A)`;
    requestDraw();
  };
  const toggle = () => {
    algo = (algo + 1) % renders.length;
    applyAlgo();
  };
  algoEl.onclick = toggle;
  addEventListener('keydown', (e) => {
    if (e.key === 'a' || e.key === 'A') toggle();
  });

  fitView(canvas, view, span);
  installControls(canvas, view, requestDraw);
  addEventListener('resize', () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    requestDraw();
  });
  applyAlgo();
  statusEl.textContent = 'scroll = zoom · drag = pan';
}
