// Photons, for caustics: light followed from the lights through glass and
// off smooth mirrors to the first surface it lands on, or the first place
// it scatters in fog or hazy glass, where it's stored for the trace shader
// to gather (see gatherPhotons and gatherVolumePhotons in shaders/trace.js).
// The camera's paths leave that light to the photons. Each frame traces a
// fresh set into a hash grid: a linked list of photons per cell.

import {common} from './common.js';
import {detail} from './detail.js';
import {fog} from './fog.js';
import {geometry} from './geometry.js';
import {lights} from './lights.js';
import {materials} from './materials.js';
import {random} from './random.js';

/** Photons traced each frame */
export const PHOTONS = 1 << 17;
/**
 * Cells in the hash grid, each the head of a list of photons; the last
 * counts the photons stored so far
 */
export const PHOTON_CELLS = 1 << 18;
/** Photons stored each frame, at most: laser photons are stored at every bounce */
const PHOTON_SLOTS = PHOTONS * 3;
/**
 * u32s per photon: position and next, power and whether it's a laser's,
 * direction, normal (0 in fog or haze)
 */
const PHOTON_SIZE = 16;
/** u32s in the photon map: the cells' heads, then the photons */
export const PHOTON_MAP_SIZE = PHOTON_CELLS + PHOTON_SLOTS * PHOTON_SIZE;

/**
 * The photon map's layout and grid, for both shaders. Photons are stored in
 * cells twice the gathering radius across, so a gather only looks in the
 * eight around it. Each cell's head is the index of its last photon plus
 * one, or 0 for none, and each photon has the next one's the same way.
 */
export const photonGrid = /* wgsl */ `
const PHOTONS = ${PHOTONS}u;

const PHOTON_CELLS = ${PHOTON_CELLS}u;

const PHOTON_SLOTS = ${PHOTON_SLOTS}u;

const PHOTON_SIZE = ${PHOTON_SIZE}u;


/** Which cell of the grid point p is in */
fn photonCell(p: vec3f) -> vec3i {
  return vec3i(floor(p / (2. * params.photonRadius)));
}


/** Where a cell's head is in the photon map */
fn photonHash(cell: vec3i) -> u32 {
  let c = bitcast<vec3u>(cell);
  return ((c.x * 73856093u) ^ (c.y * 19349663u) ^ (c.z * 83492791u)) % (PHOTON_CELLS - 1u);
}


/** Where photon i starts in the photon map */
fn photonStart(i: u32) -> u32 {
  return PHOTON_CELLS + i * PHOTON_SIZE;
}
`;

