// Low-level 2D geometry: polygon helpers and SAT collision queries.
//
// Conventions used throughout:
//  - A point is a two-element array [x, y].
//  - Polygons are convex and wound counter-clockwise in a y-up coordinate
//    system, so (y2-y1, -(x2-x1)) is the *outward* normal of edge i.
//  - "Overlap" results are {axis:[nx,ny], overlap} where axis is a unit
//    minimum-translation direction pointing from the first body to the second.

export function shoelaceArea(verts) {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// Counter-clockwise regular polygon, first vertex pointing "down" (-y) so that
// triangles render point-up once the canvas flips the y axis.
export function regularPolygonVerts(
  sides,
  circumradius,
  rotation = -Math.PI / 2,
) {
  const verts = [];
  for (let k = 0; k < sides; k++) {
    const ang = rotation + (k * 2 * Math.PI) / sides;
    verts.push([circumradius * Math.cos(ang), circumradius * Math.sin(ang)]);
  }
  return verts;
}

export function rectVerts(hw, hh) {
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
}

// Transform a shape's local vertices into world space.
export function worldVerts(item) {
  const local = item.shape.verts;
  if (!local) return null;
  const c = Math.cos(item.theta);
  const s = Math.sin(item.theta);
  const out = new Array(local.length);
  for (let i = 0; i < local.length; i++) {
    const [lx, ly] = local[i];
    out[i] = [item.x + lx * c - ly * s, item.y + lx * s + ly * c];
  }
  return out;
}

// World-space vertices and separating-axis candidates of a placed polygon,
// kept on the item and rebuilt only when its pose or shape changes. Inside the
// O(n^2) contact loops each item is tested against every other one, so without
// this its vertices would be rebuilt n-1 times per pass. The arithmetic is the
// same as worldVerts(), so cached and fresh results agree bit for bit.
//
// `axisCount` skips edges whose normals duplicate an earlier one (a k-gon with
// even k has only k/2 distinct normals). The cache is a non-enumerable symbol
// property, so spreading or posting an item never copies it.
const POLY = Symbol('poly');

function polyCache(item) {
  const shape = item.shape;
  let p = item[POLY];
  if (!p || p.shape !== shape) {
    const n = shape.verts.length;
    p = {
      shape,
      x: NaN,
      y: NaN,
      theta: NaN,
      n,
      axisCount: shape.axisCount ?? n,
      vx: new Float64Array(n),
      vy: new Float64Array(n),
      ax: new Float64Array(n),
      ay: new Float64Array(n),
    };
    Object.defineProperty(item, POLY, {value: p, writable: true});
  }
  if (p.x === item.x && p.y === item.y && p.theta === item.theta) return p;
  p.x = item.x;
  p.y = item.y;
  p.theta = item.theta;
  const local = shape.verts;
  const c = Math.cos(item.theta);
  const s = Math.sin(item.theta);
  const {n, vx, vy, ax, ay} = p;
  for (let i = 0; i < n; i++) {
    const lx = local[i][0];
    const ly = local[i][1];
    vx[i] = item.x + lx * c - ly * s;
    vy[i] = item.y + lx * s + ly * c;
  }
  // Every edge's normal is kept, for contact clipping; SAT reads only the
  // first `axisCount`.
  for (let i = 0; i < n; i++) {
    const k = i + 1 === n ? 0 : i + 1;
    const nx = -(vy[k] - vy[i]);
    const ny = vx[k] - vx[i];
    const len = Math.hypot(nx, ny) || 1;
    ax[i] = nx / len;
    ay[i] = ny / len;
  }
  return p;
}

// Projection interval of a cached polygon onto (ax, ay), returned through
// PROJ_A / PROJ_B so the hot loops allocate nothing.
const PROJ_A = [0, 0];
const PROJ_B = [0, 0];
function project(p, ax, ay, out) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = p.vx[i] * ax + p.vy[i] * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  out[0] = min;
  out[1] = max;
}

// Smallest overlap of `a` and `b` along `p`'s axes, or 0 if one separates
// them. The axis index lands in AXIS_HIT[0].
const AXIS_HIT = [0];
function minOverlapOnAxes(p, a, b, best) {
  for (let i = 0; i < p.axisCount; i++) {
    project(a, p.ax[i], p.ay[i], PROJ_A);
    project(b, p.ax[i], p.ay[i], PROJ_B);
    const overlap =
      Math.min(PROJ_A[1], PROJ_B[1]) - Math.max(PROJ_A[0], PROJ_B[0]);
    if (overlap <= 0) return 0;
    if (overlap < best) {
      best = overlap;
      AXIS_HIT[0] = i;
    }
  }
  return best;
}

