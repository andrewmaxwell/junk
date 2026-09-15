// Packing on the surface of a sphere.
//
// The container is the sphere's *surface*, normalised to unit area like every
// flat container, so a sphere built at `scale` has surface area exactly
// scale*scale and radius scale/(2*sqrt(pi)). `scale`, the area lower bound and
// the efficiency metric therefore keep the meaning they carry everywhere else,
// and a sphere result is directly comparable with a disc result.
//
// Items are spherical shapes of fixed area -- a cap for the circle, a regular
// spherical polygon otherwise. Shrinking the sphere does not move them: a
// position is a unit vector, independent of the radius. It makes each piece
// subtend more of the surface, and that is what creates the overlaps the repair
// loop then has to resolve. There is no boundary: the surface is closed, so a
// piece can never escape and containment excess is identically zero.
//
// Depths are reported as arc length, so they are in the same units as the
// planar solver's linear overlaps and share its tolerance.
//
// ORIENTATION. An item is { x,y,z, tx,ty,tz, shape }: a unit position and a
// unit tangent saying which way the piece faces. Every motion here is a
// rotation of the sphere, and each one is applied to the tangent as well as to
// the position, so the facing is *parallel-transported* rather than recomputed
// from a global convention. That matters: transport on a sphere is
// path-dependent, and no continuous tangent frame exists on the whole sphere
// anyway, so any recomputed convention would make pieces snap to new
// orientations as they crossed its seam.

const TWO_PI = Math.PI * 2;

// Radius of a sphere whose surface area is 1.
export const SPHERE_R0 = 1 / (2 * Math.sqrt(Math.PI));

const clampCos = (v) => (v > 1 ? 1 : v < -1 ? -1 : v);

export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  v.x /= len;
  v.y /= len;
  v.z /= len;
  return v;
}

// Some direction perpendicular to `u`, chosen from the axis `u` leans on least.
// Only ever used to seed a frame or to break a tie, never to recover an
// existing orientation -- see the note on transport above.
function anyPerpendicular(u) {
  const ax = Math.abs(u.x);
  const ay = Math.abs(u.y);
  const az = Math.abs(u.z);
  const ex = ax <= ay && ax <= az ? 1 : 0;
  const ey = ex === 0 && ay <= az ? 1 : 0;
  const ez = ex === 0 && ey === 0 ? 1 : 0;
  const d = u.x * ex + u.y * ey + u.z * ez;
  return normalize({ x: ex - u.x * d, y: ey - u.y * d, z: ez - u.z * d });
}

// Rodrigues rotation of `v` about unit axis `k`, in place.
function rotateVec(v, k, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = dot(k, v);
  const cx = k.y * v.z - k.z * v.y;
  const cy = k.z * v.x - k.x * v.z;
  const cz = k.x * v.y - k.y * v.x;
  v.x = v.x * c + cx * s + k.x * kv * (1 - c);
  v.y = v.y * c + cy * s + k.y * kv * (1 - c);
  v.z = v.z * c + cz * s + k.z * kv * (1 - c);
  return v;
}

// Move an item by a rotation of the sphere: position and facing together.
function rotateItem(item, axis, angle) {
  rotateVec(item, axis, angle);
  const t = { x: item.tx, y: item.ty, z: item.tz };
  rotateVec(t, axis, angle);
  item.tx = t.x;
  item.ty = t.y;
  item.tz = t.z;
}

// Slide an item `arc` along the surface in unit tangent direction `dir`.
// Rotating about u x dir by phi moves u towards dir, and an angle phi covers
// arc length phi*R.
function slideItem(item, dir, arc, R) {
  const axis = cross(item, dir);
  if (Math.hypot(axis.x, axis.y, axis.z) < 1e-12) return;
  rotateItem(item, normalize(axis), arc / R);
}

// Turn an item in place. The position is the axis, so only the facing moves.
function spinItem(item, angle) {
  const t = { x: item.tx, y: item.ty, z: item.tz };
  rotateVec(t, item, angle);
  item.tx = t.x;
  item.ty = t.y;
  item.tz = t.z;
}

// Float error accumulates over thousands of rotations; this costs nothing and
// keeps the frame a frame.
function reorthonormalize(item) {
  normalize(item);
  const d = item.tx * item.x + item.ty * item.y + item.tz * item.z;
  const t = normalize({ x: item.tx - item.x * d, y: item.ty - item.y * d, z: item.tz - item.z * d });
  item.tx = t.x;
  item.ty = t.y;
  item.tz = t.z;
}

