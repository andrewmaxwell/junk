'use strict';

const Vec = (x = 0, y = 0, z = 0) => ({x, y, z});
const addMut = (a, b) => {
  a.x += b.x;
  a.y += b.y;
  a.z += b.z;
  return a;
};
const sub = (a, b) => Vec(a.x - b.x, a.y - b.y, a.z - b.z);
const subMut = (a, b) => {
  b.x = a.x - b.x;
  b.y = a.y - b.y;
  b.z = a.z - b.z;
  return b;
};
const multiply = (a, b) => Vec(a.x * b, a.y * b, a.z * b);
const multiplyMut = (a, b) => {
  a.x *= b;
  a.y *= b;
  a.z *= b;
  return a;
};
const mult = (a, b) => {
  a.x *= b.x;
  a.y *= b.y;
  a.z *= b.z;
  return a;
};
const norm = (a) => {
  const m = 1 / Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  a.x *= m;
  a.y *= m;
  a.z *= m;
  return a;
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) =>
  Vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

const Ray = (position, direction) => ({position, direction});

const eps = 1e-4;

const sphereIntersect = (s, r) => {
  const op = sub(s.position, r.position);
  const b = dot(op, r.direction);

  let det = b ** 2 - dot(op, op) + s.rad ** 2;
  if (det < 0) return 0;
  det = Math.sqrt(det);

  let t;
  return (t = b - det) > eps ? t : (t = b + det) > eps ? t : 0;
};

const getRayColor = (ray, spheres, depth = 0) => {
  let obj;
  let dist = Infinity;
  for (const s of spheres) {
    const d = sphereIntersect(s, ray);
    if (d && d < dist) {
      dist = d;
      obj = s;
    }
  }

  if (!obj) return Vec();

  let color = {...obj.color};

  if (++depth > 5) {
    const p = Math.max(color.x, color.y, color.z);
    if (Math.random() < p / 2) multiplyMut(color, 1 / p);
    else return {...obj.emission};
  }

  const pos = addMut(multiplyMut({...ray.direction}, dist), ray.position);
  const n = norm(sub(pos, obj.position));

  switch (obj.material) {
    case 'matte': {
      const w = dot(n, ray.direction) < 0 ? n : multiplyMut(n, -1);
      const r1 = 2 * Math.PI * Math.random();
      const r2 = Math.random();
      const r2s = Math.sqrt(r2);
      const u = norm(cross(Math.abs(w.x) > 0.1 ? Vec(0, 1) : Vec(1), w));
      const v = cross(w, u);
      const direction = norm(
        addMut(
          addMut(
            multiplyMut(u, Math.cos(r1) * r2s),
            multiplyMut(v, Math.sin(r1) * r2s)
          ),
          multiplyMut(w, Math.sqrt(1 - r2))
        )
      );
      return addMut(
        mult(color, getRayColor(Ray(pos, direction), spheres, depth)),
        obj.emission
      );
    }

    case 'mirror':
      return addMut(
        mult(
          color,
          getRayColor(
            Ray(
              pos,
              subMut(ray.direction, multiplyMut(n, 2 * dot(n, ray.direction)))
            ),
            spheres,
            depth
          )
        ),
        obj.emission
      );

    case 'glass': {
      const w = dot(n, ray.direction) < 0 ? n : multiply(n, -1);
      const reflRay = Ray(
        pos,
        subMut(ray.direction, multiply(n, 2 * dot(n, ray.direction)))
      );
      const into = dot(n, w) > 0;
      const nnt = into ? 2 / 3 : 1.5;
      const ddn = dot(ray.direction, w);
      const cos2t = 1 - nnt * nnt * (1 - ddn * ddn);

      if (cos2t < 0) {
        return addMut(
          mult(color, getRayColor(reflRay, spheres, depth)),
          obj.emission
        );
      }

      const tdir = norm(
        subMut(
          multiply(ray.direction, nnt),
          multiply(n, (into ? 1 : -1) * (ddn * nnt + Math.sqrt(cos2t)))
        )
      );
      const Re = 0.04 + 0.96 * (1 - (into ? -ddn : dot(tdir, n))) ** 5,
        Tr = 1 - Re,
        P = 0.25 + 0.5 * Re,
        RP = Re / P,
        TP = Tr / (1 - P);
      return addMut(
        mult(
          color,
          depth > 2
            ? Math.random() < P
              ? multiplyMut(getRayColor(reflRay, spheres, depth), RP)
              : multiplyMut(getRayColor(Ray(pos, tdir), spheres, depth), TP)
            : addMut(
                multiplyMut(getRayColor(reflRay, spheres, depth), Re),
                multiplyMut(getRayColor(Ray(pos, tdir), spheres, depth), Tr)
              )
        ),
        obj.emission
      );
    }
  }
};

