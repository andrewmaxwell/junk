// The path tracer: each dispatch adds samples for every pixel to running
// sums, which the display shader divides by the sample count. Its WGSL is
// in pieces, one file each, joined here into one module, so each piece can
// use the others' functions and constants.

import {common} from './common.js';
import {detail} from './detail.js';
import {fog} from './fog.js';
import {geometry} from './geometry.js';
import {lights} from './lights.js';
import {materials} from './materials.js';
import {photonGrid} from './photons.js';
import {random} from './random.js';

export const traceShader = /* wgsl */ `${common}${random}${geometry}${lights}${fog}${materials}${detail}${photonGrid}
const PI = 3.14159265359;

/** Per pixel: summed color, and in w the sample count */
@group(0) @binding(2) var<storage, read_write> sums: array<vec4f>;

/**
 * Two per pixel. First, summed squared color, each channel separately, for
 * estimating noise. Not just brightness: under differently colored lights,
 * samples can be equally bright but differently colored. Second, summed
 * light that trace clamped away from lights the camera sees, for the lens
 * glow. A light thousands of times brighter than white glows far more than
 * one just over it, though both show as white. (Separate buffers would pass
 * WebGPU's default limit of 8 per shader.)
 */
@group(0) @binding(3) var<storage, read_write> sqGlowSums: array<vec4f>;

/** Caustic photons, from shaders/photons.js; see photonGrid */
@group(0) @binding(5) var<storage, read> photonMap: array<u32>;

/** Per tile: 1 if it still needs samples. Written by tileShader. */
@group(0) @binding(4) var<storage, read> tiles: array<u32>;

/**
 * For the denoiser, per pixel: the summed color (in rgb) of what each sample
 * first saw, and its normal (xyz) and distance (w). See guideAlbedo. In
 * albedoSums' w, not summed: the object the camera sees there, for
 * outlining it, or -1. (A buffer of its own would pass WebGPU's default
 * limit of 8 per shader.)
 */
@group(0) @binding(7) var<storage, read_write> albedoSums: array<vec4f>;

@group(0) @binding(8) var<storage, read_write> normalDepthSums: array<vec4f>;

/** The current sample's light that the clamp in trace removed */
var<private> clamped: vec3f;

/**
 * What the current sample first saw, for the denoiser: the first surface
 * that isn't a smooth mirror, seen through any that are (or the last of
 * those, if the path scatters in fog first). Its color, its normal facing
 * the camera, and how far the path went to get there. Neighboring pixels
 * that saw the same surface can share their light; ones that didn't can't.
 */
var<private> guideAlbedo: vec3f;

var<private> guideNormal: vec3f;

var<private> guideDepth: f32;

/** Whether the guide is settled for this sample */
var<private> guided: bool;

/** The first object the current sample hit, or NONE */
var<private> firstHit: u32;

/** Scale factor that caps a bounced-light contribution at maxIndirect. */
fn indirectScale(c: vec3f) -> f32 {
  let brightest = max(c.r, max(c.g, c.b));
  return select(1., params.maxIndirect / brightest, brightest > params.maxIndirect);
}

/**
 * With depth of field, how many pixels something dist along a camera ray
 * (from the lens, through any mirrors and glass) is blurred across: at
 * least 1. A light blurred across n pixels can give each at most 1 / n of
 * its brightness, so its samples can safely be n times brighter before the
 * clamp in trace would dim it. Otherwise out-of-focus lights, spread into
 * big discs, would come out much dimmer than they should.
 */
fn blurArea(direction: vec3f, dist: f32) -> f32 {
  if (params.lensRadius == 0.) { return 1.; }
  let depth = dist * dot(direction, params.camForward);
  // Radius of the circle of confusion on the image plane at distance 1, and
  // the size of a pixel there
  let radius = params.lensRadius * abs(1. / depth - 1. / params.focusDistance);
  let pixel = length(params.camUp) / f32(params.height);
  return max(1., PI * radius * radius / (pixel * pixel));
}

/**
 * Light from this frame's photons landing near p on surface s, toward the
 * viewer in direction v: each photon's power, scattered by the paint as
 * light from where it came from would be, spread over the circle of
 * params.photonRadius around p (a progressive photon map). Only photons on
 * the same side of a surface facing the same way, so light doesn't leak
 * around corners or through walls. ns is the bumps' normal, n the smooth
 * one, and nl the real surface's, all facing the viewer. Not by the glossy
 * coat or metal: their sharp reflections would need far more photons, so
 * paths from the camera find that light, as for any other. Except lasers',
 * which paths from the camera never find.
 */
fn gatherPhotons(s: u32, p: vec3f, ns: vec3f, n: vec3f, nl: vec3f, v: vec3f) -> vec3f {
  let r = params.photonRadius;
  var sum = vec3f(0.);
  // The eight cells within r of p
  let first = photonCell(p - r);
  for (var k = 0; k < 8; k++) {
    let cell = first + vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    var i = photonMap[photonHash(cell)];
    while (i != 0u) {
      let start = photonStart(i - 1u);
      i = photonMap[start + 3u];
      let q = bitcast<vec3f>(vec3u(photonMap[start], photonMap[start + 1u], photonMap[start + 2u]));
      // Other cells can share this one's list
      if (any(photonCell(q) != cell)) { continue; }
      let gap = q - p;
      if (dot(gap, gap) > r * r) { continue; }
      let normal = bitcast<vec3f>(vec3u(photonMap[start + 12u], photonMap[start + 13u], photonMap[start + 14u]));
      if (dot(normal, nl) < 0.9) { continue; }
      let l = -bitcast<vec3f>(vec3u(photonMap[start + 8u], photonMap[start + 9u], photonMap[start + 10u]));
      if (dot(l, nl) <= 0.) { continue; }
      var bsdf: vec3f;
      evalSurface(s, ns, n, v, l, &bsdf);
      let laser = photonMap[start + 7u] != 0u;
      sum += select(evalPaint, bsdf, laser) * bitcast<vec3f>(vec3u(photonMap[start + 4u], photonMap[start + 5u], photonMap[start + 6u]));
    }
  }
  return sum / (PI * r * r);
}

/**
 * Light from this frame's photons scattered in fog or haze near p, toward a
 * viewer looking in direction d: each photon's power, scattered by the
 * phase function, spread over the ball of params.photonRadius around p, and
 * over the medium's densities, since denser fog stops more photons there for
 * the same light passing through (volumetric photon mapping)
 */
fn gatherVolumePhotons(p: vec3f, d: vec3f, densities: vec3f) -> vec3f {
  let r = params.photonRadius;
  var sum = vec3f(0.);
  let first = photonCell(p - r);
  for (var k = 0; k < 8; k++) {
    let cell = first + vec3i(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    var i = photonMap[photonHash(cell)];
    while (i != 0u) {
      let start = photonStart(i - 1u);
      i = photonMap[start + 3u];
      // Surface photons have a normal; these don't
      if (photonMap[start + 12u] != 0u || photonMap[start + 13u] != 0u || photonMap[start + 14u] != 0u) { continue; }
      let q = bitcast<vec3f>(vec3u(photonMap[start], photonMap[start + 1u], photonMap[start + 2u]));
      if (any(photonCell(q) != cell)) { continue; }
      let gap = q - p;
      if (dot(gap, gap) > r * r) { continue; }
      let w = bitcast<vec3f>(vec3u(photonMap[start + 8u], photonMap[start + 9u], photonMap[start + 10u]));
      sum += phase(w, -d) * bitcast<vec3f>(vec3u(photonMap[start + 4u], photonMap[start + 5u], photonMap[start + 6u]));
    }
  }
  return sum / (4. / 3. * PI * r * r * r * max(densities, vec3f(1e-30)));
}

/** Follows one path from the camera, returning the light it carries. */
fn trace(origin: vec3f, direction: vec3f) -> vec3f {
  var o = origin;
  var d = direction;
  // Light gathered so far
  var color = vec3f(0.);
  // Throughput: the fraction of light arriving at the current hit that makes
  // it back to the camera, after all the surfaces it has bounced off so far
  var through = vec3f(1.);
  // True until the path hits a diffuse surface or scatters in fog
  var seenByCamera = true;
  // Probability of the random choices made so far that the throughput was
  // boosted to make up for, like whether glass reflected or refracted
  var choiceProb = 1.;
  // Nonzero when a diffuse surface or fog randomly picked this ray's
  // direction: the probability density it picked it with
  var bouncePdf = 0.;
  // Once the path refracts through glass, the one wavelength it follows from
  // then on (0 before), and that wavelength's color. Light is multiplied by
  // the color after clamping, so clamping doesn't change its hue.
  var wavelength = 0.;
  var tint = vec3f(1.);
  // How far the path has gone while seenByCamera, through mirrors and glass
  var cameraDist = 0.;
  // lightGuessTotal where the path last picked a light, for when its bounce
  // from there hits one
  var bounceTotal = 0.;
  // lightGuessTotal along the current ray, for equiangular sampling
  var rayTotal = 0.;
  // Which glass ball the path is inside, or -1
  var inside = -1;
  // How light is split with the photons (shaders/photons.js), which carry
  // light that reaches the first surface the camera sees through glass or
  // off smooth mirrors, so it isn't counted twice. 0 until that surface, if
  // the camera reaches it through nothing but glass and mirrors; 1 after
  // bouncing off it; 2 once glass or mirrors follow, when the photons
  // brought the light that the surface's paint scatters, and the path only
  // counts its gloss's share, glossyShare; 3 after anything else, when
  // everything is the path's.
  var causticState = 0u;
  var glossyShare = vec3f(1.);

  for (var depth = 0; depth < 100; depth++) {
    // In 32-bit floats, each new direction built from the last one is a bit
    // off unit length, and that compounds over bounces. Even 0.3% too long
    // makes a glossy lobe like cos ^ 2000 overflow to infinity.
    d = normalize(d);
    let hit = intersect(o, d);
    // Saved, since shadow rays change these
    let end = hitDist;
    let tri = hitTriangle;
    let bary = hitBary;
    if (seenByCamera) { cameraDist += end; }
    if (depth == 0) { firstHit = select(NONE, u32(hit), hit >= 0); }
    if (!guided && hit >= 0) {
      let g = objects[u32(hit)];
      var gn = g.normalShape.xyz;
      if (i32(g.normalShape.w) == SPHERE) { gn = normalize(o + d * end - g.centerRadius.xyz); }
      if (i32(g.normalShape.w) == TEAPOT) { gn = teapotNormal(g, tri, bary, true); }
      if (i32(g.normalShape.w) == DIAMOND) { gn = diamondNormal(g, tri); }
      guideNormal = faceForward(gn, d, gn);
      // Lights are far brighter than any surface color; their hue will do
      guideAlbedo = g.colorMaterial.rgb / max(1., peak(g.colorMaterial.rgb));
      guideDepth = cameraDist;
      // Through mirrors, but not glass: whether a path through glass
      // reflects or refracts, and which way its wavelength bends, is random,
      // so what's behind it would be a noisy guide
      guided = !isSmooth(u32(hit)) || i32(g.colorMaterial.w) == GLASS;
    }
    // Fog fills the scene, out to its farthest surfaces, not all of space: a
    // ray that hits nothing has left it. Otherwise rays escaping an open
    // scene would wander on through endless fog, far from any light, which
    // took most of the time in foggy scenes and added nothing visible.
    // Or in hazy glass, its haze, where no light shines straight in
    let densities = mediumDensities(inside);
    let foggy = any(densities > vec3f(0.)) && hit >= 0;
    let fogLit = foggy && inside < 0 && params.sampling != 2u && params.lightCount > 0u;
    // Only on rays the camera sees directly, where the glow around lights
    // shows the most. Later bounces aren't worth the extra shadow ray.
    let equiangular = fogLit && seenByCamera;

    // Direct light on the fog along this ray, at a distance picked by
    // equiangular sampling. Scattering in the fog below finds it too, so
    // the two are weighted by how likely each was to pick that distance
    // (with that light): equiangular wins near small lights, and scattering
    // in dense fog, where light doesn't get far.
    if (equiangular) {
      let u = rand2();
      rayTotal = lightGuessTotal(o, d, true);
      let light = pickLight(o, d, true, u.x, rayTotal);
      let eq = sampleEquiangular(o, d, end, light, u.y);
      let p = o + d * eq.x;
      let ls = sampleLight(p, light);
      let visible = lightVisibility(p, ls, light);
      if (any(visible > vec3f(0.))) {
        let pick = lightPickProb(p, vec3f(0.), false, light, lightGuessTotal(p, vec3f(0.), false));
        let transmittance = exp(-fogDensities() * eq.x);
        let pdf = lightPickProb(o, d, true, light, rayTotal) * eq.y;
        let scatterPdf = fogScatterPdf(densities, transmittance) * pick;
        var weight = powerHeuristic(pdf, scatterPdf);
        let ph = phase(d, ls.xyz);
        if (params.sampling == 0u) { weight *= powerHeuristic(pick / ls.w, ph); }
        let scattered = transmittance * fogDensities() * FOG_ALBEDO;
        let c = through * emitted(light, ls.xyz) * scattered * visible * (ph * weight * ls.w / pdf);
        color += tint * c * select(indirectScale(c), 1., seenByCamera);
      }
    }

    // Fog: the ray scatters after a random distance, sooner in denser fog.
    // If that's before what it hit, it scatters instead of getting there.
    // With blue fog, each channel has its own density; the distance is
    // picked using one of them at random, and the throughput corrects for
    // how likely the others were to stop there or get past it.
    var fogDist = 1e30;
    if (foggy) {
      let u = rand2();
      let density = densities[min(u32(u.y * 3.), 2u)];
      fogDist = -log(1. - u.x) / density;
      // The max()es keep it from being 0 / 0, which is NaN, when so little
      // light gets that far that it rounds to 0 in every channel
      if (fogDist < end) {
        let transmittance = exp(-densities * fogDist);
        through *= densities * transmittance / max(fogScatterPdf(densities, transmittance), 1e-30);
      } else {
        let transmittance = exp(-densities * end);
        through *= transmittance / max(dot(transmittance, vec3f(1. / 3.)), 1e-30);
      }
    }
    through *= glassTransmittance(inside, min(fogDist, end));
    if (fogDist < end) {
      // Fog absorbs some light. After a few bounces, end the path with that
      // probability instead, so survivors don't get dimmer.
      if (depth < 5) {
        through *= mediumAlbedo(inside);
      } else if (rand() >= mediumAlbedo(inside)) {
        break;
      }
      let p = o + d * fogDist;

      // Direct light, as for diffuse surfaces below, weighted against the
      // equiangular sample above if there was one. Fog scatters light evenly
      // in all directions.
      if (fogLit) {
        bounceTotal = lightGuessTotal(p, vec3f(0.), false);
        let light = pickLight(p, vec3f(0.), false, rand2().x, bounceTotal);
        let pick = lightPickProb(p, vec3f(0.), false, light, bounceTotal);
        let ls = sampleLight(p, light);
        let visible = lightVisibility(p, ls, light);
        if (any(visible > vec3f(0.))) {
          var weight = 1.;
          if (equiangular) {
            let scatterPdf = fogScatterPdf(densities, exp(-densities * fogDist)) * pick;
            let eqPdf = lightPickProb(o, d, true, light, rayTotal) * equiangularPdf(o, d, end, light, fogDist);
            weight = powerHeuristic(scatterPdf, eqPdf);
          }
          let ph = phase(d, ls.xyz);
          if (params.sampling == 0u) { weight *= powerHeuristic(pick / ls.w, ph); }
          let c = through * emitted(light, ls.xyz) * visible * (ph * weight * ls.w / pick);
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: scatter in a random direction. Its density equals
      // the phase function, so the throughput is unchanged.
      // Caustics: light that reached here through glass or off mirrors
      if (causticState == 0u && params.pairCount > 0u) {
        // In glass, light is squeezed into a narrower cone of directions,
        // so it's index^2 times as bright there, as the photons find. Paths
        // from the camera skip that factor going in and coming back out,
        // since it cancels, but this one doesn't come back out.
        var squeeze = 1.;
        if (inside >= 0) {
          var index = objects[u32(inside)].surface.x;
          if (wavelength > 0.) { index = glassIndex(u32(inside), wavelength); }
          squeeze = 1. / (index * index);
        }
        color += tint * through * squeeze * gatherVolumePhotons(p, d, densities);
        causticState = 1u;
        glossyShare = vec3f(0.);
      } else {
        causticState = 3u;
      }

      let next = samplePhase(d);
      bouncePdf = phase(d, next);
      seenByCamera = false;
      guided = true;
      o = p;
      d = next;
      continue;
    }

    if (hit < 0) { break; }
    let s = u32(hit);
    let shape = objects[s];
    let sColor = shape.colorMaterial.rgb;
    let material = i32(shape.colorMaterial.w);

    if (material == LIGHT) {
      // The photons brought the paint's share of this light already
      if (causticState == 2u && all(glossyShare == vec3f(0.))) { break; }
      var w = 1.;
      if (bouncePdf > 0.) { w = bounceLightWeight(o, d, end, bouncePdf, s, bounceTotal); }
      var e = emitted(s, d) * w * through;
      if (causticState == 2u) { e *= glossyShare; }
      if (seenByCamera) {
        // The light is far brighter than the screen can show. Clamping it
        // to the screen's brightest here, before pixel samples are averaged,
        // lets its edges antialias; otherwise a pixel 1% covered by the
        // light shows at full brightness. Paths that got here by random
        // choices clamp higher, to keep the boost that makes up for the
        // paths that went elsewhere. Otherwise a light behind glass, which
        // only about half of the paths reach, would average out too dim.
        // The whole color is scaled down, so it keeps its hue; clamping
        // each channel would turn colored lights white.
        let blur = blurArea(direction, cameraDist);
        // But tone mapping washes colors far brighter than white out toward
        // white, and the clamp would stop a light from ever getting that
        // bright, so its reflections in glass would stay deep red or blue,
        // darker than what's around them. So wash it out first, by how
        // bright it really is, spread over the pixels it's blurred across.
        let unclamped = e;
        if (params.toneMap != 0u) {
          e = mix(e, vec3f(peak(e)), washOut(peak(applyContrast(e * params.exposure / blur))));
        }
        let limit = params.maxBrightness * blur / choiceProb;
        let kept = min(1., limit / peak(e));
        color += tint * e * kept;
        clamped += tint * unclamped * (1. - kept);
      } else {
        color += tint * e * indirectScale(e);
      }
      break; // lights don't reflect anything
    }

    // Russian roulette: after a few bounces, end the path at random, and
    // boost the survivors to make up for the ones that ended
    if (depth >= 5) {
      let q = min(0.95, peak(through));
      if (rand() >= q) { break; }
      through /= q;
      choiceProb *= q;
    }

    let p = o + d * end;
    var n = shape.normalShape.xyz;
    // The real surface's normal, which decides which side light is on.
    // Teapots' triangles are flat, but n is the curved patches' they were
    // cut from, for shading.
    var facet = n;
    if (i32(shape.normalShape.w) == SPHERE) {
      n = normalize(p - shape.centerRadius.xyz);
      facet = n;
    } else if (i32(shape.normalShape.w) == TEAPOT) {
      n = teapotNormal(shape, tri, bary, true);
      facet = teapotNormal(shape, tri, bary, false);
    } else if (i32(shape.normalShape.w) == DIAMOND) {
      n = diamondNormal(shape, tri);
      facet = n;
    }
    // Normals facing the side the ray came from
    let into = dot(facet, d) < 0.;
    let nl = select(-facet, facet, into);
    let smoothNl = select(-n, n, into);

    if (!isSmooth(s)) {
      // Bumps tilt the normal that diffuse shading sees, ns. nl stays the
      // real surface's, which light can't go through. Glossy reflections
      // ignore the bumps: a coat of gloss smooths them over, and on glossy
      // surfaces they'd look like hammered metal.
      // Later bounces skip them, since they're blurred out by then and the
      // noise is slow.
      var ns = smoothNl;
      if (depth < 2 && params.detail > 0.) { ns = bumpNormal(smoothNl, p); }
      var bsdf: vec3f;
      // Which light to aim at, and whether to bounce off the glossy coat
      let choices = rand2();

      // Caustics: light that reached here through glass or off mirrors
      if (causticState == 0u && params.pairCount > 0u) {
        color += tint * through * gatherPhotons(s, p, ns, smoothNl, nl, -d);
        causticState = 1u;
      } else {
        causticState = 3u;
      }

      // Direct light: aim a ray at a light rather than waiting for a random
      // bounce to stumble into one.
      if (params.sampling != 2u && params.lightCount > 0u) {
        bounceTotal = lightGuessTotal(p, vec3f(0.), false);
        let light = pickLight(p, vec3f(0.), false, choices.x, bounceTotal);
        let pick = lightPickProb(p, vec3f(0.), false, light, bounceTotal);
        let ls = sampleLight(p, light);
        let l = ls.xyz;
        let cosSurface = dot(l, ns);
        // Only counts if the light is in front of this surface, and nothing
        // is in the way
        var visible = vec3f(0.);
        if (cosSurface > 0. && dot(l, nl) > 0.) { visible = lightVisibility(p + nl * EPSILON, ls, light); }
        if (any(visible > vec3f(0.))) {
          // radiance * BSDF * cos(theta) / pdf, where the pdf is the chance
          // of picking this light over the cone's solid angle
          let pdf = evalSurface(s, ns, smoothNl, -d, l, &bsdf);
          var weight = 1.;
          if (params.sampling == 0u) { weight = powerHeuristic(pick / ls.w, pdf); }
          let c = through * emitted(light, l) * bsdf * visible * (weight * cosSurface * ls.w / pick);
          // Light reaching the first surface the camera sees is direct light
          color += tint * c * select(indirectScale(c), 1., seenByCamera);
        }
      }

      // Indirect light: bounce in a random direction. If this hits a light,
      // bounceLightWeight keeps it from being double counted with the above.
      let next = sampleSurface(s, ns, smoothNl, -d, choices.y);
      let cosTheta = dot(next, ns);
      // A glossy lobe, or a bump, pointed it into the surface
      if (cosTheta <= 0. || dot(next, nl) <= 0.) { break; }
      bouncePdf = evalSurface(s, ns, smoothNl, -d, next, &bsdf);
      // Far out in a tight lobe, the density underflows to 0, and 0 / 0
      // would be NaN. A direction that's never picked carries no light.
      if (bouncePdf <= 0.) { break; }
      if (causticState == 1u) { glossyShare = (bsdf - evalPaint) / max(bsdf, vec3f(1e-30)); }
      through *= bsdf * cosTheta / bouncePdf;
      seenByCamera = false;
      d = next;
    } else {
      bouncePdf = 0.;
      if (causticState == 1u) { causticState = 2u; }
      // A smudge is a thin greasy film. Most light still reflects or
      // refracts sharply, but some scatters a little off course, so through
      // a smudge things look hazy, and bright ones have a soft glow. So
      // where it's smudged, some samples see the surface tilted at random,
      // mostly by a little. Later bounces skip it, like bumps: the haze is
      // too faint to see in a reflection of a reflection, and it's slow.
      // The smudge is only worked out when the random number is low enough
      // that it could be, since smudge() <= detail.
      var sn = n;
      let frosted = material == GLASS && shape.surface.y > 0.;
      let hazy = rand();
      if (frosted) {
        // Frosted glass is rough like brushed metal: tiny facets tilted by
        // the GGX distribution, picked as the path sees them. Each reflects
        // and refracts sharply, and light that a facet sends back into the
        // surface, or out the side it came in, would meet another facet and
        // carry on, so it's sent across, as for smudges below. So frosted
        // glass loses no light.
        let facetNl = sampleVisibleNormal(smoothNl, -d, roughness(s), rand2());
        sn = select(-facetNl, facetNl, into);
        // Lights seen through it are blurred, like their reflections in
        // rough metal, not seen by the camera
        seenByCamera = false;
      } else if (depth < 3 && hazy < SMUDGE_HAZE * params.detail && hazy < SMUDGE_HAZE * smudge(p)) {
        sn = directionAround(n, pow(rand(), 1. / (SMUDGE_SHININESS + 1.)), 2. * PI * rand());
      }
      let snl = select(-sn, sn, into);
      var next = reflect(d, sn);
      var reflected = true;
      // Mirrors reflect their color, whiter toward grazing angles. Glass
      // doesn't tint its reflections; it colors light inside it, by
      // glassTransmittance.
      if (material == MIRROR) { through *= fresnelMetal(sColor, -dot(d, snl)); }

      if (material == GLASS) {
        var index = shape.surface.x;
        if (wavelength > 0.) { index = glassIndex(s, wavelength); }
        let t = refract(d, snl, select(index, 1. / index, into));
        // Otherwise total internal reflection: keep the mirror direction
        if (any(t != vec3f(0.))) {
          // Fresnel: how much reflects vs refracts
          let reflectance = fresnelDielectric(-dot(d, snl), select(1. / index, index, into));
          // Pick one at random, with probability P of reflecting, and
          // divide by that probability to stay unbiased
          let P = 0.25 + 0.5 * reflectance;
          if (rand() < P) {
            through *= reflectance / P;
            choiceProb *= P;
          } else {
            next = t;
            reflected = false;
            through *= (1. - reflectance) / (1. - P);
            choiceProb *= 1. - P;
            // Now inside the ball or teapot, or back out. Glass plates are
            // too thin to be inside.
            if (i32(shape.normalShape.w) != PLATE) { inside = select(-1, i32(s), into); }
            // Dispersion: the first time the path refracts, it picks a
            // wavelength to follow, and bends by that wavelength's index
            // instead. Reflection doesn't depend on wavelength (much), so
            // paths that only reflect skip this, and the noise it adds.
            if (wavelength == 0. && params.dispersion > 0.) {
              wavelength = mix(MIN_WAVELENGTH, MAX_WAVELENGTH, rand());
              tint = wavelengthColor(wavelength);
              let i = glassIndex(s, wavelength);
              let bent = refract(d, snl, select(i, 1. / i, into));
              // Rarely, a wavelength that bends more reflects entirely
              // where yellow wouldn't
              next = select(reflect(d, sn), bent, any(bent != vec3f(0.)));
              reflected = all(bent == vec3f(0.));
            }
          }
        }
      }
      // At grazing angles, a smudge can tilt the surface enough to send a
      // reflection into it, or a refraction back out. Flip it back across.
      if ((dot(next, nl) > 0.) != reflected) { next -= 2. * dot(next, nl) * nl; }
      d = next;
    }
    // Start the next ray a hair off the surface, on the side it's leaving
    // toward. From p itself, rounding can put it just inside a sphere, where
    // a grazing ray hits the sphere again from the inside and gets trapped,
    // leaving dark specks along the edges of mirror and glass balls.
    o = p + nl * select(-EPSILON, EPSILON, dot(d, nl) > 0.);
  }
  return color;
}

@compute @workgroup_size(TILE, TILE)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.width || id.y >= params.height) { return; }
  // Adaptive sampling: skip tiles that are already smooth enough
  if (tiles[tileIndex(id.xy)] == 0u) { return; }
  seed = pcg(id.x + pcg(id.y + pcg(params.seed)));
  pixelSeed = pcg(id.x + pcg(id.y));
  let size = vec2f(f32(params.width), f32(params.height));
  let index = id.y * params.width + id.x;
  var prev = vec4f(0.);
  var prevSq = vec4f(0.);
  var prevGlow = vec4f(0.);
  var prevAlbedo = vec4f(0.);
  var prevNormalDepth = vec4f(0.);
  if (params.frame > 0u) {
    prev = sums[index];
    prevSq = sqGlowSums[2u * index];
    prevGlow = sqGlowSums[2u * index + 1u];
    prevAlbedo = albedoSums[index];
    prevNormalDepth = normalDepthSums[index];
  }
  var glowSum = vec3f(0.);
  var albedoSum = vec3f(0.);
  var normalDepthSum = vec4f(0.);

  var sum = vec3f(0.);
  var sqSum = vec3f(0.);
  for (var i = 0u; i < params.samplesPerFrame; i++) {
    sampleIndex = u32(prev.w) + i;
    dimension = 0u;
    // Jitter within the pixel for antialiasing. y = 0 is the top row.
    let jitter = rand2();
    let screen = vec2f((f32(id.x) + jitter.x) / size.x - 0.5, 0.5 - (f32(id.y) + jitter.y) / size.y);
    // Through the pixel, 1 unit in front of the camera
    let d = params.camForward + params.camRight * screen.x + params.camUp * screen.y;
    var o = params.camPos;
    var dir = d;
    if (params.lensRadius > 0.) {
      // Start from a random point on the lens, aimed at where the pinhole
      // ray crosses the plane in focus
      let u = rand2();
      let r = sqrt(u.x) * params.lensRadius;
      let angle = 2. * PI * u.y;
      let offset = (normalize(params.camRight) * cos(angle) + normalize(params.camUp) * sin(angle)) * r;
      o += offset;
      dir = d * params.focusDistance - offset;
    }
    clamped = vec3f(0.);
    // Until it hits something, it's looking at empty space, far away
    guided = false;
    guideAlbedo = vec3f(0.);
    guideNormal = -normalize(dir);
    guideDepth = 1e6;
    let c = trace(o, normalize(dir));
    albedoSum += guideAlbedo;
    normalDepthSum += vec4f(guideNormal, min(guideDepth, 1e6));
    // Rarely, rounding makes a sample NaN (in glass, somewhere), which would
    // stick in the sum forever, and the lens glow would spread it into a
    // big black square. NaN fails every comparison, so this drops it.
    if (all(abs(c) < vec3f(1e30)) && all(abs(clamped) < vec3f(1e30))) {
      sum += c;
      sqSum += c * c;
      glowSum += clamped;
    }
  }
  sums[index] = prev + vec4f(sum, f32(params.samplesPerFrame));
  sqGlowSums[2u * index] = prevSq + vec4f(sqSum, 0.);
  sqGlowSums[2u * index + 1u] = prevGlow + vec4f(glowSum, 0.);
  albedoSums[index] = vec4f(prevAlbedo.rgb + albedoSum, select(-1., f32(firstHit), firstHit != NONE));
  normalDepthSums[index] = prevNormalDepth + normalDepthSum;
}
`;
