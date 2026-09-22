export const NUM_SPECIES = 3; // keep in sync with shaders/params.wgsl

const species = (color, overrides) => ({
  color,
  distance: 3,
  radius: 3,
  angle: 0.75,
  speed: 1,
  turnSpeed: 0.25,
  scattering: 0.1,
  strength: 0.04,
  maxStrength: 0.2,
  others: -0.5, // how much this species follows (+) or avoids (-) the others' trails
  ...overrides,
});

// Tunable parameters, grouped the same way as the GUI folders.
export const params = {
  species: [
    species([255, 90, 30]),
    species([30, 150, 255], {distance: 8, radius: 1, angle: 0.5, speed: 1.5}),
    species([190, 255, 60], {
      distance: 2,
      angle: 1.2,
      turnSpeed: 0.5,
      speed: 0.7,
    }),
  ],
  world: {fadeSpeed: 0.15, brightness: 1, stepsPerFrame: 2},
  brush: {radius: 4, value: 100},
};

/** @type {Record<string, [number, number, number?]>} */
const speciesRanges = {
  distance: [-10, 10],
  radius: [0, 6, 1],
  angle: [0, Math.PI],
  speed: [0, 5],
  turnSpeed: [-0.2, 1],
  scattering: [0, 1],
  strength: [0, 0.1],
  maxStrength: [0, 1],
  others: [-2, 2],
};

/** @type {Record<string, Record<string, [number, number, number?]>>} */
const sharedRanges = {
  world: {fadeSpeed: [0, 0.2], brightness: [0.2, 5], stepsPerFrame: [1, 10, 1]},
  brush: {radius: [1, 50], value: [0, 100]},
};

const title = (s) => s[0].toUpperCase() + s.slice(1);

const addControls = (folder, target, ranges) => {
  for (const [key, range] of Object.entries(ranges)) {
    folder.add(target, key, ...range);
  }
};

export const createGui = (reset) => {
  const gui = new /** @type {any} */ (window).dat.GUI();
  params.species.forEach((sp, i) => {
    const folder = gui.addFolder(`Species ${i + 1}`);
    folder.addColor(sp, 'color');
    addControls(folder, sp, speciesRanges);
  });
  for (const [group, ranges] of Object.entries(sharedRanges)) {
    addControls(gui.addFolder(title(group)), params[group], ranges);
  }
  gui.add({reset}, 'reset');
};