function satPolyPoly(pa, pb) {
  const overA = minOverlapOnAxes(pa, pa, pb, Infinity);
  if (overA === 0) return null;
  const iA = AXIS_HIT[0];
  AXIS_HIT[0] = -1;
  const over = minOverlapOnAxes(pb, pa, pb, overA);
  if (over === 0) return null;
  // Ties keep the earlier axis, which is A's.
  const iB = AXIS_HIT[0];
  const axis = iB < 0 ? [pa.ax[iA], pa.ay[iA]] : [pb.ax[iB], pb.ay[iB]];
  return {axis, overlap: over, refIsA: iB < 0};
}

function satCirclePoly(cx, cy, r, p) {
  let minOverlap = Infinity;
  let minAxis = -1;
  for (let i = 0; i < p.axisCount; i++) {
    const cProj = cx * p.ax[i] + cy * p.ay[i];
    project(p, p.ax[i], p.ay[i], PROJ_A);
    const overlap =
      Math.min(cProj + r, PROJ_A[1]) - Math.max(cProj - r, PROJ_A[0]);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      minAxis = i;
    }
  }
  // The circle contributes one axis: towards the closest polygon vertex.
  let nearest = -1;
  let nd = Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = Math.hypot(p.vx[i] - cx, p.vy[i] - cy);
    if (d < nd) {
      nd = d;
      nearest = i;
    }
  }
  let axis = minAxis < 0 ? null : [p.ax[minAxis], p.ay[minAxis]];
  if (nearest >= 0) {
    const ax = p.vx[nearest] - cx;
    const ay = p.vy[nearest] - cy;
    const len = Math.hypot(ax, ay) || 1;
    const nx = ax / len;
    const ny = ay / len;
    const cProj = cx * nx + cy * ny;
    project(p, nx, ny, PROJ_A);
    const overlap =
      Math.min(cProj + r, PROJ_A[1]) - Math.max(cProj - r, PROJ_A[0]);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      axis = [nx, ny];
    }
  }
  return {axis, overlap: minOverlap};
}

export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const overlap = ar + br - d;
  if (overlap <= 0) return null;
  if (d < 1e-9) {
    // Coincident centres: any direction separates them.
    return {axis: [1, 0], overlap};
  }
  return {axis: [dx / d, dy / d], overlap};
}

// Second moment of area about the centroid (assumed to be the origin),
// multiplied by `mass`. Standard convex-polygon formula.
export function polygonInertia(verts, mass) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < verts.length; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % verts.length];
    const cross = Math.abs(ax * by - ay * bx);
    num += cross * (ax * ax + ax * bx + bx * bx + ay * ay + ay * by + by * by);
    den += cross;
  }
  return den === 0 ? 0 : (mass * num) / (6 * den);
}

// Relative tolerance for treating vertices as equally extreme.
const SUPPORT_EPS = 0.01;

// Deepest point of a placed item along direction (nx, ny), in world space.
//
// When several vertices are equally extreme -- a flat face resting against
// another face -- their average is returned instead of an arbitrary one. A
// single vertex there would fabricate a torque and make flat contacts jitter.
export function supportPoint(item, nx, ny, worldV, out) {
  if (item.shape.type === 'circle') {
    out[0] = item.x + nx * item.shape.radius;
    out[1] = item.y + ny * item.shape.radius;
    return out;
  }
  const verts = worldV || worldVerts(item);
  let best = -Infinity;
  for (const [x, y] of verts) {
    const p = x * nx + y * ny;
    if (p > best) best = p;
  }
  const cutoff = best - SUPPORT_EPS * item.shape.radius;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const [x, y] of verts) {
    if (x * nx + y * ny >= cutoff) {
      sx += x;
      sy += y;
      n++;
    }
  }
  out[0] = sx / n;
  out[1] = sy / n;
  return out;
}

// supportPoint() for a cached polygon.
function cachedSupport(p, radius, nx, ny, out) {
  let best = -Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = p.vx[i] * nx + p.vy[i] * ny;
    if (d > best) best = d;
  }
  const cutoff = best - SUPPORT_EPS * radius;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < p.n; i++) {
    if (p.vx[i] * nx + p.vy[i] * ny >= cutoff) {
      sx += p.vx[i];
      sy += p.vy[i];
      n++;
    }
  }
  out[0] = sx / n;
  out[1] = sy / n;
  return out;
}

const SUPPORT_A = [0, 0];
const SUPPORT_B = [0, 0];

// The edge of `p` whose outward normal is most aligned with (nx, ny). The
// cached axes point inward -- SAT does not care about sign -- hence the minus.
function bestEdge(p, nx, ny) {
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < p.n; i++) {
    const d = -(p.ax[i] * nx + p.ay[i] * ny);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return best;
}

