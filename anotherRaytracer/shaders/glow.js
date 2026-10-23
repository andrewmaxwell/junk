import {common} from './common.js';

/**
 * Lens glow. Real lenses, and eyes, scatter a little of the light coming
 * through them into a wide halo. It's everywhere, but only shows around
 * things far brighter than what's near them: lights, and their glints. This
 * blurs the image, at one texel per tile since the glow is soft anyway, by
 * a narrow and a wide Gaussian, for the display shader to mix in.
 */
export const glowShader = /* wgsl */ `${common}
@group(0) @binding(1) var<storage, read> sums: array<vec4f>;
/** Squared sums and clamped light, two per pixel; see sqGlowSums in shaders/trace.js */
@group(0) @binding(2) var<storage, read> sqGlowSums: array<vec4f>;
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
      sum += (s.rgb + sqGlowSums[2u * i + 1u].rgb) / max(s.w, 1.);
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
