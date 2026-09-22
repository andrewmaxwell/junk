import {defaults, makeSpecies, NUM_SPECIES, speciesRanges} from './params.js';

// Each preset overrides params.species; unlisted values use makeSpecies' defaults.
const preset = (...species) => species.map((sp, i) => makeSpecies(i, sp));

// Rock-paper-scissors: each species chases the next and flees the previous.
const chaser = {distance: 6, radius: 1, speed: 1.5, angle: 0.6, fadeSpeed: 0.1};

export const presets = {
  colonies: defaults.species,
  tendrils: preset(
    {
      color: [255, 60, 120],
      distance: 12,
      radius: 1,
      angle: 0.4,
      speed: 2,
      fadeSpeed: 0.06,
      strength: 0.03,
    },
    {
      color: [60, 200, 255],
      distance: 10,
      radius: 1,
      angle: 0.5,
      speed: 1.8,
      fadeSpeed: 0.06,
      strength: 0.03,
    },
    {
      color: [255, 220, 80],
      distance: 14,
      radius: 1,
      angle: 0.3,
      speed: 2.2,
      fadeSpeed: 0.06,
      strength: 0.03,
    },
  ),
  territories: preset(
    {
      color: [255, 80, 80],
      others: -2,
      maxStrength: 0.1,
      angle: 1,
      turnSpeed: 0.5,
    },
    {
      color: [80, 255, 120],
      others: -2,
      maxStrength: 0.1,
      angle: 1,
      turnSpeed: 0.5,
    },
    {
      color: [90, 120, 255],
      others: -2,
      maxStrength: 0.1,
      angle: 1,
      turnSpeed: 0.5,
    },
  ),
  lace: preset(
    {color: [255, 120, 40], others: 0.8, distance: 6, radius: 1, speed: 1.5},
    {color: [40, 220, 200], others: 0.8, distance: 6, radius: 1, speed: 1.5},
    {color: [200, 80, 255], others: 0.8, distance: 6, radius: 1, speed: 1.5},
  ),
  chase: preset(
    {...chaser, color: [255, 70, 70], follow2: 1.5, follow3: -1.5},
    {...chaser, color: [70, 255, 90], follow3: 1.5, follow1: -1.5},
    {...chaser, color: [80, 120, 255], follow1: 1.5, follow2: -1.5},
  ),
  foam: preset(
    {
      color: [255, 150, 200],
      angle: 1.5,
      turnSpeed: 0.6,
      speed: 0.6,
      scattering: 0,
      distance: 2,
    },
    {
      color: [150, 255, 200],
      angle: 1.5,
      turnSpeed: 0.6,
      speed: 0.6,
      scattering: 0,
      distance: 2,
    },
    {
      color: [200, 170, 255],
      angle: 1.5,
      turnSpeed: 0.6,
      speed: 0.6,
      scattering: 0,
      distance: 2,
    },
  ),
};

const between = (min, max) => min + Math.random() * (max - min);

// Narrower than the slider ranges, to avoid mostly-black results.
const randomRanges = {
  distance: [1, 15],
  angle: [0.2, 1.5],
  speed: [0.5, 2.5],
  turnSpeed: [0.1, 0.8],
  scattering: [0, 0.3],
  strength: [0.02, 0.08],
  maxStrength: [0.1, 0.5],
  fadeSpeed: [0.05, 0.2],
};

const hsl = (h, s, l) => {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return (
      255 *
      (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
    );
  };
  return [f(0), f(8), f(4)].map(Math.round);
};

export const randomSpecies = () => {
  const hue = Math.random();
  return defaults.species.map((_, i) => {
    const sp = {color: hsl((hue + i / 3) % 1, 1, 0.6)};
    for (const [key, [min, max]] of Object.entries(randomRanges)) {
      sp[key] = Number(between(min, max).toPrecision(3));
    }
    const [minR, maxR] = speciesRanges.radius;
    sp.radius = Math.round(between(minR, Math.min(maxR, 3)));
    for (let j = 0; j < NUM_SPECIES; j++) {
      const [min, max] = i === j ? [0.5, 1.5] : [-1.5, 1];
      sp[`follow${j + 1}`] = Number(between(min, max).toPrecision(3));
    }
    return sp;
  });
};
