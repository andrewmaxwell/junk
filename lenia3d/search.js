import {makeSim} from './sim.js';
import {capture, centerOf, place} from './pattern.js';

// The search follows Chan's way of finding creatures: start from one that
// already lives, nudge its rule a little, and see if the creature adapts.
// Random rules from random noise almost always give either still lumps or
// churning foam, because creatures live in narrow niches of rule space and only
// form from the right starting shapes.
//
// A trial runs one creature in a small world without drawing it. It's thrown
// out if it dies, grows, or comes apart. Of the rest, it's kept only
// if it does something: glides (its center moves) or pulses (its mass swings).

const sumOf = (state) => {
  let sum = 0;
  for (const v of state) sum += v;
  return sum;
};

const wrappedDistance = (a, b, N) =>
  Math.hypot(
    ...a.map((v, i) => {
      const d = Math.abs(v - b[i]) % N;
      return Math.min(d, N - d);
    }),
  );

// how far the mass sits from its center, on average (radius of gyration).
// Creatures are often several pieces, nested shells and satellite drops, so
// this rather than counting lumps is what tells one that's coming apart.
const spreadOf = (state, N, center) => {
  let sum = 0;
  let mass = 0;
  for (let z = 0, i = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, i++) {
        const v = state[i];
        if (!v) continue;
        const d = wrappedDistance([x, y, z], center, N);
        sum += v * d * d;
        mass += v;
      }
    }
  }
  return Math.sqrt(sum / mass);
};

export const makeEvaluator = (device, N) => {
  const sim = makeSim(device, N);

  // Resolves to {pattern, speed, pulse}, or null if the creature didn't make
  // it. speed is how far its center moved per 1000 steps over the second half,
  // and pulse how much its mass swung then (max - min over mean).
  const evaluate = async (rule, start, {steps = 2000, every = 100} = {}) => {
    sim.setKernel(rule.R, rule.peaks);
    sim.setParams(rule);
    sim.setState(place(start, N));
    let first = null; // {mass, spread} once it has settled into shape
    const masses = [];
    const centers = [];
    let state;
    for (let t = every; t <= steps; t += every) {
      const encoder = device.createCommandEncoder();
      sim.step(encoder, every);
      device.queue.submit([encoder.finish()]);
      state = await sim.readState();
      const mass = sumOf(state);
      if (!mass) return null;
      const center = centerOf(state, N);
      const spread = spreadOf(state, N, center);
      first ??= {mass, spread};
      if (mass < first.mass * 0.2 || mass > first.mass * 3) return null;
      if (spread > first.spread * 1.5) return null; // came apart or foamed
      if (t > steps / 2) {
        masses.push(mass);
        centers.push(center);
      }
    }
    const mean = masses.reduce((a, b) => a + b) / masses.length;
    const travelled = wrappedDistance(centers[0], centers.at(-1), N);
    return {
      pattern: capture(state, N),
      speed: (travelled / (steps / 2 - every)) * 1000,
      pulse: (Math.max(...masses) - Math.min(...masses)) / mean,
    };
  };

  return {sim, evaluate};
};

// what counts as doing something
export const isLively = ({speed, pulse}) => speed > 2 || pulse > 0.04;

const round = (v) => +v.toFixed(4);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A nearby rule: small nudges, so the creature has a chance to adapt. The
// radius and number of rings stay put, since changing those is a different
// creature altogether.
export const mutate = (rule) => {
  const nudge = (v, amount) => v * (1 + (Math.random() * 2 - 1) * amount);
  return {
    ...rule,
    mu: round(nudge(rule.mu, 0.04)),
    sigma: round(nudge(rule.sigma, 0.08)),
    peaks: rule.peaks.map((p) =>
      round(clamp(p + (Math.random() - 0.5) * 0.1, 0, 1)),
    ),
  };
};
