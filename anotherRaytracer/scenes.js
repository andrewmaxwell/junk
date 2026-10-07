// Scenes of spheres and flat plates, packed into arrays for the shader.

// Shapes
export const SPHERE = 0;
export const PLATE = 1;

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
 *   color: number[],
 *   material: number,
 *   gloss: number,
 *   shininess: number,
 *   oneSided: boolean,
 * }} Shape
 * Spheres use `radius`. Plates are rectangles facing `normal`, spanning
 * halfWidth along u and halfHeight along v.
 *
 * `color` is the surface color, or for lights, the emitted light. Lights must
 * be spheres.
 *
 * Diffuse surfaces can have a glossy coat, like plastic: `gloss` is the
 * fraction of light it reflects (0 to 1), and `shininess` is how tight its
 * reflections are (around 10 is satin, 1000 is nearly a mirror).
 *
 * One-sided plates are invisible from behind, so walls disappear when the
 * camera orbits outside them, like a dollhouse.
 */

/** @type {(v: number[]) => number[]} */
const normalize = ([x, y, z]) => {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
};

/** @type {(a: number[], b: number[]) => number[]} */
const cross = ([ax, ay, az], [bx, by, bz]) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
];

/** @type {(radius: number, center: number[], color: number[], material: number, gloss?: number, shininess?: number) => Shape} */
const sphere = (radius, center, color, material, gloss = 0, shininess = 0) => ({
  shape: SPHERE,
  center,
  radius,
  normal: [0, 0, 0],
  u: [0, 0, 0],
  v: [0, 0, 0],
  halfWidth: 0,
  halfHeight: 0,
  color,
  material,
  gloss,
  shininess,
  oneSided: false,
});

/**
 * A rectangle facing `normal`, spanning halfWidth along u (which must be
 * perpendicular to the normal) and halfHeight along normal × u.
 * @type {(center: number[], normal: number[], u: number[], halfWidth: number, halfHeight: number, color: number[], options?: {material?: number, gloss?: number, shininess?: number, oneSided?: boolean}) => Shape} */
const plate = (
  center,
  normal,
  u,
  halfWidth,
  halfHeight,
  color,
  {material = DIFFUSE, gloss = 0, shininess = 0, oneSided = false} = {},
) => ({
  shape: PLATE,
  center,
  radius: 0,
  normal,
  u,
  v: cross(normal, u),
  halfWidth,
  halfHeight,
  color,
  material,
  gloss,
  shininess,
  oneSided,
});

