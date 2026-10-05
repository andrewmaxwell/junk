// A path tracer for scenes of spheres and flat plates. The math is written
// out on plain numbers instead of vector objects: creating a new Vec3 for
// every operation spent most of the time allocating and garbage collecting.

const EPSILON = 1e-4;

// Shapes
const SPHERE = 0;
const PLATE = 1;

// Materials
const DIFFUSE = 0;
const MIRROR = 1;
const GLASS = 2;
const LIGHT = 3;

/**
 * @typedef {{
 *   shape: number,
 *   x: number, y: number, z: number,
 *   radius: number,
 *   nx: number, ny: number, nz: number,
 *   ux: number, uy: number, uz: number,
 *   vx: number, vy: number, vz: number,
 *   halfWidth: number, halfHeight: number,
 *   r: number, g: number, b: number,
 *   material: number,
 *   gloss: number,
 *   shininess: number,
 * }} Shape
 * (x, y, z) is the center. Spheres use `radius`. Plates are rectangles with
 * normal n, spanning halfWidth along u and halfHeight along v.
 *
 * r, g, b is the surface color, or for lights, the emitted light.
 *
 * Diffuse surfaces can have a glossy coat, like plastic: `gloss` is the
 * fraction of light it reflects (0 to 1), and `shininess` is how tight its
 * reflections are (around 10 is satin, 1000 is nearly a mirror).
 */

/** Every shape has every field, so JS engines can optimize property access.
 * @type {(fields: Partial<Shape>) => Shape} */
const shape = (fields) => ({
  shape: SPHERE,
  x: 0,
  y: 0,
  z: 0,
  radius: 0,
  nx: 0,
  ny: 0,
  nz: 0,
  ux: 0,
  uy: 0,
  uz: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  halfWidth: 0,
  halfHeight: 0,
  r: 0,
  g: 0,
  b: 0,
  material: DIFFUSE,
  gloss: 0,
  shininess: 0,
  ...fields,
});

/** @type {(radius: number, center: number[], color: number[], material: number, gloss?: number, shininess?: number) => Shape} */
const sphere = (
  radius,
  [x, y, z],
  [r, g, b],
  material,
  gloss = 0,
  shininess = 0,
) => shape({radius, x, y, z, r, g, b, material, gloss, shininess});

/**
 * A rectangle facing `normal`, which must be perpendicular to the x axis.
 * It spans halfWidth along x.
 * @type {(center: number[], normal: number[], halfWidth: number, halfHeight: number, color: number[], material: number, gloss?: number, shininess?: number) => Shape} */
const plate = (
  [x, y, z],
  [nx, ny, nz],
  halfWidth,
  halfHeight,
  [r, g, b],
  material,
  gloss = 0,
  shininess = 0,
) =>
  // u is the x axis, and v = n × u
  shape({
    shape: PLATE,
    x,
    y,
    z,
    nx,
    ny,
    nz,
    ux: 1,
    vy: nz,
    vz: -ny,
    halfWidth,
    halfHeight,
    r,
    g,
    b,
    material,
    gloss,
    shininess,
  });

/** @type {(v: number[]) => number[]} */
const normalize = ([x, y, z]) => {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
};

///////////////////////////////
// Scenes
///////////////////////////////

/**
 * @typedef {{
 *   objects: Shape[],
 *   camera: {position: number[], direction: number[], zoom: number, start: number},
 * }} Scene
 */

