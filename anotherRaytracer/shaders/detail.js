// Surface detail, for the trace shader: gradient noise for bumps on paint
// and smudges on glass and mirrors.

export const detail = /* wgsl */ `
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


/**
 * How a wavy pane slopes here, along it: old glass is uneven in thickness,
 * in ripples a few detailScales across, at two sizes. Its roughness is how
 * steep they are. Light through it bends by (index - 1) times this, as
 * through a thin prism, so the ripples focus it into bright lines.
 */
fn paneSlope(s: u32, p: vec3f) -> vec3f {
  let n = objects[s].normalShape.xyz;
  let size = 8. * params.detailScale;
  let g = noise(p / size).yzw + 0.5 * noise(p / (0.5 * size) + 17.1).yzw;
  let slope = objects[s].surface.y * g;
  return slope - n * dot(slope, n);
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
`;
