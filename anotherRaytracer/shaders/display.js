import {common} from './common.js';

/**
 * Shows the image: the samples' average (or the denoiser's), the lens's
 * color fringes, glow and vignette, the tone curve, film grain, and the
 * selection's outline.
 */
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

/** The image's color at pixel p, the samples' average or the denoiser's */
fn pixel(p: vec2i) -> vec3f {
  let q = clamp(p, vec2i(0), vec2i(i32(params.width), i32(params.height)) - 1);
  let i = u32(q.y) * params.width + u32(q.x);
  if (params.denoise == 1u) { return denoised[i].rgb; }
  let s = sums[i];
  return s.rgb / max(s.w, 1.);
}

/** The image's color at any position, blending the nearest four pixels */
fn imageAt(pos: vec2f) -> vec3f {
  let q = pos - 0.5;
  let a = vec2i(floor(q));
  let f = q - floor(q);
  let top = mix(pixel(a), pixel(a + vec2i(1, 0)), f.x);
  let bottom = mix(pixel(a + vec2i(0, 1)), pixel(a + vec2i(1, 1)), f.x);
  return mix(top, bottom, f.y);
}

/** Roughly normally distributed, the same for each pixel every frame */
fn grainAt(pos: vec2u) -> f32 {
  var h = pos.x * 1973u + pos.y * 9277u + 26699u;
  var sum = 0.;
  for (var k = 0u; k < 4u; k++) {
    h ^= h >> 16u;
    h *= 0x7feb352du;
    h ^= h >> 15u;
    h *= 0x846ca68bu;
    h ^= h >> 16u;
    sum += f32(h >> 8u) / 16777216.;
  }
  // Four uniform numbers sum to mean 2, variance 1 / 3
  return (sum - 2.) * 1.732;
}

// One triangle that covers the whole screen
@vertex
fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var corners = array(vec2f(-1., -1.), vec2f(3., -1.), vec2f(-1., 3.));
  return vec4f(corners[i], 0., 1.);
}

@fragment
fn fragment(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var linear = pixel(vec2i(pos.xy));
  // Chromatic aberration: a simple lens bends blue more than red, so it
  // makes slightly different sized images in each color, lined up at the
  // center and further apart toward the edges
  if (params.aberration > 0.) {
    let center = vec2f(f32(params.width), f32(params.height)) / 2.;
    let fromCenter = pos.xy - center;
    linear.r = imageAt(center + fromCenter * (1. + params.aberration)).r;
    linear.b = imageAt(center + fromCenter * (1. - params.aberration)).b;
  }
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
  // Film grain, or a sensor's noise: light arrives as photons, so how much
  // each pixel gets varies, by the square root of how much it gets on
  // average. Brightness on screen is about that to the power 1 / 2.2,
  // which makes the variation about the same at every brightness, so it's
  // added after encoding. In brightness, not color, as
  // photos are usually processed.
  if (params.grain > 0.) {
    let encoded = pow(max(color, vec3f(0.)), vec3f(1. / 2.2));
    color = pow(max(encoded + params.grain * grainAt(vec2u(pos.xy)), vec3f(0.)), vec3f(2.2));
  }
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
