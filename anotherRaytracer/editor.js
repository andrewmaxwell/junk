// Editing objects: the panel's Objects folder for whatever's selected,
// adding balls, teapots and fractals, and keeping edits in the URL.

import {camera, pointerRay} from './camera.js';
import {redraw} from './renderer.js';
import {saveParamSoon, urlParams} from './settings.js';
import {
  DIFFUSE,
  GLASS,
  LIGHT,
  MIRROR,
  PLATE,
  SPHERE,
  TEAPOT,
  DIAMOND,
  SPONGE,
  MANDELBULB,
  bottomOf,
  hitObject,
  isBounded,
  isFractal,
  mandelbulb,
  sphere,
  sponge,
  teapot,
} from './shapes.js';
import * as world from './world.js';

/** @typedef {import('./shapes.js').Shape} Shape */
/** @typedef {any} GUI lil-gui's, which comes from a CDN, without types */

const canvas = /** @type {HTMLCanvasElement} */ (
  document.querySelector('canvas')
);

/** Linear RGB, 0 to 1, as a CSS hex color, which is sRGB encoded */
const toHex = (/** @type {number[]} */ rgb) =>
  '#' +
  rgb
    .map((c) => {
      const x = Math.min(1, Math.max(0, c));
      const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
/** A CSS hex color as linear RGB */
const fromHex = (/** @type {string} */ hex) =>
  [1, 3, 5].map((i) => {
    const srgb = parseInt(hex.slice(i, i + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });

const materials = {paint: DIFFUSE, metal: MIRROR, glass: GLASS, light: LIGHT};
const materialName = (/** @type {number} */ material) =>
  Object.keys(materials).find(
    (k) => materials[/** @type {keyof typeof materials} */ (k)] === material,
  ) ?? 'paint';

/** The selected object's settings, as the panel shows them */
const edit = {
  material: 'paint',
  color: '#ffffff',
  gloss: 0,
  roughness: 0.1,
  /** Glass's index of refraction */
  ior: 1.5,
  /** Glass's cloudiness inside */
  haze: 0,
  /** Lights' brightness, in stops over white */
  brightness: 5,
  size: 1,
  /** Teapots', diamonds' and fractals' turn around the vertical, in degrees */
  turn: 0,
  /** A sponge's levels of holes, or a Mandelbulb's power */
  level: 3,
};

/** What to call an object */
const describe = (/** @type {Shape} */ o) => {
  if (o.material === LIGHT) return o.shape === SPHERE ? 'light' : 'light panel';
  const material = materialName(o.material);
  const coat =
    o.material === DIFFUSE && o.gloss > 0
      ? 'glossy '
      : o.material === GLASS && o.roughness > 0
        ? 'frosted '
        : '';
  if (o.shape === SPHERE) return `${coat}${material} ball`;
  if (o.shape === TEAPOT) return `${coat}${material} teapot`;
  if (o.shape === SPONGE) return `${coat}${material} sponge`;
  if (o.shape === MANDELBULB) return `${coat}${material} Mandelbulb`;
  if (o.shape === DIAMOND) {
    return o.material === GLASS
      ? `${coat}diamond`
      : `${coat}${material} diamond`;
  }
  const name =
    o.normal[1] > 0.7 ? 'floor' : o.normal[1] < -0.7 ? 'ceiling' : 'wall';
  return o.material === DIFFUSE ? `${coat}${name}` : `${material} ${name}`;
};

/** @type {GUI} */
let folder;
/** @type {Record<string, any>} */
let editControls = {};
/** @type {any} */
let undoControl;

/** Adds the Objects folder to the panel */
export const addObjectsFolder = (/** @type {GUI} */ gui) => {
  folder = gui.addFolder('Objects');
  const onChange = () => applyEdit();
  editControls = {
    material: folder.add(edit, 'material', Object.keys(materials)),
    color: folder.addColor(edit, 'color'),
    gloss: folder.add(edit, 'gloss', 0, 1, 0.01).name('gloss coat'),
    roughness: folder.add(edit, 'roughness', 0, 0.7, 0.001),
    ior: folder.add(edit, 'ior', 1, 2.5, 0.01).name('index of refraction'),
    haze: folder.add(edit, 'haze', 0, 0.3, 0.001),
    brightness: folder
      .add(edit, 'brightness', -2, 20, 0.1)
      .name('brightness (stops)'),
    size: folder.add(edit, 'size', 0, 1),
    turn: folder.add(edit, 'turn', -180, 180, 1).name('turn (°)'),
    level: folder.add(edit, 'level', 1, 12, 1),
  };
  for (const c of Object.values(editControls)) c.onChange(onChange);
  editControls.remove = folder
    .add({remove: removeSelected}, 'remove')
    .name('delete (⌫)');
  editControls.deselect = folder
    .add({deselect: () => select(-1)}, 'deselect')
    .name('deselect (esc, or click it again)');
  folder.add({addBall}, 'addBall').name('add a ball');
  folder.add({addTeapot}, 'addTeapot').name('add a teapot');
  folder.add({addFractal}, 'addFractal').name('add a fractal');
  undoControl = folder.add({undo: undoEdits}, 'undo').name('undo all edits');
};

/** The color showEdit put in the panel, so other edits don't round it */
let shownColor = '';
/** Which selection the size slider's range was set for */
let sizeRangeFor = -1;

/** Shows the selected object's settings in the panel, or a hint */
export const showEdit = () => {
  const o = world.objects[world.selected];
  folder.title(
    o ? `Objects: ${describe(o)}` : 'Objects (click one to edit it)',
  );
  for (const c of Object.values(editControls)) c.show(!!o);
  undoControl.show(!!editsParam());
  if (!o) return;
  const peak = Math.max(...o.color);
  edit.material = materialName(o.material);
  if (o.material === LIGHT) {
    edit.color = toHex(o.color.map((c) => c / peak));
    edit.brightness = +Math.log2(peak).toFixed(1);
  } else {
    edit.color = toHex(o.color);
    // Brightness to start at if it becomes a light: a ball glows, but a
    // whole wall as bright would be blinding
    edit.brightness = o.shape === SPHERE ? 5 : 1;
  }
  edit.gloss = o.gloss;
  edit.roughness = o.roughness;
  edit.ior = o.ior;
  edit.haze = o.haze;
  // Sizes from a quarter to four times what it was when selected. Only set
  // then, or the range would shift under the slider as it moves.
  edit.size = o.radius;
  if (sizeRangeFor !== world.selected) {
    sizeRangeFor = world.selected;
    editControls.size
      .min(+(o.radius / 4).toPrecision(2))
      .max(+(o.radius * 4).toPrecision(2))
      .step(+(o.radius / 50).toPrecision(1));
  }
  edit.turn = o.turn;
  edit.level = o.level;
  editControls.size.show(o.shape !== PLATE);
  editControls.turn.show(isBounded(o));
  // Sponges past 6 levels have holes too small to see, and Mandelbulbs
  // below power 3 outgrow their ball
  editControls.level.show(isFractal(o));
  if (o.shape === SPONGE) editControls.level.name('levels').min(0).max(6);
  if (o.shape === MANDELBULB) editControls.level.name('power').min(3).max(12);
  // Teapots, diamonds and fractals can't be lights, and Mandelbulbs can't
  // be glass
  const options = editControls.material.$select.options;
  options[Object.keys(materials).indexOf('light')].disabled = isBounded(o);
  options[Object.keys(materials).indexOf('glass')].disabled =
    o.shape === MANDELBULB;
  editControls.gloss.show(o.material === DIFFUSE);
  editControls.roughness.show(
    o.material === MIRROR ||
      o.material === GLASS ||
      (o.material === DIFFUSE && o.gloss > 0),
  );
  editControls.roughness.name(o.material === GLASS ? 'frost' : 'roughness');
  editControls.ior.show(o.material === GLASS);
  editControls.haze.show(o.material === GLASS);
  editControls.brightness.show(o.material === LIGHT);
  editControls.color.name(o.material === GLASS ? 'tint' : 'color');
  shownColor = edit.color;
  for (const c of Object.values(editControls)) c.updateDisplay();
};

/** Changes the selected object to match the panel */
const applyEdit = () => {
  const o = world.objects[world.selected];
  if (!o) return;
  const material =
    materials[/** @type {keyof typeof materials} */ (edit.material)];
  const peak = Math.max(...o.color);
  const color =
    edit.color !== shownColor
      ? fromHex(edit.color)
      : o.material === LIGHT
        ? o.color.map((c) => c / peak)
        : o.color.map((c) => Math.min(c, 1));
  o.material = material;
  // A light's color is its hue, at its brightest channel, times its brightness
  const colorPeak = Math.max(...color, 1e-6);
  o.color =
    material === LIGHT
      ? color.map((c) => (c / colorPeak) * 2 ** edit.brightness)
      : color;
  o.gloss = material === DIFFUSE ? edit.gloss : 0;
  // Metal at 0 is a perfect mirror, and glass is clear
  o.roughness =
    material === MIRROR ||
    material === GLASS ||
    (material === DIFFUSE && edit.gloss > 0)
      ? edit.roughness
      : 0;
  o.ior = edit.ior;
  o.haze = edit.haze;
  if (o.shape !== PLATE && o.radius !== edit.size) {
    // Growing or shrinking from its bottom, so what's on the floor stays on
    // it
    o.center[1] += (edit.size - o.radius) * bottomOf(o);
    o.radius = edit.size;
  }
  if (isBounded(o)) o.turn = edit.turn;
  if (isFractal(o)) o.level = edit.level;
  objectsEdited();
  showEdit();
};

/** Call whenever objects change */
export const objectsEdited = () => {
  world.objectsChanged(true);
  saveEdits();
};

/** Selects world.objects[index], or nothing with -1 */
export const select = (/** @type {number} */ index) => {
  world.setSelected(index);
  sizeRangeFor = -1;
  showEdit();
  redraw();
};

export const removeSelected = () => {
  if (!world.objects[world.selected]) return;
  world.objects[world.selected] = null;
  select(-1);
  objectsEdited();
};

const undoEdits = () => {
  world.setObjects(world.scene.objects.map((o) => structuredClone(o)));
  select(-1);
  saveEdits();
};

/**
 * A random place on the floor near the middle of the view and the point the
 * camera orbits, with room for something of this radius, clear of balls and
 * teapots, or the roomiest place it found, or the point the camera orbits
 * if it found no floor
 */
const floorSpot = (/** @type {number} */ radius) => {
  let best = {spot: [...camera.target], room: -Infinity};
  for (let tries = 0; tries < 30 && best.room < 0; tries++) {
    const {position, d} = pointerRay(
      canvas.clientWidth * (0.3 + 0.4 * Math.random()),
      canvas.clientHeight * (0.45 + 0.4 * Math.random()),
    );
    const {index, t} = hitObject(world.gpuObjects, position, d);
    const hit = world.gpuObjects[index];
    if (hit?.shape !== PLATE || hit.normal[1] < 0.7) continue;
    const spot = position.map((p, i) => p + d[i] * t);
    const [x, , z] = camera.target;
    // Not far off near the horizon
    if (Math.hypot(spot[0] - x, spot[2] - z) > camera.distance / 2) continue;
    const room = Math.min(
      ...world.gpuObjects
        // Ones standing near the floor, not lights high overhead
        .filter(
          (o) =>
            o.shape !== PLATE &&
            Math.abs(o.center[1] - spot[1]) < o.radius + 2 * radius,
        )
        .map(
          (o) =>
            Math.hypot(o.center[0] - spot[0], o.center[2] - spot[2]) -
            o.radius -
            radius,
        ),
    );
    if (room > best.room) best = {spot, room};
  }
  return best.spot;
};

/** A random color for paint, bright but not white */
const randomPaint = () => {
  const hue = Math.random() * 6;
  return [0, 4, 2].map((k) => {
    const x = Math.abs(((hue + k) % 6) - 3) - 1;
    return 0.05 + 0.75 * Math.min(1, Math.max(0, x)) ** 2;
  });
};

/** Adds one of these objects at random, and selects it */
const addOne = (/** @type {Shape[]} */ options) => {
  world.objects.push(options[Math.floor(Math.random() * options.length)]);
  select(world.objects.length - 1);
  objectsEdited();
};

/** Drops a random ball onto the floor near the middle of the view, and selects it */
const addBall = () => {
  const radius = +(camera.distance / 20).toPrecision(2);
  const center = floorSpot(radius);
  center[1] += radius;
  const paint = randomPaint();
  addOne([
    sphere(radius, center, paint, DIFFUSE, 1, 0.08),
    sphere(radius, center, paint, DIFFUSE),
    sphere(radius, center, [0.95, 0.75, 0.4], MIRROR, 0, 0.05), // gold
    sphere(radius, center, [0.97, 0.97, 0.97], GLASS),
    sphere(radius, center, [0.97, 0.97, 0.97], GLASS, 0, 0.15), // frosted
    sphere(
      radius,
      center,
      paint.map((c) => 0.3 + c),
      GLASS,
    ),
  ]);
};

/** The middle size of the balls and teapots there, or one to suit the view */
const typicalRadius = () => {
  const sizes = world.gpuObjects
    .filter((o) => o.shape !== PLATE && o.material !== LIGHT)
    .map((o) => o.radius)
    .sort((a, b) => a - b);
  return sizes.length ? sizes[sizes.length >> 1] : camera.distance / 15.6;
};

/**
 * Stands a random teapot on the floor near the middle of the view, and
 * selects it. It's sized like the balls and teapots already there, if any.
 */
const addTeapot = () => {
  const radius = +(1.3 * typicalRadius()).toPrecision(2);
  const spot = floorSpot(radius);
  // Spout to the right or left (a turn of the camera's yaw points it right),
  // a little toward the camera
  const yaw = (camera.yaw * 180) / Math.PI;
  const turn = Math.round(
    ((((yaw + (Math.random() < 0.5 ? -30 : -150) + 180) % 360) + 360) % 360) -
      180,
  );
  /** @type {(color: number[], material: number, gloss?: number, roughness?: number) => Shape} */
  const make = (...args) => teapot(radius, spot, turn, ...args);
  addOne([
    make(randomPaint(), DIFFUSE, 1, 0.05), // glazed china
    make([0.95, 0.95, 0.95], DIFFUSE, 1, 0.03), // white china
    make([0.95, 0.75, 0.4], MIRROR, 0, 0.05), // gold
    make([0.95, 0.64, 0.54], MIRROR, 0, 0.15), // brushed copper
    make([0.97, 0.97, 0.97], GLASS),
    make([0.97, 0.97, 0.97], GLASS, 0, 0.15), // frosted
    make([0.95, 0.6, 0.3], GLASS), // tea colored
  ]);
};

/**
 * Stands a random Menger sponge on the floor, or floats a Mandelbulb over
 * it, near the middle of the view, and selects it. It's sized like the
 * balls and teapots already there, if any.
 */
const addFractal = () => {
  const radius = +(1.3 * typicalRadius()).toPrecision(2);
  const spot = floorSpot(radius);
  const turn = Math.round(Math.random() * 90 - 45);
  const center = [spot[0], spot[1] + radius, spot[2]];
  addOne([
    sponge(radius, spot, turn, 3, randomPaint(), DIFFUSE),
    sponge(radius, spot, turn, 4, [0.95, 0.95, 0.95], DIFFUSE, 1, 0.05),
    sponge(radius, spot, turn, 3, [0.95, 0.75, 0.4], MIRROR, 0, 0.1), // gold
    sponge(radius, spot, turn, 3, [0.97, 0.97, 0.97], GLASS),
    mandelbulb(radius, center, turn, 8, randomPaint(), DIFFUSE),
    mandelbulb(radius, center, turn, 8, [0.95, 0.64, 0.54], MIRROR, 0, 0.2), // copper
  ]);
};

/** The fields edits keep, for each object that changed */
const editFields = /** @type {const} */ ([
  'shape',
  'center',
  'radius',
  'turn',
  'level',
  'color',
  'material',
  'gloss',
  'roughness',
  'ior',
  'haze',
]);

/**
 * Edits as differences from the scene, for the URL: for each object that
 * changed, by index, the fields that did, or 0 if it was deleted. Added
 * objects have every field. Null if nothing changed.
 */
const editsParam = () => {
  /** @type {(v: number | number[]) => number | number[]} */
  const round = (v) =>
    Array.isArray(v) ? v.map((x) => +x.toPrecision(5)) : +v.toPrecision(5);
  const same = (
    /** @type {number | number[]} */ a,
    /** @type {number | number[]} */ b,
  ) => JSON.stringify(round(a)) === JSON.stringify(round(b));
  /** @type {Record<number, object | 0>} */
  const edits = {};
  for (const [i, o] of world.objects.entries()) {
    const original = world.scene.objects[i];
    if (!o) {
      if (original) edits[i] = 0;
      continue;
    }
    const changed = Object.fromEntries(
      editFields
        .filter((f) => !original || !same(o[f], original[f]))
        .map((f) => [f, round(o[f])]),
    );
    if (Object.keys(changed).length) edits[i] = changed;
  }
  return Object.keys(edits).length ? JSON.stringify(edits) : null;
};

/** Puts the edits in the URL, once they stop changing */
export const saveEdits = () => {
  saveParamSoon('edits', editsParam);
  undoControl.show(!!editsParam());
};

/** Applies edits from the URL, as editsParam makes them */
export const loadEdits = () => {
  const json = urlParams.get('edits');
  if (!json) return;
  try {
    const objects = [...world.objects];
    for (const [key, e] of Object.entries(JSON.parse(json))) {
      const i = Number(key);
      if (!(i >= 0 && i < 1000)) continue;
      const base = objects[i] ?? sphere(1, [0, 0, 0], [0.5, 0.5, 0.5], DIFFUSE);
      // Links from before roughness replaced Phong shininess
      if (e && 'shininess' in e) {
        e.roughness = e.shininess > 0 ? Math.sqrt(2 / (e.shininess + 2)) : 0;
        delete e.shininess;
      }
      /** @type {Shape | null} */
      const o = e === 0 ? null : {...base, ...e};
      // Teapots, diamonds and fractals can't be lights, nor Mandelbulbs glass
      if (o && isBounded(o) && o.material === LIGHT) o.material = DIFFUSE;
      if (o?.shape === MANDELBULB && o.material === GLASS) o.material = DIFFUSE;
      objects[i] = o;
    }
    world.setObjects(objects);
  } catch (error) {
    console.warn("Ignoring edits in the URL that I can't read:", error);
  }
};
