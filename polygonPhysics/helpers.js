/** @typedef {{x: number, y: number}} Point */

/** @type {(vertices: Point[]) => Point} */
export function polygonCentroid(vertices) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const n = vertices.length;
  let px = vertices[vertices.length - 1].x;
  let py = vertices[vertices.length - 1].y;
  for (let i = 0; i < n; i++) {
    const ax = vertices[i].x;
    const ay = vertices[i].y;

    const cross = ax * py - px * ay;
    a += cross;
    cx += (ax + px) * cross;
    cy += (ay + py) * cross;
    px = ax;
    py = ay;
  }
  return {x: cx / (3 * a), y: cy / (3 * a)};
}

/** @type {(points: Point[]) => number} */
export function polygonArea(points) {
  let sum = 0;
  let prev = points[points.length - 1];
  for (const curr of points) {
    sum += prev.x * curr.y - curr.x * prev.y;
    prev = curr;
  }
  return Math.abs(sum) * 0.5;
}

/** @type {(points: Point[]) => number} */
export function polygonInertia(points) {
  let numer = 0;
  let denom = 0;
  let p = points[points.length - 1];
  for (const c of points) {
    const cross = p.x * c.y - c.x * p.y;
    numer +=
      cross *
      (p.x * p.x + p.x * c.x + c.x * c.x + p.y * p.y + p.y * c.y + c.y * c.y);
    denom += cross;
    p = c;
  }
  const centroid = polygonCentroid(points);
  return (
    numer / denom / 6 - (centroid.x * centroid.x + centroid.y * centroid.y)
  );
}

/** @type {(cx: number, cy: number, rad: number, numSides: number, rotate?: number) => Point[]} */
export const poly = (cx, cy, rad, numSides, rotate = 0) =>
  Array.from({length: numSides}, (_, i) => {
    const a = (i / numSides) * 2 * Math.PI + rotate;
    return {x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a)};
  });

/** @type {(x: number, y: number, w: number, h: number) => Point[]} */
export const rect = (x, y, w, h) => [
  {x: x - w / 2, y: y - h / 2},
  {x: x + w / 2, y: y - h / 2},
  {x: x + w / 2, y: y + h / 2},
  {x: x - w / 2, y: y + h / 2},
];

/** @type {<T extends {minX: number, maxX: number, minY: number, maxY: number}>(shapes: T[]) => T[][]} */
export function getOverlappingPairs(shapes) {
  shapes.sort((a, b) => a.minX - b.minX);
  // insertion sort for speed
  // for (let i = 1, n = shapes.length; i < n; ++i) {
  //   const curr = shapes[i];
  //   let j = i - 1;
  //   while (j >= 0 && shapes[j].minX > curr.minX) {
  //     shapes[j + 1] = shapes[j];
  //     --j;
  //   }
  //   shapes[j + 1] = curr;
  // }

  const pairs = [];

  for (let i = 0; i < shapes.length; i++) {
    const a = shapes[i];
    for (let j = i + 1; j < shapes.length; j++) {
      const b = shapes[j];
      if (b.minX > a.maxX) break;
      if (a.minY <= b.maxY && a.maxY >= b.minY) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** @type {(a: Point, b: Point) => number} */
const getAngle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

/** @type {(a: Point, b: Point) => number} */
const sqDist = (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

/** @type {(a: Point, b: Point, c: Point) => boolean} */
const isCounterClockwise = (a, b, c) =>
  (b.x - a.x) * (c.y - a.y) <= (b.y - a.y) * (c.x - a.x);

/** @type {(points: Point[]) => Point[]} */
const getConvexHull = (points) => {
  const minYPoint = points.reduce((min, p) =>
    p.y < min.y || (p.y === min.y && p.x < min.x) ? p : min,
  );

  /** @type {Array<Point>} */
  const hull = [];

  for (const p of points.sort(
    (a, b) =>
      getAngle(minYPoint, a) - getAngle(minYPoint, b) ||
      sqDist(minYPoint, a) - sqDist(minYPoint, b),
  )) {
    while (
      hull.length >= 2 &&
      isCounterClockwise(hull[hull.length - 2], hull[hull.length - 1], p)
    ) {
      hull.pop();
    }
    hull.push(p);
  }
  return hull;
};

/** @type {(x: number, y: number, numPts?: number, minRad?: number, maxRad?: number) => Point[]} */
export const randPoly = (x, y, numPts = 8, minRad = 0, maxRad = 150) =>
  getConvexHull(
    Array.from({length: numPts}, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = minRad + Math.random() * (maxRad - minRad);
      return {x: x + dist * Math.cos(angle), y: y + dist * Math.sin(angle)};
    }),
  );

/** @type {(colors: number[][], numSteps?: number) => (val: number) => string} */
export const rgbGradient = (colors, numSteps = 256) => {
  const gradient = Array.from({length: numSteps}, (_, i) => {
    const colorIndex = (i / (numSteps - 1)) * (colors.length - 1);
    const c1 = colors[Math.floor(colorIndex)];
    const c2 = colors[Math.ceil(colorIndex)];
    const rem = colorIndex % 1;
    const rgb = c1.map((c, i) => Math.round(c * (1 - rem) + c2[i] * rem));
    return '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
  });
  return (v) => gradient[Math.max(0, Math.min(numSteps - 1, Math.round(v)))];
};
