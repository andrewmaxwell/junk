export const makeSim = ({
  res,
  diffusionRate,
  viscosity,
  dt,
  buoyantForce, // includes gravity
  iterations,
  startingTemperature,
  regions,
}) => {
  const N = res - 2;
  const size = res ** 2;

  let xVel = new Float32Array(size);
  let xVelPrev = new Float32Array(size);
  let yVel = new Float32Array(size);
  let yVelPrev = new Float32Array(size);
  let temp = new Float32Array(size).fill(startingTemperature);
  let tempPrev = new Float32Array(size).fill(startingTemperature);

  const ix = (x, y) => x + res * y;

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

  function linearSolve(arr, arrPrev, amount, divisor, xMult, yMult) {
    for (let k = 0; k < iterations; k++) {
      for (let i = 1; i <= N; i++) {
        for (let j = 1; j <= N; j++) {
          const neighborSum =
            arr[ix(i - 1, j)] +
            arr[ix(i + 1, j)] +
            arr[ix(i, j - 1)] +
            arr[ix(i, j + 1)];
          arr[ix(i, j)] = (arrPrev[ix(i, j)] + amount * neighborSum) / divisor;
        }
      }
      setBoundaries(arr, xMult, yMult);
    }
  }

  function diffuse(arr, arrPrev, diff, xMult, yMult) {
    const a = dt * diff * N * N;
    linearSolve(arr, arrPrev, a, 1 + 4 * a, xMult, yMult);
  }

  function project(xVel, yVel, pressure, pressurePrev) {
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        pressurePrev[ix(i, j)] =
          xVel[ix(i - 1, j)] -
          xVel[ix(i + 1, j)] +
          yVel[ix(i, j - 1)] -
          yVel[ix(i, j + 1)];
      }
    }

    pressure.fill(0);
    linearSolve(pressure, pressurePrev, 1, 4, 1, 1);

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        xVel[ix(i, j)] += (pressure[ix(i - 1, j)] - pressure[ix(i + 1, j)]) / 2;
        yVel[ix(i, j)] += (pressure[ix(i, j - 1)] - pressure[ix(i, j + 1)]) / 2;
      }
    }
    setBoundaries(xVel, -1, 1);
    setBoundaries(yVel, 1, -1);
  }

  const bind = (x, min, max) => Math.max(min, Math.min(max, x));

  const swapBuffers = () => {
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];
    [tempPrev, temp] = [temp, tempPrev];
  };

  const iterate = () => {
    // heating/cooling regions
    for (const {x, y, width, height, tempDelta} of regions) {
      for (let i = x; i < x + width; i++) {
        for (let j = y; j < y + height; j++) {
          temp[ix(i, j)] += tempDelta;
        }
      }
    }

    // buoyancy
    for (let i = 0; i < size; i++) {
      yVelPrev[i] = (temp[i] - startingTemperature) * buoyantForce * dt;
      yVel[i] += dt * yVelPrev[i];
    }

    swapBuffers();

    diffuse(xVel, xVelPrev, viscosity, -1, 1);
    diffuse(yVel, yVelPrev, viscosity, 1, -1);
    diffuse(temp, tempPrev, diffusionRate, 1, 1);

    project(xVel, yVel, xVelPrev, yVelPrev);

    swapBuffers();

    // advect
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        const cellIndex = ix(i, j);
        const x = bind(i - dt * N * xVelPrev[cellIndex], 0.5, N + 0.5);
        const y = bind(j - dt * N * yVelPrev[cellIndex], 0.5, N + 0.5);
        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        const x0 = 1 - x + i0;
        const x1 = x - i0;
        const y0 = 1 - y + j0;
        const y1 = y - j0;
        const upLeftIndex = ix(i0, j0);
        const downLeftIndex = ix(i0, j0 + 1);
        const upRightIndex = ix(i0 + 1, j0);
        const downRight = ix(i0 + 1, j0 + 1);

        xVel[cellIndex] =
          x0 * (y0 * xVelPrev[upLeftIndex] + y1 * xVelPrev[downLeftIndex]) +
          x1 * (y0 * xVelPrev[upRightIndex] + y1 * xVelPrev[downRight]);
        yVel[cellIndex] =
          x0 * (y0 * yVelPrev[upLeftIndex] + y1 * yVelPrev[downLeftIndex]) +
          x1 * (y0 * yVelPrev[upRightIndex] + y1 * yVelPrev[downRight]);
        temp[cellIndex] =
          x0 * (y0 * tempPrev[upLeftIndex] + y1 * tempPrev[downLeftIndex]) +
          x1 * (y0 * tempPrev[upRightIndex] + y1 * tempPrev[downRight]);
      }
    }

    setBoundaries(xVel, -1, 1);
    setBoundaries(yVel, 1, -1);
    setBoundaries(temp, 1, 1);

    project(xVel, yVel, xVelPrev, yVelPrev);
  };

  return {
    iterate,
    getTemperatures: () => temp,
    getVel: (x, y) => {
      const index = ix(Math.floor(x * res), Math.floor(y * res));
      return {
        x: xVel[index] / res / dt / 2,
        y: yVel[index] / res / dt / 2,
      };
    },
  };
};
