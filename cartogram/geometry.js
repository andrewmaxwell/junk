// Projects the geometries' arcs into a ~1000-unit-wide plane. Each vertex
// becomes one shared point, so neighbors share their border points and stay
// stitched together however the points move. Long edges are split so they
// can bend.
//
// Rings that cross the antimeridian (Chukotka, Fiji) have their western
// longitudes shifted by 360° so they stay in one piece; `projection` must
// accept longitudes past 180° for that to help.
export const buildMap = (topology, geometries, projection, nameOf) => {
  const {
    scale: [sx, sy],
    translate: [tx, ty],
  } = topology.transform;
  const decoded = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => [
      (x += dx),
      (y += dy),
      x * sx + tx,
      y * sy + ty,
    ]);
  });
  const polyArcsOf = (g) =>
    g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  const shifted = new Set();
  for (const g of geometries) {
    for (const ring of polyArcsOf(g).flat()) {
      const ids = ring.map((a) => (a < 0 ? ~a : a));
      if (
        ids.some((a) =>
          decoded[a].some(
            (v, i) => i && Math.abs(v[2] - decoded[a][i - 1][2]) > 180,
          ),
        )
      ) {
        for (const a of ids) shifted.add(a);
      }
    }
  }
  const points = [];
  const byKey = new Map();
  const arcs = new Map();
  const maxSeg = 2;
  const arcPoints = (a) => {
    if (arcs.has(a)) return arcs.get(a);
    const projected = decoded[a]
      .map(([x, y, lon, lat]) => [
        x,
        y,
        projection([shifted.has(a) && lon < 0 ? lon + 360 : lon, lat]),
      ])
      .filter(([, , p]) => p);
    // At least ~24 segments per arc, so a tiny island that grows a lot still
    // comes out round rather than as the few-sided polygon it started as.
    let length = 0;
    for (let i = 1; i < projected.length; i++) {
      length += Math.hypot(
        projected[i][2][0] - projected[i - 1][2][0],
        projected[i][2][1] - projected[i - 1][2][1],
      );
    }
    const seg = Math.min(maxSeg, length / 24);
    const out = [];
    let px;
    let py;
    for (const [x, y, p] of projected) {
      if (out.length) {
        const n = Math.ceil(Math.hypot(p[0] - px, p[1] - py) / seg);
        for (let k = 1; k < n; k++) {
          out.push(points.length / 2);
          points.push(px + ((p[0] - px) * k) / n, py + ((p[1] - py) * k) / n);
        }
      }
      const key = `${x},${y}`;
      if (!byKey.has(key)) {
        byKey.set(key, points.length / 2);
        points.push(p[0], p[1]);
      }
      out.push(byKey.get(key));
      [px, py] = p;
    }
    arcs.set(a, out);
    return out;
  };
  const ring = (ids) => {
    const r = [];
    for (const a of ids) {
      const pts = a < 0 ? [...arcPoints(~a)].reverse() : arcPoints(a);
      r.push(...(r.length ? pts.slice(1) : pts));
    }
    if (r.length > 1 && r[0] === r[r.length - 1]) r.pop();
    return r;
  };
  // Rings that simplification collapsed to a line (Falls Church, VA) have no
  // area to stretch, so they're dropped.
  const hasArea = (r) => {
    let a = 0;
    for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
      a +=
        points[r[j] * 2] * points[r[k] * 2 + 1] -
        points[r[k] * 2] * points[r[j] * 2 + 1];
    }
    return Math.abs(a) > 1e-9;
  };
  // Shapes sharing an ID (Australia and its Ashmore and Cartier Islands) are
  // one statistical region, so they become one feature, named for the
  // biggest piece.
  const byId = new Map();
  for (const g of geometries) {
    const polys = polyArcsOf(g)
      .map((rings) => rings.map(ring).filter((r) => r.length > 2 && hasArea(r)))
      .filter((p) => p.length);
    if (!polys.length) continue;
    const id = g.id ?? g.properties.name;
    const size = polys.flat(2).length;
    const f = byId.get(id);
    if (!f) byId.set(id, {id, name: nameOf(g), polys, size});
    else {
      f.polys.push(...polys);
      if (size > f.size) Object.assign(f, {name: nameOf(g), size});
    }
  }
  const features = [...byId.values()];

  // Greedy coloring so neighbors (features sharing a point) differ.
  const firstOwner = new Map();
  const neighbors = features.map(() => new Set());
  features.forEach((f, i) => {
    for (const r of f.polys.flat()) {
      for (const p of r) {
        const o = firstOwner.get(p);
        if (o === undefined) firstOwner.set(p, i);
        else if (o !== i) {
          neighbors[i].add(o);
          neighbors[o].add(i);
        }
      }
    }
  });
  const order = features
    .map((_, i) => i)
    .sort((a, b) => neighbors[b].size - neighbors[a].size);
  for (const i of order) {
    const used = new Set([...neighbors[i]].map((j) => features[j].hue));
    features[i].hue = [0, 1, 2, 3, 4, 5].find((h) => !used.has(h)) ?? i % 6;
  }
  return {points: Float64Array.from(points), features};
};
