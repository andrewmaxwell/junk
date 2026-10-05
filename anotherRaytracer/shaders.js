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
}

@group(0) @binding(0) var<uniform> params: Params;
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
  let lightPdf = 1. / (2. * PI * lightConeOneMinusCos(p, light));
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
 * the glossy lobe with probability gloss, otherwise favoring directions near
 * the normal.
 */
fn sampleSurface(s: u32, n: vec3f, r: vec3f) -> vec3f {
  let phi = 2. * PI * rand();
  if (rand() < objects[s].surface.x) {
    return directionAround(r, pow(rand(), 1. / (objects[s].surface.y + 1.)), phi);
  }
  return directionAround(n, sqrt(1. - rand()), phi);
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
  // True until the path hits a diffuse surface
  var seenByCamera = true;
  // Probability of the random choices made so far that the throughput was
  // boosted to make up for, like whether glass reflected or refracted
  var choiceProb = 1.;
  // Nonzero when a diffuse surface randomly picked this ray's direction: the
  // probability density it picked it with
  var bouncePdf = 0.;

  for (var depth = 0; depth < 100; depth++) {
    // In 32-bit floats, each new direction built from the last one is a bit
    // off unit length, and that compounds over bounces. Even 0.3% too long
    // makes a glossy lobe like cos ^ 2000 overflow to infinity.
    d = normalize(d);
    let hit = intersect(o, d);
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
        color += min(e, vec3f(params.maxBrightness / choiceProb));
      } else {
        color += e * indirectScale(e);
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

      // Direct light: aim a ray at each light rather than waiting for a
      // random bounce to stumble into one.
      for (var light = 0u; light < params.objectCount && params.sampling != 2u; light++) {
        if (i32(objects[light].colorMaterial.w) != LIGHT) { continue; }
        let w = normalize(objects[light].centerRadius.xyz - p);

        // The light covers a cone of directions around w. Pick one uniformly.
        let oneMinusCos = lightConeOneMinusCos(p, light);
        let cosA = 1. - rand() * oneMinusCos;
        let l = directionAround(w, cosA, 2. * PI * rand());

        let cosSurface = dot(l, nl);
        if (cosSurface <= 0.) { continue; } // light is behind this surface

        // Shadow ray: only counts if nothing is in the way
        if (intersect(p, l) != i32(light)) { continue; }

        // radiance * BSDF * cos(theta) / pdf (1/solidAngle)
        let solidAngle = 2. * PI * oneMinusCos;
        let pdf = evalSurface(s, cosSurface, r, l, &bsdf);
        var weight = 1.;
        if (params.sampling == 0u) { weight = powerHeuristic(1. / solidAngle, pdf); }
        let c = through * objects[light].colorMaterial.rgb * bsdf * (weight * cosSurface * solidAngle);
        // Light reaching the first surface the camera sees is direct light
        color += c * select(indirectScale(c), 1., seenByCamera);
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      let next = sampleSurface(s, nl, r);
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
        let nnt = select(1.5, 1. / 1.5, into);
        let t = refract(d, nl, nnt);
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
          }
        }
      }
      d = next;
    }
    o = p;
  }
  return color;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) { return; }
  seed = pcg(id.x + pcg(id.y + pcg(params.seed)));
  let size = vec2f(f32(params.width), f32(params.height));

  var sum = vec3f(0.);
  for (var i = 0u; i < params.samplesPerFrame; i++) {
    // Jitter within the pixel for antialiasing. y = 0 is the top row.
    let jx = rand();
    let jy = rand();
    let screen = vec2f((f32(id.x) + jx) / size.x - 0.5, 0.5 - (f32(id.y) + jy) / size.y);
    let d = normalize(params.camForward + params.camRight * screen.x + params.camUp * screen.y);
    sum += trace(params.camPos, d);
  }
  let index = id.y * params.width + id.x;
  var prev = vec4f(0.);
  if (params.frame > 0u) { prev = sums[index]; }
  sums[index] = prev + vec4f(sum, f32(params.samplesPerFrame));
}`;

export const displayShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;

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
  var color = s.rgb / max(s.w, 1.);
  if (params.toneMap == 1u) { color = toneMap(color); }
  // The canvas takes sRGB-encoded values. In HDR, values over 1 are brighter
  // than white; in SDR the canvas clamps them.
  return vec4f(pow(color, vec3f(1. / 2.2)), 1.);
}`;
