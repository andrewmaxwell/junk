// Another Raytracer: starts the scene the URL names, then draws it, adding
// samples every frame.

import {frameView, loadCamera} from './camera.js';
import './controls.js';
import {loadEdits, saveEdits, showEdit} from './editor.js';
import {showScene} from './panel.js';
import * as renderer from './renderer.js';
import {saveSettings, settings, view} from './settings.js';

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
const stats = /** @type {HTMLElement} */ (document.querySelector('#stats'));

const hints = matchMedia('(pointer: coarse)').matches
  ? 'drag: orbit · pinch: zoom · two fingers: pan · tap: select and focus'
  : 'drag: orbit · shift/right drag: pan · scroll: zoom · ' +
    'click: select and focus · space: pause · r: reset view';

const loop = () => {
  renderer.step(frameView);
  if (renderer.failure) return;
  const {samplesPerPixel, activeTiles, tileCount, width, height} = renderer;
  const status = renderer.isDone()
    ? 'done'
    : view.paused
      ? 'paused'
      : 'rendering';
  const secs = (performance.now() - renderer.startTime) / 1000;
  const rate = secs ? samplesPerPixel / secs : 0;
  stats.textContent =
    `${status} · ${samplesPerPixel} spp · ${rate.toFixed(0)} spp/s · ` +
    `${activeTiles < 0 ? '–' : Math.round((100 * activeTiles) / tileCount)}% refining · ` +
    `${width}×${height}${settings.denoise ? ' · denoised' : ''}\n` +
    hints;
  requestAnimationFrame(loop);
};

new ResizeObserver(renderer.resize).observe(canvas);
showScene();
loadEdits();
loadCamera();
// Drop anything in the URL that matches the defaults
saveSettings();
saveEdits();
showEdit();
loop();
