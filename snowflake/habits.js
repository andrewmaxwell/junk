// Weather to model parameters. Real snow crystals grow as plates or columns
// depending on temperature (flipping twice between 0 and -22 C), and branch
// more the more humid the air is. The model has no temperature; it has
// thresholds for how much boundary mass each kind of surface cell needs to
// join the crystal. Plateness sets how much harder a new layer is to start on
// the top face than on the side faces, and humidity sets the vapor far away.

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
  [1, 3, 1.4],
  [0.5, 2.6, 1.7],
  [0, 2.4, 2.3],
  [-0.5, 2.4, 3.2],
  [-1, 2.2, 4.2],
];

/** Model parameters for a temperature (C) and humidity (0 to 1) */
export const paramsFor = ({T, s}) => {
  const P = plateness(T);
  const top = lerpTable(
    THRESHOLDS.map(([p, t]) => [p, t]),
    P,
  );
  const side = lerpTable(
    THRESHOLDS.map(([p, , d]) => [p, d]),
    P,
  );
  return {
    ...BASE,
    rho: 0.04 + 0.32 * s ** 1.3,
    b01: top,
    b10: side,
    b20: side,
  };
};

/** Labels for the chart's regions: [text, T, s] */
export const LABELS = [
  ['plates', -1.5, 0.25],
  ['columns', -7, 0.2],
  ['needles', -5, 0.85],
  ['plates', -18, 0.15],
  ['sectored plates', -15, 0.45],
  ['stars & ferns', -15, 0.85],
  ['columns', -27, 0.6],
];
