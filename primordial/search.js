import {makeSim} from './sim.js';
import {makeGenomes, makeSeed} from './seed.js';

// Judges a rule without drawing it: a small world starts as an even haze, and
// after a while the rule is kept only if the matter has gathered into
// something solid and is still on the move. Since matter is conserved, nothing
// dies out or fills the world; the ways a rule fails are by staying a haze or
// by settling down.

// how many separate lumps there are (cells above a threshold, touching faces,
// wrapping around the edges), ignoring specks
const countBodies = (state, N, threshold = 0.3, minCells = 30) => {
  const seen = new Uint8Array(state.length);
  const stack = new Int32Array(state.length);
  let bodies = 0;
  for (let start = 0; start < state.length; start++) {
    if (seen[start] || state[start] < threshold) continue;
    let top = 0;
    let cells = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const i = stack[--top];
      cells++;
      const x = i % N;
      const y = Math.floor(i / N) % N;
      const z = Math.floor(i / (N * N));
      for (const j of [
        ((x + 1) % N) + y * N + z * N * N,
        ((x + N - 1) % N) + y * N + z * N * N,
        x + ((y + 1) % N) * N + z * N * N,
        x + ((y + N - 1) % N) * N + z * N * N,
        x + y * N + ((z + 1) % N) * N * N,
        x + y * N + ((z + N - 1) % N) * N * N,
      ]) {
        if (!seen[j] && state[j] >= threshold) {
          seen[j] = 1;
          stack[top++] = j;
        }
      }
    }
    if (cells >= minCells) bodies++;
  }
  return bodies;
};

export const makeEvaluator = (device, N) => {
  const sim = makeSim(device, N);

  // Resolves to {motion, bodies} or null. motion is how much matter changed
  // place over the last stretch (as a fraction of all of it, per 500 steps).
  const evaluate = async (
    rule,
    {density = 0.08, food = {}, steps = 3000, every = 500, batch = 25} = {},
  ) => {
    sim.setRule(rule);
    sim.setFood(food);
    sim.resetFood();
    sim.setState(makeSeed(N, density, rule.channels));
    sim.setGenomes(makeGenomes(N, rule));
    sim.setColorMode(rule.channels > 1 ? 1 : 0); // for the thumbnail
    let previous = null;
    const motions = [];
    let state;
    for (let t = every; t <= steps; t += every) {
      // In small batches, waiting for each: one long batch can run past the
      // GPU's time limit (which loses the device), and it would stall the
      // main view's frames behind it.
      for (let done = 0; done < every; done += batch) {
        const encoder = device.createCommandEncoder();
        sim.step(encoder, Math.min(batch, every - done));
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
      }
      state = await sim.readState();
      if (previous && t > steps / 2) {
        let change = 0;
        let mass = 0;
        for (let i = 0; i < state.length; i++) {
          change += Math.abs(state[i] - previous[i]);
          mass += state[i];
        }
        motions.push(change / mass);
      }
      previous = state;
    }
    let max = 0;
    for (const v of state) max = Math.max(max, v);
    const motion = Math.min(...motions);
    if (max < 0.5 || motion < 0.15) return null;
    return {motion, bodies: countBodies(state, N)};
  };

  return {sim, evaluate};
};
