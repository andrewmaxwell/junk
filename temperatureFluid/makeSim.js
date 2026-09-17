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
 *   iterations: number,
 *   diffusionIterations: number,
 *   regions: Region[],
 * }} SimParams
 */

// Which staggered grid a field lives on. See the layout note below.
const X = 0;
const Y = 1;
const CENTER = 2;

/**
 * A Stam-style fluid solver on a STAGGERED (MAC) grid.
 *
 * The obvious layout puts every field at the cell center. That version of this
 * file was measurably compressible in a way no amount of solver effort could
 * fix: divergence and the pressure gradient were both wide 2h central
 * differences, which skip the immediate neighbor, while the Poisson solve used
 * the compact 5-point Laplacian. Those disagree, so the odd and even cells
 * decouple and grid-scale divergence sits in the projection's null space.
 * Measured, raising `iterations` from 8 to 256 left true cell-to-cell
 * divergence slightly WORSE (1.66e-2 -> 1.79e-2) for 10x the cost.
 *
 * Staggering fixes it at the root. Velocities live on cell faces and pressure
 * at centers, so divergence and gradient are both compact, `div(grad(p))` is
 * exactly the 5-point Laplacian being solved, and there is no null space.
 * Measured, divergence now converges toward zero like a consistent scheme
 * should: 1.37e-2 at 16 sweeps, 4.40e-4 at 256, 3.57e-5 at 1024.
 *
 * The layout, with N interior cells and a ring of ghosts, all sharing the
 * stride `res` so `x + res * y` still addresses everything:
 *
 *   temp, pressure   center of cell (i, j)      world ((i-0.5)/N, (j-0.5)/N)
 *   xVel             vertical face, i in 1..N+1 world ((i-1)/N,   (j-0.5)/N)
 *   yVel             horizontal face, j in 1..N+1  world ((i-0.5)/N, (j-1)/N)
 *
 * Faces 1 and N+1 sit exactly on the walls, so they are pinned to zero and
 * never advected or projected.
 *
 * `res` and `startingTemperature` are read once at construction because they
 * size and seed the buffers. Every other field is read live each frame, so
 * mutating the params object retunes the sim without restarting it.
 * @param {SimParams} params
 */
