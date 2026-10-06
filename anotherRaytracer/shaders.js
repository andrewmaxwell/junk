// A path tracer as a WebGPU compute shader. Each dispatch adds samples for
// every pixel to a running sum; the display shader divides by the sample
// count.

/** Shared by both shaders. main.js writes it; keep the layouts in sync. */
const common = /* wgsl */ `
struct Params {
  // Camera position, forward direction, and right and up vectors scaled to
  // the image plane at distance 1
  camPos: vec3f,
  frame: u32, // 0 means start a new sum
  camForward: vec3f,
  seed: u32, // different every dispatch, even when frame restarts
  camRight: vec3f,
  samplesPerFrame: u32,
  camUp: vec3f,
  /**
   * How diffuse surfaces find light:
   * 0 (mis): both of the below, weighted by which was more likely to find it
   * 1 (light): only rays aimed at lights; random bounces ignore light hits
   * 2 (bsdf): only random bounces (hope to hit a light)
   */
  sampling: u32,
  /**
   * Caps how bright one sample of bounced light can be, as a multiple of
   * white. Rare paths like light -> glass -> wall -> camera are correct but
   * very bright and hard to find, so without this they show up as speckles
   * that take ages to average out. Capping them makes those effects
   * (caustics, mostly) a bit dimmer than they should be. Direct light is
   * never capped.
   */
  maxIndirect: f32,
  objectCount: u32,
  width: u32,
  height: u32,
  /**
   * How bright lights may get, as a multiple of white: the screen's headroom
   * in HDR, or in SDR, the brightness that tone mapping shows as white
   */
  maxBrightness: f32,
  /** 1 to ease brightness over 1 into white for SDR screens, 0 to clip */
  toneMap: u32,
  /**
   * Fog filling the scene: the chance per unit of distance that light
   * scatters off it. 0 for none.
   */
  fogDensity: f32,
  /**
   * How much glass's index of refraction varies with wavelength, splitting
   * white light into rainbows. 0 for none, which is also less noisy.
   */
  dispersion: f32,
  /**
   * Adaptive sampling: a tile stops getting samples once its estimated noise
   * is below this, in display brightness from 0 to 1. 0 to never stop.
   */
  noiseThreshold: f32,
  /** 1 to highlight the tiles that are still getting samples */
  showTiles: u32,
  /** The display multiplies brightness by this */
  exposure: f32,
  /**
   * Depth of field: rays start from random points on a lens this big around
   * the camera, and meet again focusDistance in front of it, so only things
   * that far away are sharp. 0 for a pinhole camera, all sharp.
   */
  lensRadius: f32,
  focusDistance: f32,
  /** Lights are the first lightCount objects */
  lightCount: u32,
  /** 1 to use the Sobol sequence for the first few random choices; see rand2 */
  sobol: u32,
}

@group(0) @binding(0) var<uniform> params: Params;

/** Pixels per side of the tiles that adaptive sampling stops as a unit */
const TILE = 8u;

/** Index of the tile that pixel id is in */
fn tileIndex(id: vec2u) -> u32 {
  return (id.y / TILE) * ((params.width + TILE - 1u) / TILE) + id.x / TILE;
}

/** How bright a linear RGB color looks */
fn brightness(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`;

