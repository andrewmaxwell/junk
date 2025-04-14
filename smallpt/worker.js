class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** @type {(a: Vec3, b: Vec3) => Vec3} */
  static add(a, b) {
    return new Vec3(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  /** @type {(a: Vec3, b: Vec3) => Vec3} */
  static sub(a, b) {
    return new Vec3(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  /** @type {(a: Vec3, s: number) => Vec3} */
  static mul(a, s) {
    return new Vec3(a.x * s, a.y * s, a.z * s);
  }

  /** @type {(a: Vec3, b: Vec3) => Vec3} */
  static hadamard(a, b) {
    return new Vec3(a.x * b.x, a.y * b.y, a.z * b.z);
  }

  /** @type {(a: Vec3, b: Vec3) => number} */
  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /** @type {(a: Vec3, b: Vec3) => Vec3} */
  static cross(a, b) {
    return new Vec3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
    );
  }

  /** @type {(a: Vec3) => Vec3} */
  static norm(a) {
    const mag = Math.sqrt(Vec3.dot(a, a));
    return mag === 0 ? new Vec3() : new Vec3(a.x / mag, a.y / mag, a.z / mag);
  }
}

class Ray {
  /**
   * @param {Vec3} position
   * @param {Vec3} direction */
  constructor(position, direction) {
    this.position = position;
    this.direction = direction;
  }
}

const EPSILON = 1e-4;

class Material {
  /** @type {(scene: Scene, shape: Shape, ray: Ray, hitPos: Vec3, normal: Vec3, depth: number) => Vec3} */
  shade() {
    // No default logic here
    return new Vec3();
  }
}

class DiffuseMaterial extends Material {
  /** @type {(scene: Scene, shape: Shape, ray: Ray, hitPos: Vec3, normal: Vec3, depth: number) => Vec3} */
  shade(scene, shape, ray, hitPos, normal, depth) {
    const aligned =
      Vec3.dot(normal, ray.direction) < 0 ? normal : Vec3.mul(normal, -1);

    const r1 = 2 * Math.PI * Math.random();
    const r2 = Math.random();
    const r2s = Math.sqrt(r2);

    const u = Vec3.norm(
      Vec3.cross(
        Math.abs(aligned.x) > 0.1 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0),
        aligned,
      ),
    );
    const v = Vec3.cross(aligned, u);

    let d = Vec3.add(
      Vec3.add(
        Vec3.mul(u, Math.cos(r1) * r2s),
        Vec3.mul(v, Math.sin(r1) * r2s),
      ),
      Vec3.mul(aligned, Math.sqrt(1 - r2)),
    );
    d = Vec3.norm(d);

    const secondary = new Ray(hitPos, d);
    const tracedColor = scene.traceRay(secondary, depth);

    return Vec3.add(Vec3.hadamard(shape.color, tracedColor), shape.emission);
  }
}

class MirrorMaterial extends Material {
  /** @type {(scene: Scene, shape: Shape, ray: Ray, hitPos: Vec3, normal: Vec3, depth: number) => Vec3} */
  shade(scene, shape, ray, hitPos, normal, depth) {
    const reflectionDir = Vec3.sub(
      ray.direction,
      Vec3.mul(normal, 2 * Vec3.dot(normal, ray.direction)),
    );
    const reflectionRay = new Ray(hitPos, reflectionDir);
    const tracedColor = scene.traceRay(reflectionRay, depth);

    return Vec3.add(Vec3.hadamard(shape.color, tracedColor), shape.emission);
  }
}

class GlassMaterial extends Material {
  /** @type {(scene: Scene, shape: Shape, ray: Ray, hitPos: Vec3, normal: Vec3, depth: number) => Vec3} */
  shade(scene, shape, ray, hitPos, normal, depth) {
    const aligned =
      Vec3.dot(normal, ray.direction) < 0 ? normal : Vec3.mul(normal, -1);

    const reflDir = Vec3.sub(
      ray.direction,
      Vec3.mul(normal, 2 * Vec3.dot(normal, ray.direction)),
    );
    const reflRay = new Ray(hitPos, reflDir);

    const into = Vec3.dot(normal, aligned) > 0;
    const nnt = into ? 2 / 3 : 1.5;
    const ddn = Vec3.dot(ray.direction, aligned);
    const cos2t = 1 - nnt * nnt * (1 - ddn * ddn);

    if (cos2t < 0) {
      const reflColor = scene.traceRay(reflRay, depth);
      return Vec3.add(Vec3.hadamard(shape.color, reflColor), shape.emission);
    }

    const tdir = Vec3.norm(
      Vec3.sub(
        Vec3.mul(ray.direction, nnt),
        Vec3.mul(normal, (into ? 1 : -1) * (ddn * nnt + Math.sqrt(cos2t))),
      ),
    );
    const refrRay = new Ray(hitPos, tdir);

    const reflFactor =
      0.04 + 0.96 * (1 - (into ? -ddn : Vec3.dot(tdir, normal))) ** 5;
    const trFactor = 1 - reflFactor;

    const P = 0.25 + 0.5 * reflFactor;
    const RP = reflFactor / P;
    const TP = trFactor / (1 - P);

    if (depth > 2) {
      if (Math.random() < P) {
        const reflColor = scene.traceRay(reflRay, depth);
        const c = Vec3.mul(reflColor, RP);
        return Vec3.add(Vec3.hadamard(shape.color, c), shape.emission);
      } else {
        const refrColor = scene.traceRay(refrRay, depth);
        const c = Vec3.mul(refrColor, TP);
        return Vec3.add(Vec3.hadamard(shape.color, c), shape.emission);
      }
    }

    const reflCol = Vec3.mul(scene.traceRay(reflRay, depth), reflFactor);
    const refrCol = Vec3.mul(scene.traceRay(refrRay, depth), trFactor);
    const combined = Vec3.add(reflCol, refrCol);
    return Vec3.add(Vec3.hadamard(shape.color, combined), shape.emission);
  }
}

class Shape {
  /**
   * @param {Vec3} color
   * @param {Vec3} emission
   * @param {Material} material
   */
  constructor(color, emission, material) {
    this.color = color;
    this.emission = emission;
    this.material = material;
  }

  /** @type {(ray: Ray) => number} */
  getIntersection() {
    return 0;
  }

  /** @type {(pt: Vec3) => Vec3} */
  getNormal() {
    return new Vec3();
  }
}

class Sphere extends Shape {
  /**
   * @param {number} radius
   * @param {Vec3} center
   * @param {Vec3} color
   * @param {Vec3} emission
   * @param {Material} material */
  constructor(radius, center, color, emission, material) {
    super(color, emission, material);
    this.radius = radius;
    this.center = center;
  }

  /** @type {(ray: Ray) => number} */
  getIntersection(ray) {
    const op = Vec3.sub(this.center, ray.position);
    const b = Vec3.dot(op, ray.direction);
    let det = b * b - Vec3.dot(op, op) + this.radius * this.radius;
    if (det < 0) return 0;
    det = Math.sqrt(det);
    const t1 = b - det;
    if (t1 > EPSILON) return t1;
    const t2 = b + det;
    return t2 > EPSILON ? t2 : 0;
  }

  /** @type {(pt: Vec3) => Vec3} */
  getNormal(pt) {
    return Vec3.norm(Vec3.sub(pt, this.center));
  }
}

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

///////////////////////////////
// Scene
///////////////////////////////

class Scene {
  constructor() {
    this.items = [];
  }

  /** @type {(shape: Shape) => void} */
  add(shape) {
    this.items.push(shape);
  }

  /** @type {(ray: Ray, depth?: number) => Vec3} */
  traceRay(ray, depth = 0) {
    let hitObj = null;
    let closestDist = Infinity;

    for (const item of this.items) {
      const d = item.getIntersection(ray);
      if (d && d < closestDist) {
        closestDist = d;
        hitObj = item;
      }
    }
    if (!hitObj) {
      return new Vec3(); // black
    }

    let localColor = new Vec3(hitObj.color.x, hitObj.color.y, hitObj.color.z);
    const newDepth = depth + 1;

    if (newDepth > 5) {
      const p = Math.max(localColor.x, localColor.y, localColor.z);
      if (Math.random() < p / 2) {
        localColor = Vec3.mul(localColor, 1 / p);
      } else {
        return new Vec3(
          hitObj.emission.x,
          hitObj.emission.y,
          hitObj.emission.z,
        );
      }
    }

    const hitPos = Vec3.add(ray.position, Vec3.mul(ray.direction, closestDist));
    const normal = hitObj.getNormal(hitPos);
    return hitObj.material.shade(this, hitObj, ray, hitPos, normal, newDepth);
  }
}

///////////////////////////////
// Setup Scene & Worker
///////////////////////////////

/** @type {(x: number, y: number, z: number) => Vec3} */
function V(x, y, z) {
  return new Vec3(x, y, z);
}

const scene = new Scene();
const matte = new DiffuseMaterial();
const mirror = new MirrorMaterial();
const glass = new GlassMaterial();

const wallRad = 1e5;

// left wall
scene.add(
  new Sphere(
    wallRad,
    V(wallRad, 50, 50),
    V(0.2, 0.8, 0.2), // green
    V(0, 0, 0),
    matte,
  ),
);

// right wall
scene.add(
  new Sphere(
    wallRad,
    V(-99901, 50, 50),
    V(0.2, 0.2, 0.8), // blue
    V(0, 0, 0),
    matte,
  ),
);

// far wall
scene.add(
  new Sphere(
    wallRad,
    V(50, 50, wallRad - 150),
    V(1, 1, 1), // white
    V(0, 0, 0),
    matte,
  ),
);

// floor
scene.add(
  new Sphere(
    wallRad,
    V(50, wallRad, 50),
    V(0.8, 0.2, 0.2), // red
    V(0, 0, 0),
    matte,
  ),
);

// ceiling
scene.add(
  new Sphere(
    wallRad,
    V(50, 100 - wallRad, 50),
    V(0.8, 0.8, 0.2), // yellow
    V(0, 0, 0),
    matte,
  ),
);

// ceiling light
const lightRad = 600;
scene.add(
  new Sphere(
    lightRad,
    V(50, lightRad + 99.5, -20),
    V(0, 0, 0), // black
    V(1, 1, 1), // white
    mirror,
  ),
);

// mirror ball
scene.add(
  new Sphere(16.5, V(27, 36.5, 47), V(0.9, 0.9, 0.9), V(0, 0, 0), mirror),
);
// glass ball
scene.add(new Sphere(20, V(73, 25, 75), V(0.9, 0.9, 0.9), V(0, 0, 0), glass));

// upper matte ball
scene.add(new Sphere(10, V(60, 65, 0), V(0.5, 0.5, 0.5), V(0, 0, 0), matte));

// lower left matte ball
scene.add(new Sphere(16, V(20, 16, 160), V(0.5, 0.5, 0.5), V(0, 0, 0), matte));

const camera = {
  position: V(50, 50, 350),
  direction: V(0, -0.05, -1),
  zoom: 0.5,
};

/** @type {(e: MessageEvent<{width: number, height: number}>) => void} */
self.onmessage = ({data: {width, height}}) => {
  const res = new Uint8ClampedArray(width * height * 3);

  // Prepare coordinate axes for the image plane
  const cx = new Vec3((width * camera.zoom) / height, 0, 0);
  const cy = Vec3.mul(Vec3.norm(Vec3.cross(cx, camera.direction)), camera.zoom);

  // Precompute one ray per pixel
  const rays = [];
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const d = Vec3.norm(
        Vec3.add(
          Vec3.add(
            Vec3.mul(cx, x / width - 0.5),
            Vec3.mul(cy, y / height - 0.5),
          ),
          Vec3.norm(camera.direction),
        ),
      );
      const origin = Vec3.add(camera.position, Vec3.mul(d, 140));
      rays.push(new Ray(origin, d));
    }
  }

  // Continuously accumulate frames
  while (true) {
    let i = 0;
    for (const r of rays) {
      const pixel = scene.traceRay(r);
      res[i++] = pixel.x * 256;
      res[i++] = pixel.y * 256;
      res[i++] = pixel.z * 256;
    }
    self.postMessage(res);
  }
};
