// The shapes scenes are made of: balls, flat plates, teapots, diamonds and
// fractals. Packed into arrays for the shader, and hit by rays for picking.

import {DIAMOND_BOTTOM, hitDiamond} from './diamond.js';
import {BULB_BOTTOM, SPONGE_HALF, hitFractal} from './fractal.js';
import {TEAPOT_BOTTOM, hitTeapot} from './teapot.js';
import {cross, dot} from './vec.js';

// Shapes
export const SPHERE = 0;
export const PLATE = 1;
export const TEAPOT = 2;
export const DIAMOND = 3;
export const SPONGE = 4;
export const MANDELBULB = 5;

// Materials
export const DIFFUSE = 0;
export const MIRROR = 1;
export const GLASS = 2;
export const LIGHT = 3;

/**
 * @typedef {{
 *   shape: number,
 *   center: number[],
 *   radius: number,
 *   normal: number[],
 *   u: number[], v: number[],
 *   halfWidth: number, halfHeight: number,
 *   turn: number,
 *   level: number,
 *   color: number[],
 *   material: number,
 *   gloss: number,
 *   roughness: number,
 *   ior: number,
 *   haze: number,
 *   hole: number,
 *   oneSided: boolean,
 *   sky: boolean,
 * }} Shape
 * Spheres use `radius`. Plates are rectangles facing `normal`, spanning
 * halfWidth along u and halfHeight along v. Teapots (teapot.js) fit in a
 * ball of `radius` around `center`, turned `turn` degrees around the
 * vertical, with the spout toward +x at 0. Diamonds (diamond.js) are
 * round brilliant cuts, table up, fit and turned the same way. So do
 * fractals (fractal.js): Menger sponges with `level` levels of holes, and
 * Mandelbulbs of power `level`.
 *
 * `color` is the surface color, or for lights, the emitted light. Plate
 * lights shine from their front only.
 *
 * Diffuse surfaces are paint, which can have a glossy clear coat, like
 * varnish: `gloss` is how much of the surface it covers (0 to 1). Like real
 * varnish, it reflects a little head on and more toward grazing angles.
 * `roughness` is how blurry its reflections are: 0 is a perfect mirror,
 * around 0.03 polished, 0.1 glossy, 0.3 satin (GGX's alpha). Mirrors are
 * metal: they reflect their `color`, whiter toward grazing angles, and with
 * a `roughness`, blurrily, like brushed metal.
 *
 * Glass is colored by `color` as light goes through it: that's what's left
 * after going as far as its radius. Glass plates are thin panes, like a
 * window's: light goes straight through, tinted by `color`. `ior` is how much it bends light (its index of
 * refraction, for yellow): 1.33 for water, 1.5 for glass, 2.42 for diamond.
 * With a `roughness`, it's frosted. `haze` is how cloudy it is inside: the
 * chance per unit of distance that light scatters off something in it, so
 * beams of light show through it. Teapots, diamonds and fractals can't be
 * lights, and Mandelbulbs can't be glass.
 *
 * A plate with a `hole` has a round hole of that radius in its middle, like
 * a wall with a round window. Lights can't have holes.
 *
 * One-sided plates are invisible from behind, so walls disappear when the
 * camera orbits outside them, like a dollhouse.
 *
 * A `sky` light is a dome whose color in each direction is the scene's sky
 * (see `sky` in Scene) times `color`.
 */

/** @type {(radius: number, center: number[], color: number[], material: number, gloss?: number, roughness?: number) => Shape} */
export const sphere = (
  radius,
  center,
  color,
  material,
  gloss = 0,
  roughness = 0,
) => ({
  shape: SPHERE,
  center,
  radius,
  normal: [0, 0, 0],
  u: [0, 0, 0],
  v: [0, 0, 0],
  halfWidth: 0,
  halfHeight: 0,
  turn: 0,
  level: 0,
  color,
  material,
  gloss,
  roughness,
  ior: 1.5,
  haze: 0,
  hole: 0,
  oneSided: false,
  sky: false,
});

