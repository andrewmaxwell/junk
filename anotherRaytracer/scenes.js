// The scenes to pick from: each a list of shapes, a camera, and settings.

import {
  DIFFUSE,
  GLASS,
  LIGHT,
  MIRROR,
  diamond,
  plate,
  skyDome,
  sphere,
  teapot,
} from './shapes.js';
import {cross, normalize} from './vec.js';

/** @typedef {import('./shapes.js').Shape} Shape */

/**
 * @typedef {{
 *   objects: Shape[],
 *   camera: {position: number[], target: number[], zoom: number, focus?: number},
 *   sky?: {sun: number[], haze?: number},
 *   lasers?: import('./photons.js').Laser[],
 *   size?: number,
 *   defaults?: {fog?: number, fogForward?: number, fogBlue?: number, dof?: number, dispersion?: number, exposure?: number, contrast?: number, detail?: number, noise?: number},
 * }} Scene
 * The camera orbits `target`, and starts focused on it, or `focus` away if
 * given. `zoom` is the image height at distance 1. `defaults` overrides the
 * panel's defaults for this scene (see `defaults` in settings.js): `fog` is the
 * fog's density, the chance per unit of distance that light scatters off
 * it, and `dof` the lens size.
 * `sky` colors sky domes: as the real sky looks with the sun in direction
 * `sun`, and `haze` times as hazy as usual (see sky.js). `size` scales the
 * lens and surface detail; it defaults to the camera's distance from its
 * target.
 */

/** @type {() => Scene} */
function cornellScene() {
  // The room spans x 0 to 99, y 0 to 100, and z from -150 forward. The front
  // is open. Walls face inward and are big enough to look endless.
  const big = 1000;
  const wall = {oneSided: true};
  return {
    objects: [
      plate([0, 50, 50], [1, 0, 0], [0, 0, 1], big, big, [0.2, 0.8, 0.2], wall), // left wall
      plate(
        [99, 50, 50],
        [-1, 0, 0],
        [0, 0, 1],
        big,
        big,
        [0.2, 0.2, 0.8],
        wall,
      ), // right wall
      plate([50, 50, -150], [0, 0, 1], [1, 0, 0], big, big, [1, 1, 1], wall), // far wall
      plate([50, 0, 50], [0, 1, 0], [1, 0, 0], big, big, [0.8, 0.2, 0.2], {
        ...wall,
        gloss: 1,
        roughness: 0.14,
      }), // floor
      plate(
        [50, 100, 50],
        [0, -1, 0],
        [1, 0, 0],
        big,
        big,
        [0.8, 0.8, 0.2],
        wall,
      ), // ceiling
      // Floating amber glass, which focuses the panel's light into a warm
      // spot in its shadow
      sphere(12, [35, 74, 60], [0.95, 0.5, 0.15], GLASS),
      sphere(5, [72, 5, 125], [1, 0.78, 0.34], MIRROR, 0, 0.02), // polished gold
      sphere(16.5, [27, 36.5, 47], [0.9, 0.9, 0.9], MIRROR), // mirror ball
      sphere(20, [73, 25, 75], [0.9, 0.9, 0.9], GLASS), // glass ball
      sphere(10, [60, 65, 0], [0.5, 0.5, 0.5], DIFFUSE, 1, 0.25), // upper satin ball
      sphere(16, [20, 16, 160], [0.3, 0.3, 0.35], DIFFUSE, 1, 0.032), // lower left polished ball
      // A panel in the ceiling, like the original Cornell box's. Last, so
      // links' edits of the objects above still point at the same ones.
      plate([50, 99.8, 30], [0, -1, 0], [1, 0, 0], 22, 28, [30, 28.5, 26], {
        material: LIGHT,
        oneSided: true,
      }),
    ],
    camera: {
      position: [50, 50.014, 350],
      target: [50, 33, 10],
      zoom: 0.5,
      focus: 262.872,
    },
    defaults: {dof: 0.004},
  };
}

/**
 * The classic MIS test scene from Eric Veach's thesis: glossy plates, sharp
 * at the top to rough at the bottom, reflecting lights of equal power, tiny on
 * the left to large on the right. Light sampling is noisy where sharp plates
 * reflect big lights; bounce sampling is noisy where rough plates reflect
 * small lights; MIS handles both.
 * @type {() => Scene} */
