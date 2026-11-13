// A progressive path tracer for one scene: a grid of flat-topped columns
// standing on an endless ground plane. Because every column fills its cell
// exactly, the scene is a heightfield, and a ray can walk it cell by cell (2D
// DDA) and hit the boxes exactly, with no triangles or BVH.
//
// Each frame adds one sample per pixel to a float buffer: a jittered camera
// ray, then up to `bounces` diffuse bounces. At every hit the sun is sampled
// directly, from a disk of `sunRadius` degrees so shadows have real penumbras,
// and bounce rays that escape pick up the sky dome. Shade is lit only by the
// sky and by light bounced off the columns, which is what makes it blue.
// Columns can also glow (uGlow), lighting each other and the ground.
//
// A sample's first choices (where in the pixel, where on the sun, which way
// to bounce) follow an Owen-scrambled Sobol sequence, so they spread evenly
// as samples add up. Optionally (tracer.denoise) a denoiser after SVGF
// cleans up what's shown while there are few samples: at restarts it moves
// the last image into the new view, and each pixel fades back to its own
// samples as they get clean, past which the filter would only blur detail.
import * as THREE from 'three';

const vertexShader = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const traceShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uColumns; // rgb: linear albedo of the top, a: height in cells
uniform sampler2D uPrev;
uniform bool uGuide; // draw the denoiser's guide instead of a sample
uniform ivec2 uGrid;
uniform vec3 uOrigin; // world position of the grid's (0, 0) corner
uniform float uCell; // world size of one cell
uniform float uMaxH; // tallest column, in cells
uniform mat4 uCamWorld;
uniform mat4 uProjInv;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uSunCos;
uniform vec3 uSun;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGround;
uniform vec3 uBase; // column sides fade up from this at the ground
// Over 0, columns glow: each gives off its color squared times uGlow (so
// bright colors glow far more than dim ones), and is uGlowAlbedo itself.
uniform float uGlow;
uniform vec3 uGlowAlbedo;
// Each cell's glowing power (its glow's brightness times its surface area),
// summed up a mip chain, for picking a column to aim at; see pickGlow.
uniform sampler2D uPower;
uniform int uPowerLevels;
// Over 0, the ground is water: it mirrors this share of light head on (more
// at grazing angles, by Schlick's Fresnel), blurred by uWaterRough (a GGX
// roughness for the sun's glint), and scatters the rest by its albedo.
uniform float uWaterF0;
uniform float uWaterRough;
// Over 0, glow found by a bounce ray adds at most this much per channel: in
// previews, where a few samples can't average out a bright column hit by
// chance (a firefly). 0 (full quality) counts it all.
uniform float uClamp;
uniform int uFrame; // this sample's number since the last restart
uniform uint uSeed; // changes at every restart
uniform int uBounces;
uniform vec2 uRes;
// The sum of the samples' radiance, and in a of their brightness squared
// (for the denoiser's noise estimate). Or, with uGuide, the surface through
// the pixel's centre, as the denoiser's guide: its distance (-1 for sky),
// which way it faces, and in a its color.
out vec4 fragColor;

const float INF = 1e30;
const float PI = 3.14159265;

uint seed;
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rand() {
  seed = pcg(seed);
  return float(seed) / 4294967296.0;
}

// Owen-scrambled Sobol points (Burley 2020, "Practical Hash-based Owen
// Scrambling") for a sample's first choices: sample i of a pixel lands in a
// different part of the square from all the others so far, so soft shadows
// and the sky's light settle faster than with independent random numbers.
uint reverseBits(uint x) {
  x = ((x >> 1u) & 0x55555555u) | ((x & 0x55555555u) << 1u);
  x = ((x >> 2u) & 0x33333333u) | ((x & 0x33333333u) << 2u);
  x = ((x >> 4u) & 0x0F0F0F0Fu) | ((x & 0x0F0F0F0Fu) << 4u);
  x = ((x >> 8u) & 0x00FF00FFu) | ((x & 0x00FF00FFu) << 8u);
  return (x >> 16u) | (x << 16u);
}
uint laineKarras(uint x, uint s) {
  x += s;
  x ^= x * 0x6c50b47cu;
  x ^= x * 0xb82f1e52u;
  x ^= x * 0xc7afe638u;
  x ^= x * 0x8d22f6e6u;
  return x;
}
uint owen(uint x, uint s) { return reverseBits(laineKarras(reverseBits(x), s)); }
uint sobolY(uint i) {
  uint v = 1u << 31u;
  uint r = 0u;
  for (int b = 0; b < 32 && i != 0u; b++) {
    if ((i & 1u) != 0u) r ^= v;
    i >>= 1u;
    v ^= v >> 1u;
  }
  return r;
}
vec2 sobol2(uint index, uint s) {
  uint i = owen(index, pcg(s));
  uint x = owen(reverseBits(i), pcg(s + 1u));
  uint y = owen(sobolY(i), pcg(s + 2u));
  return vec2(float(x >> 8u), float(y >> 8u)) / 16777216.0;
}

vec4 column(ivec2 c) { return texelFetch(uColumns, c, 0); }