/**
 * A teapot standing on the floor at height `floor`, in a ball of `radius`
 * around (x, z)
 * @type {(radius: number, [x, floor, z]: number[], turn: number, color: number[], material: number, gloss?: number, roughness?: number) => Shape}
 */
export const teapot = (
  radius,
  [x, floor, z],
  turn,
  color,
  material,
  gloss = 0,
  roughness = 0,
) => ({
  ...sphere(
    radius,
    [x, floor - TEAPOT_BOTTOM * radius, z],
    color,
    material,
    gloss,
    roughness,
  ),
  shape: TEAPOT,
  turn,
});

/**
 * A diamond with its culet on the floor at height `floor`, in a ball of
 * `radius` around (x, z): diamond glass, which bends light as much as real
 * diamond does
 * @type {(radius: number, [x, floor, z]: number[], turn: number, color?: number[]) => Shape}
 */
export const diamond = (radius, [x, floor, z], turn, color = [1, 1, 1]) => ({
  ...sphere(radius, [x, floor - DIAMOND_BOTTOM * radius, z], color, GLASS),
  shape: DIAMOND,
  turn,
  ior: 2.42,
});

/**
 * A Menger sponge with this many levels of holes, standing on the floor at
 * height `floor`, in a ball of `radius` around (x, z)
 * @type {(radius: number, [x, floor, z]: number[], turn: number, levels: number, color: number[], material: number, gloss?: number, roughness?: number) => Shape}
 */
export const sponge = (
  radius,
  [x, floor, z],
  turn,
  levels,
  color,
  material,
  gloss = 0,
  roughness = 0,
) => ({
  ...sphere(
    radius,
    [x, floor + SPONGE_HALF * radius, z],
    color,
    material,
    gloss,
    roughness,
  ),
  shape: SPONGE,
  turn,
  level: levels,
});

/**
 * A Mandelbulb of this power, in a ball of `radius` around `center`
 * @type {(radius: number, center: number[], turn: number, power: number, color: number[], material: number, gloss?: number, roughness?: number) => Shape}
 */
export const mandelbulb = (
  radius,
  center,
  turn,
  power,
  color,
  material,
  gloss = 0,
  roughness = 0,
) => ({
  ...sphere(radius, center, color, material, gloss, roughness),
  shape: MANDELBULB,
  turn,
  level: power,
});

/** @type {(o: Shape) => boolean} */
export const isFractal = (o) => o.shape === SPONGE || o.shape === MANDELBULB;

/**
 * Teapots, diamonds and fractals: shapes that fit in a ball of their
 * radius, turned around the vertical, which the shader tests after the
 * others
 * @type {(o: Shape) => boolean}
 */
export const isBounded = (o) =>
  o.shape === TEAPOT || o.shape === DIAMOND || isFractal(o);

/**
 * How far below its center a shape's lowest point is, as a fraction of its
 * radius, for keeping things on the floor as they change size
 * @type {(o: Shape) => number}
 */
export const bottomOf = (o) =>
  o.shape === TEAPOT
    ? -TEAPOT_BOTTOM
    : o.shape === DIAMOND
      ? -DIAMOND_BOTTOM
      : o.shape === SPONGE
        ? SPONGE_HALF
        : o.shape === MANDELBULB
          ? BULB_BOTTOM
          : 1;

/**
 * A teapot's, diamond's or fractal's own x, y and z axes in the world: y is up, and it's turned
 * around it
 * @type {(turn: number) => number[][]}
 */
export const ownAxes = (turn) => {
  const a = (turn * Math.PI) / 180;
  return [
    [Math.cos(a), 0, -Math.sin(a)],
    [0, 1, 0],
    [Math.sin(a), 0, Math.cos(a)],
  ];
};

/**
 * A rectangle facing `normal`, spanning halfWidth along u (which must be
 * perpendicular to the normal) and halfHeight along normal × u, with a
 * round hole of radius `hole` in its middle.
 * @type {(center: number[], normal: number[], u: number[], halfWidth: number, halfHeight: number, color: number[], options?: {material?: number, gloss?: number, roughness?: number, oneSided?: boolean, hole?: number}) => Shape} */
