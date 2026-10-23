// Photons, for caustics: light followed from the lights through glass and
// off smooth mirrors to the first surface it lands on, where it's stored
// for the trace shader to gather (see gatherPhotons in shaders/trace.js).
// The camera's paths leave that light to the photons. Each frame traces a
// fresh set into a hash grid: a linked list of photons per cell.

import {common} from './common.js';
import {fog} from './fog.js';
import {geometry} from './geometry.js';
import {lights} from './lights.js';
import {materials} from './materials.js';
import {random} from './random.js';

/** Photons traced each frame */
export const PHOTONS = 1 << 16;
/** Cells in the hash grid, each the head of a list of photons */
export const PHOTON_CELLS = 1 << 18;
/** u32s per photon: position and next, power, direction, normal */
const PHOTON_SIZE = 16;
/** u32s in the photon map: the cells' heads, then the photons */
export const PHOTON_MAP_SIZE = PHOTON_CELLS + PHOTONS * PHOTON_SIZE;

/**
 * The photon map's layout and grid, for both shaders. Photons are stored in
 * cells twice the gathering radius across, so a gather only looks in the
 * eight around it. Each cell's head is the index of its last photon plus
 * one, or 0 for none, and each photon has the next one's the same way.
 */
export const photonGrid = /* wgsl */ `
const PHOTONS = ${PHOTONS}u;

const PHOTON_CELLS = ${PHOTON_CELLS}u;

const PHOTON_SIZE = ${PHOTON_SIZE}u;


/** Which cell of the grid point p is in */
fn photonCell(p: vec3f) -> vec3i {
  return vec3i(floor(p / (2. * params.photonRadius)));
}


/** Where a cell's head is in the photon map */
fn photonHash(cell: vec3i) -> u32 {
  let c = bitcast<vec3u>(cell);
  return ((c.x * 73856093u) ^ (c.y * 19349663u) ^ (c.z * 83492791u)) % PHOTON_CELLS;
}


/** Where photon i starts in the photon map */
fn photonStart(i: u32) -> u32 {
  return PHOTON_CELLS + i * PHOTON_SIZE;
}
`;