const camera = {
  position: {x: 50, y: 50, z: 295.6},
  direction: {x: 0, y: -0.042612, z: -1},
  zoom: 0.5,
};
const spheres = [
  {
    name: 'left wall',
    rad: 100000,
    position: {x: 100001, y: 40.8, z: 81.6},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.2, y: 0.8, z: 0.2},
    material: 'matte',
  },
  {
    name: 'right wall',
    rad: 100000,
    position: {x: -99901, y: 40.8, z: 81.6},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.2, y: 0.2, z: 0.8},
    material: 'matte',
  },
  {
    name: 'back wall',
    rad: 100000,
    position: {x: 50, y: 40.8, z: 100000},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 1, y: 1, z: 1},
    material: 'matte',
  },
  {
    name: 'front wall',
    rad: 100000,
    position: {x: 50, y: 40.8, z: -99830},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0, y: 0, z: 0},
    material: 'matte',
  },
  {
    name: 'floor',
    rad: 100000,
    position: {x: 50, y: 100000, z: 81.6},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.8, y: 0.2, z: 0.2},
    material: 'matte',
  },
  {
    name: 'ceiling',
    rad: 100000,
    position: {x: 50, y: -99918.4, z: 81.6},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.8, y: 0.8, z: 0.2},
    material: 'matte',
  },
  {
    name: 'mirror ball',
    rad: 16.5,
    position: {x: 27, y: 36.5, z: 47},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.999, y: 0.999, z: 0.999},
    material: 'mirror',
  },
  {
    name: 'glass ball',
    rad: 20,
    position: {x: 73, y: 26.5, z: 78},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.999, y: 0.999, z: 0.999},
    material: 'glass',
  },
  {
    name: 'matte ball',
    rad: 10,
    position: {x: 50, y: 65, z: 85},
    emission: {x: 0, y: 0, z: 0},
    color: {x: 0.5, y: 0.5, z: 0.5},
    material: 'matte',
  },
  {
    name: 'light',
    rad: 600,
    position: {x: 50, y: 681.33, z: 81.6},
    emission: {x: 1, y: 1, z: 1},
    color: {x: 0, y: 0, z: 0},
    material: 'matte',
  },
];

self.onmessage = ({data: {width, height}}) => {
  const res = new Uint8ClampedArray(width * height * 3);
  const cx = Vec((width * camera.zoom) / height);
  const cy = multiplyMut(norm(cross(cx, camera.direction)), camera.zoom);

  const rays = [];
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const d = addMut(
        addMut(multiply(cx, x / width - 0.5), multiply(cy, y / height - 0.5)),
        norm(camera.direction)
      );
      rays.push(Ray(addMut(multiply(d, 140), camera.position), norm(d)));
    }
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let i = 0;
    for (const r of rays) {
      const pixel = getRayColor(r, spheres);
      res[i++] = pixel.x * 256;
      res[i++] = pixel.y * 256;
      res[i++] = pixel.z * 256;
    }
    self.postMessage(res);
  }
};
