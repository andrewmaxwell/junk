// Materials, for the trace shader: paint with an optional varnish coat,
// metal, and glass, which splits light into rainbows (dispersion).

import {ALBEDO_SIZE} from '../ggx.js';

export const materials = /* wgsl */ `
const DIFFUSE = 0;

const MIRROR = 1;

const GLASS = 2;

const LIGHT = 3;


/**
 * Glass and smooth mirrors, which send each path one way, without aiming
 * shadow rays at lights. Frosted glass too: each path sees its surface
 * tilted at random.
 */
fn isSmooth(s: u32) -> bool {
  let material = i32(objects[s].colorMaterial.w);
  return material == GLASS || (material == MIRROR && objects[s].surface.y == 0.);
}


/**
 * Glass plates: thin panes. Light goes straight through flat ones, so
 * shadow rays see through them too (lightVisibility). Rough ones are wavy,
 * like old glass, and bend it (paneSlope).
 */
fn isPane(s: u32) -> bool {
  return i32(objects[s].colorMaterial.w) == GLASS && isPlate(s);
}


/**
 * How rough a glossy coat or metal must be for photons to bring the light
 * it reflects, as they do paint's (gatherPhotons). Sharper reflections
 * would show the gather's blur, so paths find that light. Blurrier ones
 * barely do, and through wavy glass, which shadow rays can't see through,
 * a path would have to hit a small light by chance: a varnished floor lit
 * that way lost most of its sheen, and the room the light it reflects.
 */
const PHOTON_GLOSS = 0.1;

/** Whether photons bring all the light surface s reflects, not only its paint's */
fn photonsGloss(s: u32) -> bool {
  return objects[s].surface.y >= PHOTON_GLOSS;
}


/** A flat pane, which shadow rays see through */
fn seesThrough(s: u32) -> bool {
  return isPane(s) && objects[s].surface.y == 0.;
}


/**
 * The fraction of light going in direction d that pane s reflects: between
 * its two faces, 2R / (1 + R), where R is what one face reflects
 */
fn paneReflectance(s: u32, d: vec3f) -> f32 {
  let r = fresnelDielectric(abs(dot(d, objects[s].normalShape.xyz)), objects[s].surface.x);
  return 2. * r / (1. + r);
}



/**
 * The fraction of light a smooth boundary reflects (Fresnel's equations,
 * for unpolarized light), for light arriving at an angle with cosine cosI,
 * into a material eta times as optically dense: 1.5 into glass, 1 / 1.5
 * back out of it. Past the critical angle on the way out, all of it.
 */
fn fresnelDielectric(cosI: f32, eta: f32) -> f32 {
  let c = clamp(cosI, 0., 1.);
  let sinT2 = (1. - c * c) / (eta * eta);
  if (sinT2 >= 1.) { return 1.; }
  let cosT = sqrt(1. - sinT2);
  let s = (c - eta * cosT) / (c + eta * cosT);
  let p = (eta * c - cosT) / (eta * c + cosT);
  return 0.5 * (s * s + p * p);
}


/**
 * The fraction of light metal reflects, in each channel, at an angle with
 * cosine cosI: its color head on, rising to white at grazing angles
 * (Schlick's form, which is what OpenPBR uses for metals without a separate
 * edge tint)
 */
fn fresnelMetal(color: vec3f, cosI: f32) -> vec3f {
  return color + (1. - color) * pow(1. - clamp(cosI, 0., 1.), 5.);
}


/** Paint's clear coat is like varnish: a little denser than air, as glass is */
const COAT_INDEX = 1.5;

/**
 * How much of the light scattered up from paint the coat reflects back down
 * into it, mostly by total internal reflection: 1 - (1 - 0.0918) / 1.5^2,
 * where 0.0918 is the coat's average reflectance for light from all
 * directions outside it
 */
const COAT_INSIDE_REFLECTANCE = 0.5963;


/**
 * Rough reflections are microfacet reflections (Walter et al., "Microfacet
 * Models for Refraction through Rough Surfaces"): the surface is made of tiny
 * mirrors, tilted by the GGX distribution, which has a sharp peak and long
 * soft tails, like real highlights. Roughness alpha is the tilts' spread,
 * from 0 for a perfect mirror. Below this it's too sharp for 32-bit floats.
 */
const MIN_ROUGHNESS = 0.002;


/** How many tiny mirrors face half-vector h, by the cosine of its angle from the normal */
fn ggx(cosH: f32, a2: f32) -> f32 {
  let d = cosH * cosH * (a2 - 1.) + 1.;
  return a2 / (PI * d * d);
}


/**
 * Smith's Lambda for GGX: from a direction with this cosine to the normal,
 * how much the tiny mirrors hide each other (G1 = 1 / (1 + Lambda))
 */
fn smithLambda(cosA: f32, a2: f32) -> f32 {
  let c2 = max(cosA * cosA, 1e-8);
  return 0.5 * (sqrt(1. + a2 * (1. - c2) / c2) - 1.);
}


/**
 * A random half-vector, picked in proportion to how much of the surface the
 * viewer sees facing it, so few samples are wasted on facets turned away
 * ("Sampling Visible GGX Normals with Spherical Caps", Dupuy & Benyoub). n
 * is the normal and v the direction to the viewer.
 */
fn sampleVisibleNormal(n: vec3f, v: vec3f, alpha: f32, u: vec2f) -> vec3f {
  let t = perpendicular(n);
  let b = cross(n, t);
  // Stretch the view as if the surface were smooth, pick a direction in the
  // cap the view sees, then unstretch
  let stretched = normalize(vec3f(alpha * dot(v, t), alpha * dot(v, b), dot(v, n)));
  let phi = 2. * PI * u.x;
  let z = (1. - u.y) * (1. + stretched.z) - stretched.z;
  let sinA = sqrt(clamp(1. - z * z, 0., 1.));
  let h = vec3f(sinA * cos(phi), sinA * sin(phi), z) + stretched;
  let local = normalize(vec3f(alpha * h.x, alpha * h.y, max(h.z, 1e-6)));
  return t * local.x + b * local.y + n * local.z;
}


/**
 * How much white GGX metal reflects with one bounce, by roughness and view
 * cosine: albedoTable in ggx.js, four to a vec4 (uniform arrays need that)
 */
@group(0) @binding(9) var<uniform> singleBounce: array<vec4f, ${(ALBEDO_SIZE * ALBEDO_SIZE) / 4}>;


fn singleBounceAt(row: u32, col: u32) -> f32 {
  let i = row * ${ALBEDO_SIZE}u + col;
  return singleBounce[i / 4u][i % 4u];
}


/** singleBounce at any roughness and view cosine, blending the nearest four */
fn singleBounceAlbedo(alpha: f32, cosV: f32) -> f32 {
  let p = clamp(vec2f(alpha, cosV), vec2f(0.), vec2f(1.)) * f32(${ALBEDO_SIZE - 1});
  let i = min(vec2u(p), vec2u(${ALBEDO_SIZE - 2}u));
  let f = p - vec2f(i);
  let top = mix(singleBounceAt(i.x, i.y), singleBounceAt(i.x, i.y + 1u), f.y);
  let bottom = mix(singleBounceAt(i.x + 1u, i.y), singleBounceAt(i.x + 1u, i.y + 1u), f.y);
  return mix(top, bottom, f.x);
}


/** The roughness of a rough surface */
fn roughness(s: u32) -> f32 {
  return max(objects[s].surface.y, MIN_ROUGHNESS);
}


/**
 * The chance that sampleSurface bounces off the glossy coat, or for metal,
 * 1. Roughly the share of light the coat reflects, seen from an angle with
 * this cosine, but at least a quarter of its coverage, so faint reflections
 * of lit things, not just of lights, still get found.
 */
fn coatChance(s: u32, cosV: f32) -> f32 {
  if (i32(objects[s].colorMaterial.w) == MIRROR) { return 1.; }
  let coverage = objects[s].surface.x;
  return coverage * mix(fresnelDielectric(cosV, COAT_INDEX), 1., 0.25);
}


/** The paint's part of what evalSurface last set bsdf to, without the coat's or metal's reflection */
var<private> evalPaint: vec3f;


/**
 * For paint (maybe with a glossy coat) or rough metal, sets bsdf to how much
 * light arriving from direction l it scatters toward the viewer, in
 * direction v, and returns the probability density that sampleSurface picks
 * l. n is the surface's normal on the viewer's side, which the coat and
 * metal reflect about, and ns the normal paint's bumps tilt.
 *
 * Paint's coat covers its gloss fraction of it, and reflects as clear
 * varnish does: a little head on, more toward grazing angles. What it
 * doesn't reflect reaches the paint. Metal reflects its color.
 */
fn evalSurface(s: u32, ns: vec3f, n: vec3f, v: vec3f, l: vec3f, bsdf: ptr<function, vec3f>) -> f32 {
  let metal = i32(objects[s].colorMaterial.w) == MIRROR;
  let color = objects[s].colorMaterial.rgb;
  let coverage = select(objects[s].surface.x, 1., metal);
  let cosV = max(dot(n, v), 1e-6);
  let cosL = dot(n, l);
  var glossy = vec3f(0.);
  var glossyPdf = 0.;
  if (coverage > 0. && cosL > 0.) {
    let a2 = roughness(s) * roughness(s);
    let h = normalize(v + l);
    let cosVH = dot(v, h);
    let d = ggx(max(dot(n, h), 0.), a2);
    let lambdaV = smithLambda(cosV, a2);
    // Facets hidden from the viewer or the light don't count
    let shadowing = 1. / (1. + lambdaV + smithLambda(cosL, a2));
    var f = vec3f(coverage * fresnelDielectric(cosVH, COAT_INDEX));
    // Light that bounces between the tiny mirrors before leaving, which one
    // bounce misses, scaled by how much of it each reflection keeps: its
    // reflectance head on
    var headOn = vec3f(coverage * 0.04);
    if (metal) {
      f = fresnelMetal(color, cosVH);
      headOn = color;
    }
    let single = singleBounceAlbedo(roughness(s), cosV);
    f *= 1. + headOn * (1. - single) / single;
    glossy = f * d * shadowing / (4. * cosV * cosL);
    // The density of l from sampleVisibleNormal
    glossyPdf = d / ((1. + lambdaV) * 4. * cosV);
  }
  var paint = vec3f(0.);
  if (!metal) {
    // Under the coat: light that gets through it scatters off the paint,
    // and what the coat reflects back down scatters again, and so on, so
    // paint loses a little more each time; that's why varnish deepens
    // colors. Coming out, it spreads into a wider range of directions than
    // it was in, by the index squared.
    let through = (1. - fresnelDielectric(cosV, COAT_INDEX)) *
      (1. - fresnelDielectric(max(dot(ns, l), 0.), COAT_INDEX));
    let coated = through / (COAT_INDEX * COAT_INDEX * (1. - color * COAT_INSIDE_REFLECTANCE));
    paint = color / PI * mix(vec3f(1.), coated, coverage);
  }
  *bsdf = paint + glossy;
  evalPaint = paint;
  let chance = coatChance(s, cosV);
  return (1. - chance) * max(dot(l, ns), 0.) / PI + chance * glossyPdf;
}


/**
 * Picks a random bounce direction off paint or rough metal: off the coat (or
 * metal) with probability coatChance, given choice uniform in [0, 1), or
 * otherwise favoring directions near the bumps' normal ns.
 */
fn sampleSurface(s: u32, ns: vec3f, n: vec3f, v: vec3f, choice: f32) -> vec3f {
  let u = rand2();
  if (choice < coatChance(s, max(dot(n, v), 0.))) {
    return reflect(-v, sampleVisibleNormal(n, v, roughness(s), u));
  }
  return directionAround(ns, sqrt(1. - u.x), 2. * PI * u.y);
}



// Wavelengths that paths through glass pick from, in nanometers
const MIN_WAVELENGTH = 380.;

const MAX_WAVELENGTH = 720.;


/** One side of the piecewise Gaussians in wavelengthColor */
fn lobe(x: f32, mean: f32, below: f32, above: f32) -> f32 {
  let t = (x - mean) / select(above, below, x < mean);
  return exp(-0.5 * t * t);
}


/**
 * How a wavelength looks in linear RGB, scaled so that the average over all
 * of them is white. A path that picks one at random and multiplies its color
 * by this comes out the same color on average, but bends by that wavelength
 * in glass. Uses the fit of the CIE 1931 color matching functions from
 * "Simple Analytic Approximations to the CIE XYZ Color Matching Functions"
 * (Wyman, Sloan & Shirley), with colors outside sRGB clipped. The scale
 * factors make each channel average 1 between MIN_ and MAX_WAVELENGTH.
 */
fn wavelengthColor(w: f32) -> vec3f {
  let x = 1.056 * lobe(w, 599.8, 37.9, 31.) + 0.362 * lobe(w, 442., 16., 26.7) - 0.065 * lobe(w, 501.1, 20.4, 26.2);
  let y = 0.821 * lobe(w, 568.8, 46.9, 40.5) + 0.286 * lobe(w, 530.9, 16.3, 31.1);
  let z = 1.217 * lobe(w, 437., 11.8, 36.) + 0.681 * lobe(w, 459., 26., 13.8);
  let rgb = vec3f(
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  );
  return max(rgb, vec3f(0.)) * vec3f(1.9299, 2.9470, 3.1109);
}


/**
 * Glass s's index of refraction at a wavelength: its own for yellow, more for
 * blue. Denser glass spreads colors more: diamond's fire, from an index of
 * 2.42, is about three times ordinary glass's.
 */
fn glassIndex(s: u32, w: f32) -> f32 {
  let index = objects[s].surface.x;
  return index + params.dispersion * 0.05 * (index - 1.) * ((550. / w) * (550. / w) - 1.);
}


/**
 * The fraction of light, per channel, that gets dist through glass ball s.
 * Colored glass absorbs light as it goes, so thick parts are deeper colored
 * than thin edges. Its color is what's left after going as far as its radius.
 */
fn glassTransmittance(s: i32, dist: f32) -> vec3f {
  if (s < 0) { return vec3f(1.); }
  let ball = objects[u32(s)];
  return pow(ball.colorMaterial.rgb, vec3f(dist / ball.centerRadius.w));
}
`;
