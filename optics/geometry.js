// Geometry shared by the main thread (hit testing) and rayWorker.js
// (tracing), so the two can never disagree about what's inside the glass.

export const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Is `pt` inside a lens or droplet? Elements are Lens/Droplet instances or
// their serialized copies; both carry the fields used here.
export function contains(el, pt) {
  if (el.type === 'drop') return distSq(pt, el) < el.r * el.r;

  const dx = pt.x - el.x;
  const dy = pt.y - el.y;
  const v = dx * el.perp.x + dy * el.perp.y;
  if (Math.abs(v) > el.H) return false;
  // "Outside the circle" alone would accept points far beyond a concave
  // surface, so also bound the axial extent.
  const u = dx * el.axis.x + dy * el.axis.y;
  if (u < el.uMin || u > el.uMax) return false;
  // Convex surfaces (sign > 0) keep the inside of their circle, concave ones
  // the outside.
  const d1 = distSq(pt, el.c1);
  if (el.sign1 > 0 ? d1 > el.r1 * el.r1 : d1 < el.r1 * el.r1) return false;
  const d2 = distSq(pt, el.c2);
  return el.sign2 > 0 ? d2 <= el.r2 * el.r2 : d2 >= el.r2 * el.r2;
}