// --- shape sizing -----------------------------------------------------------

// Solid angle of a regular spherical polygon of angular circumradius `rho`:
// `sides` identical isosceles triangles meeting at the centre, summed by
// spherical excess. Monotonic in rho, which is what lets the inverse be found
// by bisection.
function polygonSolidAngle(sides, rho) {
  const gamma = TWO_PI / sides;
  const cosRho = Math.cos(rho);
  const sinRho = Math.sin(rho);
  const cosSide = cosRho * cosRho + sinRho * sinRho * Math.cos(gamma);
  const sinSide = Math.sqrt(Math.max(0, 1 - cosSide * cosSide));
  if (sinSide < 1e-12 || sinRho < 1e-12) return 0;
  const beta = Math.acos(clampCos((cosRho * (1 - cosSide)) / (sinRho * sinSide)));
  return sides * (gamma + 2 * beta - Math.PI);
}

// Angular radius of a cap of area `area` on a sphere of radius R. A cap's solid
// angle is 2*pi*(1 - cos theta).
function capAngleFor(area, R) {
  return Math.acos(clampCos(1 - area / (R * R) / TWO_PI));
}

// Angular circumradius of one item on a sphere of radius R.
//
// A polygon is capped just short of a quarter turn. Past that it would no
// longer fit inside a hemisphere, and the separating-plane argument the overlap
// test rests on would quietly stop holding. A piece that big means the probe is
// hopeless anyway, and clamping lets it fail through the ordinary route --
// everything overlapping -- rather than by returning nonsense.
const MAX_POLYGON_RHO = Math.PI / 2 - 1e-6;

