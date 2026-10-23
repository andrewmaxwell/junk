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
    let variance = max(vec3f(0.), sqGlowSums[2u * (id.y * params.width + id.x)].rgb / count - color * color);
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
