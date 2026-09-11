// Which pieces are still loose?
//
// A packing usually contains a few "rattlers": pieces with room to move even
// though the layout as a whole cannot shrink any further. The eight-circles-in-
// a-circle packing is the classic example -- seven form a ring that is wedged
// solid, and the eighth sits in the middle with play all around it.
//
// A piece is reported loose here if displacing it by `play` (a fraction of its
// own radius) in some direction, or turning it by `play` radians, leaves it
// with no overlap and inside the container. That is a deliberately concrete
// test: it answers "does this piece have visible wiggle room", which is what a
// reader wants to see, rather than the stricter question of whether the packing
// is jammed in the rigidity-theory sense.
//
// Three things it does not detect, all of them by design:
//   - free play narrower than the direction sampling, such as a piece that can
//     only slide along one wall;
//   - motions that combine a turn with a slide;
//   - collective modes, where two pieces can only move together.
// Each of those would report as pinned. The test never reports a pinned piece
// as loose, so a highlighted piece really does have somewhere to go.

import { testOverlap } from './geometry.js';
import { containmentExcess } from './shapes.js';

const DIRECTIONS = 16;

// `play` is the free movement a piece must have to count as loose, as a
// fraction of its radius; `tolerance` matches the solver's feasibility limit so
// that pieces resting in contact are not read as overlapping.
export function findLoose(items, container, { play = 0.02, tolerance = 1e-4 } = {}) {
  if (!Array.isArray(items) || !container) return [];
  return items.map((_, i) => isLoose(items, i, container, play, tolerance));
}

function isLoose(items, i, container, play, tolerance) {
  const item = items[i];
  const radius = item.shape.radius;
  if (!Number.isFinite(radius) || radius <= 0) return false;
  const limit = tolerance * radius;
  const step = play * radius;
  const probe = { x: item.x, y: item.y, theta: item.theta, shape: item.shape };

  for (let k = 0; k < DIRECTIONS; k++) {
    const angle = (k * 2 * Math.PI) / DIRECTIONS;
    probe.x = item.x + Math.cos(angle) * step;
    probe.y = item.y + Math.sin(angle) * step;
    if (clear(probe, items, i, container, limit)) return true;
  }

  // A piece can be caged against sliding and still be free to turn. Turning by
  // `play` radians sweeps a corner about as far as a `play` displacement moves
  // the centre, so the two tests are of comparable strictness.
  if (item.shape.type === 'circle') return false;
  probe.x = item.x;
  probe.y = item.y;
  for (const spin of [play, -play]) {
    probe.theta = item.theta + spin;
    if (clear(probe, items, i, container, limit)) return true;
  }
  return false;
}

// Does `probe` sit inside the container without overlapping anything but the
// piece it stands in for?
function clear(probe, items, i, container, limit) {
  if (containmentExcess(probe, container) > limit) return false;
  for (let j = 0; j < items.length; j++) {
    if (j === i) continue;
    const res = testOverlap(probe, items[j]);
    if (res && res.overlap > limit) return false;
  }
  return true;
}
