// Everything the panel changes. Settings that differ from their defaults are
// kept in the URL, so a view can be shared or reloaded.

import {scenes} from './scenes.js';

export const defaults = {
  /** See `scenes` in scenes.js */
  scene: 'shafts',
  /** 'mis', 'light' or 'bsdf'; see `sampling` in shaders/common.js */
  sampling: 'mis',
  /** Cap on bounced light per sample; 0 for none. See `maxIndirect` in shaders/common.js */
  clamp: 20,
  /** Rendered pixels per CSS pixel. 2 is sharp on retina screens, but 4x slower. */
  scale: 1,
  /** Stop refining after this many samples per pixel */
  spp: 4096,
  /**
   * In HDR, how many times brighter than white lights may get. Browsers don't
   * say how much headroom the screen has; brighter than it just clips.
   */
  headroom: 8,
  /**
   * Adaptive sampling stops refining a tile once its noise is below this, in
   * display brightness from 0 to 1; 0 to refine everything. See
   * `noiseThreshold` in shaders/common.js
   */
  noise: 0.02,
  /** How strongly glass splits light into rainbows. See `dispersion` in shaders/common.js. Scenes can change this default. */
  dispersion: 1,
  /** Show the image denoised; see shaders/denoise.js */
  denoise: true,
  /** Fog density; see `fogDensity` in shaders/common.js. Scenes can change this default. */
  fog: 0,
  /** Which way fog scatters, -1 to 1; see `fogForward` in shaders/common.js. Scenes can change this default. */
  fogForward: 0,
  /** 0 for gray fog, up to 1 for sky blue; see `fogBlue` in shaders/common.js. Scenes can change this default. */
  fogBlue: 0,
  /** How uneven surfaces are, 0 for mathematically smooth; see `detail` in shaders/common.js */
  detail: 1,
  /** The fraction of light the lens spreads into a glow; see shaders/glow.js */
  glow: 0.005,
  /** How SDR screens show brightness over 1: 'filmic', 'ease' or 'clip'; see `toneMap` in shaders/common.js */
  tone: 'filmic',
  /** Darkening toward the corners, 0 to 1; see `vignette` in shaders/common.js */
  vignette: 0.5,
  /** Film grain, as a fraction of white; see `grain` in shaders/common.js */
  grain: 0.015,
  /** Colored fringes toward the corners; see `aberration` in shaders/common.js */
  aberration: 0.002,
  /** Brightens or darkens the display, in stops (doublings). Scenes can change this default. */
  exposure: 0,
  /**
   * Depth of field: the camera lens's radius, as a fraction of how far the
   * scene's own camera is from what it looks at. 0 keeps everything sharp.
   * Click the image to focus. Scenes can change this default. (A fraction
   * of the distance in focus would make focusing on the sky blur
   * everything else away.)
   */
  dof: 0,
};
/** @typedef {typeof defaults} Settings */

/** settings.tone's choices, in the order of params.toneMap */
export const toneCurves = ['clip', 'ease', 'filmic'];

export const urlParams = new URLSearchParams(location.search);

/** @type {Settings} */
export const settings = {...defaults};
for (const [key, value] of Object.entries(defaults)) {
  const param = urlParams.get(key);
  if (param === null) continue;
  Object.assign(settings, {
    [key]:
      typeof value === 'number'
        ? Number(param)
        : typeof value === 'boolean'
          ? param === 'true'
          : param,
  });
}
if (!(settings.scene in scenes)) settings.scene = defaults.scene;

/** Settings each scene can pick its own default for; see `Scene` in scenes.js */
const sceneKeys = [
  'fog',
  'fogForward',
  'fogBlue',
  'dof',
  'dispersion',
  'exposure',
];
/** The default for a setting in this scene, which the URL leaves out */
const sceneDefault = (/** @type {string} */ key) =>
  scenes[settings.scene]().defaults?.[key] ??
  defaults[/** @type {keyof Settings} */ (key)];

/** Sets sceneKeys to this scene's defaults, except ones the URL sets if keepUrl */
export const useSceneDefaults = (keepUrl = false) => {
  for (const key of sceneKeys) {
    if (keepUrl && urlParams.has(key)) continue;
    Object.assign(settings, {[key]: sceneDefault(key)});
  }
};
useSceneDefaults(true);

export const saveSettings = () => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(settings)) {
    if (value === sceneDefault(key)) url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  history.replaceState(null, '', url);
};

/** @type {Record<string, number>} */
const saveTimers = {};
/**
 * Puts value() in the URL as name, or leaves name out if it's null, once it
 * stops changing, since browsers limit how often the URL can change
 */
export const saveParamSoon = (
  /** @type {string} */ name,
  /** @type {() => string | null} */ value,
) => {
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(() => {
    const url = new URL(location.href);
    const v = value();
    if (v === null) url.searchParams.delete(name);
    else url.searchParams.set(name, v);
    history.replaceState(null, '', url);
  }, 300);
};

/** Settings that aren't kept in the URL */
export const view = {
  paused: false,
  /** Highlight the tiles adaptive sampling is still refining */
  showTiles: false,
  hdr: matchMedia('(dynamic-range: high)').matches,
};
// HDR is remembered per browser, since some (Chrome on macOS, as of 154) say
// the screen is HDR but then show HDR canvases clipped
try {
  const saved = localStorage.getItem('anotherRaytracer.hdr');
  if (saved) view.hdr = saved === 'on';
} catch {
  // Storage blocked; use the default
}
export const rememberHdr = () => {
  try {
    localStorage.setItem('anotherRaytracer.hdr', view.hdr ? 'on' : 'off');
  } catch {
    // Storage blocked; the choice lasts until reload
  }
};