function veachScene() {
  const eye = [0, 2, 20];
  const lightRow = [0, 5, -3];
  /** @type {Shape[]} */
  const objects = [
    plate([0, -4, 0], [0, 1, 0], [1, 0, 0], 100, 100, [0.25, 0.25, 0.25], {
      oneSided: true,
    }), // floor
  ];

  const radii = [0.03, 0.1, 0.3, 0.9];
  const colors = [
    [1, 0.55, 0.45],
    [1, 0.9, 0.5],
    [0.55, 1, 0.6],
    [0.5, 0.7, 1],
  ];
  radii.forEach((radius, i) => {
    // Brightness ∝ 1 / area, so every light gives off the same total power
    const power = 3.2 / (radius * radius);
    const color = colors[i].map((c) => c * power);
    const center = [-3.75 + 2.5 * i, lightRow[1], lightRow[2]];
    objects.push(sphere(radius, center, color, LIGHT));
  });

  [0.014, 0.036, 0.089, 0.2].forEach((roughness, i) => {
    const center = [0, 0.2 - 0.85 * i, -1.5 + 1.4 * i];
    // Tilt each plate to reflect the camera's view up toward the lights
    const toEye = normalize(eye.map((e, k) => e - center[k]));
    const toLights = normalize(lightRow.map((l, k) => l - center[k]));
    const normal = normalize(toEye.map((e, k) => e + toLights[k]));
    objects.push(
      plate(center, normal, [1, 0, 0], 4.5, 0.4, [0.9, 0.9, 0.9], {
        material: MIRROR,
        roughness,
      }),
    );
  });

  return {
    objects,
    camera: {
      position: [0, 2.002, 20],
      target: [0, 0.74, -1],
      zoom: 0.6,
      focus: 18.7,
    },
    defaults: {dof: 0.004},
  };
}

/**
 * A dark, foggy room lit only by a light outside a window with blinds, so the
 * light comes in as beams, with a glass ball and a brushed copper ball in them.
 * @type {() => Scene} */
function shaftsScene() {
  // The room spans x 0 to 100, y 0 to 100, and z from -100 forward. The front
  // is open. The window is in the left wall, at y 40 to 80 and z -50 to 0.
  const big = 1000;
  // Cool walls and a warm floor, against warm late-afternoon light. Dark,
  // so little light bounces around to fill the fog with haze.
  const gray = [0.2, 0.23, 0.3];
  const floor = [0.32, 0.25, 0.18];
  const wall = {oneSided: true};
  // The left wall is two-sided, so it blocks the light outside it
  /** @type {(y0: number, y1: number, z0: number, z1: number) => Shape} */
  const leftWall = (y0, y1, z0, z1) =>
    plate(
      [0, (y0 + y1) / 2, (z0 + z1) / 2],
      [1, 0, 0],
      [0, 0, 1],
      (z1 - z0) / 2,
      (y1 - y0) / 2,
      gray,
    );
  const objects = [
    plate([50, 0, 0], [0, 1, 0], [1, 0, 0], big, big, floor, wall), // floor
    // The ceiling stops at the walls, so it doesn't shade the light outside
    plate([50, 100, 0], [0, -1, 0], [1, 0, 0], 50, big, gray, wall),
    plate([50, 50, -100], [0, 0, 1], [1, 0, 0], big, big, gray, wall), // back wall
    plate([100, 50, 0], [-1, 0, 0], [0, 0, 1], big, big, gray, wall), // right wall
    leftWall(0, 40, -big, big), // below the window
    leftWall(80, 100, -big, big), // above it
    leftWall(40, 80, -big, -50), // behind it
    leftWall(40, 80, 0, big), // in front of it
    // Outside, small and far, so the beams have sharp edges
    sphere(1.5, [-120, 150, -30], [220000, 170000, 110000], LIGHT),
    // Dim blue sky behind the camera, through the open front, so shadows
    // and fog outside the beams are cool
    sphere(30, [50, 60, 260], [0.8, 1.4, 3.2], LIGHT),
    sphere(12, [49.532, 12, -14.008], [0.95, 0.95, 0.95], GLASS),
    sphere(10, [75.715, 10, -41.197], [0.95, 0.64, 0.54], MIRROR, 0, 0.081), // brushed copper
  ];
  // Blinds across the window, 5.5 tall with gaps of 2.5. Each gap lets in a
  // thin sheet of light, seen edge on from the front.
  for (let y = 40; y < 80; y += 8) objects.push(leftWall(y, y + 5.5, -50, 0));
  return {
    objects,
    camera: {
      position: [85.214, 26.04, 103.742],
      target: [46.617, 32.276, -32.534],
      zoom: 0.8,
      focus: 149.874,
    },
    defaults: {fog: 0.004},
  };
}

