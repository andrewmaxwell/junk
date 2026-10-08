import {makeSim} from './sim.js';
import {makeSeed} from './seed.js';

// How full the world is and where its center of mass is. The world wraps, so
// each coordinate of the center is an average angle around that axis.
const measure = (state, N) => {
  let sum = 0;
  const cos = [0, 0, 0];
  const sin = [0, 0, 0];
  for (let z = 0, i = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, i++) {
        const v = state[i];
        if (!v) continue;
        sum += v;
        [x, y, z].forEach((c, axis) => {
          const angle = (c / N) * 2 * Math.PI;
          cos[axis] += v * Math.cos(angle);
          sin[axis] += v * Math.sin(angle);
        });
      }
    }
  }
  const center = [0, 1, 2].map(
    (axis) => (Math.atan2(sin[axis], cos[axis]) / (2 * Math.PI)) * N,
  );
  return {fill: sum / state.length, center};
};

// Runs a rule without drawing it and records how full the world is and where
// things are over time, to tell rules that die out or take over everything
// from ones that keep something alive.
export const makeEvaluator = (device, N) => {
  const sim = makeSim(device, N);
  return async (rule, {steps = 3000, every = 100, seeds = 1} = {}) => {
    sim.setKernel(rule.R, rule.peaks);
    sim.setParams(rule);
    sim.setState(makeSeed(N, rule.R, seeds));
    const log = [];
    for (let t = 0; t < steps; t += every) {
      const encoder = device.createCommandEncoder();
      sim.step(encoder, every);
      device.queue.submit([encoder.finish()]);
      const m = measure(await sim.readState(), N);
      log.push(m);
      if (m.fill === 0 || m.fill > 0.3) break;
    }
    return log;
  };
};

// distance the center of mass moved between two measurements, across the wrap
export const travel = (a, b, N) =>
  Math.hypot(
    ...a.center.map((c, i) => {
      const d = (((b.center[i] - c) % N) + N * 1.5) % N;
      return d - N / 2;
    }),
  );