/** @type {() => Scene} */
function cornellScene() {
  // Walls are huge spheres, which look flat from inside the room
  const wallRad = 1e5;
  return {
    objects: [
      sphere(wallRad, [wallRad, 50, 50], [0.2, 0.8, 0.2], DIFFUSE), // left wall
      sphere(wallRad, [-99901, 50, 50], [0.2, 0.2, 0.8], DIFFUSE), // right wall
      sphere(wallRad, [50, 50, wallRad - 150], [1, 1, 1], DIFFUSE), // far wall
      sphere(wallRad, [50, wallRad, 50], [0.8, 0.2, 0.2], DIFFUSE, 0.2, 100), // floor
      sphere(wallRad, [50, 100 - wallRad, 50], [0.8, 0.8, 0.2], DIFFUSE), // ceiling
      sphere(12, [35, 74, 60], [25, 25, 25], LIGHT), // big light
      sphere(1.5, [72, 55, 125], [400, 320, 220], LIGHT), // small warm light
      sphere(16.5, [27, 36.5, 47], [0.9, 0.9, 0.9], MIRROR), // mirror ball
      sphere(20, [73, 25, 75], [0.9, 0.9, 0.9], GLASS), // glass ball
      sphere(10, [60, 65, 0], [0.5, 0.5, 0.5], DIFFUSE, 0.5, 30), // upper satin ball
      sphere(16, [20, 16, 160], [0.3, 0.3, 0.35], DIFFUSE, 0.6, 2000), // lower left polished ball
    ],
    // Rays start 140 units in front of the camera, inside the room
    camera: {
      position: [50, 50, 350],
      direction: [0, -0.05, -1],
      zoom: 0.5,
      start: 140,
    },
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
    sphere(1e5, [0, -4 - 1e5, 0], [0.25, 0.25, 0.25], DIFFUSE), // floor
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
      plate(center, normal, 4.5, 0.4, [0, 0, 0], DIFFUSE, 1, shininess),
    );
  });

  return {
    objects,
    camera: {position: eye, direction: [0, -0.06, -1], zoom: 0.6, start: 0},
  };
}

/** @type {Record<string, Scene>} */
const scenes = {cornell: cornellScene(), veach: veachScene()};

// The current scene, set from the main thread via `?scene=`
let {objects, camera} = scenes.cornell;
let lights = objects.filter((s) => s.material === LIGHT);

/**
 * How diffuse surfaces find light, set from the main thread via `?sampling=`:
 * - 'bsdf': only random bounces (hope to hit a light)
 * - 'light': only rays aimed at lights; random bounces ignore light hits
 * - 'mis': both, weighted by which one was more likely to find that light
 * @type {'bsdf' | 'light' | 'mis'} */
let sampling = 'mis';

/**
 * Caps how bright one sample of bounced light can be, as a multiple of white.
 * Rare paths like light -> glass -> wall -> camera are correct but very
 * bright and hard to find, so without this they show up as speckles that take
 * ages to average out. Capping them makes those effects (caustics, mostly) a
 * bit dimmer than they should be. Direct light is never capped. Set from the
 * main thread via `?clamp=`; 0 means no cap.
 */
let maxIndirect = 20;

/** Scale factor that caps a bounced-light contribution at maxIndirect.
 * @type {(r: number, g: number, b: number) => number} */
function indirectScale(r, g, b) {
  const brightest = Math.max(r, g, b);
  return brightest > maxIndirect ? maxIndirect / brightest : 1;
}

///////////////////////////////
// Geometry helpers
///////////////////////////////

/** Distance to the hit found by the last call to intersect */
let hitDist = 0;

/** Index of the closest object hit by a ray, or -1. Sets hitDist.
 * @type {(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => number} */
function intersect(ox, oy, oz, dx, dy, dz) {
  let hit = -1;
  hitDist = Infinity;
  for (let i = 0; i < objects.length; i++) {
    const s = objects[i];
    const px = s.x - ox;
    const py = s.y - oy;
    const pz = s.z - oz;
    let t = 0;
    if (s.shape === SPHERE) {
      const b = px * dx + py * dy + pz * dz;
      let det = b * b - (px * px + py * py + pz * pz) + s.radius * s.radius;
      if (det < 0) continue;
      det = Math.sqrt(det);
      t = b - det;
      if (t <= EPSILON) t = b + det;
    } else {
      // Where the ray crosses the plate's plane, if that's within the plate
      const facing = dx * s.nx + dy * s.ny + dz * s.nz;
      if (!facing) continue;
      t = (px * s.nx + py * s.ny + pz * s.nz) / facing;
      const hx = dx * t - px;
      const hy = dy * t - py;
      const hz = dz * t - pz;
      if (
        Math.abs(hx * s.ux + hy * s.uy + hz * s.uz) > s.halfWidth ||
        Math.abs(hx * s.vx + hy * s.vy + hz * s.vz) > s.halfHeight
      ) {
        continue;
      }
    }
    if (t > EPSILON && t < hitDist) {
      hitDist = t;
      hit = i;
    }
  }
  return hit;
}

/** Scratch output for directionAround, to avoid allocating */
const dir = new Float64Array(3);

/**
 * Writes into `dir` the unit vector at angle acos(cosA) from the unit axis w,
 * rotated phi around it.
 * @type {(wx: number, wy: number, wz: number, cosA: number, phi: number) => void} */
