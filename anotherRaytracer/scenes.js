// Scenes of spheres and flat plates, packed into arrays for the shader.

// Shapes
export const SPHERE = 0;
export const PLATE = 1;

// Materials
export const DIFFUSE = 0;
export const MIRROR = 1;
export const GLASS = 2;
export const LIGHT = 3;

/** Must match MAX_OBJECTS in shaders.js */
export const MAX_OBJECTS = 16;

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
 * }} Scene
 * The camera orbits `target`. `zoom` is the image height at distance 1.
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

/** @type {Record<string, () => Scene>} */
export const scenes = {cornell: cornellScene, veach: veachScene};

/**
 * Packs shapes into arrays of vec4s, one array per uniform in shaders.js.
 * @type {(objects: Shape[]) => Record<string, Float32Array>} */
export const packObjects = (objects) => {
  if (objects.length > MAX_OBJECTS) {
    throw new Error(`At most ${MAX_OBJECTS} objects`);
  }
  /** @type {Record<string, (s: Shape) => number[]>} */
  const fields = {
    centerRadius: (s) => [...s.center, s.radius],
    normalShape: (s) => [...s.normal, s.shape],
    uHalf: (s) => [...s.u, s.halfWidth],
    vHalf: (s) => [...s.v, s.halfHeight],
    colorMaterial: (s) => [...s.color, s.material],
    surface: (s) => [s.gloss, s.shininess, +s.oneSided, 0],
  };
  return Object.fromEntries(
    Object.entries(fields).map(([name, get]) => {
      const arr = new Float32Array(MAX_OBJECTS * 4);
      objects.forEach((s, i) => arr.set(get(s), i * 4));
      return [name, arr];
    }),
  );
};
