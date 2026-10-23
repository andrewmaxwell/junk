// WGSL every shader starts with.

import {tone} from './tone.js';

/**
 * What every shader shares: the parameters the renderer writes each frame (see
 * writeParams in renderer.js; keep the layouts in sync), tiles, and how the
 * display shows a color.
 */
export const common = /* wgsl */ `
struct Params {
  // Camera position, forward direction, and right and up vectors scaled to
  // the image plane at distance 1
  camPos: vec3f,
  frame: u32, // 0 means start a new sum
  camForward: vec3f,
  seed: u32, // different every dispatch, even when frame restarts
  camRight: vec3f,
  samplesPerFrame: u32,
  camUp: vec3f,
  /**
   * How diffuse surfaces find light:
   * 0 (mis): both of the below, weighted by which was more likely to find it
   * 1 (light): only rays aimed at lights; random bounces ignore light hits
   * 2 (bsdf): only random bounces (hope to hit a light)
   */
  sampling: u32,
  /**
   * Caps how bright one sample of bounced light can be, as a multiple of
   * white. Rare paths, like light off a mirror ball onto a wall, then into
   * a glossy reflection, are correct but very bright and hard to find, so
   * without this they show up as speckles that take ages to average out.
   * Capping them makes those effects a bit dimmer than they should be.
   * Direct light is never capped, nor caustics on the first surface the
   * camera sees, which come from photons.
   */
  maxIndirect: f32,
  /** Balls and plates; teapots come after them */
  objectCount: u32,
  width: u32,
  height: u32,
  /**
   * How bright lights may get, as a multiple of white: the screen's headroom
   * in HDR, or in SDR, the brightness that tone mapping shows as white
   */
  maxBrightness: f32,
  /**
   * How SDR screens show brightness over 1: 0 clips it, 1 eases it into
   * white (toneMap), 2 is a filmic curve (agx)
   */
  toneMap: u32,
  /**
   * Fog filling the scene: the chance per unit of distance that light
   * scatters off it. 0 for none.
   */
  fogDensity: f32,
  /**
   * How much glass's index of refraction varies with wavelength, splitting
   * white light into rainbows. 0 for none, which is also less noisy.
   */
  dispersion: f32,
  /**
   * Adaptive sampling: a tile stops getting samples once its estimated noise
   * is below this, in display brightness from 0 to 1. 0 to never stop.
   */
  noiseThreshold: f32,
  /** 1 to highlight the tiles that are still getting samples */
  showTiles: u32,
  /** The display multiplies brightness by this */
  exposure: f32,
  /**
   * Depth of field: rays start from random points on a lens this big around
   * the camera, and meet again focusDistance in front of it, so only things
   * that far away are sharp. 0 for a pinhole camera, all sharp.
   */
  lensRadius: f32,
  focusDistance: f32,
  /** Lights are the first lightCount objects */
  lightCount: u32,
  /**
   * Which way fog scatters light, from -1 (back where it came from) through
   * 0 (every direction evenly) to 1 (straight on). Real haze is around 0.7,
   * so fog glows brightest looking toward a light.
   */
  fogForward: f32,
  /**
   * 0 for gray fog. Up to 1, it scatters blue light more than red, like air:
   * blue sky, and lights seen through a lot of it turn orange.
   */
  fogBlue: f32,
  /**
   * How uneven surfaces are: paint finely bumpy, glass and mirrors smudged
   * in places. 0 for mathematically smooth.
   */
  detail: f32,
  /** World units per bump; world.js sets it from the scene's size */
  detailScale: f32,
  /** Lens glow: the fraction of light the lens spreads into a halo */
  glow: f32,
  /**
   * How much the image darkens toward its corners, as through a real lens:
   * 0 for none, 1 for the cos^4 falloff of a simple lens
   */
  vignette: f32,
  /** 1 to show the denoised image; see denoiseShader */
  denoise: u32,
  /** The object to outline, as the camera sees it, or NONE */
  selected: u32,
  /** Where the teapot's hierarchy and triangles start in tables, in vec4s */
  teapotNodes: u32,
  teapotTriangles: u32,
  /** Teapots and diamonds, which come after the balls and plates */
  boundedCount: u32,
  /**
   * Film grain: how much each pixel is randomly brighter or darker, as a
   * fraction of white on screen. 0 for none.
   */
  grain: f32,
  /**
   * Chromatic aberration: how much more the lens magnifies red than green,
   * and green than blue, so bright edges get colored fringes toward the
   * corners. 0 for none.
   */
  aberration: f32,
  /** Where the diamond's facets start in tables, in vec4s */
  diamondPlanes: u32,
  /** Lasers' beams, which come after the teapots and diamonds; see lasers.js */
  beamCount: u32,
  /** The power brightness relative to middle gray is raised to: 1 for none; see applyContrast */
  contrast: f32,
  /** Lights and the glass or mirrors they aim photons at; 0 for no photons. See photons.js. */
  pairCount: u32,
  /** How far around a point photons are gathered from, shrinking each frame; see gatherPhotons */
  photonRadius: f32,
}

const NONE = 0xffffffffu;

@group(0) @binding(0) var<uniform> params: Params;

/** Pixels per side of the tiles that adaptive sampling stops as a unit */
const TILE = 8u;

/** Index of the tile that pixel id is in */
fn tileIndex(id: vec2u) -> u32 {
  return (id.y / TILE) * ((params.width + TILE - 1u) / TILE) + id.x / TILE;
}

/** Size of the lens glow's image: one texel per tile */
fn glowSize() -> vec2u {
  return (vec2u(params.width, params.height) + TILE - 1u) / TILE;
}

/** How bright a linear RGB color looks */
fn brightness(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

/** The brightest of a color's channels */
fn peak(c: vec3f) -> f32 {
  return max(c.r, max(c.g, c.b));
}
${tone}
`;
