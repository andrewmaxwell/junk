// A physically based sky: sunlight scattered toward the viewer by air and
// haze, following "Display of the Earth Taking into Account Atmospheric
// Scattering" (Nishita et al.). Air scatters blue most (Rayleigh), so the sky
// is blue overhead, and sunlight that has come a long way through it, near
// the horizon, has lost its blue and turned orange. Haze scatters every color
// alike, but mostly forward (Mie), so the sky glows around the sun.

/** Columns of the table skyTable makes: directions around the horizon */
export const SKY_WIDTH = 64;
/**
 * Rows: from the horizon straight up. Row r is at (r / (SKY_HEIGHT - 1))² of
 * 90°, so most rows are near the horizon, where the sky changes fastest.
 */
export const SKY_HEIGHT = 32;

// The Earth and its atmosphere, in meters
const EARTH_RADIUS = 6360e3;
const ATMOSPHERE_RADIUS = 6420e3;
/** Heights over which air and haze thin out by a factor of e */
const AIR_HEIGHT = 7994;
const HAZE_HEIGHT = 1200;
/** How much air scatters red, green and blue, per meter at sea level */
const AIR = [5.8e-6, 13.5e-6, 33.1e-6];
/**
 * How much ozone absorbs red, green and blue, per meter, where the air is at
 * sea level density. Ozone is mostly high up, but this follows the air,
 * which is close enough. It absorbs orange and red, which is why twilight
 * skies stay blue overhead even though the sunlight reaching them is red.
 */
const OZONE = [0.65e-6, 1.881e-6, 0.085e-6];
/** How much haze scatters, per meter at sea level; it absorbs a tenth more */
const HAZE = 21e-6;
/** How far forward haze scatters, from 0 (evenly) to 1 */
const HAZE_FORWARD = 0.76;

/** @type {(a: number[], b: number[]) => number} */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Distance from p along unit direction d to the top of the atmosphere */
const toTop = (/** @type {number[]} */ p, /** @type {number[]} */ d) => {
  const b = dot(p, d);
  return -b + Math.sqrt(b * b - dot(p, p) + ATMOSPHERE_RADIUS ** 2);
};

/**
 * Light scattered toward a viewer at sea level from unit direction d, with
 * the sun in unit direction sun, for sunlight of brightness 1. haze scales
 * how hazy the air is.
 * @type {(d: number[], sun: number[], haze: number) => number[]}
 */
const skyLight = (d, sun, haze) => {
  const origin = [0, EARTH_RADIUS + 2, 0];
  const steps = 32;
  const step = toTop(origin, d) / steps;
  const cos = dot(d, sun);
  // How much of the scattered light goes each way: air evenly-ish, haze
  // forward (Cornette-Shanks)
  const airPhase = (3 / (16 * Math.PI)) * (1 + cos * cos);
  const g = HAZE_FORWARD;
  const hazePhase =
    ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + cos * cos))) /
    ((2 + g * g) * (1 + g * g - 2 * g * cos) ** 1.5);
  // Air and haze passed through so far, scaled to their sea level density
  let viewAir = 0;
  let viewHaze = 0;
  const air = [0, 0, 0];
  const hazy = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const p = origin.map((o, k) => o + d[k] * (i + 0.5) * step);
    const height = Math.hypot(...p) - EARTH_RADIUS;
    const stepAir = Math.exp(-height / AIR_HEIGHT) * step;
    const stepHaze = Math.exp(-height / HAZE_HEIGHT) * step;
    viewAir += stepAir;
    viewHaze += stepHaze;
    // Air and haze between here and the sun
    const sunSteps = 8;
    const sunStep = toTop(p, sun) / sunSteps;
    let sunAir = 0;
    let sunHaze = 0;
    let shaded = false;
    for (let j = 0; j < sunSteps; j++) {
      const q = p.map((x, k) => x + sun[k] * (j + 0.5) * sunStep);
      const h = Math.hypot(...q) - EARTH_RADIUS;
      // Behind the Earth, so no sunlight gets here
      if (h < 0) {
        shaded = true;
        break;
      }
      sunAir += Math.exp(-h / AIR_HEIGHT) * sunStep;
      sunHaze += Math.exp(-h / HAZE_HEIGHT) * sunStep;
    }
    if (shaded) continue;
    for (let c = 0; c < 3; c++) {
      // Sunlight that gets here, scatters, and gets to the viewer
      const through = Math.exp(
        -(AIR[c] + OZONE[c]) * (viewAir + sunAir) -
          1.1 * HAZE * haze * (viewHaze + sunHaze),
      );
      air[c] += through * stepAir;
      hazy[c] += through * stepHaze;
    }
  }
  return air.map(
    (a, c) => a * AIR[c] * airPhase + hazy[c] * HAZE * haze * hazePhase,
  );
};

/**
 * The sky's color in every direction above the horizon, for the sun in
 * direction sun (need not be unit length), as SKY_WIDTH × SKY_HEIGHT vec4s
 * for the shader. Scaled so its average brightness over the sky is 1, so a
 * sky dome's color sets how bright it is overall.
 * @type {(sun: number[], haze?: number) => Float32Array}
 */
export const skyTable = (sun, haze = 1) => {
  const length = Math.hypot(...sun);
  const s = sun.map((x) => x / length);
  const table = new Float32Array(SKY_WIDTH * SKY_HEIGHT * 4);
  let total = 0;
  let weights = 0;
  for (let row = 0; row < SKY_HEIGHT; row++) {
    const elevation = (row / (SKY_HEIGHT - 1)) ** 2 * (Math.PI / 2);
    // Each row stands for this much of the sky (it's denser near the
    // horizon, and rings get smaller toward the top)
    const weight =
      (Math.cos(elevation) * (2 * row + 1)) / (SKY_HEIGHT - 1) ** 2;
    for (let col = 0; col < SKY_WIDTH; col++) {
      const azimuth = (col / SKY_WIDTH) * 2 * Math.PI - Math.PI;
      const d = [
        Math.cos(elevation) * Math.cos(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.sin(azimuth),
      ];
      const light = skyLight(d, s, haze);
      table.set(light, (row * SKY_WIDTH + col) * 4);
      total +=
        weight * (0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2]);
      weights += weight;
    }
  }
  const average = total / weights;
  return table.map((x) => x / average);
};