function directionAround(wx, wy, wz, cosA, phi) {
  // u and v are perpendicular to w and each other
  let ux = 0;
  let uy = 0;
  let uz = 0;
  if (Math.abs(wx) > 0.1) {
    ux = wz;
    uz = -wx;
  } else {
    uy = -wz;
    uz = wy;
  }
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;
  const vx = wy * uz - wz * uy;
  const vy = wz * ux - wx * uz;
  const vz = wx * uy - wy * ux;

  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const a = Math.cos(phi) * sinA;
  const b = Math.sin(phi) * sinA;
  dir[0] = ux * a + vx * b + wx * cosA;
  dir[1] = uy * a + vy * b + wy * cosA;
  dir[2] = uz * a + vz * b + wz * cosA;
}

/** Cosine of the half-angle of the cone of directions from a point that hit light.
 * @type {(px: number, py: number, pz: number, light: Shape) => number} */
function lightConeCos(px, py, pz, light) {
  const lx = light.x - px;
  const ly = light.y - py;
  const lz = light.z - pz;
  const sinMaxSq =
    (light.radius * light.radius) / (lx * lx + ly * ly + lz * lz);
  return Math.sqrt(Math.max(0, 1 - sinMaxSq));
}

/** MIS weight for a strategy with density a, competing with density b.
 * @type {(a: number, b: number) => number} */
function powerHeuristic(a, b) {
  return (a * a) / (a * a + b * b);
}

/** How much a light hit by a random diffuse bounce from (px, py, pz) should count.
 * @type {(px: number, py: number, pz: number, bouncePdf: number, light: Shape) => number} */
function bounceLightWeight(px, py, pz, bouncePdf, light) {
  if (sampling === 'bsdf') return 1;
  if (sampling === 'light') return 0; // light sampling already counted it
  const lightPdf = 1 / (2 * Math.PI * (1 - lightConeCos(px, py, pz, light)));
  return powerHeuristic(bouncePdf, lightPdf);
}

/** Scratch output for evalSurface, to avoid allocating */
const bsdf = new Float64Array(3);

/**
 * For a diffuse (maybe glossy) surface, writes into `bsdf` how much light
 * arriving from direction l it scatters toward the viewer, and returns the
 * probability density that sampleSurface picks l.
 * (rx, ry, rz) is the viewing direction mirrored about the normal, and
 * cosTheta is the cosine between l and the normal.
 * @type {(s: Shape, cosTheta: number, rx: number, ry: number, rz: number, lx: number, ly: number, lz: number) => number} */
function evalSurface(s, cosTheta, rx, ry, rz, lx, ly, lz) {
  const diffuse = (1 - s.gloss) / Math.PI;
  let glossy = 0;
  let glossyPdf = 0;
  if (s.gloss) {
    // Phong lobe: strongest in the mirror direction, falling off as
    // cos(angle from it) ^ shininess
    const cosAlpha = Math.max(0, rx * lx + ry * ly + rz * lz);
    const lobe = cosAlpha ** s.shininess / (2 * Math.PI);
    glossy = s.gloss * (s.shininess + 2) * lobe;
    glossyPdf = (s.shininess + 1) * lobe;
  }
  bsdf[0] = diffuse * s.r + glossy;
  bsdf[1] = diffuse * s.g + glossy;
  bsdf[2] = diffuse * s.b + glossy;
  // sampleSurface picks the glossy lobe with probability `gloss`
  return (1 - s.gloss) * (cosTheta / Math.PI) + s.gloss * glossyPdf;
}

/**
 * Picks a random bounce direction off a diffuse (maybe glossy) surface,
 * written into `dir`: from the glossy lobe with probability `gloss`,
 * otherwise favoring directions near the normal.
 * @type {(s: Shape, nx: number, ny: number, nz: number, rx: number, ry: number, rz: number) => void} */
function sampleSurface(s, nx, ny, nz, rx, ry, rz) {
  const phi = 2 * Math.PI * Math.random();
  if (Math.random() < s.gloss) {
    directionAround(rx, ry, rz, Math.random() ** (1 / (s.shininess + 1)), phi);
  } else {
    directionAround(nx, ny, nz, Math.sqrt(1 - Math.random()), phi);
  }
}

///////////////////////////////
// Path tracing
///////////////////////////////

/**
 * Follows one path from the camera, writing the light it carries into `out`.
 * @type {(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, out: Float64Array) => void} */
