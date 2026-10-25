// Lights, for the trace shader: what they give off, picking one to aim at,
// aiming within it, and weighing that against random bounces (multiple
// importance sampling).

import {SKY_HEIGHT, SKY_WIDTH} from '../sky.js';

export const lights = /* wgsl */ `
/** The sky's color in unit direction d, blending the table's nearest four */
fn skyColor(d: vec3f) -> vec3f {
  // Row r is at (r / (SKY_HEIGHT - 1))² of 90° up; below the horizon, the
  // horizon's color
  let up = sqrt(max(asin(clamp(d.y, -1., 1.)), 0.) / (PI / 2.)) * f32(${SKY_HEIGHT - 1});
  let around = (atan2(d.z, d.x) / (2. * PI) + 0.5) * f32(${SKY_WIDTH});
  let row = min(u32(up), ${SKY_HEIGHT - 2}u);
  let col = u32(around) % ${SKY_WIDTH}u;
  let nextCol = (col + 1u) % ${SKY_WIDTH}u;
  let f = vec2f(fract(around), up - f32(row));
  let below = mix(tables[row * ${SKY_WIDTH}u + col], tables[row * ${SKY_WIDTH}u + nextCol], f.x);
  let above = mix(tables[(row + 1u) * ${SKY_WIDTH}u + col], tables[(row + 1u) * ${SKY_WIDTH}u + nextCol], f.x);
  return mix(below, above, min(f.y, 1.)).rgb;
}


/** The light a light gives off toward a viewer looking in direction d */
fn emitted(light: u32, d: vec3f) -> vec3f {
  let color = objects[light].colorMaterial.rgb;
  // Plates shine from their front only, like a window or a lamp's panel
  if (isPlate(light)) { return select(vec3f(0.), color, dot(d, objects[light].normalShape.xyz) < 0.); }
  if (objects[light].surface.w == 0.) { return color; }
  return color * skyColor(d);
}


/**
 * 1 - cos of the half-angle of the cone of directions from p that hit the
 * light. Written this way because cos is nearly 1 for small lights, and 1 -
 * cos would lose most of its precision in 32-bit floats.
 */
fn lightConeOneMinusCos(p: vec3f, light: u32) -> f32 {
  let l = objects[light].centerRadius.xyz - p;
  let r = objects[light].centerRadius.w;
  // Inside it, like under a sky dome, it's in every direction: the cone is
  // the whole sphere, cos = -1
  if (dot(l, l) < r * r) { return 2.; }
  let sinMaxSq = min(1., r * r / dot(l, l));
  return sinMaxSq / (1. + sqrt(1. - sinMaxSq));
}


/**
 * A plate light as seen from p, which must be in front of it, in a frame
 * with x and y along its sides and z along its normal: its corners' x and y
 * from p, its depth z0 (negative), and the normals of the four planes
 * through p and each edge, for sampleRectangle
 */
struct RectView {
  x0: f32, x1: f32, y0: f32, y1: f32, z0: f32,
  n0: vec3f, n1: vec3f, n2: vec3f, n3: vec3f,
  /** The solid angle it covers */
  solidAngle: f32,
}


/** The angle between unit vectors, accurately even when they nearly line up */
fn angleBetween(a: vec3f, b: vec3f) -> f32 {
  if (dot(a, b) < 0.) { return PI - 2. * asin(min(length(a + b) / 2., 1.)); }
  return 2. * asin(min(length(b - a) / 2., 1.));
}


fn rectView(p: vec3f, light: u32) -> RectView {
  let o = objects[light];
  let u = o.uHalf.xyz;
  let v = o.vHalf.xyz;
  let corner = o.centerRadius.xyz - u * o.uHalf.w - v * o.vHalf.w - p;
  var r: RectView;
  r.x0 = dot(corner, u);
  r.y0 = dot(corner, v);
  r.z0 = dot(corner, o.normalShape.xyz);
  r.x1 = r.x0 + 2. * o.uHalf.w;
  r.y1 = r.y0 + 2. * o.vHalf.w;
  let v00 = vec3f(r.x0, r.y0, r.z0);
  let v01 = vec3f(r.x0, r.y1, r.z0);
  let v10 = vec3f(r.x1, r.y0, r.z0);
  let v11 = vec3f(r.x1, r.y1, r.z0);
  r.n0 = normalize(cross(v00, v10));
  r.n1 = normalize(cross(v10, v11));
  r.n2 = normalize(cross(v11, v01));
  r.n3 = normalize(cross(v01, v00));
  r.solidAngle = angleBetween(-r.n0, r.n1) + angleBetween(-r.n1, r.n2) +
    angleBetween(-r.n2, r.n3) + angleBetween(-r.n3, r.n0) - 2. * PI;
  return r;
}


/**
 * Below this solid angle, the sum of angles above loses too much precision
 * in 32-bit floats, and plate lights are sampled by area instead. They look
 * small then, so it makes little difference.
 */
const MIN_SOLID_ANGLE = 1e-3;


/** Whether p is in front of plate light, where it shines */
fn inFrontOf(p: vec3f, light: u32) -> bool {
  return dot(p - objects[light].centerRadius.xyz, objects[light].normalShape.xyz) > 0.;
}


/**
 * The probability density, per solid angle, that sampleLight picks the
 * direction l toward light from p, which hits it at distance dist
 */
fn lightPdf(p: vec3f, l: vec3f, dist: f32, light: u32) -> f32 {
  if (!isPlate(light)) { return 1. / (2. * PI * lightConeOneMinusCos(p, light)); }
  if (!inFrontOf(p, light)) { return 0.; }
  let solidAngle = rectView(p, light).solidAngle;
  if (solidAngle >= MIN_SOLID_ANGLE) { return 1. / solidAngle; }
  let o = objects[light];
  let area = 4. * o.uHalf.w * o.vHalf.w;
  return dist * dist / (area * max(abs(dot(l, o.normalShape.xyz)), 1e-6));
}


/** MIS weight for a strategy with density a, competing with density b. */
fn powerHeuristic(a: f32, b: f32) -> f32 {
  return a * a / (a * a + b * b);
}


/**
 * How much a light hit by a random bounce from p, in direction d, at
 * distance dist, should count
 */
fn bounceLightWeight(p: vec3f, d: vec3f, dist: f32, bouncePdf: f32, light: u32, total: f32) -> f32 {
  if (params.sampling == 2u) { return 1.; }
  if (params.sampling == 1u) { return 0.; } // light sampling already counted it
  let pdf = lightPickProb(p, vec3f(0.), false, light, total) * lightPdf(p, d, dist, light);
  return powerHeuristic(bouncePdf, pdf);
}


/**
 * A random point on plate light, seen from p in front of it, picked evenly
 * by the solid angle it covers rather than by its area, so a big light up
 * close, like a ceiling, isn't sampled mostly far off at grazing angles.
 * From "An Area-Preserving Parametrization for Spherical Rectangles" (Ureña,
 * Fajardo & King), as pbrt-v4 has it.
 */
fn sampleRectangle(p: vec3f, light: u32, r: RectView, u: vec2f) -> vec3f {
  let g0 = angleBetween(-r.n0, r.n1);
  let g1 = angleBetween(-r.n1, r.n2);
  let g2 = angleBetween(-r.n2, r.n3);
  let g3 = angleBetween(-r.n3, r.n0);
  // Pick x so each strip of the rectangle gets its share of the solid angle
  let au = u.x * (g0 + g1 - 2. * PI) + (u.x - 1.) * (g2 + g3);
  let fu = (cos(au) * r.n0.z - r.n2.z) / sin(au);
  let cu = clamp(sign(fu) / sqrt(fu * fu + r.n0.z * r.n0.z), -0.99999, 0.99999);
  let xu = clamp(-(cu * r.z0) / sqrt(1. - cu * cu), r.x0, r.x1);
  // Then y, evenly by solid angle along that strip
  let dd = sqrt(xu * xu + r.z0 * r.z0);
  let h0 = r.y0 / sqrt(dd * dd + r.y0 * r.y0);
  let h1 = r.y1 / sqrt(dd * dd + r.y1 * r.y1);
  let hv = h0 + u.y * (h1 - h0);
  let yv = select(r.y1, hv * dd / sqrt(1. - hv * hv), hv * hv < 0.99999);
  let o = objects[light];
  return p + o.uHalf.xyz * xu + o.vHalf.xyz * yv + o.normalShape.xyz * r.z0;
}


/**
 * Picks a random direction from p toward a light: uniformly within the cone
 * a ball covers, or the solid angle a plate covers. Returns the direction,
 * and in w 1 / its probability density, which is the solid angle if it's
 * even, or 0 for a plate facing away.
 */
fn sampleLight(p: vec3f, light: u32) -> vec4f {
  if (isPlate(light)) {
    if (!inFrontOf(p, light)) { return vec4f(0., 0., 1., 0.); }
    let u = rand2();
    let r = rectView(p, light);
    if (r.solidAngle >= MIN_SOLID_ANGLE) {
      return vec4f(normalize(sampleRectangle(p, light, r, u) - p), r.solidAngle);
    }
    // Small or far: evenly by area
    let o = objects[light];
    let q = o.centerRadius.xyz + o.uHalf.xyz * o.uHalf.w * (2. * u.x - 1.) +
      o.vHalf.xyz * o.vHalf.w * (2. * u.y - 1.);
    let l = normalize(q - p);
    return vec4f(l, 1. / lightPdf(p, l, length(q - p), light));
  }
  let w = normalize(objects[light].centerRadius.xyz - p);
  let oneMinusCos = lightConeOneMinusCos(p, light);
  let u = rand2();
  let l = directionAround(w, 1. - u.x * oneMinusCos, 2. * PI * u.y);
  return vec4f(l, 2. * PI * oneMinusCos);
}


// Rather than aiming a ray at every light from every bounce, each bounce
// aims at one, picked at random and favoring the ones that look brightest
// from there. One shadow ray instead of one per light.

/**
 * Roughly how much light a light gives the point p, ignoring what's in the
 * way: its brightness times how big it looks from p. Or with alongRay, how
 * much it gives the fog along the ray from p in direction d: its brightness
 * times its size, over its distance from the ray.
 */
fn lightGuess(p: vec3f, d: vec3f, alongRay: bool, light: u32) -> f32 {
  let b = brightness(objects[light].colorMaterial.rgb);
  let c = objects[light].centerRadius.xyz - p;
  // For plates, a ball of the same area; see packObjects in shapes.js. One
  // formula for both, since a branch here, run for every light several
  // times a bounce, slowed everything down by 12%.
  let r = objects[light].centerRadius.w;
  if (alongRay) { return b * r * r / max(length(c - d * dot(c, d)), r); }
  // Plates shine from the front only, and look smaller edge on. Balls have
  // no normal.
  let n = objects[light].normalShape.xyz;
  let facing = select(1., max(-dot(c, n), 0.) / length(c), dot(n, n) > 0.);
  return b * facing * lightConeOneMinusCos(p, light);
}


/**
 * lightGuess summed over every light, which pickLight and lightPickProb
 * divide by. Worked out once per point and passed to both: summing it in
 * each, and again when a bounce hit a light, took most of the time in
 * scenes with many lights.
 */
fn lightGuessTotal(p: vec3f, d: vec3f, alongRay: bool) -> f32 {
  var total = 0.;
  for (var i = 0u; i < params.lightCount; i++) { total += lightGuess(p, d, alongRay, i); }
  return total;
}


/**
 * The probability that pickLight picks this light. Half the time it picks
 * evenly, so a light that looks dim, or is bright but blocked, still gets
 * picked sometimes; the other half, in proportion to lightGuess. total is
 * lightGuessTotal for the same point.
 */
fn lightPickProb(p: vec3f, d: vec3f, alongRay: bool, light: u32, total: f32) -> f32 {
  return 0.5 / f32(params.lightCount) + 0.5 * lightGuess(p, d, alongRay, light) / total;
}


/** Picks one light as lightPickProb describes, given u uniform in [0, 1) */
fn pickLight(p: vec3f, d: vec3f, alongRay: bool, u: f32, total: f32) -> u32 {
  if (u < 0.5) { return min(u32(u * 2. * f32(params.lightCount)), params.lightCount - 1u); }
  var left = (u - 0.5) * 2. * total;
  for (var i = 0u; i < params.lightCount - 1u; i++) {
    left -= lightGuess(p, d, alongRay, i);
    if (left < 0.) { return i; }
  }
  return params.lightCount - 1u;
}


/**
 * Fraction of the light, per channel, that gets from p to the light along a
 * sampleLight sample: 0 if blocked or the light faces away, less in fog
 */
fn lightVisibility(p: vec3f, ls: vec4f, light: u32) -> vec3f {
  if (ls.w <= 0.) { return vec3f(0.); }
  if (params.paneCount == 0u) {
    if (intersect(p, ls.xyz) != i32(light)) { return vec3f(0.); }
    return exp(-fogDensities() * hitDist);
  }
  // Through any panes on the way, tinted by each, less what it reflects
  var o = p;
  var dist = 0.;
  var through = vec3f(1.);
  for (var i = 0; i < 8; i++) {
    let hit = intersect(o, ls.xyz);
    dist += hitDist;
    if (hit == i32(light)) { return through * exp(-fogDensities() * dist); }
    if (hit < 0 || !isPane(u32(hit))) { break; }
    through *= (1. - paneReflectance(u32(hit), ls.xyz)) * objects[u32(hit)].colorMaterial.rgb;
    o += ls.xyz * hitDist;
  }
  return vec3f(0.);
}
`;