export const photonShader = /* wgsl */ `${common}${random}${geometry}${lights}${fog}${materials}${photonGrid}
const PI = 3.14159265359;

/** The photon map; see photonGrid */
@group(0) @binding(5) var<storage, read_write> photonMap: array<atomic<u32>>;

/**
 * Lights and the glass or mirrors they aim photons at: light index, target
 * index, running total of the shares, and share. See photonPairs in
 * photons.js.
 */
@group(0) @binding(10) var<storage, read> pairs: array<vec4f>;


/** The radius of a ball around all of shape s */
fn boundingRadius(s: u32) -> f32 {
  if (isPlate(s)) { return length(vec2f(objects[s].uHalf.w, objects[s].vHalf.w)); }
  return objects[s].centerRadius.w;
}


/**
 * The probability density, per steradian, of direction w from y, if it's
 * picked evenly from the cone of directions that hit the ball around shape
 * s; 0 if it isn't in it. Far away, the cone is so narrow that its cosine
 * rounds to 1 in 32-bit floats, so it's measured by its sine.
 */
fn conePdf(y: vec3f, w: vec3f, s: u32) -> f32 {
  let c = objects[s].centerRadius.xyz - y;
  let r = boundingRadius(s);
  let d2 = dot(c, c);
  if (d2 <= r * r) { return 1. / (4. * PI); }
  let sinSq = r * r / d2;
  let off = cross(w, c);
  if (dot(w, c) <= 0. || dot(off, off) > sinSq * d2) { return 0.; }
  return 1. / (2. * PI * sinSq / (1. + sqrt(1. - sinSq)));
}


/**
 * A direction picked evenly from the cone of directions from y that hit the
 * ball around shape s, working with 1 - cos rather than cos, for the same
 * reason
 */
fn sampleCone(y: vec3f, s: u32, u: vec2f) -> vec3f {
  let c = objects[s].centerRadius.xyz - y;
  let r = boundingRadius(s);
  let d2 = dot(c, c);
  if (d2 <= r * r) { return directionAround(vec3f(0., 1., 0.), 1. - 2. * u.x, 2. * PI * u.y); }
  let sinSq = r * r / d2;
  let oneMinusCos = u.x * sinSq / (1. + sqrt(1. - sinSq));
  let sinA = sqrt(oneMinusCos * (2. - oneMinusCos));
  let axis = c / sqrt(d2);
  let a = perpendicular(axis);
  let b = cross(axis, a);
  let phi = 2. * PI * u.y;
  return normalize(axis * (1. - oneMinusCos) + (a * cos(phi) + b * sin(phi)) * sinA);
}


/** Stores photon i at p, arriving in direction d with this power, on a surface whose normal toward it is n */
fn storePhoton(i: u32, p: vec3f, power: vec3f, d: vec3f, n: vec3f) {
  let k = photonStart(i);
  atomicStore(&photonMap[k], bitcast<u32>(p.x));
  atomicStore(&photonMap[k + 1u], bitcast<u32>(p.y));
  atomicStore(&photonMap[k + 2u], bitcast<u32>(p.z));
  atomicStore(&photonMap[k + 4u], bitcast<u32>(power.r));
  atomicStore(&photonMap[k + 5u], bitcast<u32>(power.g));
  atomicStore(&photonMap[k + 6u], bitcast<u32>(power.b));
  atomicStore(&photonMap[k + 8u], bitcast<u32>(d.x));
  atomicStore(&photonMap[k + 9u], bitcast<u32>(d.y));
  atomicStore(&photonMap[k + 10u], bitcast<u32>(d.z));
  atomicStore(&photonMap[k + 12u], bitcast<u32>(n.x));
  atomicStore(&photonMap[k + 13u], bitcast<u32>(n.y));
  atomicStore(&photonMap[k + 14u], bitcast<u32>(n.z));
  // Onto the front of its cell's list
  let next = atomicExchange(&photonMap[photonHash(photonCell(p))], i + 1u);
  atomicStore(&photonMap[k + 3u], next);
}


@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= PHOTONS || params.pairCount == 0u) { return; }
  seed = pcg(i + pcg(params.seed + 7919u));
  // Plain random numbers, not the camera's Sobol sequence
  dimension = SOBOL_PAIRS;

  // A light and a target, by their shares
  let u = rand();
  var pick = 0u;
  for (var k = 0u; k < params.pairCount - 1u; k++) {
    if (u < pairs[k].z) { break; }
    pick = k + 1u;
  }
  let light = u32(pairs[pick].x);
  let aim = u32(pairs[pick].y);

  // A point on the light, evenly by area
  let shape = objects[light];
  var y: vec3f;
  var n: vec3f;
  var areaPdf: f32;
  if (isPlate(light)) {
    let a = rand2() * 2. - 1.;
    y = shape.centerRadius.xyz + shape.uHalf.xyz * shape.uHalf.w * a.x + shape.vHalf.xyz * shape.vHalf.w * a.y;
    n = shape.normalShape.xyz;
    areaPdf = 1. / (4. * shape.uHalf.w * shape.vHalf.w);
  } else {
    let r = shape.centerRadius.w;
    let a = rand2();
    n = directionAround(vec3f(0., 1., 0.), 1. - 2. * a.x, 2. * PI * a.y);
    y = shape.centerRadius.xyz + n * r;
    areaPdf = 1. / (4. * PI * r * r);
  }

  // Toward the target, and the density of that direction over every target
  // this light aims at
  let w = sampleCone(y, aim, rand2());
  var dirPdf = 0.;
  for (var k = 0u; k < params.pairCount; k++) {
    if (u32(pairs[k].x) == light) { dirPdf += pairs[k].w * conePdf(y, w, u32(pairs[k].y)); }
  }
  let cosY = select(abs(dot(n, w)), dot(n, w), isPlate(light));
  if (cosY <= 0. || dirPdf <= 0.) { return; }
  var power = emitted(light, -w) * cosY / (areaPdf * dirPdf * f32(PHOTONS));

  var o = y + w * EPSILON;
  var d = w;
  var inside = -1;
  var wavelength = 0.;
  var tint = vec3f(1.);
  for (var depth = 0; depth < 32; depth++) {
    d = normalize(d);
    let hit = intersect(o, d);
    if (hit < 0) { return; }
    let end = hitDist;
    let tri = hitTriangle;
    let bary = hitBary;
    let s = u32(hit);
    let material = i32(objects[s].colorMaterial.w);
    if (material == LIGHT) { return; }
    // Fog dims it, but its scattered light is the camera's to find
    if (params.fogDensity > 0.) { power *= exp(-fogDensities() * end); }
    power *= glassTransmittance(inside, end);
    var p = o + d * end;
    var sn = objects[s].normalShape.xyz;
    var facet = sn;
    // Photons from far lights, like a sky dome, land up to a few times
    // EPSILON off the surface in 32-bit floats, and could start their next
    // leg on the wrong side of it, so they're put back on it exactly
    if (i32(objects[s].normalShape.w) == SPHERE) {
      sn = normalize(p - objects[s].centerRadius.xyz);
      facet = sn;
      p = objects[s].centerRadius.xyz + sn * objects[s].centerRadius.w;
    } else if (isPlate(s)) {
      p -= sn * dot(p - objects[s].centerRadius.xyz, sn);
    } else if (i32(objects[s].normalShape.w) == TEAPOT) {
      sn = teapotNormal(objects[s], tri, bary, true);
      facet = teapotNormal(objects[s], tri, bary, false);
    } else if (i32(objects[s].normalShape.w) == DIAMOND) {
      sn = diamondNormal(objects[s], tri);
      facet = sn;
    }
    let into = dot(facet, d) < 0.;
    let nl = select(-facet, facet, into);

    if (!isSmooth(s)) {
      // Only through glass or off a mirror first: light straight from a
      // light is the camera's to find
      if (depth > 0) { storePhoton(i, p, power * tint, d, nl); }
      return;
    }

    var snl = select(-sn, sn, into);
    if (material == GLASS && objects[s].surface.y > 0.) {
      // Frosted, as in trace
      snl = sampleVisibleNormal(snl, -d, roughness(s), rand2());
    }
    var next = reflect(d, snl);
    var reflected = true;
    if (material == MIRROR) { power *= fresnelMetal(objects[s].colorMaterial.rgb, -dot(d, snl)); }
    if (material == GLASS) {
      var index = objects[s].surface.x;
      if (wavelength > 0.) { index = glassIndex(s, wavelength); }
      let t = refract(d, snl, select(index, 1. / index, into));
      // Reflects or refracts at random, by how much of the light does each
      if (any(t != vec3f(0.)) && rand() >= fresnelDielectric(-dot(d, snl), select(1. / index, index, into))) {
        next = t;
        reflected = false;
        if (!isPlate(s)) { inside = select(-1, i32(s), into); }
        // Dispersion, as in trace: the first refraction picks a wavelength
        if (wavelength == 0. && params.dispersion > 0.) {
          wavelength = mix(MIN_WAVELENGTH, MAX_WAVELENGTH, rand());
          tint = wavelengthColor(wavelength);
          let bent = refract(d, snl, select(glassIndex(s, wavelength), 1. / glassIndex(s, wavelength), into));
          next = select(reflect(d, snl), bent, any(bent != vec3f(0.)));
          reflected = all(bent == vec3f(0.));
        }
      }
    }
    // A frosted facet can send it the wrong way across; flip it back
    if ((dot(next, nl) > 0.) != reflected) { next -= 2. * dot(next, nl) * nl; }
    d = next;
    o = p + nl * select(-EPSILON, EPSILON, dot(d, nl) > 0.);
  }
}
`;
