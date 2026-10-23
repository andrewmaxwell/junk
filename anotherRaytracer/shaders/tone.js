// How a linear color is shown on screen: exposure, contrast, and the SDR
// tone curves. Part of common.js.

export const tone = /* wgsl */ `
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
 * raising brightness relative to middle gray to the power params.contrast.
 * Each channel separately, so colors get a bit richer too.
 */
const MIDDLE_GRAY = 0.18;
fn applyContrast(x: vec3f) -> vec3f {
  return MIDDLE_GRAY * pow(max(x, vec3f(0.)) / MIDDLE_GRAY, vec3f(params.contrast));
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
