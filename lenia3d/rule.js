// A rule is a radius R, a number of kinds of matter (channels), and a list of
// kernels. Each kernel looks at one kind of matter (from) out to R * r through
// up to three soft rings (a: where, w: how wide, b: how strong), and turns what
// it sees into growth for another kind (to): a bump of height h centered on m
// with width s. Ranges are from the Flow-Lenia paper.

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

// how many kernels connect each kind of matter to itself and to each other
// kind, keeping the total around ten
const wiring = {
  1: {self: 10, cross: 0},
  2: {self: 3, cross: 2},
  3: {self: 2, cross: 1},
};

const randomKernel = (from, to) => ({
  from,
  to,
  ...Object.fromEntries(kernelKeys.map((k) => [k, round(between(ranges[k]))])),
  ...Object.fromEntries(
    ringKeys.map((k) => [k, [0, 1, 2].map(() => round(between(ranges[k])))]),
  ),
});

export const randomRule = (channels = 1) => {
  const {self, cross} = wiring[channels];
  const kernels = [];
  for (let from = 0; from < channels; from++) {
    for (let to = 0; to < channels; to++) {
      const count = from === to ? self : cross;
      for (let i = 0; i < count; i++) kernels.push(randomKernel(from, to));
    }
  }
  return {R: round(between(R_RANGE)), channels, kernels};
};

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
    ...rule,
    R: nudge(rule.R, R_RANGE),
    kernels: rule.kernels.map((k) => ({
      ...k,
      ...Object.fromEntries(
        kernelKeys.map((key) => [key, nudge(k[key], ranges[key])]),
      ),
      ...Object.fromEntries(
        ringKeys.map((key) => [key, k[key].map((v) => nudge(v, ranges[key]))]),
      ),
    })),
  };
};

// As a flat list of numbers, for links: R, channels, then for each kernel
// from to r m s h a a a b b b w w w.
const PER_KERNEL = 15;
export const encodeRule = ({R, channels, kernels}) =>
  [
    R,
    channels,
    ...kernels.flatMap((k) => [
      k.from,
      k.to,
      ...kernelKeys.map((key) => k[key]),
      ...ringKeys.flatMap((key) => k[key]),
    ]),
  ].join(',');

export const decodeRule = (text) => {
  const v = text.split(',').map(Number);
  if (v.length < 2 + PER_KERNEL || (v.length - 2) % PER_KERNEL) return null;
  if (v.some(isNaN) || !wiring[v[1]]) return null;
  const kernels = [];
  for (let i = 2; i < v.length; i += PER_KERNEL) {
    const k = v.slice(i, i + PER_KERNEL);
    kernels.push({
      from: k[0],
      to: k[1],
      r: k[2],
      m: k[3],
      s: k[4],
      h: k[5],
      a: k.slice(6, 9),
      b: k.slice(9, 12),
      w: k.slice(12, 15),
    });
  }
  return {R: v[0], channels: v[1], kernels};
};
