// The scene's shapes as the trace shader has them, and finding what a ray
// hits: balls, plates, teapots through their bounding volume hierarchy, and
// diamonds by their facets.

export const geometry = /* wgsl */ `
const EPSILON = 1e-3;


// Shapes
const SPHERE = 0;

const PLATE = 1;

const TEAPOT = 2;

const DIAMOND = 3;


/** Packed by packObjects in shapes.js */
struct Shape {
  centerRadius: vec4f,
  normalShape: vec4f,
  uHalf: vec4f,
  vHalf: vec4f,
  colorMaterial: vec4f,
  surface: vec4f, // gloss (glass: index of refraction), roughness, oneSided, sky
}


@group(0) @binding(1) var<storage, read> objects: array<Shape>;

/**
 * The sky's color by direction, for sky domes (skyTable in sky.js), then the
 * teapot (packTeapot in teapot.js), at params.teapotNodes, then the
 * diamond's facets (packDiamond in diamond.js), at params.diamondPlanes. (A buffer of its
 * own would pass WebGPU's default limit of 8 per shader.)
 */
@group(0) @binding(6) var<storage, read> tables: array<vec4f>;



/** Distance to the hit found by the last call to intersect */
var<private> hitDist: f32;

/**
 * Where the last call to intersect hit, if it was a teapot: which triangle,
 * and how far toward its second and third corners. For a diamond, which
 * facet.
 */
var<private> hitTriangle: u32;

var<private> hitBary: vec2f;


/**
 * Where a ray enters node of the teapot's hierarchy, or 1e30 if it misses it
 * or only gets there after tMax. o is the ray's start and inv 1 / its
 * direction, in the teapot's space.
 */
fn boxEntry(o: vec3f, inv: vec3f, node: u32, tMax: f32) -> f32 {
  let t0 = (tables[params.teapotNodes + 2u * node].xyz - o) * inv;
  let t1 = (tables[params.teapotNodes + 2u * node + 1u].xyz - o) * inv;
  let near = min(t0, t1);
  let far = max(t0, t1);
  let enter = max(max(near.x, near.y), max(near.z, 0.));
  let leave = min(min(far.x, far.y), min(far.z, tMax));
  return select(1e30, enter, enter <= leave);
}


/**
 * Where a ray from o in unit direction d first hits teapot s, if that's
 * before tMax, setting hitTriangle and hitBary; otherwise tMax. It walks the
 * hierarchy of boxes (packTeapot in teapot.js), nearer box first, skipping
 * boxes the ray misses or only reaches past the closest hit so far, and
 * tests the triangles in the boxes it reaches (Möller-Trumbore).
 */
fn intersectTeapot(o: vec3f, d: vec3f, s: Shape, tMax: f32) -> f32 {
  let own = ownSpace(o, d, s);
  let lo = own[0];
  let ld = own[1];
  let inv = 1. / ld;
  var best = tMax;
  // Boxes still to visit. The hierarchy is 18 deep.
  var stack: array<u32, 24>;
  var top = 0u;
  var node = 0u;
  var entry = boxEntry(lo, inv, 0u, best);
  loop {
    if (entry < best) {
      let count = bitcast<u32>(tables[params.teapotNodes + 2u * node + 1u].w);
      let start = bitcast<u32>(tables[params.teapotNodes + 2u * node].w);
      if (count == 0u) {
        let a = boxEntry(lo, inv, start, best);
        let b = boxEntry(lo, inv, start + 1u, best);
        let aFirst = a <= b;
        let far = max(a, b);
        if (far < 1e30) {
          stack[top] = select(start, start + 1u, aFirst);
          top++;
        }
        node = select(start + 1u, start, aFirst);
        entry = min(a, b);
        continue;
      }
      for (var i = start; i < start + count; i++) {
        let k = params.teapotTriangles + 6u * i;
        let e1 = tables[k + 1u].xyz;
        let e2 = tables[k + 2u].xyz;
        let pv = cross(ld, e2);
        let f = 1. / dot(e1, pv);
        let tv = lo - tables[k].xyz;
        let u = dot(tv, pv) * f;
        let qv = cross(tv, e1);
        let v = dot(ld, qv) * f;
        let t = dot(e2, qv) * f;
        if (u >= 0. && v >= 0. && u + v <= 1. && t > EPSILON && t < best) {
          best = t;
          hitTriangle = i;
          hitBary = vec2f(u, v);
        }
      }
    }
    if (top == 0u) { break; }
    top--;
    node = stack[top];
    // Again, since a closer hit may have been found since
    entry = boxEntry(lo, inv, node, best);
  }
  return best;
}


/**
 * Teapot s's normal on triangle tri, at bary: smooth, as the curved patches
 * it was cut from, or the flat triangle's. Both point out of the teapot.
 */
fn teapotNormal(s: Shape, tri: u32, bary: vec2f, curved: bool) -> vec3f {
  let k = params.teapotTriangles + 6u * tri;
  var n = cross(tables[k + 1u].xyz, tables[k + 2u].xyz);
  if (curved) {
    n = tables[k + 3u].xyz * (1. - bary.x - bary.y) + tables[k + 4u].xyz * bary.x + tables[k + 5u].xyz * bary.y;
  }
  return normalize(s.uHalf.xyz * n.x + s.vHalf.xyz * n.y + s.normalShape.xyz * n.z);
}


/**
 * A teapot's or diamond's own space, where it fits in a unit ball: o's
 * position and d's direction there. The direction shrinks with it, so
 * distances along the ray are the same as outside.
 */
fn ownSpace(o: vec3f, d: vec3f, s: Shape) -> array<vec3f, 2> {
  let r = s.centerRadius.w;
  let x = s.uHalf.xyz;
  let y = s.vHalf.xyz;
  let z = s.normalShape.xyz;
  let rel = (o - s.centerRadius.xyz) / r;
  return array(vec3f(dot(rel, x), dot(rel, y), dot(rel, z)), vec3f(dot(d, x), dot(d, y), dot(d, z)) / r);
}


/** The diamond has a facet per plane, its normal in xyz and distance in w */
const DIAMOND_FACETS = 73u;

/**
 * Where a ray from o in unit direction d first hits diamond s, if that's
 * before tMax, setting hitTriangle to the facet; otherwise tMax. It's the
 * space inside every facet's plane, so the ray is inside it from when it
 * has crossed into the last of them until it crosses out of the first.
 * From inside, it's where the ray leaves.
 */
fn intersectDiamond(o: vec3f, d: vec3f, s: Shape, tMax: f32) -> f32 {
  let own = ownSpace(o, d, s);
  var enter = 0.;
  var leave = 1e30;
  var enterFacet = 0u;
  var leaveFacet = 0u;
  for (var i = 0u; i < DIAMOND_FACETS; i++) {
    let plane = tables[params.diamondPlanes + i];
    let facing = dot(plane.xyz, own[1]);
    let t = (plane.w - dot(plane.xyz, own[0])) / facing;
    if (facing < 0.) {
      if (t > enter) { enter = t; enterFacet = i; }
    } else if (facing > 0.) {
      if (t < leave) { leave = t; leaveFacet = i; }
    } else if (dot(plane.xyz, own[0]) > plane.w) {
      return tMax;
    }
  }
  if (enter >= leave) { return tMax; }
  var t = enter;
  hitTriangle = enterFacet;
  if (enter <= EPSILON) {
    t = leave;
    hitTriangle = leaveFacet;
  }
  return select(tMax, t, t > EPSILON && t < tMax);
}


/** Diamond s's facet's normal, pointing out */
fn diamondNormal(s: Shape, facet: u32) -> vec3f {
  let n = tables[params.diamondPlanes + facet].xyz;
  return normalize(s.uHalf.xyz * n.x + s.vHalf.xyz * n.y + s.normalShape.xyz * n.z);
}


/** Index of the closest object hit by a ray, or -1. Sets hitDist. */
fn intersect(o: vec3f, d: vec3f) -> i32 {
  var hit = -1;
  hitDist = 1e30;
  for (var i = 0u; i < params.objectCount; i++) {
    let s = objects[i];
    let p = s.centerRadius.xyz - o;
    var t: f32;
    if (i32(s.normalShape.w) == SPHERE) {
      let r = s.centerRadius.w;
      let b = dot(p, d);
      var det = b * b - dot(p, p) + r * r;
      if (det < 0.) { continue; }
      det = sqrt(det);
      t = b - det;
      if (t <= EPSILON) { t = b + det; }
    } else {
      // Where the ray crosses the plate's plane, if that's within the plate
      let n = s.normalShape.xyz;
      let facing = dot(d, n);
      if (facing == 0. || (s.surface.z > 0. && facing > 0.)) { continue; }
      t = dot(p, n) / facing;
      let h = d * t - p;
      if (
        abs(dot(h, s.uHalf.xyz)) > s.uHalf.w ||
        abs(dot(h, s.vHalf.xyz)) > s.vHalf.w
      ) { continue; }
    }
    if (t > EPSILON && t < hitDist) {
      hitDist = t;
      hit = i32(i);
    }
  }
  // Teapots and diamonds, in a loop of their own: a third kind of shape in
  // the loop above made every scene 8% slower, teapots or not.
  for (var i = params.objectCount; i < params.objectCount + params.boundedCount; i++) {
    let s = objects[i];
    // Each fits in its ball, so only rays that hit that, before anything
    // closer, look further
    let p = s.centerRadius.xyz - o;
    let r = s.centerRadius.w;
    let b = dot(p, d);
    let det = b * b - dot(p, p) + r * r;
    if (det < 0. || b + sqrt(det) <= EPSILON || b - sqrt(det) >= hitDist) { continue; }
    var t: f32;
    if (i32(s.normalShape.w) == DIAMOND) {
      t = intersectDiamond(o, d, s, hitDist);
    } else {
      t = intersectTeapot(o, d, s, hitDist);
    }
    if (t < hitDist) {
      hitDist = t;
      hit = i32(i);
    }
  }
  return hit;
}


/** A unit vector perpendicular to the unit vector w */
fn perpendicular(w: vec3f) -> vec3f {
  return normalize(select(vec3f(0., -w.z, w.y), vec3f(w.z, 0., -w.x), abs(w.x) > 0.1));
}


/** The unit vector at angle acos(cosA) from the unit axis w, rotated phi around it. */
fn directionAround(w: vec3f, cosA: f32, phi: f32) -> vec3f {
  // u and v are perpendicular to w and each other
  let u = perpendicular(w);
  let v = cross(w, u);
  let sinA = sqrt(max(0., 1. - cosA * cosA));
  return (u * cos(phi) + v * sin(phi)) * sinA + w * cosA;
}


fn isPlate(s: u32) -> bool {
  return i32(objects[s].normalShape.w) == PLATE;
}
`;