export const plate = (
  center,
  normal,
  u,
  halfWidth,
  halfHeight,
  color,
  {
    material = DIFFUSE,
    gloss = 0,
    roughness = 0,
    oneSided = false,
    hole = 0,
  } = {},
) => ({
  shape: PLATE,
  center,
  radius: 0,
  normal,
  u,
  v: cross(normal, u),
  halfWidth,
  halfHeight,
  turn: 0,
  level: 0,
  color,
  material,
  gloss,
  roughness,
  ior: 1.5,
  haze: 0,
  hole,
  oneSided,
  sky: false,
});

/**
 * A sky dome: a light so big and high that it covers the sky, colored by
 * the scene's sky, and as bright on average as brightness
 * @type {(radius: number, center: number[], brightness: number) => Shape}
 */
export const skyDome = (radius, center, brightness) => ({
  ...sphere(radius, center, [brightness, brightness, brightness], LIGHT),
  sky: true,
});

/**
 * Packs shapes into the `Shape` structs of the `objects` buffer in shaders/geometry.js:
 * six vec4s per shape. Plates' radius is a ball's of the same area, for
 * lightGuess. Teapots', diamonds' and fractals' u, v and normal are their
 * own x, y and z axes, and fractals' level is in halfWidth's place.
 * Glass, which has no gloss coat, has its ior in gloss's place, and its haze
 * in sky's. Plates, which are never skies or inside anything, have their
 * hole there instead.
 * @type {(objects: Shape[]) => Float32Array} */
export const packObjects = (objects) =>
  new Float32Array(
    objects.flatMap((s) => {
      const [u, v, normal] = isBounded(s)
        ? ownAxes(s.turn)
        : [s.u, s.v, s.normal];
      return [
        ...s.center,
        s.shape === PLATE
          ? Math.sqrt((4 * s.halfWidth * s.halfHeight) / Math.PI)
          : s.radius,
        ...[...normal, s.shape],
        ...[...u, isFractal(s) ? s.level : s.halfWidth],
        ...[...v, s.halfHeight],
        ...[...s.color, s.material],
        ...[
          s.material === GLASS ? s.ior : s.gloss,
          s.roughness,
          +s.oneSided,
          s.shape === PLATE ? s.hole : s.material === GLASS ? s.haze : +s.sky,
        ],
      ];
    }),
  );

/**
 * The closest shape a ray (from o in unit direction d) hits, as its index in
 * objects (-1 for none) and the distance to it (Infinity for none). Matches
 * `intersect` in shaders/geometry.js.
 * @type {(objects: Shape[], o: number[], d: number[]) => {index: number, t: number}} */
export const hitObject = (objects, o, d) => {
  let closest = Infinity;
  let index = -1;
  for (const [i, s] of objects.entries()) {
    const p = s.center.map((c, i) => c - o[i]);
    let t;
    if (s.shape === SPHERE) {
      const b = dot(p, d);
      const det = b * b - dot(p, p) + s.radius * s.radius;
      if (det < 0) continue;
      t = b - Math.sqrt(det);
      if (t <= 0) t = b + Math.sqrt(det);
    } else if (isBounded(s)) {
      // In its own space, where it fits in a unit ball
      const axes = ownAxes(s.turn);
      const rel = p.map((x) => -x / s.radius);
      const ownO = axes.map((a) => dot(rel, a));
      const ownD = axes.map((a) => dot(d, a) / s.radius);
      t = isFractal(s)
        ? hitFractal(ownO, ownD, s.shape === MANDELBULB, s.level)
        : (s.shape === TEAPOT ? hitTeapot : hitDiamond)(ownO, ownD);
    } else {
      const facing = dot(d, s.normal);
      if (facing === 0 || (s.oneSided && facing > 0)) continue;
      t = dot(p, s.normal) / facing;
      const h = d.map((x, i) => x * t - p[i]);
      if (
        Math.abs(dot(h, s.u)) > s.halfWidth ||
        Math.abs(dot(h, s.v)) > s.halfHeight ||
        dot(h, h) < s.hole * s.hole
      ) {
        continue;
      }
    }
    if (t > 0 && t < closest) {
      closest = t;
      index = i;
    }
  }
  return {index, t: closest};
};
