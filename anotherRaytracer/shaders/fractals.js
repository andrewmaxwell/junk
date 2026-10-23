// Fractals, Menger sponges and Mandelbulbs, found by sphere tracing their
// distance estimates. fractal.js has the same, for picking.

export const fractals = /* wgsl */ `
const SPONGE = 4;

const MANDELBULB = 5;

/** Half a sponge's side, in its unit ball: its corners just inside */
const SPONGE_HALF = 0.57;

/** How far the Mandelbulb's own space reaches across its unit ball */
const BULB_REACH = 1.3;

const BULB_ITERATIONS = 8;

/**
 * A ray hits a fractal where it gets this close to it, in world units:
 * well inside the EPSILON the next ray starts off the surface
 */
const FRACTAL_HIT = 2.5e-4;

/**
 * Mandelbulbs are hit this close, as a fraction of their radius: their
 * distance estimate creeps up on the surface, so finer takes many more
 * steps. They're never glass, so rays don't need to start on the right side
 * of it, only leave it.
 */
const BULB_HIT = 1e-3;

/** Steps before a ray gives up: one that only grazes it */
const FRACTAL_STEPS = 300;


/**
 * Signed distance from p to a Menger sponge filling the cube from -1 to 1,
 * with this many levels of holes: negative inside. Exact outside, and
 * inside, never more than the distance to the surface and only 0 on it, so
 * rays can march through glass sponges too. Each level carves crosses of
 * square tunnels a third as wide through each of the cells the last one
 * left. (Inigo Quilez's, but measuring each level's distance to its own
 * tunnels' walls, not also to its cells' middles, which was the same
 * outside, but inside put walls where there were none.)
 */
fn spongeDistance(p: vec3f, levels: i32) -> f32 {
  let q = abs(p) - 1.;
  var d = min(max(q.x, max(q.y, q.z)), 0.) + length(max(q, vec3f(0.)));
  var scale = 1.;
  for (var i = 0; i < levels; i++) {
    let a = p * scale - 2. * floor(p * scale / 2.) - 1.;
    scale *= 3.;
    let r = 3. * abs(a) - 1.;
    let tunnels = min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x)));
    d = max(d, (tunnels - 1.) / scale);
  }
  return d;
}


/**
 * Distance from p to the Mandelbulb of this power, at most: the Mandelbrot
 * set's z -> z^2 + c in 3D, raising a point to a power by multiplying its
 * angles from the vertical and around it. Negative inside, though only
 * roughly, so Mandelbulbs can't be glass. y is up, its axis of symmetry.
 */
fn bulbDistance(p: vec3f, power: f32) -> f32 {
  var z = p;
  var dr = 1.;
  var r = length(z);
  for (var i = 0; i < BULB_ITERATIONS && r <= 2.; i++) {
    let theta = acos(clamp(z.y / r, -1., 1.)) * power;
    let phi = atan2(z.z, z.x) * power;
    dr = pow(r, power - 1.) * power * dr + 1.;
    z = pow(r, power) * vec3f(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)) + p;
    r = length(z);
  }
  return 0.5 * log(r) * r / dr;
}


/**
 * Fractal s's signed distance from p, in its own space. Its level is a
 * sponge's levels or a Mandelbulb's power.
 */
fn fractalDistance(p: vec3f, s: Shape) -> f32 {
  if (i32(s.normalShape.w) == MANDELBULB) {
    return bulbDistance(p * BULB_REACH, s.uHalf.w) / BULB_REACH;
  }
  return spongeDistance(p / SPONGE_HALF, i32(s.uHalf.w)) * SPONGE_HALF;
}


/**
 * Where a ray from o in unit direction d first hits fractal s, if that's
 * before tMax; otherwise tMax. It steps through its ball by the distance
 * to the surface, on whichever side the ray starts, so from inside glass
 * it finds where the ray leaves. A hit is where it gets close while
 * approaching, so a ray leaving the surface at a glancing angle doesn't
 * hit where it started.
 */
fn intersectFractal(o: vec3f, d: vec3f, s: Shape, tMax: f32) -> f32 {
  let r = s.centerRadius.w;
  let own = ownSpace(o, d, s);
  // In its own space, with a unit direction: own distances are r times
  // smaller than the world's
  let u = own[1] * r;
  let b = dot(own[0], u);
  let det = b * b - dot(own[0], own[0]) + 1.;
  if (det < 0.) { return tMax; }
  let enter = max(0., -b - sqrt(det));
  let leave = min(-b + sqrt(det), tMax / r);
  // Marching from where it enters the ball, not from o, which may be far
  // off, so 32-bit floats keep their precision near the surface
  let start = own[0] + u * enter;
  let side = select(1., -1., enter == 0. && fractalDistance(start, s) < 0.);
  let close = select(FRACTAL_HIT, BULB_HIT * r, i32(s.normalShape.w) == MANDELBULB);
  var t = 0.;
  var last = 1e30;
  for (var i = 0; i < FRACTAL_STEPS && enter + t < leave; i++) {
    let dist = side * fractalDistance(start + u * t, s) * r;
    if (dist < close && dist <= last && i > 0) { return (enter + t) * r; }
    last = dist;
    t += max(dist, close) / r;
  }
  return tMax;
}


/**
 * Fractal s's normal at p, pointing out: which way its distance grows,
 * from its distance at the corners of a tiny tetrahedron around p. In a
 * loop, so the distance's code is in the shader once, not four times,
 * which made every scene slower.
 */
fn fractalNormal(s: Shape, p: vec3f) -> vec3f {
  let q = ownSpace(p, vec3f(0.), s)[0];
  let h = select(0.5 * FRACTAL_HIT / s.centerRadius.w, 0.5 * BULB_HIT, i32(s.normalShape.w) == MANDELBULB);
  var corners = array(vec3f(1., -1., -1.), vec3f(-1., -1., 1.), vec3f(-1., 1., -1.), vec3f(1., 1., 1.));
  var n = vec3f(0.);
  for (var i = 0; i < 4; i++) {
    n += corners[i] * fractalDistance(q + corners[i] * h, s);
  }
  return normalize(s.uHalf.xyz * n.x + s.vHalf.xyz * n.y + s.normalShape.xyz * n.z);
}
`;
