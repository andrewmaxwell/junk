// A path tracer as a WebGPU compute shader. Each dispatch adds samples for
// every pixel to a running sum; the display shader divides by the sample
// count.

import {ALBEDO_SIZE} from './ggx.js';
import {SKY_HEIGHT, SKY_WIDTH} from './sky.js';

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
  /** Balls and plates; teapots come after them */
  objectCount: u32,
  width: u32,
  height: u32,
  /**
   * How bright lights may get, as a multiple of white: the screen's headroom
   * in HDR, or in SDR, the brightness that tone mapping shows as white
   */
  maxBrightness: f32,
  /**
   * How SDR screens show brightness over 1: 0 clips it, 1 eases it into
   * white (toneMap), 2 is a filmic curve (agx)
   */
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
  /**
   * Which way fog scatters light, from -1 (back where it came from) through
   * 0 (every direction evenly) to 1 (straight on). Real haze is around 0.7,
   * so fog glows brightest looking toward a light.
   */
  fogForward: f32,
  /**
   * 0 for gray fog. Up to 1, it scatters blue light more than red, like air:
   * blue sky, and lights seen through a lot of it turn orange.
   */
  fogBlue: f32,
  /**
   * How uneven surfaces are: paint finely bumpy, glass and mirrors smudged
   * in places. 0 for mathematically smooth.
   */
  detail: f32,
  /** World units per bump; main.js sets it from the scene's size */
  detailScale: f32,
  /** Lens glow: the fraction of light the lens spreads into a halo */
  glow: f32,
  /**
   * How much the image darkens toward its corners, as through a real lens:
   * 0 for none, 1 for the cos^4 falloff of a simple lens
   */
  vignette: f32,
  /** 1 to show the denoised image; see denoiseShader */
  denoise: u32,
  /** The object to outline, as the camera sees it, or NONE */
  selected: u32,
  /** Where the teapot's hierarchy and triangles start in tables, in vec4s */
  teapotNodes: u32,
  teapotTriangles: u32,
  teapotCount: u32,
}

const NONE = 0xffffffffu;

@group(0) @binding(0) var<uniform> params: Params;

/** Pixels per side of the tiles that adaptive sampling stops as a unit */
const TILE = 8u;

/** Index of the tile that pixel id is in */
fn tileIndex(id: vec2u) -> u32 {
  return (id.y / TILE) * ((params.width + TILE - 1u) / TILE) + id.x / TILE;
}

/** Size of the lens glow's image: one texel per tile */
fn glowSize() -> vec2u {
  return (vec2u(params.width, params.height) + TILE - 1u) / TILE;
}

/** How bright a linear RGB color looks */
fn brightness(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

/** The brightest of a color's channels */
fn peak(c: vec3f) -> f32 {
  return max(c.r, max(c.g, c.b));
}

/**
 * For SDR screens. Below the knee, brightness is left alone. Above it, it
 * eases toward white instead of clipping, so bright areas keep their shading:
 * 1 shows as 0.85, 2 as 0.99. The whole color is scaled by how much its
 * brightest channel eases, so it keeps its hue; easing each channel
 * separately would turn every bright color white. Then, like film or an eye,
 * colors much brighter than white do wash out toward white, but gradually:
 * a light 8 times white keeps most of its color.
 */
const KNEE = 0.6;
/** How far over white a color is when it's halfway washed out */
const WASH_OUT = 16.;
/** How far toward white tone mapping washes out a color with this peak */
fn washOut(p: f32) -> f32 {
  let over = max(p - 1., 0.);
  return over / (over + WASH_OUT);
}
fn toneMap(x: vec3f) -> vec3f {
  let p = peak(x);
  if (p <= KNEE) { return x; }
  let eased = KNEE + (1. - KNEE) * (1. - exp((KNEE - p) / (1. - KNEE)));
  return mix(x * (eased / p), vec3f(eased), washOut(p));
}

/**
 * Deepens what's darker than middle gray and brightens what's brighter, by
 * raising brightness relative to middle gray to the power CONTRAST. Each
 * channel separately, so colors get a bit richer too.
 */
const MIDDLE_GRAY = 0.18;
const CONTRAST = 1.25;
fn applyContrast(x: vec3f) -> vec3f {
  return MIDDLE_GRAY * pow(max(x, vec3f(0.)) / MIDDLE_GRAY, vec3f(CONTRAST));
}

/**
 * A filmic curve for SDR screens: AgX (Troy Sobotka's, as in Blender), using
 * Benjamin Wrensch's polynomial fit. Like film, it rolls off shadows as well
 * as highlights, and bright colors desaturate toward white as they would on
 * film, not just when they clip.
 */
const AGX_MIN_EV = -12.47393;
const AGX_MAX_EV = 4.026069;
fn agx(c: vec3f) -> vec3f {
  // Into AgX's working space, then log encoded from MIN_ to MAX_EV
  let inset = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104,
  );
  var x = clamp(log2(max(inset * c, vec3f(1e-10))), vec3f(AGX_MIN_EV), vec3f(AGX_MAX_EV));
  x = (x - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV);
  // The S-shaped contrast curve
  let x2 = x * x;
  let x4 = x2 * x2;
  x = 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  // Plain AgX is flat and washed out, so like Blender's, it gets a "punchy"
  // look: more contrast and saturation
  x = pow(max(x, vec3f(0.)), vec3f(1.35));
  let luma = dot(x, vec3f(0.2126, 0.7152, 0.0722));
  x = luma + 1.4 * (x - luma);
  let outset = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116,
  );
  // The curve's output is gamma encoded; back to linear
  return pow(max(outset * x, vec3f(0.)), vec3f(2.2));
}
/** Brightness that agx shows as white */
const AGX_WHITE = 16.;

/** A linear color as the display shows it, before sRGB encoding */
fn shown(c: vec3f) -> vec3f {
  var color = applyContrast(c * params.exposure);
  if (params.toneMap == 2u) {
    color = agx(color);
  } else if (params.toneMap == 1u) {
    color = toneMap(color);
  } else if (peak(color) > params.maxBrightness) {
    // Brighter than the screen can show. Scale the whole color down, rather
    // than letting the screen clip each channel, which turns colors white.
    color *= params.maxBrightness / peak(color);
  }
  return color;
}
`;

export const traceShader = /* wgsl */ `${common}
const PI = 3.14159265359;
const EPSILON = 1e-3;

// Shapes
const SPHERE = 0;
const PLATE = 1;
const TEAPOT = 2;

// Materials
const DIFFUSE = 0;
const MIRROR = 1;
const GLASS = 2;
const LIGHT = 3;

/** Fraction of light that fog scatters rather than absorbs */
const FOG_ALBEDO = 0.9;
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
 * The probability density that fog scatters a ray at distance t, given the
 * fraction of light that gets that far in each channel: the distance is
 * picked using one channel, at random (see trace), so it's their average.
 */
fn fogScatterPdf(transmittance: vec3f) -> f32 {
  return dot(fogDensities() * transmittance, vec3f(1. / 3.));
}

/** Packed by packObjects in scenes.js */
struct Shape {
  centerRadius: vec4f,
  normalShape: vec4f,
  uHalf: vec4f,
  vHalf: vec4f,
  colorMaterial: vec4f,
  surface: vec4f, // gloss, roughness, oneSided, sky
}

@group(0) @binding(1) var<storage, read> objects: array<Shape>;
/** Per pixel: summed color, and in w the sample count */
@group(0) @binding(2) var<storage, read_write> sums: array<vec4f>;
/**
 * Per pixel: summed squared color, each channel separately, for estimating
 * noise. Not just brightness: under differently colored lights, samples can
 * be equally bright but differently colored. w is unused.
 */
