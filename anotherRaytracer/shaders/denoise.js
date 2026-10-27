import {common} from './common.js';

/**
 * The denoiser: an edge-avoiding à-trous wavelet filter, guided by variance,
 * following "Spatiotemporal Variance-Guided Filtering" (Schied et al.), minus
 * most of the temporal part: the image holds still while samples add up, so
 * only moving needs it (see reproject).
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
/** Squared sums and clamped light, two per pixel; see sqGlowSums in shaders/trace.js */
@group(0) @binding(2) var<storage, read> sqGlowSums: array<vec4f>;
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
/** Per pixel: the last frame's image (see reproject), and in w how many samples it's worth */
@group(0) @binding(10) var<storage, read> history: array<vec4f>;
/** The last frame's normalDepth */
@group(0) @binding(11) var<storage, read> historyGuide: array<vec4f>;
/** Per pixel: history moved to this view at the last restart, and in w its samples' worth */
@group(0) @binding(12) var<storage, read_write> prior: array<vec4f>;
/** This frame's image, for history */
@group(0) @binding(13) var<storage, read_write> nextHistory: array<vec4f>;

struct Temporal {
  /** The camera history was seen from, like Params' */
  camPos: vec3f,
  /** 1 to move history into this view, as prior */
  reproject: u32,
  camForward: vec3f,
  /** How much prior counts, from 1 at a restart down to 0 */
  fade: f32,
  camRight: vec3f,
  camUp: vec3f,
}
@group(0) @binding(14) var<uniform> temporal: Temporal;

/** How many standard deviations of noise a brightness difference can be */
const SIGMA_BRIGHTNESS = 4.;
/**
 * The most samples history counts as. More is smoother while moving, but
 * lags further behind light that moves with the camera, like reflections.
 */
const HISTORY_SAMPLES = 8.;
/** How far a surface can be from where history saw it, as a fraction of its distance */
const HISTORY_DEPTH = 0.03;
/** How closely history's normal must match: the cosine of the angle between */
const HISTORY_NORMAL = 0.9;

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
  let channels = max(vec3f(0.), sqGlowSums[2u * i].rgb / count - color * color) / count;
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
}

/**
 * The last frame's image, seen from this frame's camera: where pixel p's
 * surface was in the last frame, blending the four pixels nearest, but only
 * ones that saw the same surface there (by distance and normal), so what
 * moving uncovers starts fresh. In w, how many samples it's worth.
 */
fn reprojected(p: vec2i) -> vec4f {
  let size = vec2f(f32(params.width), f32(params.height));
  let screen = vec2f((f32(p.x) + 0.5) / size.x - 0.5, 0.5 - (f32(p.y) + 0.5) / size.y);
  let d = normalize(params.camForward + params.camRight * screen.x + params.camUp * screen.y);
  let guide = normalDepth[pixelIndex(p)];
  let v = params.camPos + d * guide.w - temporal.camPos;
  let z = dot(v, temporal.camForward);
  if (z <= 0.) { return vec4f(0.); }
  let then = vec2f(
    dot(v, temporal.camRight) / dot(temporal.camRight, temporal.camRight),
    dot(v, temporal.camUp) / dot(temporal.camUp, temporal.camUp)) / z;
  let q = vec2f((then.x + 0.5) * size.x, (0.5 - then.y) * size.y) - 0.5;
  let a = vec2i(floor(q));
  let f = q - floor(q);
  let expected = length(v);
  var sum = vec4f(0.);
  var weights = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k % 2, k / 2);
    let t = a + o;
    if (!inImage(t)) { continue; }
    let j = pixelIndex(t);
    let g = historyGuide[j];
    if (abs(g.w - expected) > HISTORY_DEPTH * expected || dot(g.xyz, guide.xyz) < HISTORY_NORMAL) { continue; }
    let w = select(1. - f.x, f.x, o.x == 1) * select(1. - f.y, f.y, o.y == 1);
    sum += history[j] * w;
    weights += w;
  }
  // Only a sliver of a pixel matched: too little to trust
  if (weights < 0.1) { return vec4f(0.); }
  return vec4f(sum.rgb / weights, min(sum.w / weights, HISTORY_SAMPLES));
}

/**
 * Temporal accumulation, after prepare: while the camera moves, each frame
 * starts the samples over, with one each, so on its own the image would be
 * one sample deep and speckled. Instead, at each restart, the last frame's
 * image is moved to where its surfaces are now (prior), and averaged in as
 * the samples it's worth. It fades out by temporal.fade as new samples add
 * up, so once still, the image is the samples' own again.
 */
@compute @workgroup_size(8, 8)
fn reproject(@builtin(global_invocation_id) id: vec3u) {
  let p = vec2i(id.xy);
  if (!inImage(p)) { return; }
  let i = pixelIndex(p);
  if (temporal.reproject == 1u) { prior[i] = reprojected(p); }
  let before = prior[i];
  let count = max(sums[i].w, 1.);
  let weight = before.w * temporal.fade;
  let mean = result[i];
  let color = (mean.rgb * count + before.rgb * weight) / (count + weight);
  // Prior is worth weight samples like these, so the noise falls as if
  // there were that many more. But a rare bright sample stands out against
  // prior, and would show as a speck for many frames: as much as the
  // samples move the color away from prior counts as noise too, so the
  // filter smooths it away.
  let change = brightness(color - before.rgb);
  let variance = mean.w * count / (count + weight) + select(0., change * change, weight > 0.);
  result[i] = vec4f(color, variance);
  nextHistory[i] = vec4f(color, count + weight);
}`;
