// Recheck a saved layout using the shared geometry routines. This catches
// bookkeeping and nonfinite-state errors, but is not an independent geometry proof.

import { testOverlap } from './geometry.js';
import { containmentExcess } from './shapes.js';
import { sphereGeometry, overlapPair } from './sphere.js';

const finite = (...values) => values.every(Number.isFinite);
const finitePoint = (p) => p?.length === 2 && finite(...p);
const isUnit = (x, y, z) => Math.abs(Math.hypot(x, y, z) - 1) < 1e-6;

const validShape = (shape) => shape && finite(shape.radius) && shape.radius > 0 &&
  (shape.type === 'circle' || (shape.type === 'polygon' && shape.verts?.length >= 3 &&
    shape.verts.every(finitePoint) && Number.isInteger(shape.axisCount) && shape.axisCount > 0));

function validContainer(container) {
  if (!container) return false;
  if (container.type === 'circle' || container.type === 'sphere') {
    return finite(container.R) && container.R > 0;
  }
  return container.type === 'convex' && container.verts?.length >= 3 &&
    container.verts.every(finitePoint) && container.planes?.length >= 3 &&
    container.planes.every((p) => finite(p.nx, p.ny, p.d) && Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-8);
}

// A sphere item is a unit position plus a unit tangent facing; a planar item is
// a point plus an angle.
function validItem(it, onSphere) {
  if (!it || !validShape(it.shape)) return false;
  if (!onSphere) return finite(it.x, it.y, it.theta);
  return finite(it.x, it.y, it.z, it.tx, it.ty, it.tz) &&
    isUnit(it.x, it.y, it.z) && isUnit(it.tx, it.ty, it.tz) &&
    Math.abs(it.x * it.tx + it.y * it.ty + it.z * it.tz) < 1e-6;
}

// `tolerance` is relative to the item's own size, so the same threshold means
// the same thing whether the layout holds 3 shapes or 40.
export function validateLayout(items, container, tolerance = 1e-3) {
  const onSphere = container?.type === 'sphere';
  if (!Array.isArray(items) || !finite(tolerance) || tolerance < 0 || !validContainer(container) ||
      !items.every((it) => validItem(it, onSphere))) {
    return { ok: false, worstOverlap: Infinity, worstEscape: Infinity, limit: null,
      problems: ['Layout, container, or tolerance contains invalid/nonfinite data'] };
  }
  const scale = items.length ? Math.min(...items.map((it) => it.shape.radius)) : 1;
  const limit = tolerance * scale;
  // Every piece on a sphere shares one shape, and so one angular size.
  const g = onSphere && items.length ? sphereGeometry(items[0].shape, container.R) : null;
  const overlap = (a, b) => (onSphere ? overlapPair(g, a, b)?.depth : testOverlap(a, b)?.overlap) ?? 0;

  let worstOverlap = 0;
  let overlapping = null;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const depth = overlap(items[i], items[j]);
      if (depth > worstOverlap) {
        worstOverlap = depth;
        overlapping = [i, j];
      }
    }
  }
  // A sphere's surface is closed, so nothing can escape it.
  let worstEscape = 0;
  let escapee = null;
  if (!onSphere) {
    for (let i = 0; i < items.length; i++) {
      const ex = containmentExcess(items[i], container);
      if (ex > worstEscape) {
        worstEscape = ex;
        escapee = i;
      }
    }
  }
  const problems = [];
  if (worstOverlap > limit) {
    problems.push(`items ${overlapping[0]} and ${overlapping[1]} overlap by ${worstOverlap.toExponential(2)}`);
  }
  if (worstEscape > limit) {
    problems.push(`item ${escapee} pokes ${worstEscape.toExponential(2)} outside the container`);
  }
  return { ok: problems.length === 0, worstOverlap, worstEscape, limit, problems };
}
