// Geometry shared by the main thread (hit testing) and rayWorker.js
// (tracing), so the two can never disagree about what's inside the glass.

export const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Is (x, y) inside a lens, droplet or prism? Elements are main-thread
// instances or their serialized copies; both carry the fields used here.
// Plain numbers keep it allocation-free for the tracer's hot loop.
export function containsAt(el, x, y) {
  const dx = x - el.x;
  const dy = y - el.y;
  if (el.type === 'drop') return dx * dx + dy * dy < el.r * el.r;
  if (el.type === 'prism') return polygonContains(el.vertices, x, y);

  if (dx * dx + dy * dy > el.boundingRadius * el.boundingRadius) return false;
  const v = dx * el.perp.x + dy * el.perp.y;
  if (Math.abs(v) > el.H) return false;
  // "Outside the circle" alone would accept points far beyond a concave
  // surface, so also bound the axial extent.
  const u = dx * el.axis.x + dy * el.axis.y;
  if (u < el.uMin || u > el.uMax) return false;
  // Convex surfaces (sign > 0) keep the inside of their circle, concave ones
  // the outside.
  const d1 = (x - el.c1.x) ** 2 + (y - el.c1.y) ** 2;
  if (el.sign1 > 0 ? d1 > el.r1 * el.r1 : d1 < el.r1 * el.r1) return false;
  const d2 = (x - el.c2.x) ** 2 + (y - el.c2.y) ** 2;
  return el.sign2 > 0 ? d2 <= el.r2 * el.r2 : d2 >= el.r2 * el.r2;
}

export const contains = (el, pt) => containsAt(el, pt.x, pt.y);

// Convex polygon: inside if (x, y) is on the same side of every edge.
function polygonContains(vertices, x, y) {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
