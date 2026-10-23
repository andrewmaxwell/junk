// Lasers: beams so narrow and straight that a path from the camera never
// happens to land in one, so they're followed forward from the laser
// instead, here, whenever the objects change. At glass a beam splits into a
// reflection and a refraction, by Fresnel's equations; metal reflects it;
// where it lands on paint, it leaves a spot of light, a small panel light
// that lights the room like any other, and where it crosses glass, dust
// and flaws on the surface scatter a little into a glint. The shader draws
// the beams where they light up fog (`beamGlow` in shaders/fog.js).

import {
  DIFFUSE,
  GLASS,
  LIGHT,
  MIRROR,
  PLATE,
  SPHERE,
  hitObject,
  plate,
  sphere,
} from './shapes.js';
import {cross, dot, normalize} from './vec.js';

/** @typedef {import('./shapes.js').Shape} Shape */

/**
 * @typedef {{position: number[], direction: number[], color: number[], wavelength: number, radius: number}} Laser
 * `color` is its power in each channel, `wavelength` its color in
 * nanometers, which decides how much glass bends it, and `radius` the
 * beam's.
 */

/**
 * @typedef {{start: number[], direction: number[], length: number, power: number[], radius: number}} Beam
 * A straight piece of a beam, carrying `power` from `start`
 */

/** Beams this much dimmer than their laser are dropped */
const FAINTEST = 1e-3;
/** The fraction of a beam that glass's surface scatters where it crosses it */
const GLINT = 0.002;
/** How far off a surface a beam starts again */
const OFFSET = 0.01;

const scale = (/** @type {number[]} */ v, /** @type {number} */ k) =>
  v.map((x) => x * k);

/** As in shaders/materials.js */
const fresnelDielectric = (
  /** @type {number} */ cosI,
  /** @type {number} */ eta,
) => {
  const c = Math.min(1, Math.max(0, cosI));
  const sinT2 = (1 - c * c) / (eta * eta);
  if (sinT2 >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT2);
  const s = (c - eta * cosT) / (c + eta * cosT);
  const p = (eta * c - cosT) / (eta * c + cosT);
  return 0.5 * (s * s + p * p);
};

/**
 * The beams and spots of light from these lasers, among these objects.
 * `dispersion` is the setting, as glassIndex in shaders/materials.js uses
 * it. Fog dims the beams in the shader, but not the spots: in a light haze
 * that's little.
 * @type {(lasers: Laser[], objects: Shape[], dispersion: number) => {beams: Beam[], spots: Shape[]}}
 */
export const traceLasers = (lasers, objects, dispersion) => {
  /** @type {Beam[]} */
  const beams = [];
  /** @type {Shape[]} */
  const spots = [];
  for (const laser of lasers) {
    const faintest = FAINTEST * Math.max(...laser.color);
    /**
     * Follows a beam from o in unit direction d, inside glass object
     * `inside` (or null), splitting it where it reaches glass
     * @type {(o: number[], d: number[], power: number[], inside: Shape | null, depth: number) => void}
     */
    const follow = (o, d, power, inside, depth) => {
      if (depth > 16 || Math.max(...power) < faintest) return;
      const {index, t} = hitObject(objects, o, d);
      const length = Math.min(t, 1e4);
      // In glass, it's dimmed like light in shaders/materials.js'
      // glassTransmittance, and there's no fog to show it
      if (inside) {
        power = power.map(
          (c, i) => c * inside.color[i] ** (length / inside.radius),
        );
      } else {
        beams.push({
          start: o,
          direction: d,
          length,
          power,
          radius: laser.radius,
        });
      }
      const s = objects[index];
      if (!s || s.material === LIGHT) return;
      if (s.shape !== SPHERE && s.shape !== PLATE) return;
      const p = o.map((x, i) => x + d[i] * t);
      const n =
        s.shape === SPHERE
          ? normalize(p.map((x, i) => x - s.center[i]))
          : s.normal;
      const into = dot(n, d) < 0;
      const nl = into ? n : scale(n, -1);
      const cosI = -dot(d, nl);
      const reflected = d.map((x, i) => x + 2 * cosI * nl[i]);
      const out = p.map((x, i) => x + nl[i] * OFFSET);
      const through = p.map((x, i) => x - nl[i] * OFFSET);

      if (s.material === GLASS) {
        // A ball of light whose power is GLINT of the beam's
        spots.push(
          sphere(
            laser.radius,
            p,
            scale(power, GLINT / (4 * Math.PI ** 2 * laser.radius ** 2)),
            LIGHT,
          ),
        );
        power = scale(power, 1 - GLINT);
        const index =
          s.ior +
          dispersion * 0.05 * (s.ior - 1) * ((550 / laser.wavelength) ** 2 - 1);
        const eta = into ? index : 1 / index;
        const reflectance = fresnelDielectric(cosI, eta);
        follow(out, reflected, scale(power, reflectance), inside, depth + 1);
        const sinT2 = (1 - cosI * cosI) / (eta * eta);
        if (sinT2 < 1) {
          const refracted = normalize(
            d.map(
              (x, i) => x / eta + (cosI / eta - Math.sqrt(1 - sinT2)) * nl[i],
            ),
          );
          // Glass plates are too thin to be inside
          const next = s.shape === PLATE ? inside : into ? s : null;
          follow(
            through,
            refracted,
            scale(power, 1 - reflectance),
            next,
            depth + 1,
          );
        }
      } else if (s.material === MIRROR) {
        const f = s.color.map((c) => c + (1 - c) * (1 - cosI) ** 5);
        follow(
          out,
          reflected,
          power.map((c, i) => c * f[i]),
          inside,
          depth + 1,
        );
      } else if (s.material === DIFFUSE) {
        // A glossy coat reflects some of it, as varnish does
        const coat = s.gloss * fresnelDielectric(cosI, 1.5);
        follow(out, reflected, scale(power, coat), inside, depth + 1);
        // The rest scatters off the paint, evenly in every direction, from
        // the patch the beam lights: longer the more it slants
        const along = d.map((x, i) => x + cosI * nl[i]);
        const u =
          Math.hypot(...along) > 1e-3
            ? normalize(along)
            : normalize(
                cross(nl, Math.abs(nl[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]),
              );
        const halfWidth = laser.radius / Math.max(cosI, 0.2);
        const area = 4 * halfWidth * laser.radius;
        spots.push(
          plate(
            out,
            nl,
            u,
            halfWidth,
            laser.radius,
            power.map(
              (c, i) => ((1 - coat) * s.color[i] * c) / (Math.PI * area),
            ),
            {material: LIGHT, oneSided: true},
          ),
        );
      }
    };
    follow(laser.position, normalize(laser.direction), laser.color, null, 0);
  }
  return {beams, spots};
};

/**
 * Packs beams into records like the `Shape`s in the `objects` buffer, after
 * them: start and radius in centerRadius, direction and length in
 * normalShape, and power in colorMaterial
 * @type {(beams: Beam[]) => Float32Array}
 */
export const packBeams = (beams) =>
  new Float32Array(
    beams.flatMap((b) => [
      ...[...b.start, b.radius],
      ...[...b.direction, b.length],
      ...Array(8).fill(0),
      ...[...b.power, 0],
      ...Array(4).fill(0),
    ]),
  );
