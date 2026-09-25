// A path tracer for a scene of spheres. The math is written out on plain
// numbers instead of vector objects: creating a new Vec3 for every operation
// spent most of the time allocating and garbage collecting.

const EPSILON = 1e-4;

// Materials
const DIFFUSE = 0;
const MIRROR = 1;
const GLASS = 2;
const LIGHT = 3;

/**
 * @typedef {{
 *   radius: number, x: number, y: number, z: number,
 *   r: number, g: number, b: number,
 *   material: number,
 * }} Sphere
 * r, g, b is the surface color, or for lights, the emitted light.
 */

/** @type {(radius: number, center: number[], color: number[], material: number) => Sphere} */
const sphere = (radius, [x, y, z], [r, g, b], material) => ({
  radius,
  x,
  y,
  z,
  r,
  g,
  b,
  material,
});

///////////////////////////////
// Scene
///////////////////////////////

// Walls are huge spheres, which look flat from inside the room
const wallRad = 1e5;

/** @type {Sphere[]} */
const spheres = [
  sphere(wallRad, [wallRad, 50, 50], [0.2, 0.8, 0.2], DIFFUSE), // left wall
  sphere(wallRad, [-99901, 50, 50], [0.2, 0.2, 0.8], DIFFUSE), // right wall
  sphere(wallRad, [50, 50, wallRad - 150], [1, 1, 1], DIFFUSE), // far wall
  sphere(wallRad, [50, wallRad, 50], [0.8, 0.2, 0.2], DIFFUSE), // floor
  sphere(wallRad, [50, 100 - wallRad, 50], [0.8, 0.8, 0.2], DIFFUSE), // ceiling
  sphere(12, [35, 74, 60], [25, 25, 25], LIGHT), // light
  sphere(16.5, [27, 36.5, 47], [0.9, 0.9, 0.9], MIRROR), // mirror ball
  sphere(20, [73, 25, 75], [0.9, 0.9, 0.9], GLASS), // glass ball
  sphere(10, [60, 65, 0], [0.5, 0.5, 0.5], DIFFUSE), // upper matte ball
  sphere(16, [20, 16, 160], [0.5, 0.5, 0.5], DIFFUSE), // lower left matte ball
];
const lights = spheres.filter((s) => s.material === LIGHT);

const camera = {
  position: [50, 50, 350],
  direction: [0, -0.05, -1],
  zoom: 0.5,
};

/**
 * How diffuse surfaces find light, set from the main thread via `?sampling=`:
 * - 'bsdf': only random bounces (hope to hit a light)
 * - 'light': only rays aimed at lights; random bounces ignore light hits
 * - 'mis': both, weighted by which one was more likely to find that light
 * @type {'bsdf' | 'light' | 'mis'} */
let sampling = 'mis';

///////////////////////////////
// Geometry helpers
///////////////////////////////

/** Distance to the hit found by the last call to intersect */
let hitDist = 0;

/** Index of the closest sphere hit by a ray, or -1. Sets hitDist.
 * @type {(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) => number} */
function intersect(ox, oy, oz, dx, dy, dz) {
  let hit = -1;
  hitDist = Infinity;
  for (let i = 0; i < spheres.length; i++) {
    const s = spheres[i];
    const px = s.x - ox;
    const py = s.y - oy;
    const pz = s.z - oz;
    const b = px * dx + py * dy + pz * dz;
    let det = b * b - (px * px + py * py + pz * pz) + s.radius * s.radius;
    if (det < 0) continue;
    det = Math.sqrt(det);
    let t = b - det;
    if (t <= EPSILON) t = b + det;
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
 * @type {(px: number, py: number, pz: number, light: Sphere) => number} */
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
 * @type {(px: number, py: number, pz: number, bouncePdf: number, light: Sphere) => number} */
function bounceLightWeight(px, py, pz, bouncePdf, light) {
  if (sampling === 'bsdf') return 1;
  if (sampling === 'light') return 0; // light sampling already counted it
  const lightPdf = 1 / (2 * Math.PI * (1 - lightConeCos(px, py, pz, light)));
  return powerHeuristic(bouncePdf, lightPdf);
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
    const s = spheres[i];

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
      r += tr * er;
      g += tg * eg;
      b += tb * eb;
      break; // lights don't reflect anything
    }

    let cr = s.r;
    let cg = s.g;
    let cb = s.b;
    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      const p = Math.min(0.95, Math.max(cr, cg, cb));
      if (Math.random() >= p) break;
      cr /= p;
      cg /= p;
      cb /= p;
    }
    tr *= cr;
    tg *= cg;
    tb *= cb;

    const px = ox + dx * hitDist;
    const py = oy + dy * hitDist;
    const pz = oz + dz * hitDist;
    const nx = (px - s.x) / s.radius;
    const ny = (py - s.y) / s.radius;
    const nz = (pz - s.z) / s.radius;
    // Normal facing the side the ray came from
    const into = nx * dx + ny * dy + nz * dz < 0;
    const nlx = into ? nx : -nx;
    const nly = into ? ny : -ny;
    const nlz = into ? nz : -nz;

    if (s.material === DIFFUSE) {
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
        if (spheres[intersect(px, py, pz, dir[0], dir[1], dir[2])] !== light) {
          continue;
        }

        // radiance * cos(theta) * BRDF (1/pi) / pdf (1/solidAngle)
        const solidAngle = 2 * Math.PI * (1 - cosMax);
        const weight =
          sampling === 'mis'
            ? powerHeuristic(1 / solidAngle, cosSurface / Math.PI)
            : 1;
        const f = (weight * cosSurface * solidAngle) / Math.PI;
        r += tr * light.r * f;
        g += tg * light.g * f;
        b += tb * light.b * f;
      }

      // Indirect light: bounce in a random direction, favoring ones near the
      // normal, with density cos(theta) / pi. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      const cosA = Math.sqrt(1 - Math.random());
      directionAround(nlx, nly, nlz, cosA, 2 * Math.PI * Math.random());
      bouncePdf = cosA / Math.PI;
      seenByCamera = false;
    } else {
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
 * @type {(e: MessageEvent<{width: number, height: number, sampling: typeof sampling, active?: Uint8Array}>) => void} */
self.onmessage = ({data}) => {
  const {width, height, active} = data;
  sampling = data.sampling;
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
      // Start past the camera's position, inside the room
      trace(cx + dx * 140, cy + dy * 140, cz + dz * 140, dx, dy, dz, color);
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
