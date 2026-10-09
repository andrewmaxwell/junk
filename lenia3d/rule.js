// A rule is a radius R and a list of kernels. Each kernel looks at the
// neighborhood out to R * r through up to three soft rings (a: where, w: how
// wide, b: how strong), and turns what it sees into growth: a bump of height h
// centered on m with width s. Ranges are from the Flow-Lenia paper.

const ranges = {
  r: [0.2, 1],
  m: [0.05, 0.5],
  s: [0.001, 0.18],
  h: [0.01, 1],
  a: [0, 1],
  b: [0.001, 1],
  w: [0.01, 0.5],
};
const ringKeys = ['a', 'b', 'w'];
const kernelKeys = ['r', 'm', 's', 'h'];
const R_RANGE = [8, 18];

const between = ([lo, hi]) => lo + (hi - lo) * Math.random();
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const round = (v) => +v.toFixed(3);

export const randomRule = (kernels = 10) => ({
  R: round(between(R_RANGE)),
  kernels: Array.from({length: kernels}, () => ({
    ...Object.fromEntries(
      kernelKeys.map((k) => [k, round(between(ranges[k]))]),
    ),
    ...Object.fromEntries(
      ringKeys.map((k) => [k, [0, 1, 2].map(() => round(between(ranges[k])))]),
    ),
  })),
});

// a nearby rule: every number nudged by up to `amount` of its range
export const mutate = (rule, amount = 0.05) => {
  const nudge = (v, range) =>
    round(
      clamp(
        v + (Math.random() * 2 - 1) * amount * (range[1] - range[0]),
        range,
      ),
    );
  return {
    R: nudge(rule.R, R_RANGE),
    kernels: rule.kernels.map((k) => ({
      ...Object.fromEntries(
        kernelKeys.map((key) => [key, nudge(k[key], ranges[key])]),
      ),
      ...Object.fromEntries(
        ringKeys.map((key) => [key, k[key].map((v) => nudge(v, ranges[key]))]),
      ),
    })),
  };
};

// as a flat list of numbers, for links: R, then r m s h a a a b b b w w w per kernel
export const encodeRule = ({R, kernels}) =>
  [
    R,
    ...kernels.flatMap((k) => [
      ...kernelKeys.map((key) => k[key]),
      ...ringKeys.flatMap((key) => k[key]),
    ]),
  ].join(',');

export const decodeRule = (text) => {
  const v = text.split(',').map(Number);
  if (v.length < 14 || (v.length - 1) % 13 || v.some(isNaN)) return null;
  const kernels = [];
  for (let i = 1; i < v.length; i += 13) {
    const k = v.slice(i, i + 13);
    kernels.push({
      r: k[0],
      m: k[1],
      s: k[2],
      h: k[3],
      a: k.slice(4, 7),
      b: k.slice(7, 10),
      w: k.slice(10, 13),
    });
  }
  return {R: v[0], kernels};
};
