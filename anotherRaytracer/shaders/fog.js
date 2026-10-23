// Fog, for the trace shader: how far light goes before scattering, which
// way it scatters, equiangular sampling of the glow around lights, and
// lasers' beams glowing in it.

export const fog = /* wgsl */ `
/** Fraction of light that fog scatters rather than absorbs */
const FOG_ALBEDO = 0.9;


/**
 * The fraction of light that the medium in glass object inside (or with -1,
 * the fog) scatters rather than absorbs: glass's haze absorbs none, since
 * its color does that
 */
fn mediumAlbedo(inside: i32) -> f32 {
  return select(FOG_ALBEDO, 1., inside >= 0);
}

/**
 * Fog's phase function: the share of light, traveling in direction a, that
 * scatters into direction b, per steradian. Henyey-Greenstein, which leans
 * forward by params.fogForward; with 0 it's 1 / (the sphere's 4π) for all.
 */
fn phase(a: vec3f, b: vec3f) -> f32 {
  let g = params.fogForward;
  let denom = 1. + g * g - 2. * g * dot(a, b);
  return (1. - g * g) / (4. * PI * denom * sqrt(denom));
}


/**
 * Fog's density in each color channel: the chance per unit of distance that
 * light scatters off it. Rayleigh scattering goes as 1 / wavelength^4, for
 * wavelengths near the middle of each channel.
 */
fn fogDensities() -> vec3f {
  return params.fogDensity * pow(vec3f(550. / 610., 1., 550. / 465.), vec3f(4. * params.fogBlue));
}


/**
 * The density of what light is passing through, in each channel: the haze
 * in glass object inside, or with -1, the fog. Glass has no fog in it.
 */
fn mediumDensities(inside: i32) -> vec3f {
  if (inside >= 0) { return vec3f(objects[u32(inside)].surface.w); }
  return fogDensities();
}


/**
 * The probability density that a medium of these densities scatters a ray
 * at distance t, given the fraction of light that gets that far in each
 * channel: the distance is picked using one channel, at random (see
 * trace), so it's their average.
 */
fn fogScatterPdf(densities: vec3f, transmittance: vec3f) -> f32 {
  return dot(densities * transmittance, vec3f(1. / 3.));
}


/** A random direction for light traveling in direction d to scatter in fog, picked in proportion to phase */
fn samplePhase(d: vec3f) -> vec3f {
  let u = rand2();
  let g = params.fogForward;
  var cosA = 1. - 2. * u.x;
  if (abs(g) > 1e-3) {
    let k = (1. - g * g) / (1. - g + 2. * g * u.x);
    cosA = (1. + g * g - k * k) / (2. * g);
  }
  return directionAround(d, clamp(cosA, -1., 1.), 2. * PI * u.y);
}


/**
 * For equiangular sampling along a ray toward a light: the angles from the
 * light to the ray's start and end (measured from the closest point), the
 * distance to that closest point, and how close it is
 */
fn equiangularAngles(o: vec3f, d: vec3f, tMax: f32, light: u32) -> vec4f {
  let c = objects[light].centerRadius.xyz - o;
  // Distance along the ray to the point closest to the light, and how close
  let along = dot(c, d);
  let gap = max(length(c - d * along), 1e-3);
  return vec4f(atan2(-along, gap), atan2(tMax - along, gap), along, gap);
}


/**
 * Equiangular sampling, from "Importance Sampling Techniques for Path
 * Tracing in Participating Media" (Kulla & Fajardo). Fog lit by a small
 * light is far brighter close to it, falling off with distance squared, so
 * picking scatter points by distance traveled finds that glow only rarely.
 * This picks a distance t along the ray o + t d, up to tMax, evenly by the
 * angle it's seen at from the light, which crowds them near the light in
 * proportion to that falloff. Returns t, and in y its probability density.
 */
fn sampleEquiangular(o: vec3f, d: vec3f, tMax: f32, light: u32, u: f32) -> vec2f {
  let a = equiangularAngles(o, d, tMax, light);
  let t = clamp(a.z + a.w * tan(mix(a.x, a.y, u)), 0., tMax);
  return vec2f(t, equiangularPdf(o, d, tMax, light, t));
}


/**
 * The light that lasers' beams (see lasers.js) scatter toward the viewer
 * from fog along the ray o + t d, for t up to tMax. Each beam is a thin
 * cylinder of light, as bright per unit of area as its power over its
 * cross section, dimmed by fog along the way; fog in it scatters some of
 * that toward the viewer, by the phase function, all along the length of
 * the ray inside it. No randomness: a beam is found exactly, so it's as
 * smooth as the pixels allow.
 */
fn beamGlow(o: vec3f, d: vec3f, tMax: f32) -> vec3f {
  let densities = fogDensities();
  var glow = vec3f(0.);
  let first = params.objectCount + params.boundedCount;
  for (var k = first; k < first + params.beamCount; k++) {
    let beam = objects[k];
    let a = beam.centerRadius.xyz;
    let r = beam.centerRadius.w;
    let b = beam.normalShape.xyz;
    let w = o - a;
    // Where the ray is within r of the beam's line: the parts of w and d
    // across the beam, and a quadratic in t
    let wb = dot(w, b);
    let db = dot(d, b);
    let across = d - b * db;
    let wAcross = w - b * wb;
    let qa = dot(across, across);
    if (qa < 1e-8) { continue; }
    let qb = dot(across, wAcross);
    let det = qb * qb - qa * (dot(wAcross, wAcross) - r * r);
    if (det < 0.) { continue; }
    var t0 = (-qb - sqrt(det)) / qa;
    var t1 = (-qb + sqrt(det)) / qa;
    // And between the beam's ends
    if (abs(db) > 1e-6) {
      let s0 = -wb / db;
      let s1 = (beam.normalShape.w - wb) / db;
      t0 = max(t0, min(s0, s1));
      t1 = min(t1, max(s0, s1));
    } else if (wb < 0. || wb > beam.normalShape.w) {
      continue;
    }
    t0 = max(t0, 0.);
    t1 = min(t1, tMax);
    if (t1 <= t0) { continue; }
    let t = (t0 + t1) / 2.;
    let along = wb + t * db;
    let intensity = beam.colorMaterial.rgb / (PI * r * r) * exp(-densities * (along + t));
    glow += intensity * densities * FOG_ALBEDO * phase(b, -d) * (t1 - t0);
  }
  return glow;
}


/** The probability density that sampleEquiangular picks t */
fn equiangularPdf(o: vec3f, d: vec3f, tMax: f32, light: u32, t: f32) -> f32 {
  let a = equiangularAngles(o, d, tMax, light);
  let s = t - a.z;
  return a.w / ((a.y - a.x) * (a.w * a.w + s * s));
}
`;
