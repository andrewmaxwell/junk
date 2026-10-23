// Where photons start: caustics, light that reaches a surface through glass
// or off a smooth mirror, are found by following photons from the lights
// (shaders/photons.js), not from the camera, which almost never finds a
// small light through glass. Photons only matter if they reach glass or a
// mirror first, so each light aims them at those, in proportion to how much
// of its light each gets. Lasers are too narrow for the camera to ever find,
// so all their light comes from photons. This lists them all for the photon
// shader.

import {GLASS, LIGHT, MIRROR, PLATE} from './shapes.js';

/** @typedef {import('./shapes.js').Shape} Shape */

/** Glass and smooth mirrors, as isSmooth in shaders/materials.js */
export const isSmooth = (/** @type {Shape} */ o) =>
  o.material === GLASS || (o.material === MIRROR && o.roughness === 0);

/** The radius of a ball around the whole shape, at its center */
const bounds = (/** @type {Shape} */ o) =>
  o.shape === PLATE ? Math.hypot(o.halfWidth, o.halfHeight) : o.radius;

/** The solid angle of a ball of radius r, d away: the whole sphere from inside */
const solidAngle = (/** @type {number} */ r, /** @type {number} */ d) =>
  d <= r ? 4 * Math.PI : 2 * Math.PI * (1 - Math.sqrt(1 - (r * r) / (d * d)));

/**
 * @typedef {{position: number[], direction: number[], color: number[], wavelength: number, radius: number}} Laser
 * A beam of light from a disk of `radius` at `position`, all in
 * `direction`: so narrow that only photons find it, never paths from the
 * camera. `color` is its power in each channel, and `wavelength` its color
 * in nanometers, which decides how much glass bends it.
 */

/** floats per emitter, four vec4s */
const EMITTER_SIZE = 16;

/**
 * Where photons come from: for each light and each glass or mirror object it
 * can reach, roughly how much light it sends that way (its brightness, times
 * how big it looks from there, times the object's cross section), and each
 * laser, by its power. Packed as four vec4s each, for the photon shader to
 * pick from: light index (-1 for a laser), target index, running total of
 * the shares (up to 1), and share; then for lasers, position and radius,
 * direction and wavelength, and power. And how many there are, and their
 * total power, roughly.
 * @type {(objects: Shape[], lasers: Laser[]) => {data: Float32Array, count: number, power: number}}
 */
export const photonEmitters = (objects, lasers) => {
  /** @type {{weight: number, values: number[]}[]} */
  const emitters = [];
  for (const [i, light] of objects.entries()) {
    if (light.material !== LIGHT) continue;
    const brightness = Math.max(...light.color);
    for (const [j, target] of objects.entries()) {
      if (!isSmooth(target)) continue;
      const toTarget = target.center.map((c, k) => c - light.center[k]);
      const d = Math.hypot(...toTarget);
      // Plate lights shine from their front only
      const r = bounds(target);
      if (
        light.shape === PLATE &&
        toTarget.reduce((sum, x, k) => sum + x * light.normal[k], 0) < -r
      ) {
        continue;
      }
      const weight =
        brightness * solidAngle(bounds(light), d) * Math.PI * r * r;
      if (weight > 0) emitters.push({weight, values: [i, j]});
    }
  }
  for (const {position, direction, color, wavelength, radius} of lasers) {
    const length = Math.hypot(...direction);
    emitters.push({
      weight: Math.max(...color),
      values: [
        -1,
        -1,
        0,
        0,
        ...position,
        radius,
        ...direction.map((x) => x / length),
        wavelength,
        ...color,
        0,
      ],
    });
  }
  const total = emitters.reduce((sum, e) => sum + e.weight, 0);
  let running = 0;
  const data = new Float32Array(Math.max(1, emitters.length) * EMITTER_SIZE);
  for (const [k, {weight, values}] of emitters.entries()) {
    running += weight / total;
    data.set(values, k * EMITTER_SIZE);
    data[k * EMITTER_SIZE + 2] = k === emitters.length - 1 ? 1 : running;
    data[k * EMITTER_SIZE + 3] = weight / total;
  }
  return {data, count: emitters.length, power: total};
};