export function shapeAngle(shape, R) {
  if (shape.type === 'circle') return capAngleFor(shape.area, R);
  const target = shape.area / (R * R);
  if (target >= polygonSolidAngle(shape.sides, MAX_POLYGON_RHO)) return MAX_POLYGON_RHO;
  let lo = 0;
  let hi = MAX_POLYGON_RHO;
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (polygonSolidAngle(shape.sides, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Everything an overlap query needs, computed once per sweep rather than per
// pair: the pieces all share one shape, so they all share one angular size.
export function sphereGeometry(shape, R) {
  const angle = shapeAngle(shape, R);
  return {
    shape,
    R,
    angle,
    isCircle: shape.type === 'circle',
    // Two pieces cannot touch if their centres are further apart than two
    // circumradii, since each is contained in the cap of that radius. Comparing
    // dot products rather than angles keeps it to one comparison, and cosine is
    // decreasing so the inequality flips. Required for correctness, not just
    // speed -- see `overlapPair`.
    cosReach: Math.cos(Math.min(Math.PI, 2 * angle)),
  };
}

// `count` unit vectors evenly spaced on the circle at angular radius `angle`
// around an item, starting from its facing and wound counter-clockwise.
function ringAround(item, angle, count) {
  const t = { x: item.tx, y: item.ty, z: item.tz };
  const s = cross(item, t);
  const c = Math.cos(angle);
  const r = Math.sin(angle);
  const out = [];
  for (let k = 0; k < count; k++) {
    const a = (k * TWO_PI) / count;
    const ca = Math.cos(a) * r;
    const sa = Math.sin(a) * r;
    out.push({
      x: item.x * c + t.x * ca + s.x * sa,
      y: item.y * c + t.y * ca + s.y * sa,
      z: item.z * c + t.z * ca + s.z * sa,
    });
  }
  return out;
}

// Vertices of one spherical polygon, as unit vectors, wound so that the
// item's own centre lies on the positive side of every edge plane.
const polygonVerts = (item, g) => ringAround(item, g.angle, g.shape.sides);

// --- overlap ----------------------------------------------------------------

// Two convex spherical polygons are cones from the centre of the sphere, and
// two convex cones are disjoint exactly when some plane through the centre
// separates them -- a plane that can always be taken to carry a face of one of
// them. So a separating-axis test is exact here, and it is shorter than the
// planar one: a half-space through the origin has no interval to compare, only
// a sign. `dot(v, n)` against a unit edge-plane normal is the sine of the
// angular distance from that great circle, so it doubles as the depth.
function satPolygons(va, vb) {
  let best = null;
  // `sign` orients the result so that b always moves along +n and a along -n,
  // matching the planar solver's convention.
  const scan = (verts, other, sign) => {
    // Every edge is its own candidate. The planar solver skips half the edges
    // of an even-sided polygon because opposite edges there are parallel and
    // their normals antiparallel -- but on a sphere opposite edges lie on great
    // circles, and two great circles always intersect, so their plane normals
    // are genuinely different. Reusing that shortcut here silently discards
    // real separating planes.
    for (let i = 0; i < verts.length; i++) {
      const n = cross(verts[i], verts[(i + 1) % verts.length]);
      const len = Math.hypot(n.x, n.y, n.z);
      if (len < 1e-12) continue;
      n.x /= len;
      n.y /= len;
      n.z /= len;
      let deepest = null;
      let depth = -Infinity;
      for (const v of other) {
        const d = dot(v, n);
        if (d > depth) {
          depth = d;
          deepest = v;
        }
      }
      if (depth <= 0) return false; // a separating plane: done, they are apart
      if (!best || depth < best.depth) {
        best = { depth, n: { x: n.x * sign, y: n.y * sign, z: n.z * sign }, p: deepest };
      }
    }
    return true;
  };
  if (!scan(va, vb, -1)) return null;
  if (!scan(vb, va, 1)) return null;
  return best;
}

// Overlap of one pair, as {depth (arc length), n (unit, a moves -n / b moves
// +n), p (unit contact point)}, or null when they are apart.
export function overlapPair(g, a, b) {
  if (g.isCircle) {
    const sep = Math.acos(clampCos(dot(a, b)));
    const gap = 2 * g.angle - sep;
    if (gap <= 0) return null;
    let n = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    if (Math.hypot(n.x, n.y, n.z) < 1e-9) n = anyPerpendicular(a);
    else normalize(n);
    let p = { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
    if (Math.hypot(p.x, p.y, p.z) < 1e-9) p = { x: a.x, y: a.y, z: a.z };
    else normalize(p);
    return { depth: gap * g.R, n, p };
  }
  // This reject is load-bearing, and must stay ahead of the scan below.
  //
  // Face-normal SAT is complete for convex *polygons*, but these are convex
  // cones in three dimensions, where a full test also needs an axis per pair of
  // edges. Dropping those is safe only because the configurations that need
  // them are all near-antipodal -- and a piece spans less than a quarter turn,
  // so anything near-antipodal is already well beyond two circumradii and has
  // been rejected here. Measured over ~2M close pairs the scan below then
  // agrees exactly with ground truth, in both directions; measured over pairs
  // this test rejects, the scan alone gets 0.35% of them wrong.
  //
  // It is also, incidentally, most of the speed: in any sparse arrangement
  // nearly every pair is nowhere near touching.
  if (dot(a, b) < g.cosReach) return null;
  const hit = satPolygons(polygonVerts(a, g), polygonVerts(b, g));
  if (!hit) return null;
  return { depth: Math.asin(clampCos(hit.depth)) * g.R, n: hit.n, p: hit.p };
}

// --- contact resolution -----------------------------------------------------

// The planar mass/inertia split applies unchanged in the tangent plane at a
// body's own centre, so that is where it is done: project the contact normal
// and the lever arm into that plane, run the same formula, then apply the
// resulting slide and spin as rotations of the sphere.
//
// `invInertia` is the flat second moment of the shape, not the spherical one.
// They agree in the limit of small pieces and drift apart as a piece grows
// relative to the sphere, so this is an approximation -- an approximation in
// how fast a contact is corrected, though, not in whether one is detected.
function contactTerms(item, res, R, useInertia) {
  const nd = dot(item, res.n);
  const nt = { x: res.n.x - item.x * nd, y: res.n.y - item.y * nd, z: res.n.z - item.z * nd };
  if (Math.hypot(nt.x, nt.y, nt.z) < 1e-12) return null;
  normalize(nt);

  const pd = clampCos(dot(item, res.p));
  const rd = { x: res.p.x - item.x * pd, y: res.p.y - item.y * pd, z: res.p.z - item.z * pd };
  const rlen = Math.hypot(rd.x, rd.y, rd.z);
  // Scalar r x n in the tangent plane is the triple product with the centre.
  const c = rlen < 1e-12 ? 0 : Math.acos(pd) * R * dot(cross(normalize(rd), nt), item);

  const inertia = useInertia ? item.shape.invInertia : 0;
  return { nt, c, inertia, k: item.shape.invMass + c * c * inertia };
}

const clampMag = (v, limit) => (v > limit ? limit : v < -limit ? -limit : v);

function resolveSphereContact(a, b, res, R, bias, maxAngular) {
  // Circles carry no orientation, so they never take a spin correction.
  const useInertia = maxAngular > 0 && Boolean(a.shape.verts);
  const ta = contactTerms(a, res, R, useInertia);
  const tb = contactTerms(b, res, R, useInertia);
  if (!ta || !tb || ta.k + tb.k <= 0) return;

  const lambda = (res.depth * bias) / (ta.k + tb.k);
  slideItem(a, ta.nt, -lambda * a.shape.invMass, R);
  slideItem(b, tb.nt, lambda * b.shape.invMass, R);
  if (useInertia) {
    spinItem(a, -clampMag(ta.c * lambda * ta.inertia, maxAngular));
    spinItem(b, clampMag(tb.c * lambda * tb.inertia, maxAngular));
  }
}

// --- the solver's entry points ---------------------------------------------

// Contact relaxation on the surface: the same Gauss-Seidel sweep as the planar
// solver, with great-circle motion in place of straight-line motion and no wall
// pass at all. Returns the deepest violation this sweep had to correct, so an
// easy probe can stop after a pass or two.
export function relaxOnSphere(items, R, { relaxIterations, correctionBias, limit, maxAngular = 0 }) {
  if (!items.length) return 0;
  const g = sphereGeometry(items[0].shape, R);
  let worst = 0;
  for (let pass = 0; pass < relaxIterations; pass++) {
    worst = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const res = overlapPair(g, items[i], items[j]);
        if (!res) continue;
        if (res.depth > worst) worst = res.depth;
        resolveSphereContact(items[i], items[j], res, R, correctionBias, maxAngular);
      }
    }
    for (const item of items) reorthonormalize(item);
    if (worst < limit) break;
  }
  return worst;
}

// Both violation measures in one sweep, matching the planar solver's contract:
// `total` is the continuous energy, `worst` the per-pair feasibility gate.
export function measureOnSphere(items, R) {
  if (!items.length) return { total: 0, worst: 0 };
  const g = sphereGeometry(items[0].shape, R);
  let total = 0;
  let worst = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const res = overlapPair(g, items[i], items[j]);
      if (!res) continue;
      total += res.depth;
      if (res.depth > worst) worst = res.depth;
    }
  }
  return { total, worst };
}