// In grid space (x and z in cells, y in cell widths). Returns the distance to
// the first hit (INF for none), its normal, and the cell hit (-1 for ground).
float trace(vec3 o, vec3 d, out vec3 n, out ivec2 hitCell) {
  hitCell = ivec2(-1);
  n = vec3(0.0, 1.0, 0.0);
  float tGround = d.y < 0.0 ? -o.y / d.y : INF;

  vec3 inv = 1.0 / d;
  vec3 t0 = -o * inv;
  vec3 t1 = (vec3(float(uGrid.x), uMaxH, float(uGrid.y)) - o) * inv;
  vec3 tn = min(t0, t1);
  vec3 tf = max(t0, t1);
  float tEnter = max(max(tn.x, tn.z), max(tn.y, 0.0));
  float tExit = min(min(tf.x, tf.y), tf.z);
  if (tEnter >= tExit) return tGround;

  vec3 p = o + d * tEnter;
  ivec2 cell = clamp(ivec2(floor(p.xz)), ivec2(0), uGrid - 1);
  ivec2 stp = ivec2(d.x > 0.0 ? 1 : -1, d.z > 0.0 ? 1 : -1);
  vec2 tDelta = abs(inv.xz);
  vec2 tMax = vec2(
    (float(cell.x + (stp.x > 0 ? 1 : 0)) - o.x) * inv.x,
    (float(cell.y + (stp.y > 0 ? 1 : 0)) - o.z) * inv.z
  );
  float tCur = tEnter;
  vec3 lastN = tn.x > tn.z ? vec3(-float(stp.x), 0.0, 0.0) : vec3(0.0, 0.0, -float(stp.y));

  for (int i = 0; i < 8192; i++) {
    float tNext = min(min(tMax.x, tMax.y), tExit);
    float h = column(cell).a;
    if (h > 0.0) {
      if (o.y + d.y * tCur <= h) {
        n = lastN;
        hitCell = cell;
        return tCur;
      }
      if (o.y + d.y * tNext <= h) {
        hitCell = cell;
        return (h - o.y) / d.y;
      }
    }
    if (tGround <= tNext) return tGround;
    if (tNext >= tExit) break;
    if (d.y > 0.0 && o.y + d.y * tNext > uMaxH) break;
    if (tMax.x < tMax.y) {
      cell.x += stp.x;
      tCur = tMax.x;
      tMax.x += tDelta.x;
      lastN = vec3(-float(stp.x), 0.0, 0.0);
    } else {
      cell.y += stp.y;
      tCur = tMax.y;
      tMax.y += tDelta.y;
      lastN = vec3(0.0, 0.0, -float(stp.y));
    }
    if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, uGrid))) break;
  }
  return tGround;
}

vec3 sky(vec3 d) {
  return mix(uSkyHorizon, uSkyZenith, sqrt(clamp(d.y, 0.0, 1.0)));
}

vec3 albedoAt(ivec2 c, vec3 p, vec3 n) {
  if (c.x < 0) return uGround;
  vec4 col = column(c);
  if (n.y > 0.5) return col.rgb;
  float f = clamp(p.y / col.a, 0.0, 1.0);
  return mix(uBase, col.rgb, f * f);
}

void basis(vec3 n, out vec3 t, out vec3 b) {
  t = normalize(cross(abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), n));
  b = cross(n, t);
}

vec3 sampleCone(vec3 axis, float cosMax, vec2 u) {
  float c = mix(1.0, cosMax, u.x);
  float s = sqrt(max(0.0, 1.0 - c * c));
  float phi = 2.0 * PI * u.y;
  vec3 t, b;
  basis(axis, t, b);
  return normalize(t * cos(phi) * s + b * sin(phi) * s + axis * c);
}

vec3 sampleCosine(vec3 n, vec2 u) {
  float r = sqrt(u.x);
  float phi = 2.0 * PI * u.y;
  vec3 t, b;
  basis(n, t, b);
  return normalize(t * r * cos(phi) + b * r * sin(phi) + n * sqrt(max(0.0, 1.0 - r * r)));
}

// --- glowing columns as lights ---
// Light from glowing columns is found two ways, weighed against each other
// by multiple importance sampling (the power heuristic): aiming at one
// (pickGlow) at every surface, and bounce rays that happen to hit one. A
// column is picked by walking down the power pyramid, at each level choosing
// among four children by power over distance squared, so bright columns
// nearby are picked most and every glowing one can be.

// How much a node of the pyramid (at level, covering 2^level cells a side)
// is worth aiming at from x.
float glowWeight(vec3 x, ivec2 node, int level) {
  ivec2 size = textureSize(uPower, level);
  if (node.x >= size.x || node.y >= size.y) return 0.0;
  float power = texelFetch(uPower, node, level).r;
  if (power <= 0.0) return 0.0;
  float s = float(1 << level);
  vec2 d = x.xz - (vec2(node) + 0.5) * s;
  return power / max(dot(d, d) + x.y * x.y, 0.5 * s * s);
}

// A glowing cell picked for x, and the chance of picking it (0 if none).
ivec2 pickGlow(vec3 x, out float prob) {
  ivec2 node = ivec2(0);
  prob = 1.0;
  for (int level = uPowerLevels - 1; level > 0; level--) {
    float w[4];
    float total = 0.0;
    for (int k = 0; k < 4; k++) {
      w[k] = glowWeight(x, node * 2 + ivec2(k & 1, k >> 1), level - 1);
      total += w[k];
    }
    if (total <= 0.0) {
      prob = 0.0;
      return node;
    }
    float r = rand() * total;
    int pick = 0;
    for (int k = 0; k < 4; k++) {
      pick = k;
      if (r < w[k]) break;
      r -= w[k];
    }
    if (w[pick] <= 0.0) {
      prob = 0.0;
      return node;
    }
    prob *= w[pick] / total;
    node = node * 2 + ivec2(pick & 1, pick >> 1);
  }
  return node;
}

// The chance pickGlow(x) picks cell c.
float glowProb(vec3 x, ivec2 c) {
  float prob = 1.0;
  for (int level = uPowerLevels - 1; level > 0; level--) {
    ivec2 node = c >> level;
    float w[4];
    float total = 0.0;
    for (int k = 0; k < 4; k++) {
      w[k] = glowWeight(x, node * 2 + ivec2(k & 1, k >> 1), level - 1);
      total += w[k];
    }
    ivec2 child = (c >> (level - 1)) - node * 2;
    float wc = w[child.x + 2 * child.y];
    if (total <= 0.0 || wc <= 0.0) return 0.0;
    prob *= wc / total;
  }
  return prob;
}

// The chance, per unit solid angle, of aiming from x at a point on column c
// with normal nl, a distance d away along l. Points are picked evenly over
// the column's surface (top and four sides).
float glowPdf(vec3 x, ivec2 c, vec3 nl, vec3 l, float d) {
  float cosL = -dot(nl, l);
  if (cosL <= 0.0) return 0.0;
  return glowProb(x, c) / (1.0 + 4.0 * column(c).a) * d * d / cosL;
}