/**
 * Glass balls on a pale floor under one small light, casting bright, rainbow-
 * edged caustics: light focused by the glass.
 * @type {() => Scene} */
function causticsScene() {
  const big = 1000;
  const floor = [0.75, 0.75, 0.75];
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, floor, {oneSided: true}),
      plate([0, 50, -40], [0, 0, 1], [1, 0, 0], big, big, floor, {
        oneSided: true,
      }), // back wall
      // Up, back and to the left, so the caustics fall toward the camera
      sphere(4, [-60, 90, -30], [500, 470, 420], LIGHT),
      // Faint blue sky for the shadows
      sphere(150, [0, 600, 400], [0.15, 0.2, 0.3], LIGHT),
      sphere(12, [-8, 12, 0], [0.97, 0.97, 0.97], GLASS),
      sphere(7, [20, 7, -8], [0.95, 0.55, 0.45], GLASS), // amber
      sphere(5, [16, 5, 28], [0.5, 0.75, 0.95], GLASS), // blue
      sphere(3, [-22, 3, 18], [0.97, 0.97, 0.97], GLASS),
      sphere(6, [-32, 6, -10], [0.9, 0.9, 0.9], MIRROR),
    ],
    camera: {
      position: [35.026, 45.042, 94.969],
      target: [0, 4, 10],
      zoom: 0.65,
      focus: 95.674,
    },
    defaults: {dof: 0.004},
  };
}

/**
 * A rectangular light at `center`, facing `target`, upright: halfWidth
 * across and halfHeight up and down, like a photographer's softbox
 * @type {(center: number[], target: number[], halfWidth: number, halfHeight: number, color: number[]) => Shape}
 */
const softbox = (center, target, halfWidth, halfHeight, color) => {
  const normal = normalize(target.map((t, i) => t - center[i]));
  const u = normalize(cross([0, 1, 0], normal));
  return plate(center, normal, u, halfWidth, halfHeight, color, {
    material: LIGHT,
    oneSided: true,
  });
};

/**
 * Teapots on a table, lit like glass in a product photo: a softbox high
 * behind and to the left, so the glass teapot, the color of tea, focuses it
 * into an amber caustic reaching toward the camera; a dim one in front for
 * fill; and strip lights behind each side, out of the picture, which the
 * glass's edges catch as bright lines. With glazed china and polished gold.
 * @type {() => Scene} */
function teapotsScene() {
  const big = 1000;
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.7, 0.64, 0.56], {
        oneSided: true,
      }), // linen tablecloth
      // Far back, so it's out of focus and the table fades into it, not
      // meeting it at a hard line
      plate([0, 50, -90], [0, 0, 1], [1, 0, 0], big, big, [0.16, 0.18, 0.22], {
        oneSided: true,
      }), // dark wall
      softbox([-60, 80, -50], [0, 8, 0], 6, 4.5, [285, 250, 200]), // key
      softbox([70, 35, 110], [0, 10, 0], 40, 25, [0.2, 0.21, 0.23]), // fill
      teapot(15, [0, 0, 0], 15, [0.95, 0.62, 0.3], GLASS),
      teapot(10, [-34, 0, -16], -160, [0.85, 0.85, 0.82], DIFFUSE, 1, 0.03),
      teapot(7, [19, 0, 24], -120, [0.95, 0.75, 0.4], MIRROR, 0, 0.03),
      sphere(4, [-14, 4, 26], [0.97, 0.97, 0.97], GLASS),
      // Rim lights
      softbox([-90, 22, -20], [0, 10, 0], 6, 24, [12, 12, 12]),
      softbox([90, 22, -20], [0, 10, 0], 6, 24, [12, 12, 12]),
    ],
    camera: {position: [26, 30, 80], target: [0, 8, 4], zoom: 0.6},
    // Shallow, as in a product photo, so the table's far edge blurs
    defaults: {dof: 0.015},
  };
}

