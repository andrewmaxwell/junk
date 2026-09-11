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
export function regularPolygonVerts(sides, circumradius, rotation = -Math.PI / 2) {
  const verts = [];
  for (let k = 0; k < sides; k++) {
    const ang = rotation + (k * 2 * Math.PI) / sides;
    verts.push([circumradius * Math.cos(ang), circumradius * Math.sin(ang)]);
  }
  return verts;
}

export function rectVerts(hw, hh) {
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
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

// Separating-axis candidates. `count` lets callers skip edges whose normals
// duplicate an earlier one (a k-gon with even k has only k/2 distinct normals).
export function edgeAxes(verts, count = verts.length) {
  const axes = [];
  for (let i = 0; i < count; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    let nx = -(y2 - y1);
    let ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    axes.push([nx / len, ny / len]);
  }
  return axes;
}

export function projectPoly(verts, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of verts) {
    const p = x * ax + y * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

export function satPolyPoly(vertsA, axisCountA, vertsB, axisCountB) {
  const axes = [...edgeAxes(vertsA, axisCountA), ...edgeAxes(vertsB, axisCountB)];
  let minOverlap = Infinity;
  let minAxis = null;
  for (const axis of axes) {
    const [aMin, aMax] = projectPoly(vertsA, axis[0], axis[1]);
    const [bMin, bMax] = projectPoly(vertsB, axis[0], axis[1]);
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      minAxis = axis;
    }
  }
  return { axis: minAxis, overlap: minOverlap };
}

export function satCirclePoly(cx, cy, r, poly, axisCount) {
  const axes = edgeAxes(poly, axisCount);
  // The circle contributes one axis: towards the closest polygon vertex.
  let nearest = null;
  let nd = Infinity;
  for (const v of poly) {
    const d = Math.hypot(v[0] - cx, v[1] - cy);
    if (d < nd) {
      nd = d;
      nearest = v;
    }
  }
  if (nearest) {
    const ax = nearest[0] - cx;
    const ay = nearest[1] - cy;
    const len = Math.hypot(ax, ay) || 1;
    axes.push([ax / len, ay / len]);
  }
  let minOverlap = Infinity;
  let minAxis = null;
  for (const axis of axes) {
    const cProj = cx * axis[0] + cy * axis[1];
    const [pMin, pMax] = projectPoly(poly, axis[0], axis[1]);
    const overlap = Math.min(cProj + r, pMax) - Math.max(cProj - r, pMin);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) {
      minOverlap = overlap;
      minAxis = axis;
    }
  }
  return { axis: minAxis, overlap: minOverlap };
}

export function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  const overlap = ar + br - d;
  if (overlap <= 0) return null;
  if (d < 1e-9) {
    // Coincident centres: any direction separates them.
    return { axis: [1, 0], overlap };
  }
  return { axis: [dx / d, dy / d], overlap };
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

// Relative tolerance for treating vertices as equally extreme.
const SUPPORT_EPS = 0.01;

const SUPPORT_A = [0, 0];
const SUPPORT_B = [0, 0];

// The MTV axis from SAT is sign-agnostic. Orient it from a towards b so callers
// can always push a backwards and b forwards.
function orientAwayFrom(res, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (res.axis[0] * dx + res.axis[1] * dy < 0) {
    res.axis = [-res.axis[0], -res.axis[1]];
  }
  return res;
}

// Overlap between two placed items. Returns null when they are disjoint,
// otherwise {axis, overlap, px, py} where (px, py) is the contact point: the
// midpoint of each body's deepest point along the separation axis.
export function testOverlap(a, b) {
  // Broad phase: bounding circles of the two shapes.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = a.shape.radius + b.shape.radius;
  if (dx * dx + dy * dy > rr * rr) return null;

  const aCircle = a.shape.type === 'circle';
  const bCircle = b.shape.type === 'circle';
  let vertsA = null;
  let vertsB = null;
  let res;
  if (aCircle && bCircle) {
    res = circleCircle(a.x, a.y, a.shape.radius, b.x, b.y, b.shape.radius);
  } else if (aCircle) {
    vertsB = worldVerts(b);
    res = satCirclePoly(a.x, a.y, a.shape.radius, vertsB, b.shape.axisCount);
  } else if (bCircle) {
    vertsA = worldVerts(a);
    res = satCirclePoly(b.x, b.y, b.shape.radius, vertsA, a.shape.axisCount);
  } else {
    vertsA = worldVerts(a);
    vertsB = worldVerts(b);
    res = satPolyPoly(vertsA, a.shape.axisCount, vertsB, b.shape.axisCount);
  }
  if (!res) return null;
  orientAwayFrom(res, a, b);

  const [nx, ny] = res.axis;
  supportPoint(a, nx, ny, vertsA, SUPPORT_A);
  supportPoint(b, -nx, -ny, vertsB, SUPPORT_B);
  res.px = (SUPPORT_A[0] + SUPPORT_B[0]) / 2;
  res.py = (SUPPORT_A[1] + SUPPORT_B[1]) / 2;
  return res;
}
