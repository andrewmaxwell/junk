// Recheck a saved layout using the shared geometry routines. This catches
// bookkeeping and nonfinite-state errors, but is not an independent geometry proof.

import { testOverlap } from './geometry.js';
import { containmentExcess } from './shapes.js';

// `tolerance` is relative to the item's own size, so the same threshold means
// the same thing whether the layout holds 3 shapes or 40.
export function validateLayout(items, container, tolerance = 1e-3) {
  const finitePoint = (p) => p?.length === 2 && p.every(Number.isFinite);
  const validShape = (shape) => shape && Number.isFinite(shape.radius) && shape.radius > 0 &&
    (shape.type === 'circle' || (shape.type === 'polygon' && shape.verts?.length >= 3 &&
      shape.verts.every(finitePoint) && Number.isInteger(shape.axisCount) && shape.axisCount > 0));
  const validContainer = container && (container.type === 'circle'
    ? Number.isFinite(container.R) && container.R > 0
    : container.type === 'convex' && container.verts?.length >= 3 &&
      container.verts.every(finitePoint) && container.planes?.length >= 3 &&
      container.planes.every((p) => [p.nx, p.ny, p.d].every(Number.isFinite) &&
        Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-8));
  if (!Array.isArray(items) || !Number.isFinite(tolerance) || tolerance < 0 || !validContainer ||
      !items.every((it) => it && [it.x, it.y, it.theta].every(Number.isFinite) && validShape(it.shape))) {
    return { ok: false, worstOverlap: Infinity, worstEscape: Infinity, limit: null,
      problems: ['Layout, container, or tolerance contains invalid/nonfinite data'] };
  }
  const scale = items.length ? Math.min(...items.map((it) => it.shape.radius)) : 1;
  const limit = tolerance * scale;
  let worstOverlap = 0;
  let overlapPair = null;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const res = testOverlap(items[i], items[j]);
      if (res && res.overlap > worstOverlap) {
        worstOverlap = res.overlap;
        overlapPair = [i, j];
      }
    }
  }
  let worstEscape = 0;
  let escapee = null;
  for (let i = 0; i < items.length; i++) {
    const ex = containmentExcess(items[i], container);
    if (ex > worstEscape) {
      worstEscape = ex;
      escapee = i;
    }
  }
  const problems = [];
  if (worstOverlap > limit) {
    problems.push(`items ${overlapPair[0]} and ${overlapPair[1]} overlap by ${worstOverlap.toExponential(2)}`);
  }
  if (worstEscape > limit) {
    problems.push(`item ${escapee} pokes ${worstEscape.toExponential(2)} outside the container`);
  }
  return { ok: problems.length === 0, worstOverlap, worstEscape, limit, problems };
}
