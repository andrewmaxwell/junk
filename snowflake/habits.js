// Weather to model parameters. Real snow crystals grow as plates or columns
// depending on temperature (flipping twice between 0 and -22 C), and branch
// more the more humid the air is. The model has no temperature; it has
// thresholds for how much boundary mass each kind of surface cell needs to
// join the crystal. Plateness sets how much harder a new layer is to start on
// the top face than on the side faces, and supersaturation sets the vapor far
// away.
//
// Supersaturation is over ice: how much more vapor the air holds than ice is
// in balance with. Inside a cloud, droplets hold the air near water
// saturation, which is that much over ice (16% at -15 C), so the most a
// crystal in a cloud sees grows with the cold. Branching follows how close the
// air is to water saturation, so that's what the model's vapor follows.

/** [temperature C, plateness]: 1 makes thin plates, -1 long columns */
const PLATENESS = [
  [0, 0.5],
  [-2.5, 0.4],
  [-4, -0.4],
  [-5.5, -1],
  [-8.5, -0.8],
  [-10.5, 0.2],
  [-13, 0.9],
  [-17, 1],
  [-21, 0.5],
  [-24, -0.3],
  [-30, -0.5],
];

export const T_MIN = -30;
/** The top of the chart: supersaturation over ice, as a fraction */
export const SIGMA_MAX = 0.36;

/** Saturation vapor pressure over water and ice (Magnus forms, WMO 2008) */
const overWater = (T) => Math.exp((17.62 * T) / (243.12 + T));
const overIce = (T) => Math.exp((22.46 * T) / (272.62 + T));
/** Supersaturation over ice of air saturated over water, as a fraction */
export const waterSaturation = (T) => overWater(T) / overIce(T) - 1;

/** How far from ice saturation (0) to just past water saturation (1) */
export const wetness = ({T, sigma}) =>
  Math.min(1, Math.max(0, sigma / (1.1 * Math.max(0.005, waterSaturation(T)))));
/** The supersaturation for a wetness at a temperature */
export const sigmaFor = (T, w) => w * 1.1 * Math.max(0.005, waterSaturation(T));

const lerpTable = (table, x) => {
  for (let k = 1; k < table.length; k++) {
    const [x0, y0] = table[k - 1];
    const [x1, y1] = table[k];
    if (x >= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * Math.min(1, Math.max(0, t));
    }
  }
  return table.at(-1)[1];
};

export const plateness = (T) => lerpTable(PLATENESS, T);

/** The model's defaults, tuned by hand. The chart only moves rho and the betas. */
export const BASE = {
  rho: 0.15,
  kappa: 0.005,
  mu: 0.001,
  gamma: 0.0001,
  b01: 2.8,
  b10: 1.4,
  b20: 1.4,
  b11: 1,
  b21: 1,
  b30: 1,
  b31: 1,
  theta: 0.02,
  xi: 0.05,
  sigma: 0,
  diff: 0.15,
};

/**
 * [plateness, top, side]: how much boundary mass it takes to start a new layer
 * on the top face and on a side face. Plates start side layers easily; columns
 * need high thresholds on both faces, or new layers start on top before the
 * last one has spread and the ends come to points.
 */
const THRESHOLDS = [
  [1, 4, 1.4],
  [0.5, 3, 1.7],
  [0, 2.4, 2.3],
  [-0.5, 2.4, 3.2],
  [-1, 2.2, 4.2],
];

/**
 * Stellar and fernlike dendrites: thin arms with side branches and open
 * gaps between the arms, which real crystals grow near water saturation at
 * plate temperatures. Found by a random search (.search.mjs) for crystals that
 * are open and branched seen from above: every attachment threshold about
 * twice the plates', and ten times the melting. The search found it at rho
 * 0.247. The model is linear in vapor (scaling rho and every threshold
 * together grows the same crystal), so the thresholds here are per unit of
 * rho and scale with whatever rho the chart gives.
 */
const DENDRITE = {
  kappa: 0.00101,
  mu: 0.0138,
  gamma: 0.00085,
  sigma: 0.000635,
  diff: 0.132,
};
const DENDRITE_PER_RHO = Object.fromEntries(
  Object.entries({
    b01: 3.67,
    b10: 2.03,
    b20: 2.64,
    b11: 1.48,
    b21: 1.48,
    b30: 2.14,
    b31: 2.14,
    theta: 0.0209,
    xi: 0.0495,
  }).map(([key, v]) => [key, v / 0.247]),
);
/** Rates that range over orders of magnitude blend on a log scale */
const RATES = ['kappa', 'mu', 'gamma'];

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far plates near water saturation have turned into dendrites, 0 to 1 */
const dendriteness = (weather) =>
  smoothstep(0.6, 0.95, wetness(weather)) *
  smoothstep(0.4, 0.9, plateness(weather.T));

/** Model parameters for a temperature (C) and supersaturation over ice */
export const paramsFor = (weather) => {
  const P = plateness(weather.T);
  const s = wetness(weather);
  const top = lerpTable(
    THRESHOLDS.map(([p, t]) => [p, t]),
    P,
  );
  const side = lerpTable(
    THRESHOLDS.map(([p, , d]) => [p, d]),
    P,
  );
  const plain = {
    ...BASE,
    rho: 0.04 + 0.32 * s ** 1.3,
    b01: top,
    b10: side,
    b20: side,
  };
  // Near water saturation where plates grow, they turn into dendrites
  const w = dendriteness(weather);
  if (!w) return plain;
  return Object.fromEntries(
    Object.entries(plain).map(([key, v]) => {
      const to =
        key === 'rho'
          ? v
          : (DENDRITE[key] ?? DENDRITE_PER_RHO[key] * plain.rho);
      return [key, RATES.includes(key) ? v * (to / v) ** w : v + (to - v) * w];
    }),
  );
};

/**
 * What grows in a weather, in the words of Libbrecht's morphology diagram,
 * with the same plateness and wetness the model's parameters follow
 */
export const habitAt = (weather) => {
  const P = plateness(weather.T);
  const s = wetness(weather);
  if (P < -0.3) {
    if (weather.T > -10 && s > 0.6)
      return weather.T > -6.5 ? 'needles' : 'hollow columns';
    return 'columns';
  }
  if (P < 0.3) return 'blocky prisms';
  if (dendriteness(weather) > 0.5) return 'fernlike stars';
  if (s > 0.6) return 'stellar plates';
  if (s > 0.35) return 'sectored plates';
  return 'plates';
};

/** Labels for the chart's regions: [text, T, supersaturation, shape drawn] */
export const LABELS = [
  ['plates', -1.5, 0.012, 'plate'],
  ['columns', -7.5, 0.022, 'column'],
  ['needles', -5, 0.085, 'needle'],
  ['plates', -18.5, 0.03, 'plate'],
  ['sectored', -15, 0.09, 'sectored'],
  ['stars', -11.5, 0.17, 'star'],
  ['ferns', -18, 0.25, 'fern'],
  ['columns', -24.5, 0.12, 'column'],
];
