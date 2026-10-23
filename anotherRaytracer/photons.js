// Where photons start: caustics, light that reaches a surface through glass
// or off a smooth mirror, are found by following photons from the lights
// (shaders/photons.js), not from the camera, which almost never finds a
// small light through glass. Photons only matter if they reach glass or a
// mirror first, so each light aims them at those, in proportion to how much
// of its light each gets. This lists those pairs for the photon shader.

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
 * For each light and each glass or mirror object it can reach, roughly how
 * much light it sends that way: its brightness, times how big it looks from
 * there, times the object's cross section. Packed as vec4s of light index,
 * target index, running total of the shares (up to 1), and share, for the
 * photon shader to pick from; and how many there are.
 * @type {(objects: Shape[]) => {data: Float32Array, count: number}}
 */
export const photonPairs = (objects) => {
  /** @type {number[][]} */
  const pairs = [];
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
      if (weight > 0) pairs.push([i, j, weight]);
    }
  }
  const total = pairs.reduce((sum, p) => sum + p[2], 0);
  let running = 0;
  const data = new Float32Array(Math.max(1, pairs.length) * 4);
  for (const [k, [i, j, weight]] of pairs.entries()) {
    running += weight / total;
    data.set(
      [i, j, k === pairs.length - 1 ? 1 : running, weight / total],
      k * 4,
    );
  }
  return {data, count: pairs.length};
};