/**
 * @typedef {{
 *   objects: Shape[],
 *   camera: {position: number[], target: number[], zoom: number},
 *   defaults?: {fog?: number, dof?: number},
 * }} Scene
 * The camera orbits `target`, and starts focused on it. `zoom` is the image
 * height at distance 1. `defaults` overrides the panel's defaults for this
 * scene (see `defaults` in main.js): `fog` is the fog's density, the chance
 * per unit of distance that light scatters off it, and `dof` the lens size.
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
        gloss: 0.2,
        shininess: 100,
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
      sphere(12, [35, 74, 60], [25, 25, 25], LIGHT), // big light
      sphere(1.5, [72, 55, 125], [400, 320, 220], LIGHT), // small warm light
      sphere(16.5, [27, 36.5, 47], [0.9, 0.9, 0.9], MIRROR), // mirror ball
      sphere(20, [73, 25, 75], [0.9, 0.9, 0.9], GLASS), // glass ball
      sphere(10, [60, 65, 0], [0.5, 0.5, 0.5], DIFFUSE, 0.5, 30), // upper satin ball
      sphere(16, [20, 16, 160], [0.3, 0.3, 0.35], DIFFUSE, 0.6, 2000), // lower left polished ball
    ],
    camera: {position: [50, 50, 350], target: [50, 33, 10], zoom: 0.5},
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

  [10000, 1500, 250, 50].forEach((shininess, i) => {
    const center = [0, 0.2 - 0.85 * i, -1.5 + 1.4 * i];
    // Tilt each plate to reflect the camera's view up toward the lights
    const toEye = normalize(eye.map((e, k) => e - center[k]));
    const toLights = normalize(lightRow.map((l, k) => l - center[k]));
    const normal = normalize(toEye.map((e, k) => e + toLights[k]));
    objects.push(
      plate(center, normal, [1, 0, 0], 4.5, 0.4, [0, 0, 0], {
        gloss: 1,
        shininess,
      }),
    );
  });

  return {
    objects,
    camera: {position: eye, target: [0, 0.74, -1], zoom: 0.6},
  };
}

/**
 * A dark, foggy room lit only by a light outside a window with blinds, so the
 * light comes in as beams, with a glass ball and a mirror ball in them.
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
    sphere(12, [45, 12, -20], [0.95, 0.95, 0.95], GLASS),
    sphere(10, [75, 10, -60], [0.95, 0.64, 0.54], MIRROR), // copper
  ];
  // Blinds across the window, 5.5 tall with gaps of 2.5. Each gap lets in a
  // thin sheet of light, seen edge on from the front.
  for (let y = 40; y < 80; y += 8) objects.push(leftWall(y, y + 5.5, -50, 0));
  return {
    objects,
    camera: {position: [60, 45, 110], target: [40, 35, -30], zoom: 0.8},
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
      sphere(5, [8, 5, 18], [0.5, 0.75, 0.95], GLASS), // blue
      sphere(3, [-22, 3, 18], [0.97, 0.97, 0.97], GLASS),
      sphere(6, [-32, 6, -10], [0.9, 0.9, 0.9], MIRROR),
    ],
    camera: {position: [35, 45, 95], target: [0, 4, 10], zoom: 0.65},
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
    });
  return {
    objects: [
      plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.1, 0.1, 0.12], {
        oneSided: true,
        gloss: 0.3,
        shininess: 300,
      }), // floor
      wall(-30),
      wall(30),
      sphere(2.5, [-12, 26, -10], [8, 4, 1.2], LIGHT), // orange orb
      sphere(2, [14, 18, 8], [1.5, 3.5, 8], LIGHT), // blue orb
      sphere(1.8, [2, 32, 22], [7, 2, 5], LIGHT), // pink orb
      // Soft white light high above
      sphere(30, [0, 200, 40], [3, 3, 3], LIGHT),
      sphere(6, [-8, 6, 0], [0.9, 0.2, 0.15], DIFFUSE, 0.3, 500), // red
      sphere(5, [10, 5, -12], [0.95, 0.8, 0.45], MIRROR), // gold
      sphere(7, [6, 7, 22], [0.97, 0.97, 0.97], GLASS),
      sphere(3, [-16, 3, 26], [0.2, 0.6, 0.3], DIFFUSE, 0.3, 500), // green
    ],
    camera: {position: [20, 20, 55], target: [-30, 12, 0], zoom: 0.8},
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
    plate([0, 0, 0], [0, 1, 0], [1, 0, 0], big, big, [0.02, 0.02, 0.02], {
      oneSided: true,
      gloss: 0.6,
      shininess: 3000,
    }), // table
    // A big soft light up and to the left, like a window
    sphere(20, [-60, 70, 40], [10, 9.6, 9], LIGHT),
    sphere(5, [0, 5, 0], [0.97, 0.97, 0.97], GLASS),
    sphere(4, [-11, 4, -4], [0.95, 0.75, 0.4], MIRROR), // gold
    sphere(3.5, [10, 3.5, -3], [0.7, 0.08, 0.1], DIFFUSE, 0.4, 2000), // red
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
      // Blue sky: so big and high that it reaches down to 7° above the
      // horizon, where the haze hides its edge. It lights the shadows and the air.
      sphere(59500, [0, 60000, 0], [0.08, 0.17, 0.4], LIGHT),
      sphere(20, [0, 20, 0], [0.8, 0.8, 0.8], DIFFUSE, 0.2, 50),
      sphere(10, [35, 10, 20], [0.95, 0.95, 0.95], GLASS),
      sphere(12, [-40, 12, 30], [0.9, 0.9, 0.9], MIRROR),
      sphere(6, [10, 6, 45], [0.15, 0.3, 0.6], DIFFUSE, 0.5, 500),
      sphere(40, [-150, 40, -250], [0.45, 0.35, 0.3], DIFFUSE),
      sphere(25, [120, 25, -180], [0.45, 0.35, 0.3], DIFFUSE),
    ],
    camera: {position: [60, 18, 160], target: [-45, 25, 0], zoom: 0.75},
    defaults: {fog: 0.0002},
  };
}

/** @type {Record<string, () => Scene>} */
export const scenes = {
  cornell: cornellScene,
  veach: veachScene,
  shafts: shaftsScene,
  caustics: causticsScene,
  mirrors: mirrorsScene,
  bokeh: bokehScene,
  sunset: sunsetScene,
};

/**
 * Packs shapes into the `Shape` structs of the `objects` buffer in shaders.js:
 * six vec4s per shape.
 * @type {(objects: Shape[]) => Float32Array} */
export const packObjects = (objects) =>
  new Float32Array(
    objects.flatMap((s) => [
      ...[...s.center, s.radius],
      ...[...s.normal, s.shape],
      ...[...s.u, s.halfWidth],
      ...[...s.v, s.halfHeight],
      ...[...s.color, s.material],
      ...[s.gloss, s.shininess, +s.oneSided, 0],
    ]),
  );

/** @type {(a: number[], b: number[]) => number} */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Distance along a ray (from o in unit direction d) to the closest shape it
 * hits, or Infinity. Matches `intersect` in shaders.js.
 * @type {(objects: Shape[], o: number[], d: number[]) => number} */
export const hitDistance = (objects, o, d) => {
  let closest = Infinity;
  for (const s of objects) {
    const p = s.center.map((c, i) => c - o[i]);
    let t;
    if (s.shape === SPHERE) {
      const b = dot(p, d);
      const det = b * b - dot(p, p) + s.radius * s.radius;
      if (det < 0) continue;
      t = b - Math.sqrt(det);
      if (t <= 0) t = b + Math.sqrt(det);
    } else {
      const facing = dot(d, s.normal);
      if (facing === 0 || (s.oneSided && facing > 0)) continue;
      t = dot(p, s.normal) / facing;
      const h = d.map((x, i) => x * t - p[i]);
      if (
        Math.abs(dot(h, s.u)) > s.halfWidth ||
        Math.abs(dot(h, s.v)) > s.halfHeight
      ) {
        continue;
      }
    }
    if (t > 0 && t < closest) closest = t;
  }
  return closest;
};
