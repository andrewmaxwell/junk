export const NUM_SPECIES = 3; // keep in sync with shaders/params.wgsl

export const defaultSpecies = {
  color: [255, 255, 255],
  distance: 3,
  radius: 3,
  angle: 0.75,
  speed: 1,
  turnSpeed: 0.25,
  scattering: 0.1,
  strength: 0.04,
  maxStrength: 0.2,
  fadeSpeed: 0.15,
};

/**
 * Builds species i. followN is how much it follows (+) or avoids (-) species
 * N's trail; by default 1 for its own trail and `others` for the rest.
 */
export const makeSpecies = (i, {others = -0.5, ...overrides} = {}) => ({
  ...defaultSpecies,
  ...Object.fromEntries(
    Array.from({length: NUM_SPECIES}, (_, j) => [
      `follow${j + 1}`,
      j === i ? 1 : others,
    ]),
  ),
  ...overrides,
});

// Also the "colonies" preset.
export const defaults = {
  species: [
    makeSpecies(0, {color: [255, 90, 30]}),
    makeSpecies(1, {
      color: [30, 150, 255],
      distance: 8,
      radius: 1,
      angle: 0.5,
      speed: 1.5,
    }),
    makeSpecies(2, {
      color: [190, 255, 60],
      distance: 2,
      angle: 1.2,
      turnSpeed: 0.5,
      speed: 0.7,
    }),
  ],
  view: {brightness: 1, stepsPerFrame: 3},
  brush: {radius: 15, attraction: 1},
};

// Tunable parameters, grouped the same way as the GUI folders.
export const params = structuredClone(defaults);

/** @type {Record<string, [number, number, number?]>} */
export const speciesRanges = {
  distance: [-10, 10],
  radius: [0, 6, 1],
  angle: [0, Math.PI],
  speed: [0, 5],
  turnSpeed: [-0.2, 1],
  scattering: [0, 1],
  strength: [0, 0.1],
  maxStrength: [0, 1],
  fadeSpeed: [0, 0.3],
  follow1: [-2, 2],
  follow2: [-2, 2],
  follow3: [-2, 2],
};

/** @type {Record<string, Record<string, [number, number, number?]>>} */
export const sharedRanges = {
  view: {brightness: [0.2, 5], stepsPerFrame: [1, 10, 1]},
  brush: {radius: [2, 60], attraction: [0, 5]},
};

const isLeaf = (v) => typeof v !== 'object' || typeof v[0] === 'number';

/**
 * Sets the given groups of params back to their defaults, then applies
 * overrides (a partial params object; species can be an array or keyed by
 * index). Mutates in place, since the GUI holds references into params.
 */
export const setParams = (overrides = {}, groups = Object.keys(defaults)) => {
  const assign = (target, base, over) => {
    for (const key of Object.keys(base)) {
      if (isLeaf(base[key])) {
        target[key] = structuredClone(over?.[key] ?? base[key]);
      } else {
        assign(target[key], base[key], over?.[key]);
      }
    }
  };
  for (const group of groups) {
    assign(params[group], defaults[group], overrides[group]);
  }
};

/** Flattens params into [path, value] pairs, e.g. ['species.0.speed', 1]. */
export const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) =>
    isLeaf(value)
      ? [[prefix + key, value]]
      : flatten(value, `${prefix}${key}.`),
  );
