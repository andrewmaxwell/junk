// The scene being shown, its objects as edited, and which one is selected.

import * as renderer from './renderer.js';
import {scenes} from './scenes.js';
import {settings} from './settings.js';
import {LIGHT, TEAPOT} from './shapes.js';
import {skyTable} from './sky.js';

/** @typedef {import('./shapes.js').Shape} Shape */

export let scene = scenes[settings.scene]();
/**
 * The scene's objects as edited: null where one was deleted, then any that
 * were added. Edits are kept in the URL as differences from scene.objects.
 * @type {(Shape | null)[]}
 */
export let objects = [];
/**
 * The objects as the GPU has them: without deleted ones, lights first and
 * teapots last, as the shader expects. Each knows its index in objects as
 * `id`.
 * @type {(Shape & {id: number})[]}
 */
export let gpuObjects = [];
/** The selected object's index in objects, or -1 */
export let selected = -1;
/** How far the scene's own camera is from what it looks at: its size, roughly */
export let sceneSize = 1;
/** World units per bump on surfaces: smaller for smaller scenes */
export let detailScale = 1;

/** Shows settings.scene, as it was made */
export const loadScene = () => {
  scene = scenes[settings.scene]();
  // From the scene's own camera, not the current one, so zooming doesn't
  // change the bumps
  const {position, target} = scene.camera;
  sceneSize =
    scene.size ?? Math.hypot(...position.map((p, i) => p - target[i]));
  detailScale = sceneSize / 300;
  selected = -1;
  setObjects(scene.objects.map((o) => ({...o})));
  renderer.setTables(
    scene.sky ? skyTable(scene.sky.sun, scene.sky.haze) : null,
  );
  renderer.resize();
};

/** Replaces the objects, and shows them */
export const setObjects = (/** @type {(Shape | null)[]} */ list) => {
  // Indexes skipped over are holes, not objects
  objects = Array.from(list, (o) => o ?? null);
  objectsChanged();
};

/**
 * Sends the objects to the GPU after they change, and starts the image
 * over, quickly if they're still moving
 */
export const objectsChanged = (moving = false) => {
  const present = objects.flatMap((o, id) => (o ? [{...o, id}] : []));
  const isLight = (/** @type {Shape} */ o) => o.material === LIGHT;
  const isTeapot = (/** @type {Shape} */ o) => o.shape === TEAPOT;
  gpuObjects = [
    ...present.filter(isLight),
    ...present.filter((o) => !isLight(o) && !isTeapot(o)),
    ...present.filter(isTeapot),
  ];
  renderer.setObjects(gpuObjects);
  renderer.restart(moving);
};

export const setSelected = (/** @type {number} */ index) => {
  selected = index;
};

/** The selected object's index in gpuObjects, or -1 */
export const selectedOnGpu = () =>
  gpuObjects.findIndex((o) => o.id === selected);