/**
 * A big round brilliant diamond floating over dark velvet, lit like a
 * jeweler's: softboxes light whole facets, small lights make sparkles, and
 * the stone bends light so much that colors fan out into fire. The dark
 * between the lights is what gives it contrast.
 * @type {() => Scene} */
function diamondScene() {
  const big = 1000;
  const center = [0, 14, 0];
  /** The point this far from the diamond, at this height (sine of the angle up) and angle around */
  const around = (/** @type {number} */ distance, up, angle) => {
    const out = Math.sqrt(1 - up * up);
    return [
      center[0] + distance * out * Math.cos(angle),
      center[1] + distance * up,
      center[2] + distance * out * Math.sin(angle),
    ];
  };
  // Big softboxes in a ring above, with dark gaps between them, as in a
  // jeweler's light tent: whole facets light up white or stay dark, which
  // shows the cut's pattern
  const softboxes = Array.from({length: 8}, (_, k) =>
    softbox(
      around(110, 0.65, (k + 0.5) * (Math.PI / 4)),
      center,
      16,
      16,
      [4, 4, 4],
    ),
  );
  // Small bright lights spread over the sky, from a little above the
  // horizon to overhead, along a golden-angle spiral, for sparkle
  const count = 40;
  const lights = Array.from({length: count}, (_, i) =>
    sphere(
      1.8,
      around(
        120,
        0.3 + (0.7 * (i + 0.5)) / count,
        i * Math.PI * (3 - Math.sqrt(5)),
      ),
      [200, 200, 200],
      LIGHT,
    ),
  );
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.08, 0.08, 0.08]), // dark velvet
      diamond(10, [0, 4, 0], 10),
      ...softboxes,
      ...lights,
      // A small, bright light high behind it, which the stone focuses into
      // a scatter of rainbow sparks on the velvet in front of it
      sphere(0.6, around(130, 0.9, -Math.PI / 2), [4e4, 4e4, 4e4], LIGHT),
    ],
    // Low, as diamonds are usually shown, so its outline reads: the crown
    // over the pavilion
    camera: {position: [0, 36, 56], target: [0, 8, 4], zoom: 0.55},
    // A clean stone: smudges would blur the sparkles into a haze
    defaults: {dof: 0.004, detail: 0},
  };
}

/**
 * A ball lens: parallel green laser beams in a dark, hazy room go through a
 * slightly cloudy glass ball, which bends each by Snell's law and brings
 * them together behind it. Not all at one point: beams near the edge cross
 * closer than ones near the middle (spherical aberration), which cross
 * about 1.5 radii past the center. Each surface also splits off a faint
 * reflection. The beams land on the matte white wall, which lights the
 * room; a very faint panel overhead shows the rest. Seen side on, so every
 * beam can be checked against where Snell's law says it goes.
 * @type {() => Scene} */
function lasersScene() {
  const big = 1000;
  const white = [0.75, 0.75, 0.75];
  const wall = {oneSided: true};
  const ball = [0, 20, -15];
  // How far above or below the ball's center each beam goes
  const heights = [-8.5, -6, -3, 0, 3, 6, 8.5];
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.5, 0.5, 0.5], wall), // floor
      plate([0, 60, 0], [0, -1, 0], [1, 0, 0], big, big, white, wall), // ceiling
      plate([-60, 30, 0], [1, 0, 0], [0, 0, 1], big, big, white, wall), // left wall
      plate([60, 30, 0], [-1, 0, 0], [0, 0, 1], big, big, white, wall), // right wall
      plate([0, 30, -70], [0, 0, 1], [1, 0, 0], big, big, white, wall), // back wall
      plate([0, 30, 60], [0, 0, -1], [1, 0, 0], big, big, white, wall), // front wall
      {...sphere(10, ball, [0.98, 0.98, 0.98], GLASS), haze: 0.008},
      plate([0, 59.9, -10], [0, -1, 0], [1, 0, 0], 12, 12, [0.2, 0.2, 0.2], {
        material: LIGHT,
        oneSided: true,
      }), // faint panel
    ],
    lasers: heights.map((h) => ({
      position: [-59.9, ball[1] + h, ball[2]],
      direction: [1, 0, 0],
      color: [30, 600, 12],
      wavelength: 532,
      radius: 0.1,
    })),
    camera: {position: [0, 20, 72], target: ball, zoom: 0.9},
    defaults: {fog: 0.004, fogForward: 0.3, exposure: 1, contrast: 1.5},
  };
}

