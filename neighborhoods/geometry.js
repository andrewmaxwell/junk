// Geometry helpers and the spatial index used for neighborhood adjacency.

export function bboxOf(pts) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx,
    dy = ay - by;
  return dx * dx + dy * dy;
};

// Uniform grid of tagged points; reports all pairs of distinct tags within `dist`.
export class PointGrid {
  constructor(cell) {
    this.cell = cell;
    this.cells = new Map();
  }
  key(ix, iy) {
    return ix + ',' + iy;
  }
  add(x, y, tag) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let arr = this.cells.get(k);
    if (!arr) this.cells.set(k, (arr = []));
    arr.push([x, y, tag]);
  }
  eachNearPair(dist, cb) {
    const d2 = dist * dist;
    for (const [k, arr] of this.cells) {
      const [ix, iy] = k.split(',').map(Number);
      const others = [];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const a = this.cells.get(this.key(ix + dx, iy + dy));
          if (a) others.push(a);
        }
      for (const p of arr)
        for (const oa of others)
          for (const q of oa) {
            if (p[2] === q[2]) continue;
            if (dist2(p[0], p[1], q[0], q[1]) <= d2) cb(p[2], q[2]);
          }
    }
  }
}