export const traceShader = /* wgsl */ `${common}
const PI = 3.14159265359;
const EPSILON = 1e-3;

// Shapes
const SPHERE = 0;
const PLATE = 1;

// Materials
const DIFFUSE = 0;
const MIRROR = 1;
const GLASS = 2;
const LIGHT = 3;

/** Fraction of light that fog scatters rather than absorbs */
const FOG_ALBEDO = 0.9;
/**
 * Fog's phase function, the share of scattered light that goes in each
 * direction: the same for all, since it's 1 / (the sphere's 4π steradians)
 */
const PHASE = 1. / (4. * PI);

/** Packed by packObjects in scenes.js */
struct Shape {
  centerRadius: vec4f,
  normalShape: vec4f,
  uHalf: vec4f,
  vHalf: vec4f,
  colorMaterial: vec4f,
  surface: vec4f, // gloss, shininess, oneSided
}

@group(0) @binding(1) var<storage, read> objects: array<Shape>;
/** Per pixel: summed color, and in w the sample count */
@group(0) @binding(2) var<storage, read_write> sums: array<vec4f>;
/** Per pixel: summed squared brightness, for estimating noise */
@group(0) @binding(3) var<storage, read_write> sqSums: array<f32>;
/** Per tile: 1 if it still needs samples. Written by tileShader. */
@group(0) @binding(4) var<storage, read> tiles: array<u32>;

///////////////////////////////
// Random numbers
///////////////////////////////

var<private> seed: u32;

// PCG hash, from "Hash Functions for GPU Rendering" (Jarzynski & Olano)
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

/** Uniform in [0, 1) */
fn rand() -> f32 {
  seed = pcg(seed);
  return f32(seed >> 8u) / 16777216.;
}

// Plain random numbers clump, leaving gaps that take many samples to fill.
// The Sobol sequence spreads each pixel's samples evenly instead, so noise
// fades faster. Each pixel gets its own scrambled copy, so neighbors don't
// share a pattern, following "Practical Hash-based Owen Scrambling" (Burley).

/** Pairs of random choices per sample that use Sobol; the rest use rand */
const SOBOL_PAIRS = 8u;
/** Which sample of its pixel this is, counting from the last restart */
var<private> sampleIndex: u32;
/** Different for every pixel, but the same every frame */
var<private> pixelSeed: u32;
/** How many rand2 calls this sample has made */
var<private> dimension: u32;

/** The first two dimensions of the Sobol sequence, as 32-bit fractions */
fn sobol(index: u32) -> vec2u {
  // The second dimension's direction numbers each xor the one before with
  // itself shifted right by 1
  var v = 1u << 31u;
  var y = 0u;
  for (var i = index; i != 0u; i >>= 1u) {
    if ((i & 1u) != 0u) { y ^= v; }
    v ^= v >> 1u;
  }
  return vec2u(reverseBits(index), y);
}

/** Owen scrambling: randomly flips bits, each depending on the bits above it */
fn scramble(x: u32, seed: u32) -> u32 {
  var v = reverseBits(x);
  v ^= v * 0x3d20adeau;
  v += seed;
  v *= (seed >> 16u) | 1u;
  v ^= v * 0x05526c56u;
  v ^= v * 0x53a22864u;
  return reverseBits(v);
}

/**
 * Two numbers uniform in [0, 1), for a 2D choice like a direction. Each call
 * within a sample gets its own shuffle of the sequence, so different choices
 * don't line up with each other.
 */
fn rand2() -> vec2f {
  if (params.sobol == 0u || dimension >= SOBOL_PAIRS) {
    return vec2f(rand(), rand());
  }
  let s = pcg(pixelSeed + pcg(dimension));
  dimension++;
  let v = sobol(scramble(sampleIndex, s));
  let x = scramble(v.x, pcg(s + 1u));
  let y = scramble(v.y, pcg(s + 2u));
  return vec2f(vec2u(x, y) >> vec2u(8u)) / 16777216.;
}

///////////////////////////////
// Geometry helpers
///////////////////////////////

/** Distance to the hit found by the last call to intersect */
var<private> hitDist: f32;

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
  return hit;
}

/** The unit vector at angle acos(cosA) from the unit axis w, rotated phi around it. */
fn directionAround(w: vec3f, cosA: f32, phi: f32) -> vec3f {
  // u and v are perpendicular to w and each other
  let u = normalize(select(vec3f(0., -w.z, w.y), vec3f(w.z, 0., -w.x), abs(w.x) > 0.1));
  let v = cross(w, u);
  let sinA = sqrt(max(0., 1. - cosA * cosA));
  return (u * cos(phi) + v * sin(phi)) * sinA + w * cosA;
}

/**
 * 1 - cos of the half-angle of the cone of directions from p that hit the
 * light. Written this way because cos is nearly 1 for small lights, and 1 -
 * cos would lose most of its precision in 32-bit floats.
 */
fn lightConeOneMinusCos(p: vec3f, light: u32) -> f32 {
  let l = objects[light].centerRadius.xyz - p;
  let r = objects[light].centerRadius.w;
  let sinMaxSq = min(1., r * r / dot(l, l));
  return sinMaxSq / (1. + sqrt(1. - sinMaxSq));
}

/** MIS weight for a strategy with density a, competing with density b. */
fn powerHeuristic(a: f32, b: f32) -> f32 {
  return a * a / (a * a + b * b);
}

/** How much a light hit by a random diffuse bounce from p should count. */
fn bounceLightWeight(p: vec3f, bouncePdf: f32, light: u32) -> f32 {
  if (params.sampling == 2u) { return 1.; }
  if (params.sampling == 1u) { return 0.; } // light sampling already counted it
  let lightPdf = lightPickProb(p, light) / (2. * PI * lightConeOneMinusCos(p, light));
  return powerHeuristic(bouncePdf, lightPdf);
}

/** Scale factor that caps a bounced-light contribution at maxIndirect. */
fn indirectScale(c: vec3f) -> f32 {
  let brightest = max(c.r, max(c.g, c.b));
  return select(1., params.maxIndirect / brightest, brightest > params.maxIndirect);
}

/**
 * For a diffuse (maybe glossy) surface, sets bsdf to how much light arriving
 * from direction l it scatters toward the viewer, and returns the probability
 * density that sampleSurface picks l. r is the viewing direction mirrored
 * about the normal, and cosTheta is the cosine between l and the normal.
 */
fn evalSurface(s: u32, cosTheta: f32, r: vec3f, l: vec3f, bsdf: ptr<function, vec3f>) -> f32 {
  let gloss = objects[s].surface.x;
  let shininess = objects[s].surface.y;
  let diffuse = (1. - gloss) / PI;
  var glossy = 0.;
  var glossyPdf = 0.;
  if (gloss > 0.) {
    // Phong lobe: strongest in the mirror direction, falling off as
    // cos(angle from it) ^ shininess
    // Clamped to 1 too: a cosine a hair over 1 raised to a high shininess
    // can overflow
    let lobe = pow(clamp(dot(r, l), 0., 1.), shininess) / (2. * PI);
    glossy = gloss * (shininess + 2.) * lobe;
    glossyPdf = (shininess + 1.) * lobe;
  }
  *bsdf = diffuse * objects[s].colorMaterial.rgb + glossy;
  // sampleSurface picks the glossy lobe with probability gloss
  return (1. - gloss) * (cosTheta / PI) + gloss * glossyPdf;
}

/**
 * Picks a random bounce direction off a diffuse (maybe glossy) surface: from
 * the glossy lobe if choice (uniform in [0, 1)) is under gloss, otherwise
 * favoring directions near the normal.
 */
fn sampleSurface(s: u32, n: vec3f, r: vec3f, choice: f32) -> vec3f {
  let u = rand2();
  let phi = 2. * PI * u.y;
  if (choice < objects[s].surface.x) {
    return directionAround(r, pow(u.x, 1. / (objects[s].surface.y + 1.)), phi);
  }
  return directionAround(n, sqrt(1. - u.x), phi);
}

/** A random direction, any way at all */
fn sampleSphere() -> vec3f {
  let u = rand2();
  return directionAround(vec3f(0., 1., 0.), 1. - 2. * u.x, 2. * PI * u.y);
}

/**
 * Picks a random direction from p toward a light, uniformly within the cone
 * it covers. Returns the direction, and in w the cone's solid angle.
 */
fn sampleLight(p: vec3f, light: u32) -> vec4f {
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
 * Roughly how much light a light gives p, ignoring what's in the way: its
 * brightness times how big it looks from p
 */
fn lightGuess(p: vec3f, light: u32) -> f32 {
  return brightness(objects[light].colorMaterial.rgb) * lightConeOneMinusCos(p, light);
}

/**
 * The probability that pickLight picks this light from p. Half the time it
 * picks evenly, so a light that looks dim, or is bright but blocked, still
 * gets picked sometimes; the other half, in proportion to lightGuess.
 */
fn lightPickProb(p: vec3f, light: u32) -> f32 {
  var total = 0.;
  for (var i = 0u; i < params.lightCount; i++) { total += lightGuess(p, i); }
  return 0.5 / f32(params.lightCount) + 0.5 * lightGuess(p, light) / total;
}

/** Picks one light as lightPickProb describes, given u uniform in [0, 1) */
fn pickLight(p: vec3f, u: f32) -> u32 {
  if (u < 0.5) { return min(u32(u * 2. * f32(params.lightCount)), params.lightCount - 1u); }
  var total = 0.;
  for (var i = 0u; i < params.lightCount; i++) { total += lightGuess(p, i); }
  var left = (u - 0.5) * 2. * total;
  for (var i = 0u; i < params.lightCount - 1u; i++) {
    left -= lightGuess(p, i);
    if (left < 0.) { return i; }
  }
  return params.lightCount - 1u;
}

/** Fraction of the light that gets from p along l to the light: 0 if blocked, less in fog */
fn lightVisibility(p: vec3f, l: vec3f, light: u32) -> f32 {
  if (intersect(p, l) != i32(light)) { return 0.; }
  return exp(-params.fogDensity * hitDist);
}

///////////////////////////////
// Dispersion
///////////////////////////////

// Wavelengths that paths through glass pick from, in nanometers
const MIN_WAVELENGTH = 380.;
const MAX_WAVELENGTH = 720.;

/** One side of the piecewise Gaussians in wavelengthColor */
fn lobe(x: f32, mean: f32, below: f32, above: f32) -> f32 {
  let t = (x - mean) / select(above, below, x < mean);
  return exp(-0.5 * t * t);
}

/**
 * How a wavelength looks in linear RGB, scaled so that the average over all
 * of them is white. A path that picks one at random and multiplies its color
 * by this comes out the same color on average, but bends by that wavelength
 * in glass. Uses the fit of the CIE 1931 color matching functions from
 * "Simple Analytic Approximations to the CIE XYZ Color Matching Functions"
 * (Wyman, Sloan & Shirley), with colors outside sRGB clipped. The scale
 * factors make each channel average 1 between MIN_ and MAX_WAVELENGTH.
 */
fn wavelengthColor(w: f32) -> vec3f {
  let x = 1.056 * lobe(w, 599.8, 37.9, 31.) + 0.362 * lobe(w, 442., 16., 26.7) - 0.065 * lobe(w, 501.1, 20.4, 26.2);
  let y = 0.821 * lobe(w, 568.8, 46.9, 40.5) + 0.286 * lobe(w, 530.9, 16.3, 31.1);
  let z = 1.217 * lobe(w, 437., 11.8, 36.) + 0.681 * lobe(w, 459., 26., 13.8);
  let rgb = vec3f(
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  );
  return max(rgb, vec3f(0.)) * vec3f(1.9299, 2.9470, 3.1109);
}

/** Glass's index of refraction at a wavelength: 1.5 for yellow, more for blue */
fn glassIndex(w: f32) -> f32 {
  return 1.5 + params.dispersion * 0.025 * ((550. / w) * (550. / w) - 1.);
}

///////////////////////////////
// Path tracing
///////////////////////////////

/** Follows one path from the camera, returning the light it carries. */
fn trace(origin: vec3f, direction: vec3f) -> vec3f {
  var o = origin;
  var d = direction;
  // Light gathered so far
  var color = vec3f(0.);
  // Throughput: the fraction of light arriving at the current hit that makes
  // it back to the camera, after all the surfaces it has bounced off so far
  var through = vec3f(1.);
  // True until the path hits a diffuse surface or scatters in fog
  var seenByCamera = true;
  // Probability of the random choices made so far that the throughput was
  // boosted to make up for, like whether glass reflected or refracted
  var choiceProb = 1.;
  // Nonzero when a diffuse surface or fog randomly picked this ray's
  // direction: the probability density it picked it with
  var bouncePdf = 0.;
  // Once the path refracts through glass, the one wavelength it follows from
  // then on (0 before), and that wavelength's color. Light is multiplied by
  // the color after clamping, so clamping doesn't change its hue.
  var wavelength = 0.;
  var tint = vec3f(1.);

  for (var depth = 0; depth < 100; depth++) {
    // In 32-bit floats, each new direction built from the last one is a bit
    // off unit length, and that compounds over bounces. Even 0.3% too long
    // makes a glossy lobe like cos ^ 2000 overflow to infinity.
    d = normalize(d);
    let hit = intersect(o, d);

    // Fog: the ray scatters after a random distance, sooner in denser fog.
    // If that's before what it hit, it scatters instead of getting there.
    var fogDist = 1e30;
    if (params.fogDensity > 0.) { fogDist = -log(1. - rand2().x) / params.fogDensity; }
    if (fogDist < hitDist) {
      // Fog absorbs some light. After a few bounces, end the path with that
      // probability instead, so survivors don't get dimmer.
      if (depth < 5) {
        through *= FOG_ALBEDO;
      } else if (rand() >= FOG_ALBEDO) {
        break;
      }
      let p = o + d * fogDist;

      // Direct light, as for diffuse surfaces below. Fog scatters light
      // evenly in all directions.
      if (params.sampling != 2u && params.lightCount > 0u) {
        let light = pickLight(p, rand2().x);
        let pick = lightPickProb(p, light);
        let ls = sampleLight(p, light);
        let visible = lightVisibility(p, ls.xyz, light);
        if (visible > 0.) {
          var weight = 1.;
          if (params.sampling == 0u) { weight = powerHeuristic(pick / ls.w, PHASE); }
          let c = through * objects[light].colorMaterial.rgb * (PHASE * visible * weight * ls.w / pick);
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: scatter in a random direction. Its density equals
      // the phase function, so the throughput is unchanged.
      bouncePdf = PHASE;
      seenByCamera = false;
      o = p;
      d = sampleSphere();
      continue;
    }

    if (hit < 0) { break; }
    let s = u32(hit);
    let shape = objects[s];
    let sColor = shape.colorMaterial.rgb;
    let material = i32(shape.colorMaterial.w);

    if (material == LIGHT) {
      var w = 1.;
      if (bouncePdf > 0.) { w = bounceLightWeight(o, bouncePdf, s); }
      var e = sColor * w * through;
      if (seenByCamera) {
        // The light is far brighter than the screen can show. Clamping it
        // to the screen's brightest here, before pixel samples are averaged,
        // lets its edges antialias; otherwise a pixel 1% covered by the
        // light shows at full brightness. Paths that got here by random
        // choices clamp higher, to keep the boost that makes up for the
        // paths that went elsewhere. Otherwise a light behind glass, which
        // only about half of the paths reach, would average out too dim.
        color += tint * min(e, vec3f(params.maxBrightness / choiceProb));
      } else {
        color += tint * e * indirectScale(e);
      }
      break; // lights don't reflect anything
    }

    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      let q = min(0.95, max(sColor.r, max(sColor.g, sColor.b)) + shape.surface.x);
      if (rand() >= q) { break; }
      through /= q;
      choiceProb *= q;
    }

    let p = o + d * hitDist;
    var n = shape.normalShape.xyz;
    if (i32(shape.normalShape.w) == SPHERE) {
      n = normalize(p - shape.centerRadius.xyz);
    }
    // Normal facing the side the ray came from
    let into = dot(n, d) < 0.;
    let nl = select(-n, n, into);

    if (material == DIFFUSE) {
      // Viewing direction mirrored about the normal, the center of the
      // glossy lobe
      let r = reflect(d, nl);
      var bsdf: vec3f;
      // Which light to aim at, and whether to bounce off the glossy coat
      let choices = rand2();

      // Direct light: aim a ray at a light rather than waiting for a random
      // bounce to stumble into one.
      if (params.sampling != 2u && params.lightCount > 0u) {
        let light = pickLight(p, choices.x);
        let pick = lightPickProb(p, light);
        let ls = sampleLight(p, light);
        let l = ls.xyz;
        let cosSurface = dot(l, nl);
        // Only counts if the light is in front of this surface, and nothing
        // is in the way
        var visible = 0.;
        if (cosSurface > 0.) { visible = lightVisibility(p, l, light); }
        if (visible > 0.) {
          // radiance * BSDF * cos(theta) / pdf, where the pdf is the chance
          // of picking this light over the cone's solid angle
          let pdf = evalSurface(s, cosSurface, r, l, &bsdf);
          var weight = 1.;
          if (params.sampling == 0u) { weight = powerHeuristic(pick / ls.w, pdf); }
          let c = through * objects[light].colorMaterial.rgb * bsdf * (weight * cosSurface * ls.w * visible / pick);
          // Light reaching the first surface the camera sees is direct light
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      let next = sampleSurface(s, nl, r, choices.y);
      let cosTheta = dot(next, nl);
      if (cosTheta <= 0.) { break; } // glossy lobe pointed into the surface
      bouncePdf = evalSurface(s, cosTheta, r, next, &bsdf);
      // Far out in a tight lobe, cos ^ shininess underflows to 0, and 0 / 0
      // would be NaN. A direction that's never picked carries no light.
      if (bouncePdf <= 0.) { break; }
      through *= bsdf * cosTheta / bouncePdf;
      seenByCamera = false;
      d = next;
    } else {
      through *= sColor;
      bouncePdf = 0.;
      var next = reflect(d, n);

      if (material == GLASS) {
        var index = 1.5;
        if (wavelength > 0.) { index = glassIndex(wavelength); }
        let t = refract(d, nl, select(index, 1. / index, into));
        // Otherwise total internal reflection: keep the mirror direction
        if (any(t != vec3f(0.))) {
          // Fresnel: how much reflects vs refracts (Schlick's approximation)
          // Clamped because rounding can push it just below 0, and GPU
          // pow() of a negative number is NaN, which would stick in the
          // pixel's sum forever as a white dot
          let c = clamp(1. - select(dot(t, n), -dot(d, nl), into), 0., 1.);
          let reflectance = 0.04 + 0.96 * pow(c, 5.);
          // Pick one at random, with probability P of reflecting, and
          // divide by that probability to stay unbiased
          let P = 0.25 + 0.5 * reflectance;
          if (rand() < P) {
            through *= reflectance / P;
            choiceProb *= P;
          } else {
            next = t;
            through *= (1. - reflectance) / (1. - P);
            choiceProb *= 1. - P;
            // Dispersion: the first time the path refracts, it picks a
            // wavelength to follow, and bends by that wavelength's index
            // instead. Reflection doesn't depend on wavelength (much), so
            // paths that only reflect skip this, and the noise it adds.
            if (wavelength == 0. && params.dispersion > 0.) {
              wavelength = mix(MIN_WAVELENGTH, MAX_WAVELENGTH, rand());
              tint = wavelengthColor(wavelength);
              let i = glassIndex(wavelength);
              let bent = refract(d, nl, select(i, 1. / i, into));
              // Rarely, a wavelength that bends more reflects entirely
              // where yellow wouldn't
              next = select(reflect(d, n), bent, any(bent != vec3f(0.)));
            }
          }
        }
      }
      d = next;
    }
    o = p;
  }
  return color;
}

@compute @workgroup_size(TILE, TILE)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) { return; }
  // Adaptive sampling: skip tiles that are already smooth enough
  if (tiles[tileIndex(id.xy)] == 0u) { return; }
  seed = pcg(id.x + pcg(id.y + pcg(params.seed)));
  pixelSeed = pcg(id.x + pcg(id.y));
  let size = vec2f(f32(params.width), f32(params.height));
  let index = id.y * params.width + id.x;
  var prev = vec4f(0.);
  var prevSq = 0.;
  if (params.frame > 0u) {
    prev = sums[index];
    prevSq = sqSums[index];
  }

  var sum = vec3f(0.);
  var sqSum = 0.;
  for (var i = 0u; i < params.samplesPerFrame; i++) {
    sampleIndex = u32(prev.w) + i;
    dimension = 0u;
    // Jitter within the pixel for antialiasing. y = 0 is the top row.
    let jitter = rand2();
    let screen = vec2f((f32(id.x) + jitter.x) / size.x - 0.5, 0.5 - (f32(id.y) + jitter.y) / size.y);
    // Through the pixel, 1 unit in front of the camera
    let d = params.camForward + params.camRight * screen.x + params.camUp * screen.y;
    var o = params.camPos;
    var dir = d;
    if (params.lensRadius > 0.) {
      // Start from a random point on the lens, aimed at where the pinhole
      // ray crosses the plane in focus
      let u = rand2();
      let r = sqrt(u.x) * params.lensRadius;
      let angle = 2. * PI * u.y;
      let offset = (normalize(params.camRight) * cos(angle) + normalize(params.camUp) * sin(angle)) * r;
      o += offset;
      dir = d * params.focusDistance - offset;
    }
    let c = trace(o, normalize(dir));
    sum += c;
    sqSum += brightness(c) * brightness(c);
  }
  sums[index] = prev + vec4f(sum, f32(params.samplesPerFrame));
  sqSums[index] = prevSq + sqSum;
}`;

