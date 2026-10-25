// The orbit camera: where it is, the rays through the canvas, and keeping it
// in the URL.

import {restart} from './renderer.js';
import {saveParamSoon, settings, urlParams} from './settings.js';
import {cross, normalize} from './vec.js';
import {detailScale, sceneSize, scene, selectedOnGpu} from './world.js';

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);

/** Orbits target. `focus` is the distance that depth of field keeps sharp. */
export const camera = {
  target: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  distance: 1,
  focus: 1,
};

/** The camera as the URL keeps it: target, yaw, pitch, distance and focus */
const cameraParam = () =>
  [...camera.target, camera.yaw, camera.pitch, camera.distance, camera.focus]
    .map((x) => +x.toFixed(3))
    .join('_');
/** cameraParam for the scene's own camera, which the URL leaves out */
let sceneCamera = '';

/** Call whenever the camera changes */
export const cameraMoved = () => {
  restart(true);
  saveCamera();
};

/** Puts the camera in the URL once it stops moving */
export const saveCamera = () =>
  saveParamSoon('camera', () => {
    const value = cameraParam();
    return value === sceneCamera ? null : value;
  });

/** Moves the camera to the scene's own view */
export const resetCamera = () => {
  const {position, target} = scene.camera;
  const offset = position.map((p, i) => p - target[i]);
  camera.target = [...target];
  camera.distance = Math.hypot(...offset);
  camera.yaw = Math.atan2(offset[0], offset[2]);
  camera.pitch = Math.asin(offset[1] / camera.distance);
  camera.focus = scene.camera.focus ?? camera.distance;
  sceneCamera = cameraParam();
  cameraMoved();
};

/** Moves the camera to where the URL has it, if it does */
export const loadCamera = () => {
  const values = urlParams.get('camera')?.split('_').map(Number);
  if (values?.length !== 7 || !values.every(isFinite)) return;
  camera.target = values.slice(0, 3);
  [camera.yaw, camera.pitch, camera.distance, camera.focus] = values.slice(3);
  cameraMoved();
};

/**
 * The image's height at distance 1. Scenes are framed for landscape screens
 * by their height, which would crop most of the scene on a phone held
 * upright, so narrow screens show at least as much width as a 5:4 one.
 */
const viewZoom = () =>
  scene.camera.zoom *
  Math.max(1, 1.25 / (canvas.clientWidth / canvas.clientHeight));

/** Camera position and unit forward, right and up vectors */
const cameraBasis = () => {
  const {target, yaw, pitch, distance} = camera;
  const back = [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
  const position = target.map((t, i) => t + back[i] * distance);
  const forward = back.map((b) => -b);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return {position, forward, right, up};
};

/** What the renderer needs to draw a frame from here */
export const frameView = () => ({
  ...cameraBasis(),
  zoom: viewZoom(),
  lensRadius: settings.dof * sceneSize,
  focus: camera.focus,
  detailScale,
  gathers: scene.gathers ?? 1,
  selected: selectedOnGpu(),
});

/** The ray from the camera through a point on the canvas, in CSS pixels */
export const pointerRay = (
  /** @type {number} */ x,
  /** @type {number} */ y,
) => {
  const {position, forward, right, up} = cameraBasis();
  const zoom = viewZoom();
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const u = (x / canvas.clientWidth - 0.5) * zoom * aspect;
  const v = (0.5 - y / canvas.clientHeight) * zoom;
  const d = normalize(forward.map((f, i) => f + right[i] * u + up[i] * v));
  return {position, forward, d};
};

/** Pans so the scene moves dx, dy CSS pixels with the pointer */
export const pan = (/** @type {number} */ dx, /** @type {number} */ dy) => {
  const {right, up} = cameraBasis();
  const perPixel = (camera.distance * viewZoom()) / canvas.clientHeight;
  camera.target = camera.target.map(
    (t, i) => t + (-right[i] * dx + up[i] * dy) * perPixel,
  );
};

/** Zooms by factor, toward the target */
export const zoomBy = (/** @type {number} */ factor) => {
  camera.distance *= factor;
  // Moving toward the target, keep the same thing in focus
  camera.focus *= factor;
};

/** Orbits by dx, dy CSS pixels of dragging */
export const orbit = (/** @type {number} */ dx, /** @type {number} */ dy) => {
  camera.yaw -= dx * 0.005;
  camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.005));
};
