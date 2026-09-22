// Glow and tone mapping: the scene is downsampled to quarter resolution,
// blurred, added back on top, hue rotated, tone mapped and dithered.
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
@group(0) @binding(3) var bloom: texture_2d<f32>; // only read by composite

struct Varyings {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Varyings {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return Varyings(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), vec2f(uv.x, 1.0 - uv.y));
}

fn tap(uv: vec2f) -> vec3f {
  return textureSample(src, linearSampler, uv).rgb;
}

// Four bilinear taps average the 4x4 source block under each output texel.
@fragment
fn downsample(in: Varyings) -> @location(0) vec4f {
  let t = 1.0 / vec2f(textureDimensions(src));
  let c = tap(in.uv + t * vec2f(-1.0, -1.0)) + tap(in.uv + t * vec2f(1.0, -1.0)) +
    tap(in.uv + t * vec2f(-1.0, 1.0)) + tap(in.uv + t * vec2f(1.0, 1.0));
  return vec4f(c / 4.0, 1.0);
}

// 9-tap Gaussian, with taps spread 2 texels apart for a wider glow.
fn blur(uv: vec2f, dir: vec2f) -> vec4f {
  var weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  let step = 2.0 * dir / vec2f(textureDimensions(src));
  var c = tap(uv) * weights[0];
  for (var i = 1; i < 5; i++) {
    c += (tap(uv + step * f32(i)) + tap(uv - step * f32(i))) * weights[i];
  }
  return vec4f(c, 1.0);
}

@fragment
fn blurH(in: Varyings) -> @location(0) vec4f { return blur(in.uv, vec2f(1.0, 0.0)); }

@fragment
fn blurV(in: Varyings) -> @location(0) vec4f { return blur(in.uv, vec2f(0.0, 1.0)); }

// Rotates a color around the gray axis, so grays (like food) are unchanged.
fn hueRotate(c: vec3f, angle: f32) -> vec3f {
  let k = vec3f(0.57735);
  return c * cos(angle) + cross(k, c) * sin(angle) + k * dot(k, c) * (1.0 - cos(angle));
}

@fragment
fn composite(in: Varyings) -> @location(0) vec4f {
  let base = textureLoad(src, vec2i(in.pos.xy), 0).rgb;
  let glow = textureSample(bloom, linearSampler, in.uv).rgb;
  let color = max(hueRotate(base + glow * p.glow, p.hue), vec3f(0.0));
  // Tone map so dense areas glow toward white instead of clipping.
  let mapped = 1.0 - exp(-color * p.brightness * 4.0);
  // Dither to hide banding in dark gradients.
  let noise = fract(sin(dot(in.pos.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  return vec4f(mapped + (noise - 0.5) / 255.0, 1.0);
}
