import {common} from './common.js';

/**
 * Shows the image: the samples' average (or the denoiser's), the lens glow
 * and vignette, the tone curve, and the selection's outline.
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