function trace(ox, oy, oz, dx, dy, dz, out) {
  // Light gathered so far
  let r = 0;
  let g = 0;
  let b = 0;
  // Throughput: the fraction of light arriving at the current hit that makes
  // it back to the camera, after all the surfaces it has bounced off so far
  let tr = 1;
  let tg = 1;
  let tb = 1;
  // True until the path hits a diffuse surface
  let seenByCamera = true;
  // Nonzero when a diffuse surface randomly picked this ray's direction: the
  // probability density it picked it with
  let bouncePdf = 0;

  for (let depth = 0; ; depth++) {
    const i = intersect(ox, oy, oz, dx, dy, dz);
    if (i < 0) break;
    const s = objects[i];

    if (s.material === LIGHT) {
      const w = bouncePdf ? bounceLightWeight(ox, oy, oz, bouncePdf, s) : 1;
      let er = s.r * w;
      let eg = s.g * w;
      let eb = s.b * w;
      if (seenByCamera) {
        // The light is far brighter than the screen can show. Clamping it to
        // white here, before pixel samples are averaged, lets its edges
        // antialias; otherwise a pixel 1% covered by the light shows as white.
        er = Math.min(1, er);
        eg = Math.min(1, eg);
        eb = Math.min(1, eb);
      }
      er *= tr;
      eg *= tg;
      eb *= tb;
      const k = seenByCamera ? 1 : indirectScale(er, eg, eb);
      r += er * k;
      g += eg * k;
      b += eb * k;
      break; // lights don't reflect anything
    }

    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      const p = Math.min(0.95, Math.max(s.r, s.g, s.b) + s.gloss);
      if (Math.random() >= p) break;
      tr /= p;
      tg /= p;
      tb /= p;
    }

    const px = ox + dx * hitDist;
    const py = oy + dy * hitDist;
    const pz = oz + dz * hitDist;
    const isSphere = s.shape === SPHERE;
    const nx = isSphere ? (px - s.x) / s.radius : s.nx;
    const ny = isSphere ? (py - s.y) / s.radius : s.ny;
    const nz = isSphere ? (pz - s.z) / s.radius : s.nz;
    // Normal facing the side the ray came from
    const into = nx * dx + ny * dy + nz * dz < 0;
    const nlx = into ? nx : -nx;
    const nly = into ? ny : -ny;
    const nlz = into ? nz : -nz;

    if (s.material === DIFFUSE) {
      // Viewing direction mirrored about the normal, the center of the
      // glossy lobe
      const dn = 2 * (dx * nlx + dy * nly + dz * nlz);
      const rx = dx - nlx * dn;
      const ry = dy - nly * dn;
      const rz = dz - nlz * dn;

      // Direct light: aim a ray at each light rather than waiting for a
      // random bounce to stumble into one.
      for (const light of sampling === 'bsdf' ? [] : lights) {
        let wx = light.x - px;
        let wy = light.y - py;
        let wz = light.z - pz;
        const wLen = Math.sqrt(wx * wx + wy * wy + wz * wz);
        wx /= wLen;
        wy /= wLen;
        wz /= wLen;

        // The light covers a cone of directions around w. Pick one uniformly.
        const cosMax = lightConeCos(px, py, pz, light);
        const cosA = 1 - Math.random() * (1 - cosMax);
        directionAround(wx, wy, wz, cosA, 2 * Math.PI * Math.random());

        const cosSurface = dir[0] * nlx + dir[1] * nly + dir[2] * nlz;
        if (cosSurface <= 0) continue; // light is behind this surface

        // Shadow ray: only counts if nothing is in the way
        if (objects[intersect(px, py, pz, dir[0], dir[1], dir[2])] !== light) {
          continue;
        }

        // radiance * BSDF * cos(theta) / pdf (1/solidAngle)
        const solidAngle = 2 * Math.PI * (1 - cosMax);
        const pdf = evalSurface(
          s,
          cosSurface,
          rx,
          ry,
          rz,
          dir[0],
          dir[1],
          dir[2],
        );
        const weight =
          sampling === 'mis' ? powerHeuristic(1 / solidAngle, pdf) : 1;
        const f = weight * cosSurface * solidAngle;
        const lr = tr * light.r * bsdf[0] * f;
        const lg = tg * light.g * bsdf[1] * f;
        const lb = tb * light.b * bsdf[2] * f;
        // Light reaching the first surface the camera sees is direct light
        const k = seenByCamera ? 1 : indirectScale(lr, lg, lb);
        r += lr * k;
        g += lg * k;
        b += lb * k;
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      sampleSurface(s, nlx, nly, nlz, rx, ry, rz);
      const cosTheta = dir[0] * nlx + dir[1] * nly + dir[2] * nlz;
      if (cosTheta <= 0) break; // glossy lobe pointed into the surface
      bouncePdf = evalSurface(s, cosTheta, rx, ry, rz, dir[0], dir[1], dir[2]);
      tr *= (bsdf[0] * cosTheta) / bouncePdf;
      tg *= (bsdf[1] * cosTheta) / bouncePdf;
      tb *= (bsdf[2] * cosTheta) / bouncePdf;
      seenByCamera = false;
    } else {
      tr *= s.r;
      tg *= s.g;
      tb *= s.b;
      bouncePdf = 0;
      const dn = 2 * (dx * nx + dy * ny + dz * nz);
      dir[0] = dx - nx * dn;
      dir[1] = dy - ny * dn;
      dir[2] = dz - nz * dn;

      if (s.material === GLASS) {
        const nnt = into ? 1 / 1.5 : 1.5;
        const ddn = dx * nlx + dy * nly + dz * nlz;
        const cos2t = 1 - nnt * nnt * (1 - ddn * ddn);
        // Otherwise total internal reflection: keep the mirror direction
        if (cos2t >= 0) {
          const k = (into ? 1 : -1) * (ddn * nnt + Math.sqrt(cos2t));
          let tx = dx * nnt - nx * k;
          let ty = dy * nnt - ny * k;
          let tz = dz * nnt - nz * k;
          const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
          tx /= tLen;
          ty /= tLen;
          tz /= tLen;

          // Fresnel: how much reflects vs refracts (Schlick's approximation)
          const c = 1 - (into ? -ddn : tx * nx + ty * ny + tz * nz);
          const reflectance = 0.04 + 0.96 * c ** 5;
          // Pick one at random, with probability P of reflecting, and
          // divide by that probability to stay unbiased
          const P = 0.25 + 0.5 * reflectance;
          let scale = reflectance / P;
          if (Math.random() >= P) {
            dir[0] = tx;
            dir[1] = ty;
            dir[2] = tz;
            scale = (1 - reflectance) / (1 - P);
          }
          tr *= scale;
          tg *= scale;
          tb *= scale;
        }
      }
    }

    ox = px;
    oy = py;
    oz = pz;
    dx = dir[0];
    dy = dir[1];
    dz = dir[2];
  }

  out[0] = r;
  out[1] = g;
  out[2] = b;
}