// Light reaching x (normal n) from a glowing column picked for it, as it
// leaves a surface of the given albedo, weighed against bounce rays.
vec3 glowLight(vec3 x, vec3 n, vec3 albedo) {
  float prob;
  ivec2 c = pickGlow(x, prob);
  if (prob <= 0.0) return vec3(0.0);
  float h = column(c).a;
  float area = 1.0 + 4.0 * h;
  float a = rand() * area;
  vec3 cell = vec3(float(c.x), 0.0, float(c.y));
  vec3 p;
  vec3 nl;
  if (a < 1.0) {
    p = cell + vec3(rand(), h, rand());
    nl = vec3(0.0, 1.0, 0.0);
  } else {
    int side = min(int((a - 1.0) / h), 3);
    float y = rand() * h;
    float f = rand();
    if (side == 0) { p = cell + vec3(1.0, y, f); nl = vec3(1.0, 0.0, 0.0); }
    else if (side == 1) { p = cell + vec3(0.0, y, f); nl = vec3(-1.0, 0.0, 0.0); }
    else if (side == 2) { p = cell + vec3(f, y, 1.0); nl = vec3(0.0, 0.0, 1.0); }
    else { p = cell + vec3(f, y, 0.0); nl = vec3(0.0, 0.0, -1.0); }
  }
  vec3 toP = p - x;
  float d = length(toP);
  vec3 l = toP / d;
  float cosS = dot(n, l);
  float cosL = -dot(nl, l);
  if (cosS <= 0.0 || cosL <= 0.0) return vec3(0.0);
  if (abs(l.x) < 1e-7) l.x = 1e-7;
  if (abs(l.z) < 1e-7) l.z = 1e-7;
  vec3 sn;
  ivec2 sc;
  float t = trace(x, l, sn, sc);
  if (sc != c || abs(t - d) > 1e-3 * max(1.0, d)) return vec3(0.0);
  float pdfLight = prob / area * d * d / cosL;
  float pdfBounce = cosS / PI;
  float w = pdfLight * pdfLight / (pdfLight * pdfLight + pdfBounce * pdfBounce);
  vec3 glow = albedoAt(c, p, nl);
  return albedo / PI * glow * glow * uGlow * cosS / pdfLight * w;
}

vec3 rayThrough(vec2 frag) {
  vec2 ndc = frag / uRes * 2.0 - 1.0;
  vec4 view = uProjInv * vec4(ndc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld * vec4(view.xyz / view.w, 0.0)).xyz);
  if (abs(d.x) < 1e-7) d.x = 1e-7;
  if (abs(d.z) < 1e-7) d.z = 1e-7;
  return d;
}

// Which way a face looks: 0 up (tops and the ground), 1-4 the sides.
float faceCode(vec3 n) {
  if (n.y > 0.5) return 0.0;
  if (abs(n.x) > 0.5) return n.x > 0.0 ? 1.0 : 2.0;
  return n.z > 0.0 ? 3.0 : 4.0;
}
// A color to 8 bits a channel, as one exact float.
float packColor(vec3 a) {
  vec3 q = floor(clamp(a, 0.0, 1.0) * 255.0 + 0.5);
  return q.r * 65536.0 + q.g * 256.0 + q.b;
}

void main() {
  vec3 o0 = (uCamPos - uOrigin) / uCell;
  if (uGuide) {
    vec3 gd = rayThrough(gl_FragCoord.xy);
    vec3 gn;
    ivec2 gc;
    float gt = trace(o0, gd, gn, gc);
    fragColor = gt >= INF
      ? vec4(-1.0, 5.0, 0.0, 0.0)
      : vec4(gt * uCell, faceCode(gn), 0.0, packColor(albedoAt(gc, o0 + gd * gt, gn)));
    return;
  }
  uvec2 px = uvec2(gl_FragCoord.xy);
  uint pixel = pcg(px.x * 1973u + pcg(px.y * 9277u + uSeed));
  seed = pcg(pixel ^ (uint(uFrame) * 0x9E3779B9u));
  uint index = uint(uFrame);
  vec3 d = rayThrough(gl_FragCoord.xy - 0.5 + sobol2(index, pixel * 3u));
  vec3 o = o0;

  vec3 radiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  vec3 lastN = vec3(0.0); // the last surface's normal, for weighing glow
  bool mirrored = false; // the last bounce was off water
  for (int bounce = 0; bounce <= uBounces; bounce++) {
    vec3 n;
    ivec2 c;
    float t = trace(o, d, n, c);
    if (t >= INF) {
      radiance += throughput * sky(d);
      break;
    }
    vec3 p = o + d * t;
    vec3 albedo = albedoAt(c, p, n);
    if (uGlow > 0.0 && c.x >= 0) {
      // Seen directly it counts in full; reached by a bounce, weighed
      // against having aimed at it from the last surface.
      float w = 1.0;
      if (bounce > 0 && !mirrored) {
        float pdfBounce = max(dot(lastN, d), 0.0) / PI;
        float pdfLight = glowPdf(o, c, n, d, t);
        w = pdfBounce * pdfBounce / (pdfBounce * pdfBounce + pdfLight * pdfLight);
      }
      vec3 glow = throughput * albedo * albedo * uGlow * w;
      if (uClamp > 0.0 && bounce > 0) glow = min(glow, vec3(uClamp));
      radiance += glow;
      albedo = uGlowAlbedo;
    }
    o = p + n * 1e-3;
    lastN = n;
    // Water: the share it mirrors (fresnel) is left to the mirrored ray; the
    // rest is diffuse, lit below like any surface.
    float fresnel = 0.0;
    if (uWaterF0 > 0.0 && c.x < 0) {
      fresnel = uWaterF0 + (1.0 - uWaterF0) * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
    }
    vec3 diffuse = albedo * (1.0 - fresnel);
    if (uGlow > 0.0) radiance += throughput * glowLight(o, n, diffuse);

    // Direct sun, from a point on its disk.
    vec2 u = bounce == 0 ? sobol2(index, pixel * 3u + 1u) : vec2(rand(), rand());
    vec3 l = sampleCone(uSunDir, uSunCos, u);
    float cosL = dot(n, l);
    if (cosL > 0.0) {
      vec3 sn;
      ivec2 sc;
      if (trace(o, l, sn, sc) >= INF || sc.x < 0) {
        radiance += throughput * diffuse * uSun * cosL;
        // Water's glint of the sun (or moon): a GGX microfacet reflection,
        // found by the same shadow ray (mirrored rays don't count the sun).
        if (fresnel > 0.0) {
          float a2 = uWaterRough * uWaterRough;
          float nh = max(dot(n, normalize(l - d)), 0.0);
          float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
          radiance += throughput * fresnel * D * PI * uSun / (4.0 * max(dot(-d, n), 1e-3));
        }
      }
    }
    if (bounce == uBounces) break;
    // Mirror with the chance the water mirrors (keeping the throughput), or
    // scatter diffusely with the rest.
    mirrored = fresnel > 0.0 && rand() < fresnel;
    if (mirrored) {
      vec3 r = reflect(d, n);
      for (int k = 0; k < 4; k++) {
        vec3 j = vec3(rand(), rand(), rand()) * 2.0 - 1.0;
        vec3 rough = normalize(r + uWaterRough * j);
        if (dot(rough, n) > 0.0) {
          r = rough;
          break;
        }
      }
      d = r;
    } else {
      u = bounce == 0 ? sobol2(index, pixel * 3u + 2u) : vec2(rand(), rand());
      d = sampleCosine(n, u);
      throughput *= albedo;
    }
    if (abs(d.x) < 1e-7) d.x = 1e-7;
    if (abs(d.z) < 1e-7) d.z = 1e-7;
  }

  float l = dot(radiance, vec3(0.2126, 0.7152, 0.0722));
  vec4 prev = uFrame == 0 ? vec4(0.0) : texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0);
  fragColor = prev + vec4(radiance, l * l);
}
`;

const displayShader = /* glsl */ `
precision highp float;
uniform sampler2D uAccum;
// With uDenoised, uAccum is the denoiser's result, and each pixel shows the
// samples themselves (uRaw) instead once they're clean enough: by how noisy
// the pixel's mean still is (uNoise's a, its variance), relative to its
// brightness. Fine detail the filter would blur shows as soon as it's clean,
// and noisy light (glow) stays smoothed until it is.
uniform bool uDenoised;
uniform sampler2D uRaw;
uniform float uRawCount; // samples summed in uRaw
uniform sampler2D uNoise;
uniform sampler2D uBloom; // the glow around bright light (see bloom), added
uniform float uBloomStrength;
uniform vec2 uScreen;
uniform vec2 uNoiseRange; // all raw at or under x, all denoised at or over y
uniform float uExposure;
uniform vec2 uScale; // accumulation pixels per screen pixel
uniform float uCount; // samples summed in uAccum
out vec4 fragColor;

