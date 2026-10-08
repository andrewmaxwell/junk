import {makeSim} from './sim.js';
import {makeSeed} from './seed.js';

// Rules are judged in a small world without drawing them. A rule is kept if,
// from two different seeds, it neither dies out nor grows to fill more than an
// eighth of the world (past that it's foam, not creatures).
// Its activity is how much the state changes between snapshots: zero for
// things that sit still, higher for pulsing, gliding, or churning.

const sumOf = (state) => {
  let sum = 0;
  for (const v of state) sum += v;
  return sum;
};

const difference = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum;
};

export const makeEvaluator = (device, N) => {
  const sim = makeSim(device, N);

  const trial = async (rule, {steps, every}) => {
    sim.setState(makeSeed(N, rule.R, 2));
    let previous = null;
    const fills = [];
    const changes = [];
    for (let t = 0; t < steps; t += every) {
      const encoder = device.createCommandEncoder();
      sim.step(encoder, every);
      device.queue.submit([encoder.finish()]);
      const state = await sim.readState();
      const sum = sumOf(state);
      const fill = sum / state.length;
      if (fill === 0) return {died: true};
      if (fill > 0.12) return {erupted: true};
      fills.push(fill);
      if (previous) changes.push(difference(state, previous) / sum);
      previous = state;
    }
    const late = (values) => values.slice(Math.floor(values.length / 2));
    const mean = (values) => values.reduce((a, b) => a + b) / values.length;
    return {fill: mean(late(fills)), activity: mean(late(changes))};
  };

  // resolves to {fill, activity}, or null if the rule died or erupted
  const evaluate = async (
    rule,
    {steps = 3000, every = 250, trials = 2} = {},
  ) => {
    sim.setKernel(rule.R, rule.peaks);
    sim.setParams(rule);
    const results = [];
    for (let i = 0; i < trials; i++) {
      const result = await trial(rule, {steps, every});
      if (result.died || result.erupted) return null;
      results.push(result);
    }
    return {
      fill: Math.max(...results.map((r) => r.fill)),
      activity: Math.min(...results.map((r) => r.activity)),
    };
  };

  return {sim, evaluate};
};

const round = (v) => +v.toFixed(4);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const randomRule = () => {
  const mu = 0.08 + Math.random() * 0.27;
  const rings = 1 + Math.floor(Math.random() * 3);
  return {
    R: 10,
    dt: 0.1,
    mu: round(mu),
    sigma: round(mu * (0.08 + Math.random() * 0.2)),
    peaks:
      rings === 1
        ? [1]
        : Array.from(
            {length: rings},
            () => +(0.05 + Math.random() * 0.95).toFixed(2),
          ),
  };
};

// a nearby rule: small nudges to everything, and now and then a ring more or less
export const mutate = (rule) => {
  const nudge = (v, amount) => v * (1 + (Math.random() * 2 - 1) * amount);
  let peaks = rule.peaks.map(
    (p) => +clamp(p + (Math.random() - 0.5) * 0.2, 0.02, 1).toFixed(2),
  );
  if (Math.random() < 0.1 && peaks.length < 4) {
    peaks = [...peaks, +Math.random().toFixed(2)];
  } else if (Math.random() < 0.1 && peaks.length > 1) {
    peaks = peaks.slice(0, -1);
  }
  return {
    ...rule,
    mu: round(nudge(rule.mu, 0.06)),
    sigma: round(nudge(rule.sigma, 0.1)),
    peaks,
  };
};
