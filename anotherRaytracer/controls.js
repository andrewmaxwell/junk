// Mouse, touch and keyboard: orbit, pan and zoom; click to select and focus;
// drag a selected ball or teapot; and the panel's shortcuts.

import {
  camera,
  cameraMoved,
  orbit,
  pan,
  pointerRay,
  resetCamera,
  saveCamera,
  zoomBy,
} from './camera.js';
import {objectsEdited, removeSelected, select} from './editor.js';
import {changed, displayChanged, hdrChanged, nextScene} from './panel.js';
import {redraw, restart} from './renderer.js';
import {settings, toneCurves, view} from './settings.js';
import {PLATE, hitObject} from './shapes.js';
import {dot} from './vec.js';
import * as world from './world.js';

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/** Pointers that are down, by id, at their last position */
const pointers = new Map();
/**
 * What dragging does: 'orbit', 'pan', 'move' (the selected ball or teapot),
 * 'pinch' (two fingers: zoom and pan), or 'none' (after a pinch, until every
 * finger lifts, so the last one doesn't suddenly orbit)
 */
let dragMode = 'orbit';
// How far the pointer has moved since it went down, to tell clicks from drags
let dragged = 0;
/** While moving something: from where the pointer's ray meets its height to its center */
let grabOffset = [0, 0, 0];

/** Where a ray meets the level plane at height y, or null if it doesn't */
const meetLevel = (
  /** @type {number[]} */ o,
  /** @type {number[]} */ d,
  /** @type {number} */ y,
) => {
  const t = (y - o[1]) / d[1];
  return t > 0 && isFinite(t) ? o.map((x, i) => x + d[i] * t) : null;
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x: e.offsetX, y: e.offsetY});
  if (pointers.size === 2) {
    dragMode = 'pinch';
    return;
  }
  if (pointers.size > 2) return;
  dragged = 0;
  dragMode = e.shiftKey || e.button > 0 ? 'pan' : 'orbit';
  // Dragging the selected ball or teapot moves it
  const o = world.objects[world.selected];
  if (dragMode === 'orbit' && o && o.shape !== PLATE) {
    const {position, d} = pointerRay(e.offsetX, e.offsetY);
    const hit = hitObject(world.gpuObjects, position, d);
    const level = meetLevel(position, d, o.center[1]);
    if (world.gpuObjects[hit.index]?.id === world.selected && level) {
      dragMode = 'move';
      grabOffset = o.center.map((c, i) => c - level[i]);
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  const now = {x: e.offsetX, y: e.offsetY};
  if (dragMode === 'pinch') {
    // Zoom by how far apart the two fingers are, and pan with their middle
    const [a, b] = [...pointers.values()];
    const before = {
      mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
      gap: Math.hypot(a.x - b.x, a.y - b.y),
    };
    pointers.set(e.pointerId, now);
    const [c, d] = [...pointers.values()];
    const gap = Math.hypot(c.x - d.x, c.y - d.y);
    if (gap > 0 && before.gap > 0) zoomBy(before.gap / gap);
    pan((c.x + d.x) / 2 - before.mid.x, (c.y + d.y) / 2 - before.mid.y);
    cameraMoved();
    return;
  }
  pointers.set(e.pointerId, now);
  if (dragMode === 'none') return;
  const dx = now.x - last.x;
  const dy = now.y - last.y;
  dragged += Math.abs(dx) + Math.abs(dy);
  // Small wobbles of a tap shouldn't move anything
  if (dragged < 4) return;
  if (dragMode === 'move') {
    const o = world.objects[world.selected];
    if (!o) return;
    const {position, d} = pointerRay(now.x, now.y);
    const level = meetLevel(position, d, o.center[1]);
    if (!level) return;
    o.center = level.map((x, i) => x + grabOffset[i]);
    objectsEdited();
    return;
  }
  if (dragMode === 'pan') pan(dx, dy);
  else orbit(dx, dy);
  cameraMoved();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    // Trackpad pinches come as wheel events with ctrl held
    zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.001)));
    cameraMoved();
  },
  {passive: false},
);

/** Selects the object at a point on the canvas, and focuses on it */
const click = (/** @type {number} */ x, /** @type {number} */ y) => {
  const {position, forward, d} = pointerRay(x, y);
  const {index, t} = hitObject(world.gpuObjects, position, d);
  const hit = world.gpuObjects[index];
  // Sky domes aren't things you can pick up. Clicking the selection again
  // lets it go.
  const id = hit && !hit.sky ? hit.id : -1;
  select(id === world.selected ? -1 : id);
  if (!isFinite(t)) return;
  // The lens focuses on a plane, so it's the depth that matters
  camera.focus = t * dot(forward, d);
  saveCamera();
  if (settings.dof > 0) restart();
};

const pointerEnd = (/** @type {PointerEvent} */ e) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size) {
    if (dragMode === 'pinch') dragMode = 'none';
    return;
  }
  // A click or tap: select what's under it, and focus on it
  if (
    e.type === 'pointerup' &&
    dragMode !== 'none' &&
    dragged < 4 &&
    e.button <= 0
  ) {
    click(e.offsetX, e.offsetY);
  }
};
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space') {
    e.preventDefault();
    view.paused = !view.paused;
  } else if (e.key === 'r') {
    resetCamera();
  } else if (e.key === 'd') {
    settings.denoise = !settings.denoise;
    displayChanged();
  } else if (e.key === 'Escape') {
    select(-1);
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    removeSelected();
  } else if (e.key === 'n') {
    view.showTiles = !view.showTiles;
    redraw();
  } else if (e.key === 't') {
    settings.tone = toneCurves[(toneCurves.indexOf(settings.tone) + 1) % 3];
    changed();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    nextScene(e.key === 'ArrowLeft' ? -1 : 1);
  } else if (e.key === 'h') {
    view.hdr = !view.hdr;
    hdrChanged();
  }
});
