import {common} from './common.js';

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
/** Squared sums and clamped light, two per pixel; see sqGlowSums in shaders/trace.js */
@group(0) @binding(2) var<storage, read> sqGlowSums: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> tiles: array<u32>;
/** How many tiles are still going, for the renderer to show and to know when to stop */
@group(0) @binding(4) var<storage, read_write> activeTiles: atomic<u32>;
/** Per tile: how many frames it has been traced in since the last restart */
@group(0) @binding(5) var<storage, read_write> tileFrames: array<u32>;

const PI = 3.14159265359;

/** Every tile gets at least this many samples before its noise is trusted */
const MIN_SAMPLES = 32.;

/**
 * And with photons, this many frames: each frame's samples gather from the
 * same photons, so where light from them is rare, a tile's first few frames
 * could all have missed it, and look smooth and black
 */
const MIN_FRAMES = 32u;

/** The tile's frames so far, which every thread reads */
var<workgroup> frames: u32;

/** Each pixel's squared noise */
var<workgroup> noise: array<f32, TILE * TILE>;


@compute @workgroup_size(TILE, TILE)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) local: u32) {
  if (local == 0u) { frames = select(tileFrames[tileIndex(id.xy)], 0u, params.frame == 0u); }
  workgroupBarrier();
  var n = 0.;
  if (id.x < params.width && id.y < params.height) {
    let i = id.y * params.width + id.x;
    let s = sums[i];
    let count = max(s.w, 1.);
    let color = s.rgb / count;
    let sq = sqGlowSums[2u * i];
    let variance = max(vec3f(0.), sq.rgb / count - color * color);
    // Standard error: how far the average of the samples is likely to be off.
    // Light from photons also varies from frame to frame, by more than the
    // samples within a frame show, so that's added, as the standard error of
    // the frames' averages.
    // Where photons land only now and then, frames that all missed look
    // smooth and black, so the error is at least one photon's worth: what
    // one landing on white paint would add, over the frames so far.
    var photonErrSq = 0.;
    if (params.pairCount > 0u && frames > 0u) {
      let f = f32(frames);
      let mean = sqGlowSums[2u * i + 1u].w / f;
      let r = params.photonRadius;
      let one = params.photonPower / (PI * PI * r * r) / f;
      photonErrSq = max(max(0., sq.w / f - mean * mean) / f, one * one);
    }
    let stdErr = sqrt(variance / count + photonErrSq);
    // As displayed. The display scales a color as a whole, which keeps its
    // hue, so near white, where it squeezes brightness, differences in hue
    // still show. So scale the noise by how much it scales this color, then
    // apply gamma, which stretches dark values. Measured at the color plus
    // its error: at black, how much it scales black says nothing.
    let c = shown(color);
    let reach = color + stdErr;
    let err = stdErr * brightness(shown(reach)) / max(brightness(reach), 1e-12);
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
    (params.pairCount > 0u && frames < MIN_FRAMES) ||
    rms > params.noiseThreshold;
  tiles[tileIndex(id.xy)] = u32(refining);
  tileFrames[tileIndex(id.xy)] = frames + u32(refining);
  if (refining) { atomicAdd(&activeTiles, 1u); }
}`;