export function settledOnSphere(items, item, R, tol) {
  const g = sphereGeometry(item.shape, R);
  for (const other of items) {
    if (other === item) continue;
    const res = overlapPair(g, item, other);
    if (res && res.depth > tol) return false;
  }
  return true;
}

// --- seeding ----------------------------------------------------------------

const seed = (x, y, z, shape, facing) => {
  const item = { x, y, z, tx: 0, ty: 0, tz: 0, shape };
  const t = facing ?? anyPerpendicular(item);
  item.tx = t.x;
  item.ty = t.y;
  item.tz = t.z;
  return item;
};

// The nearest thing a sphere has to the planar solver's aligned lattice: an
// even, low-discrepancy spiral that good sphere packings often resemble, and
// which no random start reaches by luck.
export function fibonacciSphere(count, shape) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const items = [];
  for (let i = 0; i < count; i++) {
    // Offset by a half step so the first and last points are not stacked on
    // the poles, which would start two pieces exactly coincident.
    const z = count === 1 ? 0 : 1 - (2 * i + 1) / count;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = i * golden;
    items.push(seed(Math.cos(phi) * r, Math.sin(phi) * r, z, shape));
  }
  return items;
}

// Uniform on the sphere: sampling z flat and the azimuth flat is exactly area
// measure, so no region is favoured the way naive angle sampling favours poles.
// Facings are random too, since an aligned scatter is not a scatter.
export function scatterSphere(count, shape, rand) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const z = 2 * rand() - 1;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = TWO_PI * rand();
    const item = seed(Math.cos(phi) * r, Math.sin(phi) * r, z, shape);
    spinItem(item, TWO_PI * rand());
    items.push(item);
  }
  return items;
}

