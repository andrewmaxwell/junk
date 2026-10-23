// Random numbers for the trace shader: a hash for plain ones, and a
// scrambled Sobol sequence for the first few choices of each sample.

export const random = /* wgsl */ `
var<private> seed: u32;


// PCG hash, from "Hash Functions for GPU Rendering" (Jarzynski & Olano)
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}


/** Uniform in [0, 1) */
fn rand() -> f32 {
  seed = pcg(seed);
  return f32(seed >> 8u) / 16777216.;
}


// Plain random numbers clump, leaving gaps that take many samples to fill.
// The Sobol sequence spreads each pixel's samples evenly instead, so noise
// fades faster. Each pixel gets its own scrambled copy, so neighbors don't
// share a pattern, following "Practical Hash-based Owen Scrambling" (Burley).

/** Pairs of random choices per sample that use Sobol; the rest use rand */
const SOBOL_PAIRS = 8u;

/** Which sample of its pixel this is, counting from the last restart */
var<private> sampleIndex: u32;

/** Different for every pixel, but the same every frame */
var<private> pixelSeed: u32;

/** How many rand2 calls this sample has made */
var<private> dimension: u32;


/** The first two dimensions of the Sobol sequence, as 32-bit fractions */
fn sobol(index: u32) -> vec2u {
  // The second dimension's direction numbers each xor the one before with
  // itself shifted right by 1
  var v = 1u << 31u;
  var y = 0u;
  for (var i = index; i != 0u; i >>= 1u) {
    if ((i & 1u) != 0u) { y ^= v; }
    v ^= v >> 1u;
  }
  return vec2u(reverseBits(index), y);
}


/** Owen scrambling: randomly flips bits, each depending on the bits above it */
fn scramble(x: u32, seed: u32) -> u32 {
  var v = reverseBits(x);
  v ^= v * 0x3d20adeau;
  v += seed;
  v *= (seed >> 16u) | 1u;
  v ^= v * 0x05526c56u;
  v ^= v * 0x53a22864u;
  return reverseBits(v);
}


/**
 * Two numbers uniform in [0, 1), for a 2D choice like a direction. Each call
 * within a sample gets its own shuffle of the sequence, so different choices
 * don't line up with each other.
 */
fn rand2() -> vec2f {
  if (dimension >= SOBOL_PAIRS) {
    return vec2f(rand(), rand());
  }
  let s = pcg(pixelSeed + pcg(dimension));
  dimension++;
  let v = sobol(scramble(sampleIndex, s));
  let x = scramble(v.x, pcg(s + 1u));
  let y = scramble(v.y, pcg(s + 2u));
  return vec2f(vec2u(x, y) >> vec2u(8u)) / 16777216.;
}
`;
