/** @typedef {{x: number, y: number}} Point */

/** @type {(vertices: Point[]) => Point} */
export function polygonCentroid(vertices) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];

    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  return {x: cx / (3 * twiceArea), y: cy / (3 * twiceArea)};
}

/**
 * Narrow-phase SAT between two convex, *axis-aligned or rotated* polygons.
 * Returns the MTV (minimum-translation-vector) normal (unit-length) and
 * penetration depth, or `null` when no overlap exists.
 */
/** @type {(A: Point[], B: Point[]) => {normal: Point, depth: number} | null} */
export function polygonsCollide(A, B) {
  const lenA = A.length;
  const lenB = B.length;

  let minOverlap = Infinity;
  let axisX = 0;
  let axisY = 0;

  // --- 1. Test all edge normals from *both* polygons (no helper call) -----
  for (let polyIdx = 0; polyIdx < 2; ++polyIdx) {
    const poly = polyIdx === 0 ? A : B;
    // previous vertex (wrap-around)
    let px = poly[poly.length - 1].x;
    let py = poly[poly.length - 1].y;

    for (let i = 0; i < poly.length; ++i) {
      const vx = poly[i].x;
      const vy = poly[i].y;

      // outward normal of the current edge (px,py) -> (vx,vy)
      let nx = py - vy;
      let ny = vx - px;

      // skip degenerate edges
      const lenSq = nx * nx + ny * ny;
      if (lenSq === 0) {
        px = vx;
        py = vy;
        continue;
      }

      // normalise once per axis
      const invLen = 1 / Math.sqrt(lenSq);
      nx *= invLen;
      ny *= invLen;

      // project polygon A
      let minA = Infinity;
      let maxA = -Infinity;
      for (let j = 0; j < lenA; ++j) {
        const d = A[j].x * nx + A[j].y * ny;
        if (d < minA) minA = d;
        if (d > maxA) maxA = d;
      }

      // project polygon B
      let minB = Infinity;
      let maxB = -Infinity;
      for (let j = 0; j < lenB; ++j) {
        const d = B[j].x * nx + B[j].y * ny;
        if (d < minB) minB = d;
        if (d > maxB) maxB = d;
      }

      // separating axis found – quit immediately
      if (maxA < minB || maxB < minA) return null;

      const overlap = (maxA < maxB ? maxA : maxB) - (minA > minB ? minA : minB);
      if (overlap < minOverlap) {
        minOverlap = overlap;
        axisX = nx;
        axisY = ny;
      }

      px = vx;
      py = vy;
    }
  }

  // --- 2. Make the axis point from A toward B (two cheap loops) -----------
  let cxA = 0;
  let cyA = 0;
  for (let i = 0; i < lenA; ++i) {
    cxA += A[i].x;
    cyA += A[i].y;
  }
  cxA /= lenA;
  cyA /= lenA;

  let cxB = 0;
  let cyB = 0;
  for (let i = 0; i < lenB; ++i) {
    cxB += B[i].x;
    cyB += B[i].y;
  }
  cxB /= lenB;
  cyB /= lenB;

  if ((cxB - cxA) * axisX + (cyB - cyA) * axisY < 0) {
    axisX = -axisX;
    axisY = -axisY;
  }

  return {normal: {x: axisX, y: axisY}, depth: minOverlap};
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

const EPS = 1e-7; // inside ≤ 0, with a small tolerance

/** Clip convex polygon A by convex polygon B (both clockwise). */
/** @type {(A: Point[], B: Point[]) => Point[]} */
function convexIntersection(A, B) {
  let poly = A; // running polygon to be clipped

  // Clip against every edge of B
  for (let i = 0, j = B.length - 1; i < B.length; j = i++) {
    // Right-hand (inward-pointing) normal of edge Bj → Bi
    const nx = B[i].y - B[j].y;
    const ny = B[j].x - B[i].x;
    const c = nx * B[j].x + ny * B[j].y; // line equation: nx·x + ny·y = c

    const out = [];
    let prev = poly[poly.length - 1];
    let prevDist = nx * prev.x + ny * prev.y - c;

    for (const curr of poly) {
      const currDist = nx * curr.x + ny * curr.y - c;

      // If the segment (prev → curr) crosses the clip line,
      // add the intersection point.
      if (prevDist * currDist < -EPS) {
        const t = prevDist / (prevDist - currDist);
        out.push({
          x: prev.x + (curr.x - prev.x) * t,
          y: prev.y + (curr.y - prev.y) * t,
        });
      }

      // Keep the current vertex if it’s inside (≤ 0)
      if (currDist <= EPS) out.push(curr);

      prev = curr;
      prevDist = currDist;
    }

    if (!out.length) return []; // fully outside
    poly = out; // use the clipped polygon for next edge
  }
  return poly;
}

/** @type {(A: Point[], b: Point[]) => Point[]} */
export function contactManifold(A, B) {
  const pts = convexIntersection(A, B);
  if (!pts.length) return [];

  // dedupe vertices closer than 0.0001 px
  const out = [];
  for (const p of pts) {
    if (!out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-4)) out.push(p);
  }
  return out;
}

/** @type {(cx: number, cy: number, rad: number, numSides: number, rotate?: number) => Point[]} */
export const poly = (cx, cy, rad, numSides, rotate = 0) =>
  Array.from({length: numSides}, (_, i) => {
    const a = (i / numSides) * 2 * Math.PI + rotate;
    return {x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a)};
  });

/** @type {(x: number, y: number, w: number, h: number) => Point[]} */
export const rect = (x, y, w, h) => [
  {x, y},
  {x: x + w, y},
  {x: x + w, y: y + h},
  {x, y: y + h},
];

/** @type {<T extends {minX: number, maxX: number, minY: number, maxY: number}>(shapes: T[]) => T[][]} */
export function getOverlappingPairs(shapes) {
  // insertion sort for speed
  for (let i = 1, n = shapes.length; i < n; ++i) {
    const curr = shapes[i];
    let j = i - 1;
    while (j >= 0 && shapes[j].minX > curr.minX) {
      shapes[j + 1] = shapes[j];
      --j;
    }
    shapes[j + 1] = curr;
  }

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