/**
 * Renders one sample for each pixel whose `active` entry is nonzero.
 * @type {(e: MessageEvent<{width: number, height: number, sampling: typeof sampling, scene: string, clamp: number, active?: Uint8Array}>) => void} */
self.onmessage = ({data}) => {
  const {width, height, active} = data;
  sampling = data.sampling;
  maxIndirect = data.clamp || Infinity;
  ({objects, camera} = scenes[data.scene] ?? scenes.cornell);
  lights = objects.filter((s) => s.material === LIGHT);
  const res = new Float32Array(width * height * 3);
  const color = new Float64Array(3);

  // Camera basis: forward (fx, fy, fz), plus right and up vectors spanning
  // the image plane
  const [cx, cy, cz] = camera.position;
  let [fx, fy, fz] = camera.direction;
  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  fx /= fLen;
  fy /= fLen;
  fz /= fLen;
  const rightX = (width * camera.zoom) / height;
  const upLen = Math.sqrt(fz * fz + fy * fy);
  const upY = (-fz / upLen) * camera.zoom;
  const upZ = (fy / upLen) * camera.zoom;

  let p = 0;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++, p++) {
      if (active && !active[p]) continue;
      // Jitter within the pixel for antialiasing
      const sx = (x + Math.random()) / width - 0.5;
      const sy = (y + Math.random()) / height - 0.5;
      let dx = rightX * sx + fx;
      let dy = upY * sy + fy;
      let dz = upZ * sy + fz;
      const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dx /= dLen;
      dy /= dLen;
      dz /= dLen;
      const start = camera.start;
      trace(
        cx + dx * start,
        cy + dy * start,
        cz + dz * start,
        dx,
        dy,
        dz,
        color,
      );
      res[p * 3] = color[0];
      res[p * 3 + 1] = color[1];
      res[p * 3 + 2] = color[2];
    }
  }
  self.postMessage(res, [res.buffer]);
};