/**
 * Two mirrors facing each other, reflecting glowing orbs and balls between
 * them back and forth into the distance.
 * @type {() => Scene} */
function mirrorsScene() {
  const big = 1000;
  // Slightly green, like real mirror glass, so each reflection is a bit
  // greener and dimmer than the last
  const mirror = [0.88, 0.93, 0.9];
  /** @type {(x: number) => Shape} */
  const wall = (x) =>
    plate([x, 40, 0], [-Math.sign(x), 0, 0], [0, 0, 1], 100, 40, mirror, {
      material: MIRROR,
      // So orbiting outside shows the room, like a dollhouse, rather than
      // the back of a mirror reflecting nothing
      oneSided: true,
    });
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.3, 0.28, 0.26], {
        oneSided: true,
        gloss: 1,
        roughness: 0.081,
      }), // floor
      wall(-30),
      wall(30),
      sphere(2.5, [-12, 26, -10], [8, 4, 1.2], LIGHT), // orange orb
      sphere(2, [14, 18, 8], [1.5, 3.5, 8], LIGHT), // blue orb
      sphere(1.8, [2, 32, 22], [7, 2, 5], LIGHT), // pink orb
      // Soft white light high above
      sphere(30, [0, 200, 40], [15, 15, 15], LIGHT),
      sphere(6, [-8, 6, 0], [0.9, 0.2, 0.15], DIFFUSE, 1, 0.063), // red
      sphere(5, [10, 5, -12], [0.95, 0.8, 0.45], MIRROR), // gold
      sphere(7, [6, 7, 22], [0.97, 0.97, 0.97], GLASS),
      sphere(3, [-16, 3, 26], [0.2, 0.6, 0.3], DIFFUSE, 1, 0.063), // green
    ],
    // Orbiting a point inside the room
    camera: {
      position: [42.776, 20.835, 60.095],
      target: [-5.472, 15.456, 28.498],
      zoom: 0.8,
    },
    // The size of the first view the scene was tuned with, which sets the
    // surface detail's scale
    size: 37.4,
    defaults: {exposure: 0.5},
  };
}

/**
 * A few balls on a polished black table, in front of a string of fairy lights
 * that the lens blurs into discs (bokeh).
 * @type {() => Scene} */
function bokehScene() {
  const big = 1000;
  /** @type {Shape[]} */
  const objects = [
    plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.12, 0.07, 0.04], {
      oneSided: true,
      gloss: 1,
      roughness: 0.026,
    }), // polished walnut table
    // A dark wall far behind, for the fairy lights to glow on
    plate([0, 50, -230], [0, 0, 1], [1, 0, 0], big, big, [0.3, 0.24, 0.2], {
      oneSided: true,
    }),
    // A big soft light up and to the left, like a window
    sphere(20, [-60, 70, 40], [30, 28.8, 27], LIGHT),
    // Dim cool light from above, so shadows aren't empty
    sphere(200, [0, 500, 150], [0.4, 0.45, 0.55], LIGHT),
    sphere(5, [0, 5, 0], [0.97, 0.97, 0.97], GLASS),
    sphere(4, [-11, 4, -4], [0.95, 0.75, 0.4], MIRROR), // gold
    sphere(3.5, [10, 3.5, -3], [0.7, 0.08, 0.1], DIFFUSE, 1, 0.032), // red
  ];
  // Fairy lights far behind, sagging between posts
  const colors = [
    [1, 0.65, 0.3],
    [1, 0.8, 0.5],
    [1, 0.55, 0.25],
  ];
  for (let i = 0; i < 28; i++) {
    const x = -140 + i * 10;
    const sag = Math.cos((((x + 140) % 70) / 70 - 0.5) * Math.PI);
    const y = 32 - 14 * sag;
    const color = colors[i % 3].map((c) => c * 6);
    objects.push(sphere(0.8, [x, y, -150 - i * 2], color, LIGHT));
  }
  return {
    objects,
    camera: {position: [3, 9, 38], target: [0, 5, 0], zoom: 0.55},
    defaults: {dof: 0.02},
  };
}