@group(0) @binding(3) var<storage, read_write> sqSums: array<vec4f>;
/** Per tile: 1 if it still needs samples. Written by tileShader. */
@group(0) @binding(4) var<storage, read> tiles: array<u32>;
/**
 * Per pixel: summed light that trace clamped away from lights the camera
 * sees, for the lens glow. A light thousands of times brighter than white
 * glows far more than one just over it, though both show as white.
 */
@group(0) @binding(5) var<storage, read_write> glowSums: array<vec4f>;
/**
 * The sky's color by direction, for sky domes (skyTable in sky.js), then the
 * teapot (packTeapot in teapot.js), at params.teapotNodes. (A buffer of its
 * own would pass WebGPU's default limit of 8 per shader.)
 */
@group(0) @binding(6) var<storage, read> tables: array<vec4f>;
/**
 * For the denoiser, per pixel: the summed color (in rgb) of what each sample
 * first saw, and its normal (xyz) and distance (w). See guideAlbedo. In
 * albedoSums' w, not summed: the object the camera sees there, for
 * outlining it, or -1. (A buffer of its own would pass WebGPU's default
 * limit of 8 per shader.)
 */
@group(0) @binding(7) var<storage, read_write> albedoSums: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> normalDepthSums: array<vec4f>;

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

/** The current sample's light that the clamp in trace removed */
var<private> clamped: vec3f;

/**
 * What the current sample first saw, for the denoiser: the first surface
 * that isn't a smooth mirror, seen through any that are (or the last of
 * those, if the path scatters in fog first). Its color, its normal facing
 * the camera, and how far the path went to get there. Neighboring pixels
 * that saw the same surface can share their light; ones that didn't can't.
 */
var<private> guideAlbedo: vec3f;
var<private> guideNormal: vec3f;
var<private> guideDepth: f32;
/** Whether the guide is settled for this sample */
var<private> guided: bool;
/** The first object the current sample hit, or NONE */
var<private> firstHit: u32;

