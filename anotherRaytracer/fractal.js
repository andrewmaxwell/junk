// Fractals: Menger sponges and Mandelbulbs. They have no surface to solve
// for, only a distance estimate: how far a point is from the fractal, at
// most. A ray steps forward by that much until it's nearly touching
// (sphere tracing). The shader traces them as `intersectFractal` in
// shaders/fractals.js; this is the same, for picking.

import {dot} from './vec.js';

/** Half a sponge's side, in its unit ball: its corners just inside */
export const SPONGE_HALF = 0.57;
/** How far the Mandelbulb's own space reaches across its unit ball */
export const BULB_REACH = 1.3;
/** Its lowest point, below its center, at power 8, of its ball's radius */
export const BULB_BOTTOM = 1.02 / BULB_REACH;
/** Iterations of z -> z^power + c */
export const BULB_ITERATIONS = 8;

const mod = (/** @type {number} */ a, /** @type {number} */ m) =>
  a - m * Math.floor(a / m);

/**
 * Signed distance from p to a Menger sponge filling the cube from -1 to 1,
 * with this many levels of holes: negative inside. As spongeDistance in
 * shaders/fractals.js, which explains it.
 * @type {(p: number[], levels: number) => number}
 */
export const spongeDistance = (p, levels) => {
  const q = p.map((x) => Math.abs(x) - 1);
  let d =
    Math.min(Math.max(...q), 0) + Math.hypot(...q.map((x) => Math.max(x, 0)));
  let scale = 1;
  for (let i = 0; i < levels; i++) {
    const a = p.map((x) => mod(x * scale, 2) - 1);
    scale *= 3;
    const r = a.map((x) => 3 * Math.abs(x) - 1);
    const tunnels = Math.min(
      Math.max(r[0], r[1]),
      Math.max(r[1], r[2]),
      Math.max(r[2], r[0]),
    );
    d = Math.max(d, (tunnels - 1) / scale);
  }
  return d;
};

/**
 * Distance from p to the Mandelbulb of this power, at most: the
 * Mandelbrot set's z -> z^2 + c in 3D, raising a point to a power by
 * multiplying its angles from the vertical and around it. Negative inside,
 * though only roughly. y is up, its axis of symmetry.
 * @type {(p: number[], power: number) => number}
 */
export const bulbDistance = (p, power) => {
  let z = [...p];
  let dr = 1;
  let r = Math.hypot(...z);
  for (let i = 0; i < BULB_ITERATIONS && r <= 2; i++) {
    const theta = Math.acos(Math.max(-1, Math.min(1, z[1] / r))) * power;
    const phi = Math.atan2(z[2], z[0]) * power;
    dr = r ** (power - 1) * power * dr + 1;
    const zr = r ** power;
    z = [
      zr * Math.sin(theta) * Math.cos(phi) + p[0],
      zr * Math.cos(theta) + p[1],
      zr * Math.sin(theta) * Math.sin(phi) + p[2],
    ];
    r = Math.hypot(...z);
  }
  return (0.5 * Math.log(r) * r) / dr;
};

/**
 * Where a ray first hits a fractal, or Infinity: from o in direction d in
 * its own space, where it fits in a unit ball, and d is 1 / its radius
 * long, so distances along the ray are the world's. `mandelbulb` picks
 * which, and `level` is a sponge's levels or a Mandelbulb's power.
 * @type {(o: number[], d: number[], mandelbulb: boolean, level: number) => number}
 */
export const hitFractal = (o, d, mandelbulb, level) => {
  const a = dot(d, d);
  const b = dot(o, d);
  const det = b * b - a * (dot(o, o) - 1);
  if (det < 0) return Infinity;
  const leave = (-b + Math.sqrt(det)) / a;
  const scale = 1 / Math.sqrt(a);
  let t = Math.max(0, (-b - Math.sqrt(det)) / a);
  for (let i = 0; i < 300 && t < leave; i++) {
    const p = o.map((x, k) => x + d[k] * t);
    const dist =
      (mandelbulb
        ? bulbDistance(
            p.map((x) => x * BULB_REACH),
            level,
          ) / BULB_REACH
        : spongeDistance(
            p.map((x) => x / SPONGE_HALF),
            level,
          ) * SPONGE_HALF) * scale;
    if (dist < 1e-4 * scale) return t;
    t += dist;
  }
  return Infinity;
};
