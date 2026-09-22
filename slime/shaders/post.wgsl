// Tone maps the linear scene to the screen, with dithering.
@group(0) @binding(1) var scene: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn composite(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let color = textureLoad(scene, vec2i(pos.xy), 0).rgb;
  // Tone map so dense areas glow toward white instead of clipping.
  let mapped = 1.0 - exp(-color * 4.0);
  // Dither to hide banding in dark gradients.
  let noise = fract(sin(dot(pos.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(mapped + (noise - 0.5) / 255.0, 1.0);
}
