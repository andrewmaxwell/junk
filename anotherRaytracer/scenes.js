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
 *   fog?: number,
 * }} Scene
 * The camera orbits `target`. `zoom` is the image height at distance 1.
 * `fog` is the fog's density: the chance per unit of distance that light
 * scatters off it.
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
    fog: 0.004,
  };
}

/** @type {Record<string, () => Scene>} */
export const scenes = {
  cornell: cornellScene,
  veach: veachScene,
  shafts: shaftsScene,
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