/** Smooth glass and mirrors, which bounce light in one direction, not a spread */
fn isSmooth(s: u32) -> bool {
  let material = i32(objects[s].colorMaterial.w);
  return material == GLASS || (material == MIRROR && objects[s].surface.y == 0.);
}

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
  if (dimension >= SOBOL_PAIRS) {
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
/**
 * Where the last call to intersect hit, if it was a teapot: which triangle,
 * and how far toward its second and third corners
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
  // The teapot's own space, where it fits in a unit ball. The direction
  // shrinks with it, so distances along the ray are the same as outside.
  let r = s.centerRadius.w;
  let x = s.uHalf.xyz;
  let y = s.vHalf.xyz;
  let z = s.normalShape.xyz;
  let rel = (o - s.centerRadius.xyz) / r;
  let lo = vec3f(dot(rel, x), dot(rel, y), dot(rel, z));
  let ld = vec3f(dot(d, x), dot(d, y), dot(d, z)) / r;
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
  // Teapots, in a loop of their own: a third kind of shape in the loop
  // above made every scene 8% slower, teapots or not.
  for (var i = params.objectCount; i < params.objectCount + params.teapotCount; i++) {
    let s = objects[i];
    // A teapot fits in its ball, so only rays that hit that, before
    // anything closer, look further
    let p = s.centerRadius.xyz - o;
    let r = s.centerRadius.w;
    let b = dot(p, d);
    let det = b * b - dot(p, p) + r * r;
    if (det < 0. || b + sqrt(det) <= EPSILON || b - sqrt(det) >= hitDist) { continue; }
    let t = intersectTeapot(o, d, s, hitDist);
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

fn isPlate(s: u32) -> bool {
  return i32(objects[s].normalShape.w) == PLATE;
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

/** Scale factor that caps a bounced-light contribution at maxIndirect. */
fn indirectScale(c: vec3f) -> f32 {
  let brightest = max(c.r, max(c.g, c.b));
  return select(1., params.maxIndirect / brightest, brightest > params.maxIndirect);
}

///////////////////////////////
// Materials
///////////////////////////////

/**
 * The fraction of light a smooth boundary reflects (Fresnel's equations,
 * for unpolarized light), for light arriving at an angle with cosine cosI,
 * into a material eta times as optically dense: 1.5 into glass, 1 / 1.5
 * back out of it. Past the critical angle on the way out, all of it.
 */
fn fresnelDielectric(cosI: f32, eta: f32) -> f32 {
  let c = clamp(cosI, 0., 1.);
  let sinT2 = (1. - c * c) / (eta * eta);
  if (sinT2 >= 1.) { return 1.; }
  let cosT = sqrt(1. - sinT2);
  let s = (c - eta * cosT) / (c + eta * cosT);
  let p = (eta * c - cosT) / (eta * c + cosT);
  return 0.5 * (s * s + p * p);
}

/**
 * The fraction of light metal reflects, in each channel, at an angle with
 * cosine cosI: its color head on, rising to white at grazing angles
 * (Schlick's form, which is what OpenPBR uses for metals without a separate
 * edge tint)
 */
fn fresnelMetal(color: vec3f, cosI: f32) -> vec3f {
  return color + (1. - color) * pow(1. - clamp(cosI, 0., 1.), 5.);
}

/** Paint's clear coat is like varnish: a little denser than air, as glass is */
const COAT_INDEX = 1.5;
/**
 * How much of the light scattered up from paint the coat reflects back down
 * into it, mostly by total internal reflection: 1 - (1 - 0.0918) / 1.5^2,
 * where 0.0918 is the coat's average reflectance for light from all
 * directions outside it
 */
const COAT_INSIDE_REFLECTANCE = 0.5963;

/**
 * Rough reflections are microfacet reflections (Walter et al., "Microfacet
 * Models for Refraction through Rough Surfaces"): the surface is made of tiny
 * mirrors, tilted by the GGX distribution, which has a sharp peak and long
 * soft tails, like real highlights. Roughness alpha is the tilts' spread,
 * from 0 for a perfect mirror. Below this it's too sharp for 32-bit floats.
 */
const MIN_ROUGHNESS = 0.002;

/** How many tiny mirrors face half-vector h, by the cosine of its angle from the normal */
fn ggx(cosH: f32, a2: f32) -> f32 {
  let d = cosH * cosH * (a2 - 1.) + 1.;
  return a2 / (PI * d * d);
}

/**
 * Smith's Lambda for GGX: from a direction with this cosine to the normal,
 * how much the tiny mirrors hide each other (G1 = 1 / (1 + Lambda))
 */
fn smithLambda(cosA: f32, a2: f32) -> f32 {
  let c2 = max(cosA * cosA, 1e-8);
  return 0.5 * (sqrt(1. + a2 * (1. - c2) / c2) - 1.);
}

/**
 * A random half-vector, picked in proportion to how much of the surface the
 * viewer sees facing it, so few samples are wasted on facets turned away
 * ("Sampling Visible GGX Normals with Spherical Caps", Dupuy & Benyoub). n
 * is the normal and v the direction to the viewer.
 */
fn sampleVisibleNormal(n: vec3f, v: vec3f, alpha: f32, u: vec2f) -> vec3f {
  let t = perpendicular(n);
  let b = cross(n, t);
  // Stretch the view as if the surface were smooth, pick a direction in the
  // cap the view sees, then unstretch
  let stretched = normalize(vec3f(alpha * dot(v, t), alpha * dot(v, b), dot(v, n)));
  let phi = 2. * PI * u.x;
  let z = (1. - u.y) * (1. + stretched.z) - stretched.z;
  let sinA = sqrt(clamp(1. - z * z, 0., 1.));
  let h = vec3f(sinA * cos(phi), sinA * sin(phi), z) + stretched;
  let local = normalize(vec3f(alpha * h.x, alpha * h.y, max(h.z, 1e-6)));
  return t * local.x + b * local.y + n * local.z;
}

/**
 * How much white GGX metal reflects with one bounce, by roughness and view
 * cosine: albedoTable in ggx.js, four to a vec4 (uniform arrays need that)
 */
@group(0) @binding(9) var<uniform> singleBounce: array<vec4f, ${(ALBEDO_SIZE * ALBEDO_SIZE) / 4}>;

fn singleBounceAt(row: u32, col: u32) -> f32 {
  let i = row * ${ALBEDO_SIZE}u + col;
  return singleBounce[i / 4u][i % 4u];
}

/** singleBounce at any roughness and view cosine, blending the nearest four */
fn singleBounceAlbedo(alpha: f32, cosV: f32) -> f32 {
  let p = clamp(vec2f(alpha, cosV), vec2f(0.), vec2f(1.)) * f32(${ALBEDO_SIZE - 1});
  let i = min(vec2u(p), vec2u(${ALBEDO_SIZE - 2}u));
  let f = p - vec2f(i);
  let top = mix(singleBounceAt(i.x, i.y), singleBounceAt(i.x, i.y + 1u), f.y);
  let bottom = mix(singleBounceAt(i.x + 1u, i.y), singleBounceAt(i.x + 1u, i.y + 1u), f.y);
  return mix(top, bottom, f.x);
}

/** The roughness of a rough surface */
fn roughness(s: u32) -> f32 {
  return max(objects[s].surface.y, MIN_ROUGHNESS);
}

/**
 * The chance that sampleSurface bounces off the glossy coat, or for metal,
 * 1. Roughly the share of light the coat reflects, seen from an angle with
 * this cosine, but at least a quarter of its coverage, so faint reflections
 * of lit things, not just of lights, still get found.
 */
fn coatChance(s: u32, cosV: f32) -> f32 {
  if (i32(objects[s].colorMaterial.w) == MIRROR) { return 1.; }
  let coverage = objects[s].surface.x;
  return coverage * mix(fresnelDielectric(cosV, COAT_INDEX), 1., 0.25);
}

/**
 * For paint (maybe with a glossy coat) or rough metal, sets bsdf to how much
 * light arriving from direction l it scatters toward the viewer, in
 * direction v, and returns the probability density that sampleSurface picks
 * l. n is the surface's normal on the viewer's side, which the coat and
 * metal reflect about, and ns the normal paint's bumps tilt.
 *
 * Paint's coat covers its gloss fraction of it, and reflects as clear
 * varnish does: a little head on, more toward grazing angles. What it
 * doesn't reflect reaches the paint. Metal reflects its color.
 */
fn evalSurface(s: u32, ns: vec3f, n: vec3f, v: vec3f, l: vec3f, bsdf: ptr<function, vec3f>) -> f32 {
  let metal = i32(objects[s].colorMaterial.w) == MIRROR;
  let color = objects[s].colorMaterial.rgb;
  let coverage = select(objects[s].surface.x, 1., metal);
  let cosV = max(dot(n, v), 1e-6);
  let cosL = dot(n, l);
  var glossy = vec3f(0.);
  var glossyPdf = 0.;
  if (coverage > 0. && cosL > 0.) {
    let a2 = roughness(s) * roughness(s);
    let h = normalize(v + l);
    let cosVH = dot(v, h);
    let d = ggx(max(dot(n, h), 0.), a2);
    let lambdaV = smithLambda(cosV, a2);
    // Facets hidden from the viewer or the light don't count
    let shadowing = 1. / (1. + lambdaV + smithLambda(cosL, a2));
    var f = vec3f(coverage * fresnelDielectric(cosVH, COAT_INDEX));
    // Light that bounces between the tiny mirrors before leaving, which one
    // bounce misses, scaled by how much of it each reflection keeps: its
    // reflectance head on
    var headOn = vec3f(coverage * 0.04);
    if (metal) {
      f = fresnelMetal(color, cosVH);
      headOn = color;
    }
    let single = singleBounceAlbedo(roughness(s), cosV);
    f *= 1. + headOn * (1. - single) / single;
    glossy = f * d * shadowing / (4. * cosV * cosL);
    // The density of l from sampleVisibleNormal
    glossyPdf = d / ((1. + lambdaV) * 4. * cosV);
  }
  var paint = vec3f(0.);
  if (!metal) {
    // Under the coat: light that gets through it scatters off the paint,
    // and what the coat reflects back down scatters again, and so on, so
    // paint loses a little more each time; that's why varnish deepens
    // colors. Coming out, it spreads into a wider range of directions than
    // it was in, by the index squared.
    let through = (1. - fresnelDielectric(cosV, COAT_INDEX)) *
      (1. - fresnelDielectric(max(dot(ns, l), 0.), COAT_INDEX));
    let coated = through / (COAT_INDEX * COAT_INDEX * (1. - color * COAT_INSIDE_REFLECTANCE));
    paint = color / PI * mix(vec3f(1.), coated, coverage);
  }
  *bsdf = paint + glossy;
  let chance = coatChance(s, cosV);
  return (1. - chance) * max(dot(l, ns), 0.) / PI + chance * glossyPdf;
}

/**
 * Picks a random bounce direction off paint or rough metal: off the coat (or
 * metal) with probability coatChance, given choice uniform in [0, 1), or
 * otherwise favoring directions near the bumps' normal ns.
 */
fn sampleSurface(s: u32, ns: vec3f, n: vec3f, v: vec3f, choice: f32) -> vec3f {
  let u = rand2();
  if (choice < coatChance(s, max(dot(n, v), 0.))) {
    return reflect(-v, sampleVisibleNormal(n, v, roughness(s), u));
  }
  return directionAround(ns, sqrt(1. - u.x), 2. * PI * u.y);
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
  // For plates, a ball of the same area; see packObjects in scenes.js. One
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

/**
 * Fraction of the light, per channel, that gets from p to the light along a
 * sampleLight sample: 0 if blocked or the light faces away, less in fog
 */
fn lightVisibility(p: vec3f, ls: vec4f, light: u32) -> vec3f {
  if (ls.w <= 0. || intersect(p, ls.xyz) != i32(light)) { return vec3f(0.); }
  return exp(-fogDensities() * hitDist);
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
// Surface detail
///////////////////////////////

// Real surfaces are never perfectly even. Gradient noise (Perlin's), summed
// over a few sizes, varies them a little from point to point. It depends
// only on position, so each point stays the same as samples add up.

/**
 * Three pseudorandom numbers from three, in one go: pcg3d, from "Hash
 * Functions for GPU Rendering" (Jarzynski & Olano). The noise below hashes
 * eight lattice points per octave, so this is about 4x quicker than chaining
 * pcg for each coordinate and output.
 */
fn pcg3d(input: vec3u) -> vec3u {
  var v = input * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

/** A pseudorandom gradient for a lattice point of the noise */
fn latticeGradient(c: vec3i) -> vec3f {
  return vec3f(pcg3d(vec3u(c)) >> vec3u(8u)) / 8388608. - 1.;
}

/**
 * Smoothly varying noise, roughly -1 to 1, with features about 1 apart. In
 * x, and its gradient in yzw, worked out exactly rather than by sampling
 * nearby points, which would take four times as long.
 */
fn noise(p: vec3f) -> vec4f {
  let i = floor(p);
  let f = p - i;
  // Weights that ease in and out, so there are no creases at cell edges,
  // and their slopes
  let u = f * f * f * (f * (f * 6. - 15.) + 10.);
  let du = 30. * f * f * (f - 1.) * (f - 1.);
  var sum = vec4f(0.);
  for (var k = 0u; k < 8u; k++) {
    let corner = vec3f(vec3u(k, k >> 1u, k >> 2u) & vec3u(1u));
    let w = mix(1. - u, u, corner);
    let dw = du * (corner * 2. - 1.);
    let g = latticeGradient(vec3i(i + corner));
    let v = dot(g, f - corner);
    let weight = w.x * w.y * w.z;
    let dWeight = vec3f(dw.x * w.y * w.z, w.x * dw.y * w.z, w.x * w.y * dw.z);
    sum += vec4f(weight * v, dWeight * v + weight * g);
  }
  return sum * 1.4;
}

/** noise summed over octaves, each half the size and strength of the last */
fn fbm(p: vec3f, octaves: i32) -> f32 {
  var sum = 0.;
  var strength = 0.5;
  var q = p;
  for (var i = 0; i < octaves; i++) {
    sum += strength * noise(q).x;
    // Offset each octave so their lattices don't line up
    q = q * 2.03 + 17.1;
    strength *= 0.5;
  }
  return sum;
}

/** How many sizes of bumps there are, each half the last */
const BUMP_OCTAVES = 6;

/**
 * A bumpy surface's normal here: n tilted by noise, like paint over plaster.
 * Only light and shading see the bumps; the surface itself stays flat. The
 * bumps come in BUMP_OCTAVES sizes, from 4 detailScales across down to
 * finer than a pixel at the scene's starting view. Bigger ones are gentler,
 * so from a distance, where the fine ones average out, a surface looks
 * smooth, but close up it's textured. Much bigger, slower noise varies how
 * bumpy, so it isn't the same everywhere.
 */
fn bumpNormal(n: vec3f, p: vec3f) -> vec3f {
  var slope = vec3f(0.);
  var size = 4. * params.detailScale;
  var steepness = 1.;
  for (var i = 0; i < BUMP_OCTAVES; i++) {
    // A bump of height steepness * size, so its slope is steepness
    slope += steepness * noise(p / size + f32(i) * 17.1).yzw;
    size *= 0.5;
    steepness *= 1.4;
  }
  let patches = noise(p / (40. * params.detailScale) + 51.3).x;
  let bumpiness = 0.004 * params.detail * mix(0.3, 1.5, smoothstep(-0.5, 0.5, patches));
  // Tilt away from uphill, along the surface
  return normalize(n - bumpiness * (slope - n * dot(slope, n)));
}

/** How smudged glass or a mirror is here, from 0 to 1, fading in gently */
fn smudge(p: vec3f) -> f32 {
  return params.detail * smoothstep(0.1, 0.5, fbm(p / (6. * params.detailScale), 4));
}
/** The most light a smudge scatters, where it's thickest */
const SMUDGE_HAZE = 0.35;
/**
 * How tightly it scatters: the tilt's spread is a Phong lobe this shiny,
 * about 1 / sqrt(this) = 3° across
 */
const SMUDGE_SHININESS = 300.;

///////////////////////////////
// Path tracing
///////////////////////////////

/**
 * With depth of field, how many pixels something dist along a camera ray
 * (from the lens, through any mirrors and glass) is blurred across: at
 * least 1. A light blurred across n pixels can give each at most 1 / n of
 * its brightness, so its samples can safely be n times brighter before the
 * clamp in trace would dim it. Otherwise out-of-focus lights, spread into
 * big discs, would come out much dimmer than they should.
 */
fn blurArea(direction: vec3f, dist: f32) -> f32 {
  if (params.lensRadius == 0.) { return 1.; }
  let depth = dist * dot(direction, params.camForward);
  // Radius of the circle of confusion on the image plane at distance 1, and
  // the size of a pixel there
  let radius = params.lensRadius * abs(1. / depth - 1. / params.focusDistance);
  let pixel = length(params.camUp) / f32(params.height);
  return max(1., PI * radius * radius / (pixel * pixel));
}

/**
 * The fraction of light, per channel, that gets dist through glass ball s.
 * Colored glass absorbs light as it goes, so thick parts are deeper colored
 * than thin edges. Its color is what's left after going as far as its radius.
 */
fn glassTransmittance(s: i32, dist: f32) -> vec3f {
  if (s < 0) { return vec3f(1.); }
  let ball = objects[u32(s)];
  return pow(ball.colorMaterial.rgb, vec3f(dist / ball.centerRadius.w));
}

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
  // How far the path has gone while seenByCamera, through mirrors and glass
  var cameraDist = 0.;
  // lightGuessTotal where the path last picked a light, for when its bounce
  // from there hits one
  var bounceTotal = 0.;
  // lightGuessTotal along the current ray, for equiangular sampling
  var rayTotal = 0.;
  // Which glass ball the path is inside, or -1
  var inside = -1;

  for (var depth = 0; depth < 100; depth++) {
    // In 32-bit floats, each new direction built from the last one is a bit
    // off unit length, and that compounds over bounces. Even 0.3% too long
    // makes a glossy lobe like cos ^ 2000 overflow to infinity.
    d = normalize(d);
    let hit = intersect(o, d);
    // Saved, since shadow rays change these
    let end = hitDist;
    let tri = hitTriangle;
    let bary = hitBary;
    if (seenByCamera) { cameraDist += end; }
    if (depth == 0) { firstHit = select(NONE, u32(hit), hit >= 0); }
    if (!guided && hit >= 0) {
      let g = objects[u32(hit)];
      var gn = g.normalShape.xyz;
      if (i32(g.normalShape.w) == SPHERE) { gn = normalize(o + d * end - g.centerRadius.xyz); }
      if (i32(g.normalShape.w) == TEAPOT) { gn = teapotNormal(g, tri, bary, true); }
      guideNormal = faceForward(gn, d, gn);
      // Lights are far brighter than any surface color; their hue will do
      guideAlbedo = g.colorMaterial.rgb / max(1., peak(g.colorMaterial.rgb));
      guideDepth = cameraDist;
      // Through mirrors, but not glass: whether a path through glass
      // reflects or refracts, and which way its wavelength bends, is random,
      // so what's behind it would be a noisy guide
      guided = !isSmooth(u32(hit)) || i32(g.colorMaterial.w) == GLASS;
    }
    // Fog fills the scene, out to its farthest surfaces, not all of space: a
    // ray that hits nothing has left it. Otherwise rays escaping an open
    // scene would wander on through endless fog, far from any light, which
    // took most of the time in foggy scenes and added nothing visible.
    let foggy = params.fogDensity > 0. && hit >= 0;
    let fogLit = foggy && params.sampling != 2u && params.lightCount > 0u;
    // Only on rays the camera sees directly, where the glow around lights
    // shows the most. Later bounces aren't worth the extra shadow ray.
    let equiangular = fogLit && seenByCamera;

    // Direct light on the fog along this ray, at a distance picked by
    // equiangular sampling. Scattering in the fog below finds it too, so
    // the two are weighted by how likely each was to pick that distance
    // (with that light): equiangular wins near small lights, and scattering
    // in dense fog, where light doesn't get far.
    if (equiangular) {
      let u = rand2();
      rayTotal = lightGuessTotal(o, d, true);
      let light = pickLight(o, d, true, u.x, rayTotal);
      let eq = sampleEquiangular(o, d, end, light, u.y);
      let p = o + d * eq.x;
      let ls = sampleLight(p, light);
      let visible = lightVisibility(p, ls, light);
      if (any(visible > vec3f(0.))) {
        let pick = lightPickProb(p, vec3f(0.), false, light, lightGuessTotal(p, vec3f(0.), false));
        let transmittance = exp(-fogDensities() * eq.x);
        let pdf = lightPickProb(o, d, true, light, rayTotal) * eq.y;
        let scatterPdf = fogScatterPdf(transmittance) * pick;
        var weight = powerHeuristic(pdf, scatterPdf);
        let ph = phase(d, ls.xyz);
        if (params.sampling == 0u) { weight *= powerHeuristic(pick / ls.w, ph); }
        let scattered = transmittance * fogDensities() * FOG_ALBEDO;
        let c = through * emitted(light, ls.xyz) * scattered * visible * (ph * weight * ls.w / pdf);
        color += tint * c * select(indirectScale(c), 1., seenByCamera);
      }
    }

    // Fog: the ray scatters after a random distance, sooner in denser fog.
    // If that's before what it hit, it scatters instead of getting there.
    // With blue fog, each channel has its own density; the distance is
    // picked using one of them at random, and the throughput corrects for
    // how likely the others were to stop there or get past it.
    var fogDist = 1e30;
    if (foggy) {
      let u = rand2();
      let densities = fogDensities();
      let density = densities[min(u32(u.y * 3.), 2u)];
      fogDist = -log(1. - u.x) / density;
      // The max()es keep it from being 0 / 0, which is NaN, when so little
      // light gets that far that it rounds to 0 in every channel
      if (fogDist < end) {
        let transmittance = exp(-densities * fogDist);
        through *= densities * transmittance / max(fogScatterPdf(transmittance), 1e-30);
      } else {
        let transmittance = exp(-densities * end);
        through *= transmittance / max(dot(transmittance, vec3f(1. / 3.)), 1e-30);
      }
    }
    through *= glassTransmittance(inside, min(fogDist, end));
    if (fogDist < end) {
      // Fog absorbs some light. After a few bounces, end the path with that
      // probability instead, so survivors don't get dimmer.
      if (depth < 5) {
        through *= FOG_ALBEDO;
      } else if (rand() >= FOG_ALBEDO) {
        break;
      }
      let p = o + d * fogDist;

      // Direct light, as for diffuse surfaces below, weighted against the
      // equiangular sample above if there was one. Fog scatters light evenly
      // in all directions.
      if (fogLit) {
        bounceTotal = lightGuessTotal(p, vec3f(0.), false);
        let light = pickLight(p, vec3f(0.), false, rand2().x, bounceTotal);
        let pick = lightPickProb(p, vec3f(0.), false, light, bounceTotal);
        let ls = sampleLight(p, light);
        let visible = lightVisibility(p, ls, light);
        if (any(visible > vec3f(0.))) {
          var weight = 1.;
          if (equiangular) {
            let scatterPdf = fogScatterPdf(exp(-fogDensities() * fogDist)) * pick;
            let eqPdf = lightPickProb(o, d, true, light, rayTotal) * equiangularPdf(o, d, end, light, fogDist);
            weight = powerHeuristic(scatterPdf, eqPdf);
          }
          let ph = phase(d, ls.xyz);
          if (params.sampling == 0u) { weight *= powerHeuristic(pick / ls.w, ph); }
          let c = through * emitted(light, ls.xyz) * visible * (ph * weight * ls.w / pick);
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: scatter in a random direction. Its density equals
      // the phase function, so the throughput is unchanged.
      let next = samplePhase(d);
      bouncePdf = phase(d, next);
      seenByCamera = false;
      guided = true;
      o = p;
      d = next;
      continue;
    }

    if (hit < 0) { break; }
    let s = u32(hit);
    let shape = objects[s];
    let sColor = shape.colorMaterial.rgb;
    let material = i32(shape.colorMaterial.w);

    if (material == LIGHT) {
      var w = 1.;
      if (bouncePdf > 0.) { w = bounceLightWeight(o, d, end, bouncePdf, s, bounceTotal); }
      var e = emitted(s, d) * w * through;
      if (seenByCamera) {
        // The light is far brighter than the screen can show. Clamping it
        // to the screen's brightest here, before pixel samples are averaged,
        // lets its edges antialias; otherwise a pixel 1% covered by the
        // light shows at full brightness. Paths that got here by random
        // choices clamp higher, to keep the boost that makes up for the
        // paths that went elsewhere. Otherwise a light behind glass, which
        // only about half of the paths reach, would average out too dim.
        // The whole color is scaled down, so it keeps its hue; clamping
        // each channel would turn colored lights white.
        let blur = blurArea(direction, cameraDist);
        // But tone mapping washes colors far brighter than white out toward
        // white, and the clamp would stop a light from ever getting that
        // bright, so its reflections in glass would stay deep red or blue,
        // darker than what's around them. So wash it out first, by how
        // bright it really is, spread over the pixels it's blurred across.
        let unclamped = e;
        if (params.toneMap != 0u) {
          e = mix(e, vec3f(peak(e)), washOut(peak(applyContrast(e * params.exposure / blur))));
        }
        let limit = params.maxBrightness * blur / choiceProb;
        let kept = min(1., limit / peak(e));
        color += tint * e * kept;
        clamped += tint * unclamped * (1. - kept);
      } else {
        color += tint * e * indirectScale(e);
      }
      break; // lights don't reflect anything
    }

    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      let q = min(0.95, peak(through));
      if (rand() >= q) { break; }
      through /= q;
      choiceProb *= q;
    }

    let p = o + d * end;
    var n = shape.normalShape.xyz;
    // The real surface's normal, which decides which side light is on.
    // Teapots' triangles are flat, but n is the curved patches' they were
    // cut from, for shading.
    var facet = n;
    if (i32(shape.normalShape.w) == SPHERE) {
      n = normalize(p - shape.centerRadius.xyz);
      facet = n;
    } else if (i32(shape.normalShape.w) == TEAPOT) {
      n = teapotNormal(shape, tri, bary, true);
      facet = teapotNormal(shape, tri, bary, false);
    }
    // Normals facing the side the ray came from
    let into = dot(facet, d) < 0.;
    let nl = select(-facet, facet, into);
    let smoothNl = select(-n, n, into);

    if (!isSmooth(s)) {
      // Bumps tilt the normal that diffuse shading sees, ns. nl stays the
      // real surface's, which light can't go through. Glossy reflections
      // ignore the bumps: a coat of gloss smooths them over, and on glossy
      // surfaces they'd look like hammered metal.
      // Later bounces skip them, since they're blurred out by then and the
      // noise is slow.
      var ns = smoothNl;
      if (depth < 2 && params.detail > 0.) { ns = bumpNormal(smoothNl, p); }
      var bsdf: vec3f;
      // Which light to aim at, and whether to bounce off the glossy coat
      let choices = rand2();

      // Direct light: aim a ray at a light rather than waiting for a random
      // bounce to stumble into one.
      if (params.sampling != 2u && params.lightCount > 0u) {
        bounceTotal = lightGuessTotal(p, vec3f(0.), false);
        let light = pickLight(p, vec3f(0.), false, choices.x, bounceTotal);
        let pick = lightPickProb(p, vec3f(0.), false, light, bounceTotal);
        let ls = sampleLight(p, light);
        let l = ls.xyz;
        let cosSurface = dot(l, ns);
        // Only counts if the light is in front of this surface, and nothing
        // is in the way
        var visible = vec3f(0.);
        if (cosSurface > 0. && dot(l, nl) > 0.) { visible = lightVisibility(p + nl * EPSILON, ls, light); }
        if (any(visible > vec3f(0.))) {
          // radiance * BSDF * cos(theta) / pdf, where the pdf is the chance
          // of picking this light over the cone's solid angle
          let pdf = evalSurface(s, ns, smoothNl, -d, l, &bsdf);
          var weight = 1.;
          if (params.sampling == 0u) { weight = powerHeuristic(pick / ls.w, pdf); }
          let c = through * emitted(light, l) * bsdf * visible * (weight * cosSurface * ls.w / pick);
          // Light reaching the first surface the camera sees is direct light
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      let next = sampleSurface(s, ns, smoothNl, -d, choices.y);
      let cosTheta = dot(next, ns);
      // A glossy lobe, or a bump, pointed it into the surface
      if (cosTheta <= 0. || dot(next, nl) <= 0.) { break; }
      bouncePdf = evalSurface(s, ns, smoothNl, -d, next, &bsdf);
      // Far out in a tight lobe, the density underflows to 0, and 0 / 0
      // would be NaN. A direction that's never picked carries no light.
      if (bouncePdf <= 0.) { break; }
      through *= bsdf * cosTheta / bouncePdf;
      seenByCamera = false;
      d = next;
    } else {
      bouncePdf = 0.;
      // A smudge is a thin greasy film. Most light still reflects or
      // refracts sharply, but some scatters a little off course, so through
      // a smudge things look hazy, and bright ones have a soft glow. So
      // where it's smudged, some samples see the surface tilted at random,
      // mostly by a little. Later bounces skip it, like bumps: the haze is
      // too faint to see in a reflection of a reflection, and it's slow.
      // The smudge is only worked out when the random number is low enough
      // that it could be, since smudge() <= detail.
      var sn = n;
      let hazy = rand();
      if (depth < 3 && hazy < SMUDGE_HAZE * params.detail && hazy < SMUDGE_HAZE * smudge(p)) {
        sn = directionAround(n, pow(rand(), 1. / (SMUDGE_SHININESS + 1.)), 2. * PI * rand());
      }
      let snl = select(-sn, sn, into);
      var next = reflect(d, sn);
      var reflected = true;
      // Mirrors reflect their color, whiter toward grazing angles. Glass
      // doesn't tint its reflections; it colors light inside it, by
      // glassTransmittance.
      if (material == MIRROR) { through *= fresnelMetal(sColor, -dot(d, snl)); }

      if (material == GLASS) {
        var index = 1.5;
        if (wavelength > 0.) { index = glassIndex(wavelength); }
        let t = refract(d, snl, select(index, 1. / index, into));
        // Otherwise total internal reflection: keep the mirror direction
        if (any(t != vec3f(0.))) {
          // Fresnel: how much reflects vs refracts
          let reflectance = fresnelDielectric(-dot(d, snl), select(1. / index, index, into));
          // Pick one at random, with probability P of reflecting, and
          // divide by that probability to stay unbiased
          let P = 0.25 + 0.5 * reflectance;
          if (rand() < P) {
            through *= reflectance / P;
            choiceProb *= P;
          } else {
            next = t;
            reflected = false;
            through *= (1. - reflectance) / (1. - P);
            choiceProb *= 1. - P;
            // Now inside the ball or teapot, or back out. Glass plates are
            // too thin to be inside.
            if (i32(shape.normalShape.w) != PLATE) { inside = select(-1, i32(s), into); }
            // Dispersion: the first time the path refracts, it picks a
            // wavelength to follow, and bends by that wavelength's index
            // instead. Reflection doesn't depend on wavelength (much), so
            // paths that only reflect skip this, and the noise it adds.
            if (wavelength == 0. && params.dispersion > 0.) {
              wavelength = mix(MIN_WAVELENGTH, MAX_WAVELENGTH, rand());
              tint = wavelengthColor(wavelength);
              let i = glassIndex(wavelength);
              let bent = refract(d, snl, select(i, 1. / i, into));
              // Rarely, a wavelength that bends more reflects entirely
              // where yellow wouldn't
              next = select(reflect(d, sn), bent, any(bent != vec3f(0.)));
              reflected = all(bent == vec3f(0.));
            }
          }
        }
      }
      // At grazing angles, a smudge can tilt the surface enough to send a
      // reflection into it, or a refraction back out. Flip it back across.
      if ((dot(next, nl) > 0.) != reflected) { next -= 2. * dot(next, nl) * nl; }
      d = next;
    }
    // Start the next ray a hair off the surface, on the side it's leaving
    // toward. From p itself, rounding can put it just inside a sphere, where
    // a grazing ray hits the sphere again from the inside and gets trapped,
    // leaving dark specks along the edges of mirror and glass balls.
    o = p + nl * select(-EPSILON, EPSILON, dot(d, nl) > 0.);
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
  var prevSq = vec4f(0.);
  var prevGlow = vec4f(0.);
  var prevAlbedo = vec4f(0.);
  var prevNormalDepth = vec4f(0.);
  if (params.frame > 0u) {
    prev = sums[index];
    prevSq = sqSums[index];
    prevGlow = glowSums[index];
    prevAlbedo = albedoSums[index];
    prevNormalDepth = normalDepthSums[index];
  }
  var glowSum = vec3f(0.);
  var albedoSum = vec3f(0.);
  var normalDepthSum = vec4f(0.);

  var sum = vec3f(0.);
  var sqSum = vec3f(0.);
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
    clamped = vec3f(0.);
    // Until it hits something, it's looking at empty space, far away
    guided = false;
    guideAlbedo = vec3f(0.);
    guideNormal = -normalize(dir);
    guideDepth = 1e6;
    let c = trace(o, normalize(dir));
    albedoSum += guideAlbedo;
    normalDepthSum += vec4f(guideNormal, min(guideDepth, 1e6));
    // Rarely, rounding makes a sample NaN (in glass, somewhere), which would
    // stick in the sum forever, and the lens glow would spread it into a
    // big black square. NaN fails every comparison, so this drops it.
    if (all(abs(c) < vec3f(1e30)) && all(abs(clamped) < vec3f(1e30))) {
      sum += c;
      sqSum += c * c;
      glowSum += clamped;
    }
  }
  sums[index] = prev + vec4f(sum, f32(params.samplesPerFrame));
  sqSums[index] = prevSq + vec4f(sqSum, 0.);
  glowSums[index] = prevGlow + vec4f(glowSum, 0.);
  albedoSums[index] = vec4f(prevAlbedo.rgb + albedoSum, select(-1., f32(firstHit), firstHit != NONE));
  normalDepthSums[index] = prevNormalDepth + normalDepthSum;
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
@group(0) @binding(2) var<storage, read> sqSums: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> tiles: array<u32>;
/** How many tiles are still going, for main.js to show and to know when to stop */
@group(0) @binding(4) var<storage, read_write> activeTiles: atomic<u32>;

/** Every tile gets at least this many samples before its noise is trusted */
const MIN_SAMPLES = 32.;

/** Each pixel's squared noise */
var<workgroup> noise: array<f32, TILE * TILE>;


@compute @workgroup_size(TILE, TILE)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) local: u32) {
  var n = 0.;
  if (id.x < params.width && id.y < params.height) {
    let s = sums[id.y * params.width + id.x];
    let count = max(s.w, 1.);
    let color = s.rgb / count;
    let variance = max(vec3f(0.), sqSums[id.y * params.width + id.x].rgb / count - color * color);
    // Standard error: how far the average of the samples is likely to be off
    let stdErr = sqrt(variance / count);
    // As displayed. The display scales a color as a whole, which keeps its
    // hue, so near white, where it squeezes brightness, differences in hue
    // still show. So scale the noise by how much it scales this color, then
    // apply gamma, which stretches dark values.
    let c = shown(color);
    let err = stdErr * brightness(c) / max(brightness(color), 1e-6);
    let e = pow(c + err, vec3f(1. / 2.2)) - pow(max(c - err, vec3f(0.)), vec3f(1. / 2.2));
    // Averaged over the channels
    n = dot(e, e) / 3.;
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

/**
 * Lens glow. Real lenses, and eyes, scatter a little of the light coming
 * through them into a wide halo. It's everywhere, but only shows around
 * things far brighter than what's near them: lights, and their glints. This
 * blurs the image, at one texel per tile since the glow is soft anyway, by
 * a narrow and a wide Gaussian, for the display shader to mix in.
 */
export const glowShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
@group(0) @binding(2) var<storage, read> glowSums: array<vec4f>;
/** Each tile's average, with the light trace clamped away put back */
@group(0) @binding(3) var<storage, read_write> small: array<vec4f>;
/** small blurred along rows: narrow and wide, two per texel */
@group(0) @binding(4) var<storage, read_write> rows: array<vec4f>;
/** The glow: small blurred both ways, half narrow and half wide */
@group(0) @binding(5) var<storage, read_write> glow: array<vec4f>;

/** The two blurs' widths, in texels: about 12 and 64 pixels */
const NARROW = 1.5;
const WIDE = 8.;
/** How far the blurs reach, in texels: past this, the wide one is ~0 */
const REACH = 24;

@compute @workgroup_size(8, 8)
fn downsample(@builtin(global_invocation_id) id: vec3u) {
  let size = glowSize();
  if (any(id.xy >= size)) { return; }
  var sum = vec3f(0.);
  var count = 0.;
  for (var y = id.y * TILE; y < min((id.y + 1u) * TILE, params.height); y++) {
    for (var x = id.x * TILE; x < min((id.x + 1u) * TILE, params.width); x++) {
      let i = y * params.width + x;
      let s = sums[i];
      sum += (s.rgb + glowSums[i].rgb) / max(s.w, 1.);
      count += 1.;
    }
  }
  small[id.y * size.x + id.x] = vec4f(sum / count, 0.);
}

/**
 * A Gaussian's weight at x, tapered to 0 at REACH. Lights are so bright that
 * even the Gaussian's far tail shows, so cutting it off would leave an edge.
 */
fn gaussian(x: f32, width: f32) -> f32 {
  let taper = 1. - x * x / f32(REACH * REACH);
  return exp(-0.5 * x * x / (width * width)) * taper * taper;
}

@compute @workgroup_size(8, 8)
fn blurRows(@builtin(global_invocation_id) id: vec3u) {
  let size = glowSize();
  if (any(id.xy >= size)) { return; }
  var narrow = vec4f(0.);
  var wide = vec4f(0.);
  for (var k = -REACH; k <= REACH; k++) {
    let x = i32(id.x) + k;
    if (x < 0 || x >= i32(size.x)) { continue; }
    // Weights in w, so texels off the edge don't count
    let c = vec4f(small[id.y * size.x + u32(x)].rgb, 1.);
    narrow += c * gaussian(f32(k), NARROW);
    wide += c * gaussian(f32(k), WIDE);
  }
  let i = id.y * size.x + id.x;
  rows[2u * i] = narrow / narrow.w;
  rows[2u * i + 1u] = wide / wide.w;
}

@compute @workgroup_size(8, 8)
fn blurColumns(@builtin(global_invocation_id) id: vec3u) {
  let size = glowSize();
  if (any(id.xy >= size)) { return; }
  var narrow = vec4f(0.);
  var wide = vec4f(0.);
  for (var k = -REACH; k <= REACH; k++) {
    let y = i32(id.y) + k;
    if (y < 0 || y >= i32(size.y)) { continue; }
    let i = u32(y) * size.x + id.x;
    narrow += vec4f(rows[2u * i].rgb, 1.) * gaussian(f32(k), NARROW);
    wide += vec4f(rows[2u * i + 1u].rgb, 1.) * gaussian(f32(k), WIDE);
  }
  glow[id.y * size.x + id.x] = vec4f(mix(narrow.rgb / narrow.w, wide.rgb / wide.w, 0.5), 0.);
}`;

/**
 * The denoiser: an edge-avoiding à-trous wavelet filter, guided by variance,
 * following "Spatiotemporal Variance-Guided Filtering" (Schied et al.), minus
 * the temporal part, since the image here holds still while samples add up.
 *
 * It averages each pixel with its neighbors, but only ones that saw the same
 * surface (by trace's guides: color, normal and distance), and whose
 * brightness differs by no more than the noise could explain. Five passes,
 * each reaching twice as far as the last, blur up to 62 pixels away. It knows
 * each pixel's noise exactly, from its samples' spread, so as samples add up
 * and the noise fades, it stops averaging, and the result becomes the plain
 * average of the samples. It only changes what's shown: adaptive sampling,
 * the lens glow and the sums all use the samples themselves.
 */
export const denoiseShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
@group(0) @binding(2) var<storage, read> sqSums: array<vec4f>;
@group(0) @binding(3) var<storage, read> albedoSums: array<vec4f>;
@group(0) @binding(4) var<storage, read> normalDepthSums: array<vec4f>;
/** Per pixel: the guide's normal, and its distance in w */
@group(0) @binding(5) var<storage, read_write> normalDepth: array<vec4f>;
/** Per pixel: the guide's color, and in w how fast its distance changes per pixel */
@group(0) @binding(6) var<storage, read_write> albedoSlope: array<vec4f>;
/** How many pixels apart this pass's taps are */
@group(0) @binding(7) var<uniform> stride: i32;
/** Per pixel: color, and in w the variance of its brightness */
@group(0) @binding(8) var<storage, read> source: array<vec4f>;
@group(0) @binding(9) var<storage, read_write> result: array<vec4f>;

/** How many standard deviations of noise a brightness difference can be */
const SIGMA_BRIGHTNESS = 4.;
/** How sharply normals must match: cos(angle) ^ this */
const SIGMA_NORMAL = 64.;
/** How far, in multiples of the expected change, distances can differ */
const SIGMA_DEPTH = 2.;
/** How far guide colors can differ */
const SIGMA_ALBEDO = 0.1;

fn inImage(p: vec2i) -> bool {
  return all(p >= vec2i(0)) && p.x < i32(params.width) && p.y < i32(params.height);
}

fn pixelIndex(p: vec2i) -> u32 {
  return u32(p.y) * params.width + u32(p.x);
}

fn meanColor(p: vec2i) -> vec3f {
  let s = sums[pixelIndex(p)];
  return s.rgb / max(s.w, 1.);
}

fn meanDepth(p: vec2i) -> f32 {
  let i = pixelIndex(p);
  return normalDepthSums[i].w / max(sums[i].w, 1.);
}

/**
 * How much a pixel's distance changes per pixel across the image: along
 * each axis, the smaller of the changes to either side, so an edge, where
 * one side jumps, doesn't count
 */
fn depthSlope(p: vec2i, depth: f32) -> f32 {
  var slope = vec2f(0.);
  for (var axis = 0; axis < 2; axis++) {
    var change = 1e30;
    for (var side = -1; side <= 1; side += 2) {
      var q = p;
      q[axis] += side;
      if (inImage(q)) { change = min(change, abs(meanDepth(q) - depth)); }
    }
    slope[axis] = select(0., change, change < 1e30);
  }
  return length(slope);
}

/** Averages the samples and guides, and estimates each pixel's noise */
@compute @workgroup_size(8, 8)
fn prepare(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (!inImage(p)) { return; }
  let i = pixelIndex(p);
  let s = sums[i];
  let count = max(s.w, 1.);
  let color = s.rgb / count;
  let nd = normalDepthSums[i] / count;
  normalDepth[i] = vec4f(nd.xyz / max(length(nd.xyz), 1e-6), nd.w);
  albedoSlope[i] = vec4f(albedoSums[i].rgb / count, depthSlope(p, nd.w));
  // The variance of the average's brightness: the samples' variance over
  // their count, in each channel, weighted like brightness
  let channels = max(vec3f(0.), sqSums[i].rgb / count - color * color) / count;
  var variance = brightness(channels);
  // With only a few samples, their spread says little, so use how much the
  // averages of the pixels around vary instead
  if (s.w < 8.) {
    var total = 0.;
    var totalSq = 0.;
    var n = 0.;
    for (var y = -2; y <= 2; y++) {
      for (var x = -2; x <= 2; x++) {
        let q = p + vec2i(x, y);
        if (!inImage(q)) { continue; }
        let b = brightness(meanColor(q));
        total += b;
        totalSq += b * b;
        n += 1.;
      }
    }
    // Can come out a hair below 0 from rounding, next to bright lights
    variance = max(variance, max(totalSq / n - (total / n) * (total / n), 0.));
  }
  // A light's brightness squared can overflow to infinity, and infinity
  // minus infinity is NaN, which the blur would spread into a black blotch.
  // Either way it means very noisy. (NaN fails every comparison.)
  if (!(variance < 1e30)) { variance = 1e30; }
  result[i] = vec4f(color, variance);
}

/** One pass of the filter: 5 × 5 taps, stride pixels apart */
@compute @workgroup_size(8, 8)
fn blur(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (!inImage(p)) { return; }
  let i = pixelIndex(p);
  let center = source[i];
  let guide = normalDepth[i];
  let albedo = albedoSlope[i];
  // The variance, a little blurred, since one pixel's estimate is noisy
  var variance = 0.;
  var weights = 0.;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let q = p + vec2i(x, y);
      if (!inImage(q)) { continue; }
      let w = select(0.5, 1., x == 0) * select(0.5, 1., y == 0);
      variance += w * source[pixelIndex(q)].w;
      weights += w;
    }
  }
  let noise = SIGMA_BRIGHTNESS * sqrt(variance / weights) + 1e-10;
  let b = brightness(center.rgb);

  // B3 spline weights, the usual for à-trous
  var kernel = array(1. / 16., 1. / 4., 3. / 8., 1. / 4., 1. / 16.);
  var sum = vec4f(0.);
  var weightSum = 0.;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let q = p + vec2i(x, y) * stride;
      if (!inImage(q)) { continue; }
      let j = pixelIndex(q);
      let c = source[j];
      let g = normalDepth[j];
      let a = albedoSlope[j].rgb;
      let offset = length(vec2f(f32(x), f32(y))) * f32(stride);
      var w = kernel[x + 2] * kernel[y + 2] *
        pow(max(dot(guide.xyz, g.xyz), 0.), SIGMA_NORMAL) *
        exp(-abs(guide.w - g.w) / (SIGMA_DEPTH * albedo.w * offset + 1e-3 * guide.w + 1e-6) -
          abs(b - brightness(c.rgb)) / noise -
          length(albedo.rgb - a) / SIGMA_ALBEDO);
      // A pixel always matches itself, even if its normal averaged to zero
      if (x == 0 && y == 0) { w = kernel[2] * kernel[2]; }
      // The variance of a weighted average goes as the weights squared
      sum += vec4f(c.rgb * w, c.w * w * w);
      weightSum += w;
    }
  }
  // The center always counts, so weightSum > 0
  result[i] = vec4f(sum.rgb / weightSum, sum.w / (weightSum * weightSum));
}`;

export const displayShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
@group(0) @binding(2) var<storage, read> tiles: array<u32>;
@group(0) @binding(3) var<storage, read> glow: array<vec4f>;
/** The denoiser's result: color in rgb */
@group(0) @binding(4) var<storage, read> denoised: array<vec4f>;
/** In w, the object the camera sees at each pixel; see albedoSums in traceShader */
@group(0) @binding(5) var<storage, read> albedoSums: array<vec4f>;

fn isSelected(pos: vec2i) -> bool {
  return albedoSums[u32(pos.y) * params.width + u32(pos.x)].w == f32(params.selected);
}

/** Whether pixel pos is on the edge of the selected object */
fn onOutline(pos: vec2i) -> bool {
  let inside = isSelected(pos);
  for (var k = 0; k < 4; k++) {
    // Two pixels out, so it shows on high resolution screens
    let q = pos + array(vec2i(2, 0), vec2i(-2, 0), vec2i(0, 2), vec2i(0, -2))[k];
    if (any(q < vec2i(0)) || q.x >= i32(params.width) || q.y >= i32(params.height)) { continue; }
    if (isSelected(q) != inside) { return true; }
  }
  return false;
}

/** The lens glow at pixel position pos, blending the four nearest texels */
fn glowAt(pos: vec2f) -> vec3f {
  let size = vec2i(glowSize());
  // Texel centers are at the middle of each tile
  let q = pos / f32(TILE) - 0.5;
  let f = q - floor(q);
  let a = clamp(vec2i(floor(q)), vec2i(0), size - 1);
  let b = clamp(vec2i(floor(q)) + 1, vec2i(0), size - 1);
  let top = mix(glow[a.y * size.x + a.x].rgb, glow[a.y * size.x + b.x].rgb, f.x);
  let bottom = mix(glow[b.y * size.x + a.x].rgb, glow[b.y * size.x + b.x].rgb, f.x);
  return mix(top, bottom, f.y);
}

// One triangle that covers the whole screen
@vertex
fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(corners[i], 0., 1.);
}

@fragment
fn fragment(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let i = u32(pos.y) * params.width + u32(pos.x);
  let s = sums[i];
  var linear = s.rgb / max(s.w, 1.);
  if (params.denoise == 1u) { linear = denoised[i].rgb; }
  // The lens spreads that fraction of the light into the glow
  if (params.glow > 0.) { linear = mix(linear, glowAt(pos.xy), params.glow); }
  // Vignetting: light reaching the edges of the image comes in at an angle,
  // so it's spread over more of the sensor, and the lens looks smaller from
  // there. Together, brightness falls off as cos^4 of the angle.
  let screen = pos.xy / vec2f(f32(params.width), f32(params.height)) - 0.5;
  // Off the center of the image plane, 1 unit in front of the camera
  let offset = params.camRight * screen.x + params.camUp * screen.y;
  let tanSq = dot(offset, offset);
  linear *= mix(1., 1. / ((1. + tanSq) * (1. + tanSq)), params.vignette);
  var color = shown(linear);
  if (params.selected != NONE && onOutline(vec2i(pos.xy))) {
    color = mix(color, vec3f(1., 0.75, 0.2), 0.8);
  }
  if (params.showTiles == 1u && tiles[tileIndex(vec2u(pos.xy))] == 1u) {
    color = mix(color, vec3f(1., 0., 0.), 0.3);
  }
  // The canvas takes sRGB-encoded values. In HDR, values over 1 are brighter
  // than white; in SDR the canvas clamps them.
  return vec4f(pow(color, vec3f(1. / 2.2)), 1.);
}`;