/**
 * Balls on a plain at sunset. The air is thin fog, so it glows around the
 * low sun, and the sky fades from orange to blue overhead.
 * @type {() => Scene} */
function sunsetScene() {
  const big = 100000;
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.5, 0.42, 0.35], {
        oneSided: true,
      }),
      // The sun, low and far, to the left of the balls
      sphere(40, [-2800, 250, -1200], [6000, 3000, 1200], LIGHT),
      // The sky: a shallow dome over everything, 2000 overhead and meeting
      // the ground 14000 away, so there's no gap at the horizon, and not so
      // much fog that it hides the sky. It lights the shadows and the air,
      // blue from overhead and orange from near the sun.
      skyDome(50000, [0, -48000, 0], 0.6),
      sphere(20, [0, 20, 0], [0.8, 0.8, 0.8], DIFFUSE, 1, 0.2),
      sphere(10, [35, 10, 20], [0.95, 0.95, 0.95], GLASS),
      sphere(12, [-40, 12, 30], [0.9, 0.9, 0.9], MIRROR),
      sphere(6, [1.9255, 6, 60.734], [0.15, 0.3, 0.6], DIFFUSE, 1, 0.063),
      sphere(40, [-150, 40, -250], [0.45, 0.35, 0.3], DIFFUSE),
      sphere(25, [120, 25, -180], [0.45, 0.35, 0.3], DIFFUSE),
    ],
    // Focused on the small blue ball
    camera: {
      position: [49.764, 18.299, 166.28],
      target: [-45, 25, 0],
      zoom: 0.75,
      focus: 109.273,
    },
    sky: {sun: [-2800, 250, -1200]},
    // Thin, since the sky has haze of its own
    defaults: {fog: 0.0001, fogForward: 0.7, fogBlue: 1, dof: 0.004},
  };
}

/**
 * A red, a green and a blue light in a row, in front of a white wall. Each
 * light's shadow is lit by the other two, so it's the opposite color: cyan,
 * magenta and yellow, in the reverse order of the lights. Where two shadows
 * overlap only one light gets in, so it's red, green or blue, and where all
 * three do it's black. The floating ball's shadows overlap like a color wheel;
 * the post by the wall casts shadows that nearly coincide, and the one further
 * out casts them apart. Glass focuses each light into its own colored spot,
 * and fog shows the beams.
 * @type {() => Scene} */
function rgbShadowsScene() {
  const big = 1000;
  const white = [0.8, 0.8, 0.8];
  const gray = [0.3, 0.3, 0.3];
  // Small, so the shadows have sharp edges
  /** @type {(x: number, color: number[]) => Shape} */
  const light = (x, color) =>
    sphere(
      1,
      [x, 25, 30],
      color.map((c) => c * 3500),
      LIGHT,
    );
  /** @type {(x: number, z: number) => Shape} */
  const post = (x, z) => plate([x, 15, z], [0, 0, 1], [1, 0, 0], 1, 15, gray);
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, white, {oneSided: true}),
      plate([0, 50, -40], [0, 0, 1], [1, 0, 0], big, big, white, {
        oneSided: true,
      }), // wall
      light(-11, [1, 0, 0]),
      light(0, [0, 1, 0]),
      light(11, [0, 0, 1]),
      // Faint sky, so the top of the mirror ball reflects something
      sphere(150, [0, 600, 400], [0.15, 0.15, 0.15], LIGHT),
      sphere(4, [-14, 26, -29], gray, DIFFUSE, 1, 0.081), // floating ball
      post(14, -15),
      post(-2, -34),
      sphere(5, [-2, 5, 4], [0.97, 0.97, 0.97], GLASS),
      sphere(4, [16, 4, 14], [0.9, 0.9, 0.9], MIRROR),
    ],
    camera: {
      position: [-70.148, 23.137, 40.228],
      target: [5.284, 14.904, -9.279],
      zoom: 0.6,
      focus: 80.989,
    },
    // The size of the first view the scene was tuned with, which sets the
    // lens and surface detail's scale
    size: 109.6,
    // The lights are each one primary color, so glass has no white light to
    // split into rainbows; dispersion would only add noise
    defaults: {fog: 0.0004, dispersion: 0, exposure: -1.5, dof: 0.004},
  };
}