// Contact point of two overlapping polygons by edge clipping, as in Box2D's
// contact manifolds. The reference face is the one the SAT axis came from; the
// incident face is the other body's edge facing it most squarely. Clipping the
// incident edge to the reference edge's extent leaves the points of the
// incident body that actually sit inside the reference body, and each one
// contributes the midpoint between it and the reference face, weighted by how
// deep it is.
//
// The midpoint of the two support points, used before this, lands halfway
// between a corner and the centre of the face it pokes into, so the lever arm
// -- and with it the turn the contact applies -- comes out wrong whenever a
// corner meets a face off-centre. Returns false if clipping leaves nothing,
// so the caller can fall back.
function clippedContact(ref, inc, nx, ny, out) {
  const r = bestEdge(ref, nx, ny);
  const i = bestEdge(inc, -nx, -ny);
  const r2 = r + 1 === ref.n ? 0 : r + 1;
  const i2 = i + 1 === inc.n ? 0 : i + 1;
  const rx = ref.vx[r];
  const ry = ref.vy[r];
  let tx = ref.vx[r2] - rx;
  let ty = ref.vy[r2] - ry;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  // Clip the incident edge to the reference edge's extent along its tangent.
  const ax = inc.vx[i];
  const ay = inc.vy[i];
  const dx = inc.vx[i2] - ax;
  const dy = inc.vy[i2] - ay;
  const sa = (ax - rx) * tx + (ay - ry) * ty;
  const sb = sa + dx * tx + dy * ty;
  if ((sa < 0 && sb < 0) || (sa > len && sb > len)) return false;
  // Parameters of the clipped ends along the incident edge.
  const span = sb - sa;
  const fa = span === 0 ? 0 : (Math.min(len, Math.max(0, sa)) - sa) / span;
  const fb = span === 0 ? 1 : (Math.min(len, Math.max(0, sb)) - sa) / span;
  const face = rx * nx + ry * ny;
  let wx = 0;
  let wy = 0;
  let w = 0;
  for (const f of [fa, fb]) {
    const x = ax + dx * f;
    const y = ay + dy * f;
    const depth = face - (x * nx + y * ny);
    if (depth <= 0) continue;
    wx += (x + (nx * depth) / 2) * depth;
    wy += (y + (ny * depth) / 2) * depth;
    w += depth;
  }
  if (w <= 0) return false;
  out[0] = wx / w;
  out[1] = wy / w;
  return true;
}
const CLIPPED = [0, 0];

// Overlap between two placed items. Returns null when they are disjoint,
// otherwise {axis, overlap, px, py} where (px, py) is the contact point: the
// clipped edge contact for two polygons, otherwise the midpoint of each body's
// deepest point along the separation axis. The axis is a unit vector pointing
// from a towards b.
export function testOverlap(a, b) {
  // Broad phase: bounding circles of the two shapes.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.shape.radius + b.shape.radius;
  if (dx * dx + dy * dy > rr * rr) return null;

  const aCircle = a.shape.type === 'circle';
  const bCircle = b.shape.type === 'circle';
  const pa = aCircle ? null : polyCache(a);
  const pb = bCircle ? null : polyCache(b);
  let res;
  if (aCircle && bCircle) {
    res = circleCircle(a.x, a.y, a.shape.radius, b.x, b.y, b.shape.radius);
  } else if (aCircle) {
    res = satCirclePoly(a.x, a.y, a.shape.radius, pb);
  } else if (bCircle) {
    res = satCirclePoly(b.x, b.y, b.shape.radius, pa);
  } else {
    res = satPolyPoly(pa, pb);
  }
  if (!res) return null;

  // The SAT axis is sign-agnostic; orient it from a towards b.
  const axis = res.axis;
  if (axis[0] * dx + axis[1] * dy < 0) {
    axis[0] = -axis[0];
    axis[1] = -axis[1];
  }
  const nx = axis[0];
  const ny = axis[1];
  if (pa && pb) {
    // The reference face's outward normal points at the other body: +n from
    // a, -n from b.
    const ok = res.refIsA
      ? clippedContact(pa, pb, nx, ny, CLIPPED)
      : clippedContact(pb, pa, -nx, -ny, CLIPPED);
    if (ok) {
      res.px = CLIPPED[0];
      res.py = CLIPPED[1];
      return res;
    }
  }
  if (pa) cachedSupport(pa, a.shape.radius, nx, ny, SUPPORT_A);
  else supportPoint(a, nx, ny, null, SUPPORT_A);
  if (pb) cachedSupport(pb, b.shape.radius, -nx, -ny, SUPPORT_B);
  else supportPoint(b, -nx, -ny, null, SUPPORT_B);
  res.px = (SUPPORT_A[0] + SUPPORT_B[0]) / 2;
  res.py = (SUPPORT_A[1] + SUPPORT_B[1]) / 2;
  return res;
}