/**
 * Adaptive sampling. Runs before each trace dispatch, one workgroup per tile,
 * and marks which tiles still need samples.
 *
 * Noise is judged per tile rather than per pixel: one pixel's noise estimate
 * is itself noisy, so pixels whose first samples happened to agree would stop
 * too early. Tiles stop as a unit, when the root-mean-square noise of their
 * pixels is low enough, so a few noisy pixels keep the whole tile going.
 */
export const tileShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
@group(0) @binding(2) var<storage, read> sqSums: array<f32>;
@group(0) @binding(3) var<storage, read_write> tiles: array<u32>;
/** How many tiles are still going, for main.js to show and to know when to stop */
@group(0) @binding(4) var<storage, read_write> activeTiles: atomic<u32>;

/** Every tile gets at least this many samples before its noise is trusted */
const MIN_SAMPLES = 32.;

/** Each pixel's squared noise */
var<workgroup> noise: array<f32, TILE * TILE>;

/** Brightness as displayed, roughly: clipped to white, with gamma */
fn display(x: f32) -> f32 {
  return pow(clamp(x, 0., 1.), 1. / 2.2);
}

@compute @workgroup_size(TILE, TILE)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) local: u32) {
  var n = 0.;
  if (id.x < params.width && id.y < params.height) {
    let s = sums[id.y * params.width + id.x];
    let count = max(s.w, 1.);
    let mean = brightness(s.rgb) / count;
    let variance = max(0., sqSums[id.y * params.width + id.x] / count - mean * mean);
    // Standard error: how far the average of the samples is likely to be off
    let stdErr = sqrt(variance / count);
    // In display brightness, where dark values are stretched by gamma
    let e = display(mean + stdErr) - display(mean - stdErr);
    n = e * e;
  }
  noise[local] = n;
  workgroupBarrier();
  if (local != 0u) { return; }

  // Thread 0 is the tile's top left pixel. Every pixel in a tile has the same
  // sample count.
  var total = 0.;
  for (var i = 0u; i < TILE * TILE; i++) { total += noise[i]; }
  let pixels = min(TILE, params.width - id.x) * min(TILE, params.height - id.y);
  let rms = sqrt(total / f32(pixels));
  let count = sums[id.y * params.width + id.x].w;
  let refining =
    params.frame == 0u || // the sums are from before a restart
    params.noiseThreshold == 0. ||
    count < MIN_SAMPLES ||
    rms > params.noiseThreshold;
  tiles[tileIndex(id.xy)] = u32(refining);
  if (refining) { atomicAdd(&activeTiles, 1u); }
}`;

export const displayShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
@group(0) @binding(2) var<storage, read> tiles: array<u32>;

// One triangle that covers the whole screen
@vertex
fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(corners[i], 0., 1.);
}

/**
 * Below the knee, brightness is left alone. Above it, it eases toward white
 * instead of clipping, so bright areas keep their shading: 1 shows as 0.85,
 * 2 as 0.99. Each channel eases separately, so very bright colors wash out
 * toward white, like film.
 */
const KNEE = 0.6;
fn toneMap(x: vec3f) -> vec3f {
  let eased = KNEE + (1. - KNEE) * (1. - exp((KNEE - x) / (1. - KNEE)));
  return select(x, eased, x > vec3f(KNEE));
}

@fragment
fn fragment(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let s = sums[u32(pos.y) * params.width + u32(pos.x)];
  var color = s.rgb / max(s.w, 1.) * params.exposure;
  if (params.toneMap == 1u) { color = toneMap(color); }
  if (params.showTiles == 1u && tiles[tileIndex(vec2u(pos.xy))] == 1u) {
    color = mix(color, vec3f(1., 0., 0.), 0.3);
  }
  // The canvas takes sRGB-encoded values. In HDR, values over 1 are brighter
  // than white; in SDR the canvas clamps them.
  return vec4f(pow(color, vec3f(1. / 2.2)), 1.);
}`;