/**
 * A dark gallery lit only by thin colored strips of light, after Dan
 * Flavin's fluorescent tubes: a row on the back wall, and one diagonal on the
 * left. Each washes the walls in its color, the polished floor stretches
 * their reflections into streaks, light haze glows around them, and the
 * balls show colored soft shadows, one for each strip.
 * @type {() => Scene} */
function neonScene() {
  // The room spans x -60 to 60, y 0 to 70, and z from -40 forward. The
  // front is open.
  const big = 1000;
  const wall = {oneSided: true};
  /**
   * A tube of light, standing off a wall, facing out along normal. Panels
   * shine from their front only, and a tube glows all around, so it's two
   * back to back: one lighting the room, and one washing the wall behind it
   * in its color. Thin, so its shadows are sharp across and soft along.
   * @type {(center: number[], normal: number[], along: number[], length: number, color: number[]) => Shape[]}
   */
  const tube = (center, normal, along, length, color) =>
    [1, -1].map((side) =>
      plate(
        center,
        normal.map((n) => n * side),
        along.map((a) => a * side),
        0.6,
        length,
        color.map((c) => c * 30),
        {material: LIGHT, oneSided: true},
      ),
    );
  // Diagonal, from low near the back to high toward the front
  const diagonal = normalize([0, 1, 1.3]);
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.35, 0.35, 0.37], {
        ...wall,
        gloss: 1,
        roughness: 0.04,
      }), // polished concrete floor
      plate(
        [0, 50, -40],
        [0, 0, 1],
        [1, 0, 0],
        big,
        big,
        [0.8, 0.8, 0.8],
        wall,
      ), // back wall
      plate(
        [-60, 50, 0],
        [1, 0, 0],
        [0, 0, 1],
        big,
        big,
        [0.8, 0.8, 0.8],
        wall,
      ), // left wall
      plate(
        [60, 50, 0],
        [-1, 0, 0],
        [0, 0, 1],
        big,
        big,
        [0.8, 0.8, 0.8],
        wall,
      ), // right wall
      plate([0, 70, 0], [0, -1, 0], [1, 0, 0], big, big, [0.3, 0.3, 0.3], wall), // ceiling
      // Upright tubes on the back wall
      ...tube([-33, 22, -36], [0, 0, 1], [1, 0, 0], 20, [1, 0.15, 0.45]), // pink
      ...tube([-11, 22, -36], [0, 0, 1], [1, 0, 0], 20, [0.1, 0.75, 1]), // cyan
      ...tube([11, 22, -36], [0, 0, 1], [1, 0, 0], 20, [1, 0.55, 0.1]), // amber
      ...tube([33, 22, -36], [0, 0, 1], [1, 0, 0], 20, [0.2, 1, 0.3]), // green
      // The diagonal, on the left wall
      ...tube(
        [-56, 30, 0],
        [1, 0, 0],
        normalize(cross([1, 0, 0], diagonal)),
        28,
        [1, 0.85, 0.5],
      ),
      sphere(9, [-8, 9, -8], [0.8, 0.8, 0.8], DIFFUSE), // white, for colored shadows
      sphere(6, [18, 6, 4], [0.95, 0.95, 0.95], MIRROR), // chrome
      sphere(7, [-30, 7, 14], [0.97, 0.97, 0.97], GLASS),
      sphere(4, [8, 4, 22], [0.05, 0.05, 0.05], DIFFUSE, 1, 0.03), // black lacquer
    ],
    camera: {position: [24, 22, 95], target: [-6, 20, -10], zoom: 0.75},
    defaults: {fog: 0.002, dof: 0.004},
  };
}

/** @type {Record<string, () => Scene>} */
export const scenes = {
  cornell: cornellScene,
  veach: veachScene,
  shafts: shaftsScene,
  caustics: causticsScene,
  teapots: teapotsScene,
  diamond: diamondScene,
  lasers: lasersScene,
  mirrors: mirrorsScene,
  bokeh: bokehScene,
  sunset: sunsetScene,
  rgb: rgbShadowsScene,
  neon: neonScene,
};
