const BUDGET = 0.75; // fraction of each frame the GPU may spend on the simulation
const MAX_STEPS = 8;
const SMOOTHING = 0.1;

/**
 * Picks how many simulation steps to run each frame so the GPU work fits in
 * the frame, whatever the display's refresh rate and the GPU's speed.
 * Step and draw costs are measured from when submitted work finishes;
 * fractional step counts carry over, so 1.5 steps/frame alternates 1 and 2.
 */
export const createPacer = () => {
  let frameTime = 1000 / 60; // shortest recent frame interval, i.e. the refresh rate
  let stepTime = 3; // ms per step, smoothed
  let drawTime = 1; // ms per draw, smoothed
  let carry = 0;
  let last = 0;

  const stepsFor = (now) => {
    // Track the shortest interval, relaxing slowly in case the display changes.
    if (last) frameTime = Math.min(frameTime * 1.01, Math.max(4, now - last));
    last = now;
    const fit = (frameTime * BUDGET - drawTime) / stepTime;
    carry = Math.min(carry + Math.max(0.25, fit), MAX_STEPS);
    const steps = Math.floor(carry);
    carry -= steps;
    return steps;
  };

  /** start: when encoding began; stepped/drawn: promises for GPU completion. */
  const measure = (steps, start, stepped, drawn) => {
    const now = () => performance.now();
    Promise.all([stepped.then(now), drawn.then(now)]).then(([a, b]) => {
      if (steps) stepTime += ((a - start) / steps - stepTime) * SMOOTHING;
      drawTime += (b - a - drawTime) * SMOOTHING;
    });
  };

  return {stepsFor, measure};
};
