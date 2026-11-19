// Fog, for the trace shader: how far light goes before scattering, which
// way it scatters, and equiangular sampling of the glow around lights.

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


/**
 * Uneven fog: its density at p, as a multiple of fogDensities(). Noise over a
 * few sizes makes wisps where it's thicker and gaps where it's nearly clear,
 * averaging about 1, so the fog is about as bright overall as even fog.
 */
const WISP_OCTAVES = 3;
/** How far the noise moves the density, at params.fogWisps 1 */
const WISP_CONTRAST = 3.;
fn fogWisp(p: vec3f) -> f32 {
  if (params.fogWisps <= 0.) { return 1.; }
  var n = 0.;
  var strength = 0.5;
  var q = p / params.fogWispSize;
  for (var i = 0; i < WISP_OCTAVES; i++) {
    n += strength * wispNoise(q);
    q = q * 2.03 + 17.1;
    strength *= 0.5;
  }
  return clamp(1. + WISP_CONTRAST * params.fogWisps * n, 0., wispMax());
}

/**
 * The most fogWisp can be. The noise rarely gets past half its range, so
 * the thickest spots are capped there: a lower ceiling means fewer steps
 * through the fog in fogTransmittance and trace.
 */
fn wispMax() -> f32 {
  return 1. + 0.5 * WISP_CONTRAST * params.fogWisps;
}

/** Gradient noise, as noise() in detail.js, without its gradient, which fog doesn't need */
fn wispNoise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  var sum = 0.;
  for (var k = 0u; k < 8u; k++) {
    let corner = vec3f(vec3u(k, k >> 1u, k >> 2u) & vec3u(1u));
    let w = mix(1. - u, u, corner);
    sum += w.x * w.y * w.z * dot(latticeGradient(vec3i(i + corner)), f - corner);
  }
  return sum * 1.4;
}

/**
 * The fraction of light in each channel that gets through the fog from o
 * to o + d * dist. Exactly, for even fog. For uneven fog, an estimate that's
 * right on average (ratio tracking, from "Unbiased, Adaptive Stochastic
 * Sampling for Rendering Inhomogeneous Participating Media", Novák et al.):
 * steps as if the fog were everywhere as thick as it ever gets, each time
 * keeping the share that the fog actually there lets through.
 */
fn fogTransmittance(o: vec3f, d: vec3f, dist: f32) -> vec3f {
  let densities = fogDensities();
  if (params.fogWisps <= 0.) { return exp(-densities * dist); }
  let majorant = peak(densities) * wispMax();
  if (majorant <= 0.) { return vec3f(1.); }
  var t = 0.;
  var through = vec3f(1.);
  for (var i = 0; i < 256; i++) {
    t -= log(1. - rand()) / majorant;
    if (t >= dist) { break; }
    through *= 1. - densities * fogWisp(o + d * t) / majorant;
  }
  return through;
}


/**
 * Where a ray through uneven fog scatters: dist (1e30 if it doesn't before
 * end), the fog's densities there, and what to multiply the throughput by.
 */
struct FogScatter {
  dist: f32,
  local: vec3f,
  weight: vec3f,
}

/**
 * Picks where a ray from o in direction d scatters in uneven fog, before end
 * (delta tracking, from "Monte Carlo Methods for Volumetric Light Transport
 * Simulation", Novák et al.): steps as if the fog were everywhere as thick
 * as it ever gets, and at each step, scatters with the chance that the fog
 * there would, or goes on. With blue fog, the channels' average decides,
 * and the weight corrects each channel for its own chance (spectral
 * tracking, Kutz et al.). Camera paths and photons both use it, so they
 * agree on where light scatters.
 */
fn sampleUnevenFog(o: vec3f, d: vec3f, end: f32) -> FogScatter {
  let densities = fogDensities();
  let majorant = peak(densities) * wispMax();
  var result = FogScatter(1e30, densities, vec3f(1.));
  var t = 0.;
  for (var i = 0; i < 256; i++) {
    t -= log(1. - rand()) / majorant;
    if (t >= end) { break; }
    let here = densities * fogWisp(o + d * t);
    let scatterProb = dot(here, vec3f(1. / 3.)) / majorant;
    if (rand() < scatterProb) {
      result.weight *= here / (majorant * scatterProb);
      result.dist = t;
      result.local = here;
      break;
    }
    result.weight *= (majorant - here) / (majorant * max(1. - scatterProb, 1e-30));
  }
  return result;
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


/** The probability density that sampleEquiangular picks t */
fn equiangularPdf(o: vec3f, d: vec3f, tMax: f32, light: u32, t: f32) -> f32 {
  let a = equiangularAngles(o, d, tMax, light);
  let s = t - a.z;
  return a.w / ((a.y - a.x) * (a.w * a.w + s * s));
}
`;