// Unused: a raymarched Mandelbox, written against the old Vec3/Shape classes.
// It would need porting to the plain-number style above to be used.
// class Mandelbox extends Shape {
//   /**
//    * @param {number} halfSize
//    * @param {Vec3} center
//    * @param {Vec3} color
//    * @param {Vec3} emission
//    * @param {Material} material
//    */
//   constructor(halfSize, center, color, emission, material) {
//     super(color, emission, material);
//     this.halfSize = halfSize;
//     this.center = center;

//     // Typical Mandelbox parameters; you can tweak these for different fractal shapes
//     this.scale = -1.5;
//     this.minRadius = 0.5;
//     this.fixedRadius = 1.0;
//     this.iterations = 12;
//   }

//   /**
//    * Distance estimator for the Mandelbox fractal at a given point.
//    * @type {(pos: Vec3) => number}
//    */
//   distanceEstimator(pos) {
//     // Shift point by the center
//     let z = Vec3.sub(pos, this.center);
//     const c = new Vec3(z.x, z.y, z.z);

//     let dr = 1.0; // derivative factor
//     let r = 0.0; // magnitude

//     for (let i = 0; i < this.iterations; i++) {
//       // Box fold: reflect any component outside [-1,1]
//       if (z.x > 1) z.x = 2 - z.x;
//       else if (z.x < -1) z.x = -2 - z.x;
//       if (z.y > 1) z.y = 2 - z.y;
//       else if (z.y < -1) z.y = -2 - z.y;
//       if (z.z > 1) z.z = 2 - z.z;
//       else if (z.z < -1) z.z = -2 - z.z;

//       // Now compute squared distance
//       const r2 = Vec3.dot(z, z);

//       // If outside fixedRadius, scale out
//       if (r2 > this.fixedRadius) {
//         z = Vec3.mul(z, this.scale);
//         dr *= Math.abs(this.scale);

//         // If inside minRadius, scale in
//       } else if (r2 < this.minRadius) {
//         const mag = Math.sqrt(r2);
//         z = Vec3.mul(z, (1 / mag) * mag * this.scale); // same as z*(scale)
//         dr *= Math.abs(1 / this.scale);
//       }

//       // Translate back
//       z = Vec3.add(z, c);
//     }

//     r = Math.sqrt(Vec3.dot(z, z));
//     // Distance estimation formula for the Mandelbox
//     return 0.5 * Math.log(r) * (r / Math.abs(dr));
//   }

//   /** @type {(ray: Ray) => number} */
//   getIntersection(ray) {
//     // We implement a ray-marching distance estimator for the Mandelbox.
//     // Typical approach: step along the ray until distance < EPSILON or max steps.

//     const maxSteps = 100;
//     const maxDistance = 300; // how far we allow stepping before giving up

//     let totalDist = 0;
//     let currPos = new Vec3(ray.position.x, ray.position.y, ray.position.z);

//     for (let i = 0; i < maxSteps; i++) {
//       const distToSurface = this.distanceEstimator(currPos);
//       if (distToSurface < EPSILON) {
//         // We hit the fractal surface
//         return totalDist;
//       }
//       if (totalDist > maxDistance) {
//         // Too far, no intersection
//         return 0;
//       }
//       // Step forward by distToSurface
//       totalDist += distToSurface;
//       currPos = Vec3.add(currPos, Vec3.mul(ray.direction, distToSurface));
//     }

//     // If we exit the loop, we didn't converge
//     return 0;
//   }

//   /** @type {(pt: Vec3) => Vec3} */
//   getNormal(pt) {
//     // Approximate the normal using the numerical gradient of the distance estimator
//     const eps = 0.001;
//     const d = this.distanceEstimator(pt);

//     // Compute partial derivatives via central differences
//     const dx = this.distanceEstimator(new Vec3(pt.x + eps, pt.y, pt.z)) - d;
//     const dy = this.distanceEstimator(new Vec3(pt.x, pt.y + eps, pt.z)) - d;
//     const dz = this.distanceEstimator(new Vec3(pt.x, pt.y, pt.z + eps)) - d;

//     const grad = new Vec3(dx, dy, dz);
//     return Vec3.norm(grad);
//   }
// }
