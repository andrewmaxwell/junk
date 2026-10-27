// Bounding volume hierarchies: boxes in boxes, so a ray only tests what's in
// the boxes it passes through. For the teapot's triangles (teapot.js) and
// the scene's balls and plates (packHierarchy in shapes.js).

import {sub} from './vec.js';

/**
 * @typedef {{min: number[], max: number[], centroid: number[]}} Item
 * Something to put in boxes: its bounding box, and its middle, which
 * decides which box it goes in
 */

/**
 * @typedef {{min: number[], max: number[], left: number, first: number, count: number}} Node
 * Leaves have items first to first + count; others have children left and
 * left + 1.
 */

/** Items' bounding box, or of their centroids */
const boxOf = (
  /** @type {Item[]} */ list,
  /** @type {(t: Item) => number[][]} */ points = (t) => [t.min, t.max],
) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const t of list) {
    for (const p of points(t)) {
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[a]);
        max[a] = Math.max(max[a], p[a]);
      }
    }
  }
  return {min, max};
};

/** Half a box's surface area: how likely a ray through its parent is to hit it */
const area = (/** @type {{min: number[], max: number[]}} */ {min, max}) => {
  const [x, y, z] = sub(max, min);
  return x * y + y * z + z * x;
};

/** Places tried along an axis when splitting a box */
const BINS = 12;

/**
 * Splits items into a hierarchy of boxes, each split where the surface area
 * heuristic expects rays to do the least work, among BINS places along the
 * longest axis, until leaves have leafSize or fewer. Leaves with more than
 * maxLeaf, which the heuristic wouldn't split, are split in half anyway.
 * Reorders items so each leaf's are together.
 * @type {<T extends Item>(items: T[], leafSize: number, maxLeaf?: number) => Node[]}
 */
export const buildHierarchy = (items, leafSize, maxLeaf = Infinity) => {
  /** @type {Node[]} */
  const nodes = [];
  /** @type {(index: number, first: number, count: number) => void} */
  const build = (index, first, count) => {
    const list = items.slice(first, first + count);
    const box = boxOf(list);
    nodes[index] = {...box, left: 0, first, count};
    if (count <= leafSize) return;
    let split = sahSplit(list, box, count);
    if (!split) {
      if (count <= maxLeaf) return;
      split = [list.slice(0, count >> 1), list.slice(count >> 1)];
    }
    const [below, above] = split;
    items.splice(first, count, ...below, ...above);
    const left = nodes.length;
    nodes[index].left = left;
    nodes[index].count = 0;
    nodes.push(nodes[index], nodes[index]);
    build(left, first, below.length);
    build(left + 1, first + below.length, above.length);
  };
  build(0, 0, items.length);
  return nodes;
};

/**
 * Where the surface area heuristic splits list (in box), as the items below
 * and above, or null if not splitting is cheaper
 * @type {<T extends Item>(list: T[], box: {min: number[], max: number[]}, count: number) => [T[], T[]] | null}
 */
const sahSplit = (list, box, count) => {
  const centers = boxOf(list, (t) => [t.centroid]);
  const extent = sub(centers.max, centers.min);
  const axis = [0, 1, 2].reduce((a, b) => (extent[b] > extent[a] ? b : a));
  if (!extent[axis]) return null;
  const binOf = (/** @type {Item} */ t) =>
    Math.min(
      BINS - 1,
      Math.floor(
        ((t.centroid[axis] - centers.min[axis]) / extent[axis]) * BINS,
      ),
    );
  const bins = Array.from(
    {length: BINS},
    () => /** @type {typeof list} */ ([]),
  );
  for (const t of list) bins[binOf(t)].push(t);
  let best = {cost: area(box) * count, bin: 0};
  for (let k = 1; k < BINS; k++) {
    const below = bins.slice(0, k).flat();
    const above = bins.slice(k).flat();
    if (!below.length || !above.length) continue;
    const cost =
      area(boxOf(below)) * below.length + area(boxOf(above)) * above.length;
    if (cost < best.cost) best = {cost, bin: k};
  }
  // Not worth splitting
  if (!best.bin) return null;
  return [bins.slice(0, best.bin).flat(), bins.slice(best.bin).flat()];
};
