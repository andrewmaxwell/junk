// A round brilliant cut diamond: 57 facets and a faceted girdle, in
// Tolkowsky's ideal proportions. It's convex, so it's the space inside
// every facet's plane, and a ray hits it where it has crossed into all of
// them. The shader traces it as `intersectDiamond` in shaders/geometry.js.

import {cross, dot, normalize, sub} from './vec.js';

const TABLE = 0.56; // the table's width across its corners, of the girdle's
const CROWN_ANGLE = (34.5 * Math.PI) / 180;
const PAVILION_ANGLE = (40.75 * Math.PI) / 180;
const GIRDLE = 0.03; // the girdle's thickness, of its radius
const STAR = 0.5; // how far star facets reach from the table to the girdle
const LOWER_GIRDLE = 0.77; // how far lower girdle facets reach to the culet

// With the girdle's radius 1 and y up, the crown on top and the pavilion
// below. Main facets point toward the table's corners, at multiples of 45°.
const eighth = Math.PI / 4;
/** The point at radius r, height y, and angle a around the vertical */
const at = (r, y, a) => [r * Math.cos(a), y, r * Math.sin(a)];
const half = GIRDLE / 2;
const tableHeight = half + (1 - TABLE) * Math.tan(CROWN_ANGLE);
const culet = -half - Math.tan(PAVILION_ANGLE);
// Between two main facets, how far out a point on both is, and its height
const betweenR = (fraction) => fraction / Math.cos(eighth / 2);
const tableEdge = TABLE * Math.cos(eighth / 2);
const starR = betweenR(tableEdge + STAR * (1 - tableEdge));
const starY = half + (1 - starR * Math.cos(eighth / 2)) * Math.tan(CROWN_ANGLE);
const lowerR = betweenR(1 - LOWER_GIRDLE);
const lowerY =
  -half - (1 - lowerR * Math.cos(eighth / 2)) * Math.tan(PAVILION_ANGLE);

/** Each facet's corners, any three of which give its plane */
const facets = [
  [
    at(TABLE, tableHeight, 0),
    at(TABLE, tableHeight, eighth),
    [0, tableHeight, 0],
  ],
];
for (let k = 0; k < 8; k++) {
  const a = k * eighth;
  const mid = a + eighth / 2;
  const corner = at(TABLE, tableHeight, a);
  const nextCorner = at(TABLE, tableHeight, a + eighth);
  const star = at(starR, starY, mid);
  const top = at(1, half, a);
  const nextTop = at(1, half, a + eighth);
  const topMid = at(1, half, mid);
  const bottom = at(1, -half, a);
  const nextBottom = at(1, -half, a + eighth);
  const bottomMid = at(1, -half, mid);
  const lower = at(lowerR, lowerY, mid);
  facets.push(
    [corner, top, at(starR, starY, a - eighth / 2)], // bezel
    [corner, nextCorner, star], // star
    [star, top, topMid], // upper girdle
    [star, topMid, nextTop],
    [top, topMid, bottomMid], // girdle
    [topMid, nextTop, nextBottom],
    // Pavilion main: level along the girdle where it meets it
    [bottom, [0, culet, 0], sub(bottom, [Math.sin(a), 0, -Math.cos(a)])],
    [lower, bottomMid, bottom], // lower girdle
    [lower, nextBottom, bottomMid],
  );
}

// Fit it in a ball of radius 1, so a diamond's radius means what a ball's
// does: centered between the girdle's rim and the culet, which are the
// farthest points from the axis and the bottom (the rim's lower edge)
const middle = (culet ** 2 - 1 - half ** 2) / (2 * (culet + half));
const reach = Math.hypot(1, half + middle);

/** Each facet's plane, as its outward normal and distance from the middle */
const planes = facets.map(([a, b, c]) => {
  let n = normalize(cross(sub(b, a), sub(c, a)));
  const p = sub(a, [0, middle, 0]).map((x) => x / reach);
  if (dot(n, p) < 0) n = n.map((x) => -x);
  return [...n, dot(n, p)];
});

/** Where the culet is: it sits on the floor at center y - bottom × radius */
export const DIAMOND_BOTTOM = (culet - middle) / reach;

/** The planes as vec4s: normal in xyz, distance from the middle in w */
export const packDiamond = () => new Float32Array(planes.flat());

/**
 * Where a ray from o in direction d, in the diamond's own space (fit to a
 * unit ball), first hits it, as a multiple of d, or Infinity. Matches
 * `intersectDiamond` in shaders/geometry.js.
 * @type {(o: number[], d: number[]) => number}
 */
export const hitDiamond = (o, d) => {
  let enter = 0;
  let leave = Infinity;
  for (const [x, y, z, w] of planes) {
    const n = [x, y, z];
    const facing = dot(n, d);
    const t = (w - dot(n, o)) / facing;
    if (facing < 0) enter = Math.max(enter, t);
    else if (facing > 0) leave = Math.min(leave, t);
    else if (dot(n, o) > w) return Infinity;
  }
  return enter < leave ? enter || leave : Infinity;
};