// Narkowicz's fit of the ACES filmic curve.
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The accumulated sample at a screen pixel, bilinear when the accumulation
// is smaller than the screen (a fast preview).
vec4 accum(sampler2D tex, vec2 frag) {
  if (uScale == vec2(1.0)) return texelFetch(tex, ivec2(frag), 0);
  vec2 p = frag * uScale - 0.5;
  ivec2 size = textureSize(tex, 0);
  ivec2 i = ivec2(floor(p));
  vec2 f = p - floor(p);
  vec4 a = texelFetch(tex, clamp(i, ivec2(0), size - 1), 0);
  vec4 b = texelFetch(tex, clamp(i + ivec2(1, 0), ivec2(0), size - 1), 0);
  vec4 c = texelFetch(tex, clamp(i + ivec2(0, 1), ivec2(0), size - 1), 0);
  vec4 d = texelFetch(tex, clamp(i + ivec2(1, 1), ivec2(0), size - 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 a = accum(uAccum, gl_FragCoord.xy).rgb / uCount;
  if (uDenoised) {
    vec3 raw = accum(uRaw, gl_FragCoord.xy).rgb / uRawCount;
    float lum = dot(raw, vec3(0.2126, 0.7152, 0.0722));
    float noise = sqrt(max(accum(uNoise, gl_FragCoord.xy).a, 0.0)) / max(lum, 1e-3);
    a = mix(a, raw, clamp((uNoiseRange.y - noise) / (uNoiseRange.y - uNoiseRange.x), 0.0, 1.0));
  }
  if (uBloomStrength > 0.0) {
    a += texture(uBloom, gl_FragCoord.xy / uScreen).rgb * uBloomStrength;
  }
  vec3 c = toSrgb(aces(a * uExposure));
  // A touch of noise so the smooth ground doesn't band.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  fragColor = vec4(c + dither / 255.0, 1.0);
}
`;

// --- denoiser ----------------------------------------------------------------
// After Schied et al., "Spatiotemporal Variance-Guided Filtering" (SVGF), as
// in anotherRaytracer's shaders/denoise.js. It only changes what's shown.
//
// At a restart (the camera moved), the last image is moved to where its
// surfaces are now (prior), dropped where they don't match, and counts as up
// to 8 samples, fading to none by 16. Then each new sample is blended with
// it (temporal), its noise measured, and five edge-avoiding wavelet passes
// (atrous) average each pixel with neighbors that see the same surface (same
// face direction, same plane, same color) and whose brightness differs by no
// more than the noise explains. As samples add up the noise estimate shrinks
// and the passes stop averaging, so the result becomes the samples' own mean.

const denoiseCommon = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 uRes;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
vec3 rayThrough(vec2 frag) {
  vec2 ndc = frag / uRes * 2.0 - 1.0;
  vec4 view = uProjInv * vec4(ndc, 1.0, 1.0);
  return normalize((uCamWorld * vec4(view.xyz / view.w, 0.0)).xyz);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 faceNormal(float code) {
  if (code < 0.5) return vec3(0.0, 1.0, 0.0);
  if (code < 1.5) return vec3(1.0, 0.0, 0.0);
  if (code < 2.5) return vec3(-1.0, 0.0, 0.0);
  if (code < 3.5) return vec3(0.0, 0.0, 1.0);
  return vec3(0.0, 0.0, -1.0);
}
vec3 unpackColor(float v) {
  float r = floor(v / 65536.0);
  float g = floor((v - r * 65536.0) / 256.0);
  return vec3(r, g, v - r * 65536.0 - g * 256.0) / 255.0;
}
`;

// The last image (lastT, and lastGuide's distance and face) moved into this
// view: rgb, and in a how many samples it's worth.
const priorShader = /* glsl */ `${denoiseCommon}
uniform sampler2D uAux;
uniform sampler2D uLastT;
uniform sampler2D uLastGuide;
uniform mat4 uPrevViewProj;
uniform vec3 uPrevCamPos;
out vec4 outPrior;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 aux = texelFetch(uAux, p, 0);
  outPrior = vec4(0.0);
  if (aux.x <= 0.0) return;
  vec3 P = uCamPos + rayThrough(gl_FragCoord.xy) * aux.x;
  vec4 clip = uPrevViewProj * vec4(P, 1.0);
  if (clip.w <= 0.0) return;
  ivec2 size = textureSize(uLastGuide, 0);
  vec2 f = (clip.xy / clip.w * 0.5 + 0.5) * vec2(size) - 0.5;
  ivec2 i0 = ivec2(floor(f));
  vec2 fr = f - floor(f);
  float expected = distance(P, uPrevCamPos);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    ivec2 q = i0 + o;
    if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, size))) continue;
    vec4 g = texelFetch(uLastGuide, q, 0);
    if (abs(g.z - aux.y) > 0.5 || abs(g.x + g.y - expected) > 0.02 * expected) continue;
    float w = (o.x == 1 ? fr.x : 1.0 - fr.x) * (o.y == 1 ? fr.y : 1.0 - fr.y);
    vec4 t = texelFetch(uLastT, q, 0);
    sum += w * vec4(t.rgb, min(t.a, 8.0));
    total += w;
  }
  if (total > 1e-3) outPrior = sum / total;
}
`;

// This view's samples blended with the prior. Writes the blend and its
// worth in samples (for the next restart's prior), the blend and the
// variance of its brightness (for the wavelet passes), and the guide's
// distance (split into two halves for precision) and face.
const temporalShader = /* glsl */ `${denoiseCommon}
uniform sampler2D uColor;
uniform sampler2D uAux;
uniform sampler2D uPrior;
uniform bool uHavePrior;
uniform float uCount; // samples summed in uColor
layout(location = 0) out vec4 outT;
layout(location = 1) out vec4 outFilter;
layout(location = 2) out vec4 outGuide;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uColor, p, 0);
  vec4 aux = texelFetch(uAux, p, 0);
  float n = uCount;
  vec3 m = c.rgb / n;
  vec4 prior = uHavePrior ? texelFetch(uPrior, p, 0) : vec4(0.0);
  float w = prior.a * clamp(1.0 - n / 16.0, 0.0, 1.0);
  vec3 mean = (m * n + prior.rgb * w) / (n + w);
  // The spread of single samples: from this pixel's own samples once there
  // are a few, before that from its neighbors on the same face.
  float spread;
  if (n >= 4.0) {
    spread = max(0.0, c.a / n - lum(m) * lum(m));
  } else {
    float s1 = 0.0, s2 = 0.0, k = 0.0;
    ivec2 size = textureSize(uColor, 0);
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        ivec2 q = clamp(p + ivec2(dx, dy), ivec2(0), size - 1);
        if (abs(texelFetch(uAux, q, 0).y - aux.y) > 0.5) continue;
        float l = lum(texelFetch(uColor, q, 0).rgb / n);
        s1 += l;
        s2 += l * l;
        k += 1.0;
      }
    }
    spread = max(0.0, s2 / k - (s1 / k) * (s1 / k)) * n;
  }
  outT = vec4(mean, n + w);
  outFilter = vec4(mean, spread / (n + w));
  float hi = unpackHalf2x16(packHalf2x16(vec2(aux.x, 0.0))).x;
  outGuide = vec4(hi, aux.x - hi, aux.y, 0.0);
}
`;

const atrousShader = /* glsl */ `${denoiseCommon}
uniform sampler2D uIn; // rgb, and the variance of its brightness
uniform sampler2D uAux;
uniform int uStep;
uniform float uPixelAngle; // radians per pixel
out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 cp = texelFetch(uIn, p, 0);
  vec4 ap = texelFetch(uAux, p, 0);
  if (ap.x <= 0.0) {
    outColor = cp;
    return;
  }
  vec3 np = faceNormal(ap.y);
  vec3 Pp = uCamPos + rayThrough(gl_FragCoord.xy) * ap.x;
  vec3 Ap = unpackColor(ap.w);
  float lp = lum(cp.rgb);
  float sigmaL = 4.0 * sqrt(max(cp.a, 0.0)) + 1e-5;
  // Neighbors more than about a pixel's footprint off this pixel's plane are
  // another surface.
  float reach = ap.x * uPixelAngle;
  ivec2 size = textureSize(uIn, 0);
  vec3 sum = vec3(0.0);
  float sumVar = 0.0;
  float total = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 q = p + ivec2(dx, dy) * uStep;
      if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, size))) continue;
      vec4 aq = texelFetch(uAux, q, 0);
      if (aq.x <= 0.0 || abs(aq.y - ap.y) > 0.5) continue;
      vec3 Pq = uCamPos + rayThrough(vec2(q) + 0.5) * aq.x;
      float wP = exp(-abs(dot(np, Pq - Pp)) / reach);
      vec3 dA = Ap - unpackColor(aq.w);
      float wA = exp(-dot(dA, dA) / 0.005);
      vec4 cq = texelFetch(uIn, q, 0);
      float wL = exp(-abs(lp - lum(cq.rgb)) / sigmaL);
      float h = (dx == 0 ? 0.5 : 0.25) * (dy == 0 ? 0.5 : 0.25);
      float w = h * wP * wA * wL;
      sum += w * cq.rgb;
      sumVar += w * w * cq.a;
      total += w;
    }
  }
  outColor = vec4(sum / total, sumVar / (total * total));
}
`;

// --- bloom -------------------------------------------------------------------
// Light brighter than a threshold spreads into a soft glow around it, as it
// does in a camera lens: the bright part is halved in size down a chain of
// images, then added back up the chain, each level blurring a little wider,
// and the result added to the picture. Only what's shown changes.

// The bright part of a 2x2 block of the shown image (its sum over uCount).
const bloomBrightShader = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
uniform float uCount;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 size = textureSize(uSource, 0) - 1;
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec3 c = texelFetch(uSource, min(p + ivec2(k & 1, k >> 1), size), 0).rgb / uCount;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    sum += c * max(l - uThreshold, 0.0) / max(l, 1e-4);
  }
  fragColor = vec4(sum / 4.0, 1.0);
}
`;

// Half size, averaging (bilinear taps between texels cover a 4x4 block).
const bloomDownShader = /* glsl */ `
precision highp float;
uniform sampler2D uSource;
out vec4 fragColor;
void main() {
  vec2 texel = 1.0 / vec2(textureSize(uSource, 0));
  vec2 uv = gl_FragCoord.xy * 2.0 * texel;
  vec3 sum = texture(uSource, uv + texel * vec2(-1.0, -1.0)).rgb
    + texture(uSource, uv + texel * vec2(1.0, -1.0)).rgb
    + texture(uSource, uv + texel * vec2(-1.0, 1.0)).rgb
    + texture(uSource, uv + texel * vec2(1.0, 1.0)).rgb;
  fragColor = vec4(sum / 4.0, 1.0);
}
`;

// Double size: this level plus the smaller one blurred up with a tent.
const bloomUpShader = /* glsl */ `
precision highp float;
uniform sampler2D uSource; // this level
uniform sampler2D uSmaller; // the level below, already summed up
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSource, 0));
  vec2 t = 1.0 / vec2(textureSize(uSmaller, 0));
  vec3 up = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float w = (x == 0 ? 2.0 : 1.0) * (y == 0 ? 2.0 : 1.0) / 16.0;
      up += w * texture(uSmaller, uv + vec2(x, y) * t).rgb;
    }
  }
  fragColor = vec4(texelFetch(uSource, ivec2(gl_FragCoord.xy), 0).rgb + up, 1.0);
}
`;

export function createPathTracer(renderer) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const floatTarget = (count = 1, type = THREE.FloatType) =>
    new THREE.WebGLRenderTarget(1, 1, {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      count,
    });
  // Accumulation buffers: a pair of sums (read is the latest complete one,
  // write the one being drawn) and the denoiser's guide. One set at full
  // resolution and one small for previews.
  const pair = () => ({
    read: floatTarget(),
    write: floatTarget(),
    aux: floatTarget(),
    width: 1,
    height: 1,
    samples: 0, // complete samples per pixel
    restart: -1, // which restart these samples belong to
    cam: {
      world: new THREE.Matrix4(),
      projInv: new THREE.Matrix4(),
      pos: new THREE.Vector3(),
      viewProj: new THREE.Matrix4(),
      pixelAngle: 0,
    },
  });
  const main = pair();
  const small = pair();
  const setSize = (p, width, height) => {
    [p.width, p.height] = [Math.max(1, width), Math.max(1, height)];
    for (const t of [p.read, p.write, p.aux]) t.setSize(p.width, p.height);
    p.samples = 0;
  };

  const linear = (hex) => new THREE.Color(hex);
  const trace = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: traceShader,
    uniforms: {
      uColumns: {value: null},
      uPrev: {value: null},
      uGuide: {value: false},
      uGrid: {value: new THREE.Vector2(1, 1)},
      uOrigin: {value: new THREE.Vector3()},
      uCell: {value: 1},
      uMaxH: {value: 1},
      uCamWorld: {value: new THREE.Matrix4()},
      uProjInv: {value: new THREE.Matrix4()},
      uCamPos: {value: new THREE.Vector3()},
      uSunDir: {value: new THREE.Vector3(0, 1, 0)},
      uSunCos: {value: 1},
      uSun: {value: new THREE.Vector3()},
      uSkyZenith: {value: new THREE.Vector3()},
      uSkyHorizon: {value: new THREE.Vector3()},
      uGround: {value: linear('#ffffff')},
      uGlow: {value: 0},
      uGlowAlbedo: {value: new THREE.Vector3(0.05, 0.05, 0.05)},
      uPower: {value: null},
      uPowerLevels: {value: 1},
      uWaterF0: {value: 0},
      uWaterRough: {value: 0.1},
      uClamp: {value: 0},
      uBase: {value: linear('#ffffff')},
      uFrame: {value: 0},
      uSeed: {value: 0},
      uBounces: {value: 3},
      uRes: {value: new THREE.Vector2(1, 1)},
    },
  });
  const display = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader: displayShader,
    uniforms: {
      uAccum: {value: null},
      uExposure: {value: 1},
      uScale: {value: new THREE.Vector2(1, 1)},
      uCount: {value: 1},
      uDenoised: {value: false},
      uRaw: {value: null},
      uRawCount: {value: 1},
      uNoise: {value: null},
      uNoiseRange: {value: new THREE.Vector2(0.08, 0.25)},
      uBloom: {value: null},
      uBloomStrength: {value: 0},
      uScreen: {value: new THREE.Vector2(1, 1)},
    },
  });
  const u = trace.uniforms;

  const denoiseUniforms = () => ({
    uRes: {value: new THREE.Vector2()},
    uProjInv: {value: new THREE.Matrix4()},
    uCamWorld: {value: new THREE.Matrix4()},
    uCamPos: {value: new THREE.Vector3()},
  });
  const pass = (fragmentShader, uniforms) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {...denoiseUniforms(), ...uniforms},
    });
  const priorPass = pass(priorShader, {
    uAux: {value: null},
    uLastT: {value: null},
    uLastGuide: {value: null},
    uPrevViewProj: {value: new THREE.Matrix4()},
    uPrevCamPos: {value: new THREE.Vector3()},
  });
  const temporalPass = pass(temporalShader, {
    uColor: {value: null},
    uAux: {value: null},
    uPrior: {value: null},
    uHavePrior: {value: false},
    uCount: {value: 1},
  });
  const atrousPass = pass(atrousShader, {
    uIn: {value: null},
    uAux: {value: null},
    uStep: {value: 1},
    uPixelAngle: {value: 0},
  });
  // Made on first use, sized to whichever buffer is shown.
  let dn = null;
  const history = {
    valid: false,
    // A copy: the pair's own camera is overwritten at its next restart.
    cam: {viewProj: new THREE.Matrix4(), pos: new THREE.Vector3()},
  };
  let filtered = {pair: null, samples: -1, restart: -1};
  let priorRestart = -1;
  let havePrior = false;

  function run(material, target, p) {
    const du = material.uniforms;
    if (p && du.uRes) {
      du.uRes.value.set(p.width, p.height);
      du.uProjInv.value.copy(p.cam.projInv);
      du.uCamWorld.value.copy(p.cam.world);
      du.uCamPos.value.copy(p.cam.pos);
    }
    quad.material = material;
    material.uniformsNeedUpdate = true; // see draw
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  // Runs the denoiser on pair p's samples; the result is in dn.out.
  // The bloom chain: down[0] is half the shown image's size, each next level
  // half again; up[i] is down[i] plus everything below it, blurred up.
  const bloomPass = (fragmentShader, uniforms) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
    });
  const bloomBright = bloomPass(bloomBrightShader, {
    uSource: {value: null},
    uCount: {value: 1},
    uThreshold: {value: 1},
  });
  const bloomDown = bloomPass(bloomDownShader, {uSource: {value: null}});
  const bloomUp = bloomPass(bloomUpShader, {
    uSource: {value: null},
    uSmaller: {value: null},
  });
  const bloomTarget = () => {
    const t = floatTarget(1, THREE.HalfFloatType);
    t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
    return t;
  };
  const bloomLevels = [];
  let bloomKey = '';
  function bloom(source, count, width, height) {
    const sizes = [];
    for (
      let [w, h] = [width >> 1, height >> 1];
      w >= 4 && h >= 4 && sizes.length < 7;

    ) {
      sizes.push([w, h]);
      [w, h] = [w >> 1, h >> 1];
    }
    while (bloomLevels.length < sizes.length) {
      bloomLevels.push({down: bloomTarget(), up: bloomTarget()});
    }
    sizes.forEach(([w, h], i) => {
      for (const t of [bloomLevels[i].down, bloomLevels[i].up]) {
        if (t.width !== w || t.height !== h) t.setSize(w, h);
      }
    });
    bloomBright.uniforms.uSource.value = source;
    bloomBright.uniforms.uCount.value = count;
    bloomBright.uniforms.uThreshold.value = tracer.bloomThreshold;
    run(bloomBright, bloomLevels[0].down);
    for (let i = 1; i < sizes.length; i++) {
      bloomDown.uniforms.uSource.value = bloomLevels[i - 1].down.texture;
      run(bloomDown, bloomLevels[i].down);
    }
    const last = sizes.length - 1;
    let smaller = bloomLevels[last].down.texture;
    for (let i = last - 1; i >= 0; i--) {
      bloomUp.uniforms.uSource.value = bloomLevels[i].down.texture;
      bloomUp.uniforms.uSmaller.value = smaller;
      run(bloomUp, bloomLevels[i].up);
      smaller = bloomLevels[i].up.texture;
    }
    return smaller;
  }

  function denoise(p) {
    if (!dn) {
      dn = {
        temporal: floatTarget(3, THREE.HalfFloatType),
        prior: floatTarget(1, THREE.HalfFloatType),
        a: floatTarget(1, THREE.HalfFloatType),
        b: floatTarget(1, THREE.HalfFloatType),
      };
    }
    const [color, aux] = [p.read.texture, p.aux.texture];
    const fits = (t) => t.width === p.width && t.height === p.height;
    for (const t of [dn.prior, dn.a, dn.b]) {
      if (!fits(t)) t.setSize(p.width, p.height);
    }
    // At the first result of a restart, move the last image into this view.
    if (p.restart !== priorRestart) {
      priorRestart = p.restart;
      havePrior = history.valid;
      if (havePrior) {
        const pu = priorPass.uniforms;
        pu.uAux.value = aux;
        pu.uLastT.value = dn.temporal.textures[0];
        pu.uLastGuide.value = dn.temporal.textures[2];
        pu.uPrevViewProj.value.copy(history.cam.viewProj);
        pu.uPrevCamPos.value.copy(history.cam.pos);
        run(priorPass, dn.prior, p);
      }
    }
    if (!fits(dn.temporal)) dn.temporal.setSize(p.width, p.height);
    const tu = temporalPass.uniforms;
    tu.uColor.value = color;
    tu.uAux.value = aux;
    tu.uPrior.value = dn.prior.texture;
    tu.uHavePrior.value = havePrior;
    tu.uCount.value = p.samples;
    run(temporalPass, dn.temporal, p);
    history.valid = true;
    history.cam.viewProj.copy(p.cam.viewProj);
    history.cam.pos.copy(p.cam.pos);

    const au = atrousPass.uniforms;
    au.uAux.value = aux;
    au.uPixelAngle.value = p.cam.pixelAngle;
    let input = dn.temporal.textures[1];
    let [into, spare] = [dn.a, dn.b];
    for (let i = 0; i < 5; i++) {
      au.uIn.value = input;
      au.uStep.value = 1 << i;
      run(atrousPass, into, p);
      input = into.texture;
      [into, spare] = [spare, into];
    }
    dn.out = spare; // the last pass's target
  }

  const swap = (p) => {
    [p.read, p.write] = [p.write, p.read];
    p.samples++;
  };

  let columns;
  let power;
  // The glow's power pyramid (see pickGlow): each cell's glow brightness
  // (its color squared) times roughly its glowing area, padded to powers of
  // two and summed 2x2 up to one cell.
  function setPower(data, width, height) {
    const pow2 = (v) => 2 ** Math.ceil(Math.log2(Math.max(v, 1)));
    let [w, h] = [pow2(width), pow2(height)];
    let level = new Float32Array(w * h);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const top = data[i + 3];
        if (top <= 0) continue;
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        const glow = 0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b;
        level[y * w + x] = glow * (1 + 0.8 * top); // sides fade toward the ground
      }
    }
    const mipmaps = [{data: level, width: w, height: h}];
    while (w > 1 || h > 1) {
      const [pw, ph, prev] = [w, h, level];
      [w, h] = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
      level = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            const [cx, cy] = [x * 2 + (k & 1), y * 2 + (k >> 1)];
            if (cx < pw && cy < ph) sum += prev[cy * pw + cx];
          }
          level[y * w + x] = sum;
        }
      }
      mipmaps.push({data: level, width: w, height: h});
    }
    power?.dispose();
    power = new THREE.DataTexture(
      mipmaps[0].data,
      mipmaps[0].width,
      mipmaps[0].height,
      THREE.RedFormat,
      THREE.FloatType,
    );
    power.mipmaps = mipmaps;
    power.generateMipmaps = false;
    power.minFilter = THREE.NearestMipmapNearestFilter;
    power.magFilter = THREE.NearestFilter;
    power.needsUpdate = true;
    u.uPower.value = power;
    u.uPowerLevels.value = mipmaps.length;
  }
  let screen = [1, 1];
  let row = 0; // first row of the next band of the sample being drawn
  let rows = 64; // rows per band, adjusted to keep each band near budgetMs
  let lastStep = 0;
  let restarts = 0;

  // Draws rows [y0, y0 + count) of the next sample into pair p.
  function draw(p, view, y0, count, bounces) {
    if (p.samples === 0 && y0 === 0) {
      // A restart for this pair: remember the camera, for the denoiser.
      p.restart = restarts;
      p.cam.world.copy(view.matrixWorld);
      p.cam.projInv.copy(view.projectionMatrixInverse);
      p.cam.pos.setFromMatrixPosition(view.matrixWorld);
      p.cam.viewProj.multiplyMatrices(
        view.projectionMatrix,
        view.matrixWorldInverse,
      );
      p.cam.pixelAngle = 2 / (view.projectionMatrix.elements[5] * p.height);
    }
    u.uCamWorld.value.copy(p.cam.world);
    u.uProjInv.value.copy(p.cam.projInv);
    u.uCamPos.value.copy(p.cam.pos);
    u.uFrame.value = p.samples;
    u.uSeed.value = restarts;
    u.uRes.value.set(p.width, p.height);
    const saved = u.uBounces.value;
    u.uBounces.value = bounces;
    u.uClamp.value = p === small ? tracer.previewClamp : 0;
    u.uPrev.value = p.read.texture;
    quad.material = trace;
    // three only uploads uniforms when the material changes between draws,
    // and these draws often follow one another, so say they've changed.
    const band = (target) => {
      trace.uniformsNeedUpdate = true;
      target.scissor.set(0, y0, p.width, count);
      target.scissorTest = count < p.height;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    };
    band(p.write);
    // The guide, once per restart, a band at a time like the sample.
    if (p.samples === 0) {
      u.uGuide.value = true;
      band(p.aux);
      u.uGuide.value = false;
    }
    u.uBounces.value = saved;
  }

  const tracer = {
    samples: 0, // complete full-resolution samples per pixel
    uniforms: u,
    // Milliseconds of GPU work to aim for per step. 0 draws each whole sample
    // in one go; a budget splits it into bands of rows over several steps, so
    // a big screen never holds up the next frame (and camera input) for long.
    budgetMs: 0,
    previewScale: 0.3, // preview resolution, as a fraction of the screen's
    previewBounces: 1,
    previewClamp: 0, // see uClamp
    denoise: false,
    // A pixel's noise (the standard error of its brightness, relative to it)
    // at which the display switches from its own samples to the denoised
    // image, fully by the second.
    noiseRange: [0.08, 0.25],
    // How much of the light over bloomThreshold (in radiance, before
    // exposure) spreads into a glow around it; 0 for none.
    bloom: 0,
    bloomThreshold: 1,
    reset() {
      tracer.samples = 0;
      main.samples = 0;
      small.samples = 0;
      row = 0;
      restarts++;
    },
    // Forgets the last image, so the next restart doesn't reuse it (for a
    // change of scene, rather than of view).
    forgetHistory() {
      history.valid = false;
    },
    resize(width, height) {
      screen = [width, height];
      setSize(main, width, height);
      setSize(
        small,
        Math.round(width * tracer.previewScale),
        Math.round(height * tracer.previewScale),
      );
      tracer.forgetHistory();
      tracer.reset();
    },
    // `data` holds RGBA floats per cell: linear albedo and height in cells.
    setColumns(data, width, height, cell, origin) {
      columns?.dispose();
      columns = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      columns.needsUpdate = true;
      u.uColumns.value = columns;
      u.uGrid.value.set(width, height);
      u.uCell.value = cell;
      u.uOrigin.value.copy(origin);
      let maxH = 0;
      for (let i = 3; i < data.length; i += 4) maxH = Math.max(maxH, data[i]);
      u.uMaxH.value = maxH + 1e-3;
      setPower(data, width, height);
      tracer.reset();
    },
    // Advances the full-resolution render: one whole sample per pixel, or one
    // band of one when there's a budget.
    step(view) {
      if (!tracer.budgetMs) {
        draw(main, view, 0, main.height, u.uBounces.value);
        swap(main);
        tracer.samples = main.samples;
        return;
      }
      // Nothing on screen for this view yet: a quick preview first.
      if (main.samples === 0 && small.samples === 0) tracer.preview(view);
      // Steps come once a frame, so the time since the last one shows how far
      // behind the GPU is; resize the bands toward the budget.
      const now = performance.now();
      const dt = now - lastStep;
      lastStep = now;
      if (dt < 200) {
        if (dt > tracer.budgetMs * 1.3)
          rows = Math.max(8, Math.floor(rows * 0.7));
        else if (dt < tracer.budgetMs)
          rows = Math.min(main.height, Math.ceil(rows * 1.15));
      }
      const count = Math.min(rows, main.height - row);
      draw(main, view, row, count, u.uBounces.value);
      row += count;
      if (row >= main.height) {
        row = 0;
        swap(main);
        tracer.samples = main.samples;
      }
    },
    // One quick low-resolution sample, for while the view is moving.
    preview(view) {
      draw(small, view, 0, small.height, tracer.previewBounces);
      swap(small);
    },
    // Shows the full render, or the preview until the full one has a whole
    // sample, denoised if asked.
    show(exposure) {
      const p = main.samples === 0 && small.samples > 0 ? small : main;
      let shown = p.read.texture;
      let count = Math.max(p.samples, 1);
      // Each pixel fades from the denoised image to its own samples as they
      // get clean (see uDenoised): past that the filter only blurs real
      // detail, since several columns can share a pixel and the guide sees
      // one.
      const du = display.uniforms;
      du.uDenoised.value = false;
      if (tracer.denoise && p.samples > 0) {
        const f = filtered;
        if (
          f.pair !== p ||
          f.samples !== p.samples ||
          f.restart !== p.restart
        ) {
          denoise(p);
          filtered = {pair: p, samples: p.samples, restart: p.restart};
        }
        shown = dn.out.texture;
        count = 1;
        du.uDenoised.value = true;
        du.uRaw.value = p.read.texture;
        du.uRawCount.value = p.samples;
        du.uNoise.value = dn.temporal.textures[1];
        du.uNoiseRange.value.fromArray(tracer.noiseRange);
      }
      du.uBloomStrength.value = tracer.bloom;
      if (tracer.bloom > 0 && p.samples > 0) {
        const key = `${p === main}|${p.samples}|${p.restart}|${count}`;
        if (key !== bloomKey) {
          du.uBloom.value = bloom(shown, count, p.width, p.height);
          bloomKey = key;
        }
      }
      du.uScreen.value.set(screen[0], screen[1]);
      display.uniforms.uAccum.value = shown;
      display.uniforms.uExposure.value = exposure;
      display.uniforms.uCount.value = count;
      display.uniforms.uScale.value.set(
        p.width / screen[0],
        p.height / screen[1],
      );
      quad.material = display;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
  return tracer;
}