export const photonShader = /* wgsl */ `${common}${random}${geometry}${lights}${fog}${materials}${detail}${photonGrid}
const PI = 3.14159265359;

/** The photon map; see photonGrid */
@group(0) @binding(5) var<storage, read_write> photonMap: array<atomic<u32>>;

/**
 * Where photons come from, four vec4s each: lights and the glass or mirrors
 * they aim at, and lasers. See photonEmitters in photons.js.
 */
@group(0) @binding(10) var<storage, read> emitters: array<vec4f>;


/**
 * The probability density, per steradian, of direction w from y, as
 * sampleAim picks it toward shape s: for a plate, by area, so it's the
 * distance squared over the area it covers seen from y; for anything else,
 * evenly from the cone of directions that hit the ball around it. 0 if w
 * misses. Far away, a ball's cone is so narrow that its cosine rounds to 1
 * in 32-bit floats, so it's measured by its sine.
 */
fn aimPdf(y: vec3f, w: vec3f, s: u32) -> f32 {
  let o = objects[s];
  let c = o.centerRadius.xyz - y;
  if (isPlate(s)) {
    let facing = dot(w, o.normalShape.xyz);
    let t = dot(c, o.normalShape.xyz) / facing;
    let h = w * t - c;
    if (facing == 0. || t <= 0. || abs(dot(h, o.uHalf.xyz)) > o.uHalf.w || abs(dot(h, o.vHalf.xyz)) > o.vHalf.w) { return 0.; }
    return t * t / (4. * o.uHalf.w * o.vHalf.w * abs(facing));
  }
  let r = o.centerRadius.w;
  let d2 = dot(c, c);
  if (d2 <= r * r) { return 1. / (4. * PI); }
  let sinSq = r * r / d2;
  let off = cross(w, c);
  if (dot(w, c) <= 0. || dot(off, off) > sinSq * d2) { return 0.; }
  return 1. / (2. * PI * sinSq / (1. + sqrt(1. - sinSq)));
}


/**
 * A direction from y toward shape s: for a plate, toward a point picked
 * evenly over it, so photons aimed at a window's panes all reach them; for
 * anything else, picked evenly from the cone of directions that hit the
 * ball around it, working with 1 - cos rather than cos, as aimPdf does
 */
fn sampleAim(y: vec3f, s: u32, u: vec2f) -> vec3f {
  let o = objects[s];
  let c = o.centerRadius.xyz - y;
  if (isPlate(s)) {
    let a = u * 2. - 1.;
    return normalize(c + o.uHalf.xyz * o.uHalf.w * a.x + o.vHalf.xyz * o.vHalf.w * a.y);
  }
  let r = o.centerRadius.w;
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


/**
 * Stores a photon at p, arriving in direction d with this power, on a
 * surface whose normal toward it is n, or 0 in fog or haze
 */
fn storePhoton(p: vec3f, power: vec3f, d: vec3f, n: vec3f, laser: bool) {
  let i = atomicAdd(&photonMap[PHOTON_CELLS - 1u], 1u);
  if (i >= PHOTON_SLOTS) { return; }
  let k = photonStart(i);
  atomicStore(&photonMap[k + 7u], u32(laser));
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

  // An emitter, by its share
  let u = rand();
  var e = 0u;
  for (var k = 0u; k < params.pairCount - 1u; k++) {
    if (u < emitters[4u * k].z) { break; }
    e = 4u * (k + 1u);
  }

  var power: vec3f;
  var o: vec3f;
  var d: vec3f;
  var wavelength = 0.;
  let laser = emitters[e].x < 0.;
  if (laser) {
    // From a point on its disk, straight ahead, and its own wavelength
    let disk = emitters[e + 1u];
    d = emitters[e + 2u].xyz;
    wavelength = emitters[e + 2u].w;
    let a = rand2();
    let across = perpendicular(d);
    let angle = 2. * PI * a.y;
    o = disk.xyz + (across * cos(angle) + cross(d, across) * sin(angle)) * disk.w * sqrt(a.x);
    power = emitters[e + 3u].rgb / (emitters[e].w * f32(PHOTONS));
  } else {
    // A point on the light, evenly by area
    let light = u32(emitters[e].x);
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
    // Toward the target, and the density of that direction over every
    // target this light aims at
    let w = sampleAim(y, u32(emitters[e].y), rand2());
    var dirPdf = 0.;
    for (var k = 0u; k < params.pairCount; k++) {
      let other = emitters[4u * k];
      if (other.x >= 0. && u32(other.x) == light) { dirPdf += other.w * aimPdf(y, w, u32(other.y)); }
    }
    let cosY = select(abs(dot(n, w)), dot(n, w), isPlate(light));
    if (cosY <= 0. || dirPdf <= 0.) { return; }
    power = emitted(light, -w) * cosY / (areaPdf * dirPdf * f32(PHOTONS));
    o = y + w * EPSILON;
    d = w;
  }

  var inside = -1;
  var tint = vec3f(1.);
  // A laser's light is all the photons', from the start and at every bounce,
  // since paths from the camera never find a laser. Other lights' photons
  // only carry light that has been through glass or off a mirror, as far as
  // the first thing it scatters off.
  var stores = laser;
  // Fewer bounces than paths from the camera: a few photons stay trapped in
  // glass teapots, and with 1000 they made the teapots scene 30% slower.
  // A level-5 glass sponge still matches the white furnace.
  for (var depth = 0; depth < 128; depth++) {
    d = normalize(d);
    let hit = intersect(o, d);
    if (hit < 0) { return; }
    let end = hitDist;
    let tri = hitTriangle;
    let bary = hitBary;
    let s = u32(hit);
    let material = i32(objects[s].colorMaterial.w);
    // Fog, or haze in glass. Until a photon stores, what it scatters is the
    // camera's to find, so it's only dimmed. After, it may scatter, as in
    // trace: a random distance, picked by one channel's density, and where
    // it does, it's stored.
    let densities = mediumDensities(inside);
    if (any(densities > vec3f(0.))) {
      if (!stores) {
        power *= exp(-densities * end);
      } else {
        let u = rand2();
        let scatter = -log(1. - u.x) / densities[min(u32(u.y * 3.), 2u)];
        if (scatter < end) {
          let transmittance = exp(-densities * scatter);
          power *= densities * transmittance / max(fogScatterPdf(densities, transmittance), 1e-30);
          power *= glassTransmittance(inside, scatter);
          storePhoton(o + d * scatter, power * tint, d, vec3f(0.), laser);
          if (!laser) { return; }
          // A laser's goes on, in a new direction, unless it's absorbed
          let albedo = mediumAlbedo(inside);
          if (rand() >= albedo) { return; }
          o += d * scatter;
          d = samplePhase(d);
          continue;
        }
        let transmittance = exp(-densities * end);
        power *= transmittance / max(dot(transmittance, vec3f(1. / 3.)), 1e-30);
      }
    }
    if (material == LIGHT) { return; }
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
    } else if (i32(objects[s].normalShape.w) >= SPONGE) {
      sn = fractalNormal(objects[s], p);
      facet = sn;
    }
    let into = dot(facet, d) < 0.;
    let nl = select(-facet, facet, into);
    var snl = select(-sn, sn, into);

    if (!isSmooth(s)) {
      if (stores) { storePhoton(p, power * tint, d, nl, laser); }
      if (!laser) { return; }
      // A laser's bounces on, as paint or rough metal scatter it, and ends
      // at random in proportion to how much it loses (Russian roulette)
      let next = sampleSurface(s, snl, snl, -d, rand());
      let cosTheta = dot(next, snl);
      if (cosTheta <= 0. || dot(next, nl) <= 0.) { return; }
      var bsdf: vec3f;
      let pdf = evalSurface(s, snl, snl, -d, next, &bsdf);
      if (pdf <= 0.) { return; }
      let kept = bsdf * cosTheta / pdf;
      let q = min(0.95, peak(kept));
      if (rand() >= q) { return; }
      power *= kept / q;
      d = next;
      o = p + nl * EPSILON;
      continue;
    }

    // Straight through a flat pane, as in trace: shadow rays find this
    // light, so it stores no photons
    if (seesThrough(s) && rand() >= paneReflectance(s, d)) {
      power *= objects[s].colorMaterial.rgb;
      o = p + d * EPSILON;
      continue;
    }
    // Through glass or off a mirror: other lights' photons store from here
    stores = true;
    if (material == GLASS && objects[s].surface.y > 0. && !isPlate(s)) {
      // Frosted, as in trace
      snl = sampleVisibleNormal(snl, -d, roughness(s), rand2());
    }
    // Wavy panes, as in trace
    var slope = vec3f(0.);
    if (isPane(s) && objects[s].surface.y > 0.) {
      slope = paneSlope(s, p);
      let tilted = normalize(sn - slope);
      snl = select(-tilted, tilted, into);
    }
    var next = reflect(d, snl);
    var reflected = true;
    if (material == MIRROR) { power *= fresnelMetal(objects[s].colorMaterial.rgb, -dot(d, snl)); }
    // Flat panes that get here reflect. Wavy ones reflect or go through,
    // bent by their ripples.
    if (isPane(s) && objects[s].surface.y > 0. && rand() >= paneReflectance(s, d)) {
      next = normalize(d - (objects[s].surface.x - 1.) * slope);
      reflected = false;
      power *= objects[s].colorMaterial.rgb;
    }
    if (material == GLASS && !isPlate(s)) {
      var index = objects[s].surface.x;
      if (wavelength > 0.) { index = glassIndex(s, wavelength); }
      let t = refract(d, snl, select(index, 1. / index, into));
      // Reflects or refracts at random, by how much of the light does each
      if (any(t != vec3f(0.)) && rand() >= fresnelDielectric(-dot(d, snl), select(1. / index, index, into))) {
        next = t;
        reflected = false;
        inside = select(-1, i32(s), into);
        // Dispersion, as in trace: the first refraction picks a wavelength.
        // A laser's is its own.
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