// --- perturbation -----------------------------------------------------------

// The sphere's equivalent of the planar group translate-and-turn, and likewise
// the move that actually turns one arrangement into a differently-shaped one
// rather than jiggling the one already there. Both halves are rotations of the
// sphere, so every facing rides along without extra bookkeeping.
export function hopOnSphere(items, rand, heat, R, moveScales) {
  const g = sphereGeometry(items[0].shape, R);
  const anchor = items[Math.floor(rand() * items.length)];
  const count = 1 + Math.floor(rand() * Math.max(1, items.length * 0.35));
  // Nearest by dot product: on a sphere a larger dot *is* a smaller angle, so
  // no arccos is needed just to rank neighbours.
  const cluster = items
    .map((item, index) => ({ index, near: dot(item, anchor) }))
    .sort((a, b) => b.near - a.near)
    .slice(0, count);

  const amplitude = moveScales[Math.floor(rand() * moveScales.length)] * heat;
  const drift = normalize({ x: rand() - 0.5, y: rand() - 0.5, z: rand() - 0.5 });
  const driftAngle = (rand() - 0.5) * 2 * g.angle * amplitude;
  const turnAxis = { x: anchor.x, y: anchor.y, z: anchor.z };
  const turnAngle = (rand() - 0.5) * Math.PI * amplitude;
  for (const { index } of cluster) {
    rotateItem(items[index], drift, driftAngle);
    rotateItem(items[index], turnAxis, turnAngle);
    reorthonormalize(items[index]);
  }
}

// --- freedom ----------------------------------------------------------------

// Which pieces still have room to move? Same contract as the planar freedom
// test: displace by a fraction of the piece's own size in each of several
// directions, and turn it, and see whether any of that lands clear. There is no
// container to escape, so sliding and turning are the only things to probe.
export function looseOnSphere(items, R, play, tol) {
  if (!items.length) return [];
  const g = sphereGeometry(items[0].shape, R);
  const directions = 16;
  const step = play * g.angle * R;
  return items.map((item) => {
    const t = { x: item.tx, y: item.ty, z: item.tz };
    const s = cross(item, t);
    for (let k = 0; k < directions; k++) {
      const a = (k * TWO_PI) / directions;
      const dir = normalize({
        x: t.x * Math.cos(a) + s.x * Math.sin(a),
        y: t.y * Math.cos(a) + s.y * Math.sin(a),
        z: t.z * Math.cos(a) + s.z * Math.sin(a),
      });
      const probe = { ...item };
      slideItem(probe, dir, step, R);
      if (clearOnSphere(g, items, item, probe, tol)) return true;
    }
    // A piece can be caged against sliding and still be free to turn.
    if (g.isCircle) return false;
    for (const spin of [play, -play]) {
      const probe = { ...item };
      spinItem(probe, spin);
      if (clearOnSphere(g, items, item, probe, tol)) return true;
    }
    return false;
  });
}

function clearOnSphere(g, items, self, probe, tol) {
  for (const other of items) {
    if (other === self) continue;
    const res = overlapPair(g, probe, other);
    if (res && res.depth > tol) return false;
  }
  return true;
}

// --- rendering --------------------------------------------------------------

// Outline of one piece as unit vectors. A polygon's edges are great-circle
// arcs, which are not straight lines on a map, so they are subdivided.
export function itemOutline(item, g, segments) {
  if (g.isCircle) return ringAround(item, g.angle, segments);
  const out = [];
  const verts = polygonVerts(item, g);
  const per = Math.max(2, Math.round(segments / verts.length));
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const omega = Math.acos(clampCos(dot(a, b)));
    const sinOmega = Math.sin(omega);
    for (let k = 0; k < per; k++) {
      const f = k / per;
      if (sinOmega < 1e-9) {
        out.push({ x: a.x, y: a.y, z: a.z });
        continue;
      }
      // Slerp: the great-circle arc between consecutive vertices.
      const w0 = Math.sin((1 - f) * omega) / sinOmega;
      const w1 = Math.sin(f * omega) / sinOmega;
      out.push({ x: a.x * w0 + b.x * w1, y: a.y * w0 + b.y * w1, z: a.z * w0 + b.z * w1 });
    }
  }
  return out;
}