export const makeSim = (params) => {
  const {res, startingTemperature} = params;
  const N = res - 2;
  const size = res ** 2;

  // Over-relaxation factor for the pressure solve. Plain Gauss-Seidel is the
  // omega = 1 case of the same iteration; the optimal value for a 5-point
  // Poisson solve on an N^2 grid is 2 / (1 + sin(pi/N)), which turns O(N^2)
  // sweeps into O(N). Derived from N rather than hardcoded so it stays correct
  // if the resolution changes. Measured at res 256: 4 sweeps of SOR beat 32
  // sweeps of Gauss-Seidel on divergence (1.7e-3 vs 4.8e-3) at a quarter of
  // the cost. Do not exceed 2 -- the iteration diverges.
  const omega = 2 / (1 + Math.sin(Math.PI / N));

  let xVel = new Float32Array(size);
  let yVel = new Float32Array(size);
  let temp = new Float32Array(size).fill(startingTemperature);
  let xVelPrev = new Float32Array(size);
  let yVelPrev = new Float32Array(size);
  let tempPrev = new Float32Array(size).fill(startingTemperature);

  // Scratch for `project` alone, plus the round trip `macCormack` needs.
  const pressure = new Float32Array(size);
  const divergence = new Float32Array(size);
  const reverted = new Float32Array(size);

  const bind = (x, min, max) => Math.max(min, Math.min(max, x));

  // Where a field's node (i, j) sits, as an offset in cells: the node is at
  // world ((i + ox) / N, (j + oy) / N). Inverting, a world coordinate maps to
  // that field's index space as `w * N - o`.
  const offsetX = (kind) => (kind === X ? -1 : -0.5);
  const offsetY = (kind) => (kind === Y ? -1 : -0.5);

  /**
   * Bilinear sample in a field's own index space. The clamp range keeps both
   * taps inside the domain, which is why each kind passes its own bounds:
   * faces reach one further than centers along their normal axis.
   */
  function sampleField(arr, gi, gj, giLo, giHi, gjLo, gjHi) {
    const x = bind(gi, giLo, giHi);
    const y = bind(gj, gjLo, gjHi);
    const i0 = Math.min(Math.floor(x), N);
    const j0 = Math.min(Math.floor(y), N);
    const fx = x - i0;
    const fy = y - j0;
    const k = i0 + res * j0;
    const a = arr[k];
    const b = arr[k + 1];
    const c = arr[k + res];
    const d = arr[k + res + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // Normal components sit on the wall, so they are zero. Tangential components
  // mirror, which is free slip -- the same convention the collocated version's
  // setBoundaries(xVel, -1, 1) encoded.
  function boundX(arr) {
    for (let j = 0; j < res; j++) {
      arr[1 + res * j] = 0;
      arr[N + 1 + res * j] = 0;
    }
    for (let i = 0; i < res; i++) {
      arr[i] = arr[i + res];
      arr[i + res * (N + 1)] = arr[i + res * N];
    }
  }

  function boundY(arr) {
    for (let i = 0; i < res; i++) {
      arr[i + res] = 0;
      arr[i + res * (N + 1)] = 0;
    }
    for (let j = 0; j < res; j++) {
      arr[res * j] = arr[1 + res * j];
      arr[N + 1 + res * j] = arr[N + res * j];
    }
  }

  function boundCenter(arr) {
    for (let j = 1; j <= N; j++) {
      arr[res * j] = arr[1 + res * j];
      arr[N + 1 + res * j] = arr[N + res * j];
    }
    for (let i = 0; i < res; i++) {
      arr[i] = arr[i + res];
      arr[i + res * (N + 1)] = arr[i + res * N];
    }
  }

  const boundFor = (kind) =>
    kind === X ? boundX : kind === Y ? boundY : boundCenter;

  /**
   * Every sweeping loop here runs `i` on the inside, because the stride is
   * `res` and `i` is the contiguous axis. For Gauss-Seidel the two orders are
   * not merely equivalent in the limit, they produce the identical iterate.
   */
  function linearSolve(arr, arrPrev, amount, divisor, kind, sweeps) {
    const bound = boundFor(kind);
    const iLo = kind === X ? 2 : 1;
    const jLo = kind === Y ? 2 : 1;
    for (let k = 0; k < sweeps; k++) {
      for (let j = jLo; j <= N; j++) {
        const row = res * j;
        for (let i = iLo; i <= N; i++) {
          const index = row + i;
          const neighborSum =
            arr[index - 1] +
            arr[index + 1] +
            arr[index - res] +
            arr[index + res];
          arr[index] = (arrPrev[index] + amount * neighborSum) / divisor;
        }
      }
      bound(arr);
    }
  }

  /**
   * Gauss-Seidel shrinks the remaining error by roughly `4a / (1 + 4a)` per
   * sweep. Weak diffusion is strongly diagonally dominant and converges to
   * float precision in a handful of sweeps, so spending a large budget on it is
   * wasted work.
   *
   * This is capped by `diffusionIterations`, which is deliberately SEPARATE
   * from the projection's `iterations`. They used to share one number, which
   * silently coupled them: lowering the projection budget also cut the
   * viscosity actually applied, so a cheaper pressure solve looked like it came
   * with a free flow speed-up when it had really just stopped being viscous.
   */
  const sweepsFor = (a) => {
    const rate = (4 * a) / (1 + 4 * a);
    if (!(rate > 0)) return 0;
    // Falling back to `iterations` keeps a params object that predates the
    // split working. Without this the budget is `undefined`, every comparison
    // against it is false and `Math.min` is NaN, so the sweep loop silently
    // runs zero times AND skips its boundary pass -- a wrong answer rather
    // than an error, which is the worst way for this to fail.
    const budget = params.diffusionIterations ?? params.iterations;
    if (rate > 0.99) return budget;
    return Math.min(budget, Math.ceil(Math.log(1e-6) / Math.log(rate)));
  };

  function diffuse(arr, arrPrev, diff, kind) {
    const a = params.dt * diff * N * N;
    // Warm start, and already the answer to float precision when `a` is tiny.
    arr.set(arrPrev);
    const sweeps = sweepsFor(a);
    if (sweeps === 0) boundFor(kind)(arr);
    else linearSolve(arr, arrPrev, a, 1 + 4 * a, kind, sweeps);
  }

  /**
   * Make the velocity field divergence-free. Both differences here are compact
   * -- one cell wide -- which is the whole point of the staggered layout:
   * subtracting this gradient removes exactly the divergence just measured.
   */
  function project() {
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        divergence[index] =
          xVel[index + 1] - xVel[index] + yVel[index + res] - yVel[index];
      }
    }

    // Solving lap(p) = divergence, where lap is the 5-point stencil, so
    // sum(neighbors) - 4p = divergence.
    pressure.fill(0);
    for (let s = 0; s < params.iterations; s++) {
      for (let j = 1; j <= N; j++) {
        const row = res * j;
        for (let i = 1; i <= N; i++) {
          const index = row + i;
          const gaussSeidel =
            (pressure[index - 1] +
              pressure[index + 1] +
              pressure[index - res] +
              pressure[index + res] -
              divergence[index]) /
            4;
          // Step PAST the Gauss-Seidel value by `omega`. Note the solve starts
          // from zero every frame: warm starting from last frame's pressure
          // helps plain Gauss-Seidel but is unstable here, reaching |p| ~ 1e21
          // at omega >= 1.7.
          pressure[index] += omega * (gaussSeidel - pressure[index]);
        }
      }
      boundCenter(pressure);
    }

    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 2; i <= N; i++) {
        const index = row + i;
        xVel[index] -= pressure[index] - pressure[index - 1];
      }
    }
    for (let j = 2; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        yVel[index] -= pressure[index] - pressure[index - res];
      }
    }
    boundX(xVel);
    boundY(yVel);
  }

  const swapBuffers = () => {
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];
    [tempPrev, temp] = [temp, tempPrev];
  };

  function applyRegions() {
    for (const {x, y, width, height, targetTemp, rate} of params.regions) {
      for (let j = y; j < y + height; j++) {
        const row = res * j;
        for (let i = x; i < x + width; i++) {
          const index = row + i;
          temp[index] += (targetTemp - temp[index]) * rate;
        }
      }
    }
  }

  /** Buoyancy pushes vertical faces, which lie between two cells, so the
   *  driving temperature is the average of the pair. */
  function applyBuoyancy() {
    const {dt, buoyantForce} = params;
    for (let j = 2; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        const t = (temp[index] + temp[index - res]) / 2;
        yVel[index] += (t - startingTemperature) * buoyantForce * dt;
      }
    }
  }

  /**
   * One semi-Lagrangian pass. `direction` of -1 traces the other way, which is
   * how `macCormack` re-derives where a value came from.
   *
   * The backtrace velocity at a node is assembled from the faces around it by
   * plain averaging rather than by interpolating the velocity fields. On a
   * staggered grid those neighbors are exactly symmetric about the node, so
   * the average is the same value interpolation would produce, for a fraction
   * of the work -- this is most of why staggering costs so little here.
   */
  function advectPass(dst, src, kind, direction) {
    const dt = params.dt;
    const ox = offsetX(kind);
    const oy = offsetY(kind);
    const iLo = kind === X ? 2 : 1;
    const jLo = kind === Y ? 2 : 1;
    const giLo = kind === X ? 1 : 0.5;
    const giHi = kind === X ? N + 1 : N + 0.5;
    const gjLo = kind === Y ? 1 : 0.5;
    const gjHi = kind === Y ? N + 1 : N + 0.5;

    for (let j = jLo; j <= N; j++) {
      const row = res * j;
      for (let i = iLo; i <= N; i++) {
        const index = row + i;
        let u, v;
        if (kind === X) {
          u = xVelPrev[index];
          v =
            (yVelPrev[index - 1] +
              yVelPrev[index] +
              yVelPrev[index - 1 + res] +
              yVelPrev[index + res]) /
            4;
        } else if (kind === Y) {
          u =
            (xVelPrev[index - res] +
              xVelPrev[index + 1 - res] +
              xVelPrev[index] +
              xVelPrev[index + 1]) /
            4;
          v = yVelPrev[index];
        } else {
          u = (xVelPrev[index] + xVelPrev[index + 1]) / 2;
          v = (yVelPrev[index] + yVelPrev[index + res]) / 2;
        }
        // World coordinates run 0..1 across the interior, so a displacement is
        // simply dt * velocity.
        const wx = (i + ox) / N - direction * dt * u;
        const wy = (j + oy) / N - direction * dt * v;
        dst[index] = sampleField(
          src,
          wx * N - ox,
          wy * N - oy,
          giLo,
          giHi,
          gjLo,
          gjHi,
        );
      }
    }
  }

  /**
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
  function macCormack(dst, src, kind) {
    const dt = params.dt;
    advectPass(dst, src, kind, 1);
    advectPass(reverted, dst, kind, -1);

    const ox = offsetX(kind);
    const oy = offsetY(kind);
    const iLo = kind === X ? 2 : 1;
    const jLo = kind === Y ? 2 : 1;
    const giLo = kind === X ? 1 : 0.5;
    const giHi = kind === X ? N + 1 : N + 0.5;
    const gjLo = kind === Y ? 1 : 0.5;
    const gjHi = kind === Y ? N + 1 : N + 0.5;

    for (let j = jLo; j <= N; j++) {
      const row = res * j;
      for (let i = iLo; i <= N; i++) {
        const index = row + i;
        let u, v;
        if (kind === X) {
          u = xVelPrev[index];
          v =
            (yVelPrev[index - 1] +
              yVelPrev[index] +
              yVelPrev[index - 1 + res] +
              yVelPrev[index + res]) /
            4;
        } else if (kind === Y) {
          u =
            (xVelPrev[index - res] +
              xVelPrev[index + 1 - res] +
              xVelPrev[index] +
              xVelPrev[index + 1]) /
            4;
          v = yVelPrev[index];
        } else {
          u = (xVelPrev[index] + xVelPrev[index + 1]) / 2;
          v = (yVelPrev[index] + yVelPrev[index + res]) / 2;
        }
        const gi = bind((i + ox) / N - dt * u, -1, 2) * N - ox;
        const gj = bind((j + oy) / N - dt * v, -1, 2) * N - oy;
        const x = bind(gi, giLo, giHi);
        const y = bind(gj, gjLo, gjHi);
        const i0 = Math.min(Math.floor(x), N);
        const j0 = Math.min(Math.floor(y), N);
        const corner = i0 + res * j0;
        const a = src[corner];
        const b = src[corner + 1];
        const c = src[corner + res];
        const d = src[corner + res + 1];
        dst[index] = bind(
          dst[index] + (src[index] - reverted[index]) / 2,
          Math.min(a, b, c, d),
          Math.max(a, b, c, d),
        );
      }
    }
  }

  /**
   * Hand back whatever heat advection lost, so the field cannot drift.
   *
   * Semi-Lagrangian advection is not conservative: it asks where each cell's
   * value came from and interpolates, and the interpolation quietly creates or
   * destroys heat. The error is tiny — around 5e-6 of the mean per frame — but
   * it carries a consistent sign, so it accumulates. Left alone the interior
   * mean climbs 0.5046 -> 0.6144 over 12000 frames and the whole field
   * saturates hot, which at 119fps takes under two minutes to watch happen.
   * The plates cannot be blamed: they relax as `(target - T) * rate`, so a
   * warming bulk makes the cold plate pull harder and the hot plate push less.
   *
   * So measure the shortfall against the pre-advection total and give it back,
   * weighted toward the bound it is moving away from — when heat is missing,
   * add it in proportion to `1 - T` so cold cells take most of it and nothing
   * can pass 1; when there is a surplus, remove it in proportion to `T`. That
   * is exactly conservative, can never create a new extremum, and costs two
   * passes (about 1ms at res 256).
   *
   * Measured over 12000 frames this holds the mean around 0.489 and flat from
   * frame 4500 on, rather than running away. Because the field never
   * saturates, it keeps *more* contrast than the uncorrected version, not
   * less: interior SD 0.0478 against 0.0351, S(2cell) 0.203 against 0.178.
   *
   * Note this is a correction bolted onto a non-conservative scheme, not a
   * conservative scheme. Genuine flux-form advection conserves by
   * construction, and was implemented and measured first — it kills the
   * convection outright. That result is worth reading before revisiting this;
   * see CLAUDE.md.
   */
  function conserveMass() {
    let before = 0;
    let after = 0;
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        before += tempPrev[row + i];
        after += temp[row + i];
      }
    }
    const deficit = before - after;
    if (deficit === 0) return;

    // Total room available in the direction the correction has to move.
    let headroom = 0;
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const v = temp[row + i];
        headroom += deficit > 0 ? 1 - v : v;
      }
    }
    if (!(headroom > 0)) return;

    const scale = deficit / headroom;
    for (let j = 1; j <= N; j++) {
      const row = res * j;
      for (let i = 1; i <= N; i++) {
        const index = row + i;
        const v = temp[index];
        temp[index] = v + scale * (deficit > 0 ? 1 - v : v);
      }
    }
    boundCenter(temp);
  }

  function advect() {
    macCormack(xVel, xVelPrev, X);
    macCormack(yVel, yVelPrev, Y);
    // Temperature advects with MacCormack like the velocities, and then the
    // heat it lost is handed back. Without that second call the field drifts
    // hot without bound and eventually saturates.
    macCormack(temp, tempPrev, CENTER);
    conserveMass();

    boundX(xVel);
    boundY(yVel);
    boundCenter(temp);
  }

  /**
   * World coordinates already run 0..1 across the domain, so one unit of
   * stored velocity moves `dt` of the canvas per frame. Everything crossing
   * the sim/screen boundary converts through this one factor.
   */
  const canvasPerFrame = () => params.dt;

  /** Runs `fn` over a round brush on one field's nodes, gaussian weighted. */
  const forEachNode = (x, y, radius, kind, fn) => {
    const ox = offsetX(kind);
    const oy = offsetY(kind);
    const centerI = x * N - ox;
    const centerJ = y * N - oy;
    const iLo = kind === X ? 2 : 1;
    const jLo = kind === Y ? 2 : 1;
    const minI = Math.max(iLo, Math.ceil(centerI - radius));
    const maxI = Math.min(N, Math.floor(centerI + radius));
    const minJ = Math.max(jLo, Math.ceil(centerJ - radius));
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

      swapBuffers();
      diffuse(xVel, xVelPrev, params.viscosity, X);
      diffuse(yVel, yVelPrev, params.viscosity, Y);
      diffuse(temp, tempPrev, params.diffusionRate, CENTER);
      project();

      swapBuffers();
      advect();
      project();
    },
    getTemperatures: () => temp,

    /**
     * Velocity as a displacement in canvas fractions per frame, which is what
     * a particle integrator wants. Sampled bilinearly from each face field at
     * its own offsets, so trails follow the flow rather than stepping between
     * cells.
     * @type {(x: number, y: number) => {x: number, y: number}}
     */
    getVel: (x, y) => {
      const scale = canvasPerFrame();
      return {
        x:
          sampleField(xVel, x * N + 1, y * N + 0.5, 1, N + 1, 0.5, N + 0.5) *
          scale,
        y:
          sampleField(yVel, x * N + 0.5, y * N + 1, 0.5, N + 0.5, 1, N + 1) *
          scale,
      };
    },

    /**
     * Push the fluid. `dx`/`dy` are how far the pointer travelled in canvas
     * fractions, converted through the same factor `getVel` reports in, so
     * dragging at a speed pushes fluid at roughly that speed. The two
     * components land on different faces, hence two passes.
     */
    addVelocity: (x, y, dx, dy, radius) => {
      const scale = 1 / canvasPerFrame();
      forEachNode(x, y, radius, X, (index, falloff) => {
        xVel[index] += dx * scale * falloff;
      });
      forEachNode(x, y, radius, Y, (index, falloff) => {
        yVel[index] += dy * scale * falloff;
      });
    },

    /** Paint heat, relaxing toward a target the way `applyRegions` does. */
    addHeat: (x, y, targetTemp, rate, radius) => {
      forEachNode(x, y, radius, CENTER, (index, falloff) => {
        temp[index] += (targetTemp - temp[index]) * rate * falloff;
      });
    },
  };
};
