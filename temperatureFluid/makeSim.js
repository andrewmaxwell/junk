/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   targetTemp: number,
 *   rate: number,
 * }} Region
 *
 * @typedef {{
 *   res: number,
 *   startingTemperature: number,
 *   diffusionRate: number,
 *   viscosity: number,
 *   dt: number,
 *   buoyantForce: number, // includes gravity
 *   vorticity: number,
 *   iterations: number,
 *   regions: Region[],
 * }} SimParams
 */

/**
 * `res` and `startingTemperature` are read once at construction because they
 * size and seed the buffers. Every other field is read live each frame, so
 * mutating the params object retunes the sim without restarting it.
 * @param {SimParams} params
 */
export const makeSim = (params) => {
  const {res, startingTemperature} = params;
  const N = res - 2;
  const size = res ** 2;

  // Each field plus the previous-frame copy it is integrated from.
  // `swapBuffers` rotates current into previous.
  let xVel = new Float32Array(size);
  let yVel = new Float32Array(size);
  let temp = new Float32Array(size).fill(startingTemperature);
  let xVelPrev = new Float32Array(size);
  let yVelPrev = new Float32Array(size);
  let tempPrev = new Float32Array(size).fill(startingTemperature);

  // Scratch for `project` alone. These used to be the velocity `Prev` buffers,
  // which made it look like projection consumed the previous frame's velocity
  // and left the swapped-in buffers holding pressure data that only happened to
  // be overwritten later.
  const pressure = new Float32Array(size);
  const divergence = new Float32Array(size);
  const curl = new Float32Array(size);
  // Holds the round trip in `macCormack`: the forward advection traced back.
  const reverted = new Float32Array(size);

  const ix = (x, y) => x + res * y;
  const bind = (x, min, max) => Math.max(min, Math.min(max, x));

  function setBoundaries(arr, xMult, yMult) {
    for (let i = 1; i <= N; i++) {
      arr[ix(0, i)] = xMult * arr[ix(1, i)];
      arr[ix(N + 1, i)] = xMult * arr[ix(N, i)];
      arr[ix(i, 0)] = yMult * arr[ix(i, 1)];
      arr[ix(i, N + 1)] = yMult * arr[ix(i, N)];
    }
    arr[ix(0, 0)] = 0.5 * (arr[ix(1, 0)] + arr[ix(0, 1)]);
    arr[ix(0, N + 1)] = 0.5 * (arr[ix(1, N + 1)] + arr[ix(0, N)]);
    arr[ix(N + 1, 0)] = 0.5 * (arr[ix(N, 0)] + arr[ix(N + 1, 1)]);
    arr[ix(N + 1, N + 1)] = 0.5 * (arr[ix(N, N + 1)] + arr[ix(N + 1, N)]);
  }

  /**
   * Every sweeping loop here runs `i` on the inside. `ix` is `x + res * y`, so
   * `i` is the contiguous axis and `j` steps a whole row; iterating `j` on the
   * inside instead walks memory in strides of `res` floats and misses cache on
   * nearly every read. For Gauss-Seidel the two orders are not just equivalent
   * in the limit, they produce the identical iterate: either way the neighbors
   * already updated this sweep are exactly (i-1, j) and (i, j-1).
   */
  function linearSolve(arr, arrPrev, amount, divisor, xMult, yMult, sweeps) {
    for (let k = 0; k < sweeps; k++) {
      for (let j = 1; j <= N; j++) {
        const row = res * j;
        const above = row - res;
        const below = row + res;
        for (let i = 1; i <= N; i++) {
          const index = row + i;
          const neighborSum =
            arr[index - 1] + arr[index + 1] + arr[above + i] + arr[below + i];
          arr[index] = (arrPrev[index] + amount * neighborSum) / divisor;
        }
      }
      setBoundaries(arr, xMult, yMult);
    }
  }

  /**
   * Gauss-Seidel shrinks the remaining error by roughly `4a / (1 + 4a)` per
   * sweep. Weak diffusion is strongly diagonally dominant and converges to
   * float precision in a handful of sweeps, so spending the full `iterations`
   * budget on it is wasted work. Pressure has a ratio of 1 and genuinely needs
   * every sweep it can get, which is why `project` asks for the full budget.
   */
  const sweepsFor = (a) => {
    const rate = (4 * a) / (1 + 4 * a);
    if (!(rate > 0)) return 0;
    if (rate > 0.99) return params.iterations;
    return Math.min(
      params.iterations,
      Math.ceil(Math.log(1e-6) / Math.log(rate)),
    );
  };

  function diffuse(arr, arrPrev, diff, xMult, yMult) {
    const a = params.dt * diff * N * N;
    // Warm start, and already the answer to float precision when `a` is tiny.
    arr.set(arrPrev);
    const sweeps = sweepsFor(a);
    if (sweeps === 0) setBoundaries(arr, xMult, yMult);
    else linearSolve(arr, arrPrev, a, 1 + 4 * a, xMult, yMult, sweeps);
  }

  function project() {
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      const above = row - res;
      const below = row + res;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        divergence[index] =
          0.5 *
          (xVel[index - 1] -
            xVel[index + 1] +
            yVel[above + i] -
            yVel[below + i]);
      }
    }
    // No setBoundaries on `divergence`: linearSolve reads arrPrev only at
    // interior cells, so its boundary values are never looked at.
    pressure.fill(0);
    linearSolve(pressure, divergence, 1, 4, 1, 1, params.iterations);

    for (let j = 1; j <= N; j++) {
      const row = res * j;
      const above = row - res;
      const below = row + res;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        xVel[index] += (pressure[index - 1] - pressure[index + 1]) / 2;
        yVel[index] += (pressure[above + i] - pressure[below + i]) / 2;
      }
    }
    setBoundaries(xVel, -1, 1);
    setBoundaries(yVel, 1, -1);
  }

  // Current fields become the previous ones. The buffers read from last frame
  // are reused as the destination, so their contents are always overwritten
  // before being read again.
  const swapBuffers = () => {
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];
    [tempPrev, temp] = [temp, tempPrev];
  };

  // Regions relax toward a target instead of accumulating, so they can't run
  // away. This also keeps the whole field inside the range spanned by the
  // targets and startingTemperature: advection and diffusion both average
  // existing values, so neither can overshoot it.
  function applyRegions() {
    for (const {x, y, width, height, targetTemp, rate} of params.regions) {
      for (let j = y; j < y + height; j++) {
        for (let i = x; i < x + width; i++) {
          const index = ix(i, j);
          temp[index] += (targetTemp - temp[index]) * rate;
        }
      }
    }
  }

  function applyBuoyancy() {
    const {dt, buoyantForce} = params;
    for (let i = 0; i < size; i++) {
      yVel[i] += (temp[i] - startingTemperature) * buoyantForce * dt;
    }
  }

  /**
   * Even with the advection fixed below, a grid this coarse still bleeds
   * angular momentum. Vorticity confinement measures the swirl that survived
   * and pushes it back up: the force runs along the gradient of |curl|, so
   * every vortex pulls its own circulation back toward its center instead of
   * letting it spread out and flatten.
   *
   * This one is a dial, not a correction. It injects energy rather than
   * recovering something the discretization lost, so too much turns the flow
   * into a field of permanent pinwheels that no longer respond to buoyancy.
   */
  function applyVorticity() {
    const {dt, vorticity} = params;
    if (!vorticity) return;

    for (let j = 1; j <= N; j++) {
      const row = res * j;
      const above = row - res;
      const below = row + res;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        curl[index] =
          (yVel[index + 1] -
            yVel[index - 1] -
            xVel[below + i] +
            xVel[above + i]) /
          2;
      }
    }

    // The gradient needs a curl value on each side, so this stops one cell
    // short of the ring `curl` was written on.
    for (let j = 2; j < N; j++) {
      const row = res * j;
      const above = row - res;
      const below = row + res;
      for (let i = 2; i < N; i++) {
        const index = row + i;
        const gradX =
          (Math.abs(curl[index + 1]) - Math.abs(curl[index - 1])) / 2;
        const gradY =
          (Math.abs(curl[below + i]) - Math.abs(curl[above + i])) / 2;
        // Normalizing makes the force depend on the direction of the gradient
        // but not its steepness, so faint vortices get confined as firmly as
        // strong ones. The epsilon covers perfectly uniform neighborhoods.
        const scale =
          (vorticity * dt * curl[index]) / (Math.hypot(gradX, gradY) + 1e-12);
        xVel[index] += gradY * scale;
        yVel[index] -= gradX * scale;
      }
    }
  }

  /**
   * One semi-Lagrangian pass: trace each cell back along the velocity field
   * and bilinearly sample `src` where it lands. `direction` of -1 traces the
   * other way, which is how `macCormack` re-derives where a value came from.
   */
  function advectPass(dst, src, direction) {
    const {dt} = params;
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        const x = bind(i - direction * dt * N * xVelPrev[index], 0.5, N + 0.5);
        const y = bind(j - direction * dt * N * yVelPrev[index], 0.5, N + 0.5);
        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        const x1 = x - i0;
        const x0 = 1 - x1;
        const y1 = y - j0;
        const y0 = 1 - y1;
        const upLeft = ix(i0, j0);
        const downLeft = upLeft + res;
        dst[index] =
          x0 * (y0 * src[upLeft] + y1 * src[downLeft]) +
          x1 * (y0 * src[upLeft + 1] + y1 * src[downLeft + 1]);
      }
    }
  }

  /**
   * Plain semi-Lagrangian advection is only first order: every step resamples
   * through a bilinear filter, and that filter is a blur. It is the reason
   * small vortices dissolve within a second or two and the temperature field
   * turns to haze no matter how low `diffusionRate` goes.
   *
   * MacCormack advects forward, advects that result back, and reads how far
   * the round trip missed the original as an estimate of the error to subtract
   * off. That cancels the leading term and costs one extra trace.
   *
   * The correction can overshoot into values that were never anywhere nearby,
   * which is unstable, so each result is clamped to the range of the four
   * cells the forward trace actually sampled. Clamping falls back to plain
   * semi-Lagrangian exactly at sharp extrema, which is where the overshoot
   * would have been worst.
   */
  function macCormack(dst, src) {
    const {dt} = params;
    advectPass(dst, src, 1);
    advectPass(reverted, dst, -1);

    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        const x = bind(i - dt * N * xVelPrev[index], 0.5, N + 0.5);
        const y = bind(j - dt * N * yVelPrev[index], 0.5, N + 0.5);
        const upLeft = ix(Math.floor(x), Math.floor(y));
        const downLeft = upLeft + res;
        const a = src[upLeft];
        const b = src[upLeft + 1];
        const c = src[downLeft];
        const d = src[downLeft + 1];
        dst[index] = bind(
          dst[index] + (src[index] - reverted[index]) / 2,
          Math.min(a, b, c, d),
          Math.max(a, b, c, d),
        );
      }
    }
  }

  function advect() {
    macCormack(xVel, xVelPrev);
    macCormack(yVel, yVelPrev);
    macCormack(temp, tempPrev);

    setBoundaries(xVel, -1, 1);
    setBoundaries(yVel, 1, -1);
    setBoundaries(temp, 1, 1);
  }

  /**
   * `advect` moves fluid by `dt * N` cells per frame, so one unit of stored
   * velocity is `dt * N / res` of the canvas per frame. Everything crossing
   * this boundary converts through that one factor.
   */
  const canvasPerFrame = () => (params.dt * N) / res;

  /** Runs `fn` over a round brush, weighted by a gaussian falloff. */
  const forEachInBrush = (x, y, radius, fn) => {
    const centerI = x * res;
    const centerJ = y * res;
    const minI = Math.max(1, Math.ceil(centerI - radius));
    const maxI = Math.min(N, Math.floor(centerI + radius));
    const minJ = Math.max(1, Math.ceil(centerJ - radius));
    const maxJ = Math.min(N, Math.floor(centerJ + radius));
    for (let j = minJ; j <= maxJ; j++) {
      const row = res * j;
      for (let i = minI; i <= maxI; i++) {
        const dx = i - centerI;
        const dy = j - centerJ;
        const falloff = Math.exp(-(dx * dx + dy * dy) / (radius * radius));
        if (falloff > 0.01) fn(row + i, falloff);
      }
    }
  };

  return {
    iterate: () => {
      applyRegions();
      applyBuoyancy();
      applyVorticity();

      swapBuffers();
      diffuse(xVel, xVelPrev, params.viscosity, -1, 1);
      diffuse(yVel, yVelPrev, params.viscosity, 1, -1);
      diffuse(temp, tempPrev, params.diffusionRate, 1, 1);
      project();

      swapBuffers();
      advect();
      project();
    },
    getTemperatures: () => temp,

    /**
     * Velocity as a displacement in canvas fractions per frame, which is what
     * a particle integrator wants. Bilinear like advection is, so trails
     * follow the flow instead of stepping between cells.
     * @type {(x: number, y: number) => {x: number, y: number}}
     */
    getVel: (x, y) => {
      // Callers pass fractions of the canvas and can legitimately pass exactly
      // 1. Clamping to the same range `advectPass` traces into keeps all four
      // samples on the grid.
      const gridX = bind(x * res, 0.5, N + 0.5);
      const gridY = bind(y * res, 0.5, N + 0.5);
      const i0 = Math.floor(gridX);
      const j0 = Math.floor(gridY);
      const x1 = gridX - i0;
      const x0 = 1 - x1;
      const y1 = gridY - j0;
      const y0 = 1 - y1;
      const upLeft = ix(i0, j0);
      const downLeft = upLeft + res;
      const sample = (arr) =>
        x0 * (y0 * arr[upLeft] + y1 * arr[downLeft]) +
        x1 * (y0 * arr[upLeft + 1] + y1 * arr[downLeft + 1]);
      const scale = canvasPerFrame();
      return {x: sample(xVel) * scale, y: sample(yVel) * scale};
    },

    /**
     * Push the fluid. `dx`/`dy` are how far the pointer travelled in canvas
     * fractions, converted through the same factor `getVel` reports in, so
     * dragging at a speed pushes fluid at roughly that speed.
     */
    addVelocity: (x, y, dx, dy, radius) => {
      const scale = 1 / canvasPerFrame();
      forEachInBrush(x, y, radius, (index, falloff) => {
        xVel[index] += dx * scale * falloff;
        yVel[index] += dy * scale * falloff;
      });
    },

    /** Paint heat, relaxing toward a target the way `applyRegions` does. */
    addHeat: (x, y, targetTemp, rate, radius) => {
      forEachInBrush(x, y, radius, (index, falloff) => {
        temp[index] += (targetTemp - temp[index]) * rate * falloff;
      });
    },
  };
};
