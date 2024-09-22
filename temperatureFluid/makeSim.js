export const makeSim = ({
  res,
  diffusionRate,
  viscosity,
  dt,
  buoyantForce, // includes gravity
  incompressibility,
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
    for (let k = 0; k < incompressibility; k++) {
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
        const neighborPressure =
          xVel[ix(i - 1, j)] -
          xVel[ix(i + 1, j)] +
          yVel[ix(i, j - 1)] -
          yVel[ix(i, j + 1)];
        pressurePrev[ix(i, j)] = neighborPressure / N;
        pressure[ix(i, j)] = 0;
      }
    }
    setBoundaries(pressurePrev, 1, 1);
    setBoundaries(pressure, 1, 1);
    linearSolve(pressure, pressurePrev, 1, 4, 1, 1);

    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        xVel[ix(i, j)] -=
          0.5 * N * (pressure[ix(i + 1, j)] - pressure[ix(i - 1, j)]);
        yVel[ix(i, j)] -=
          0.5 * N * (pressure[ix(i, j + 1)] - pressure[ix(i, j - 1)]);
      }
    }
    setBoundaries(xVel, -1, 1);
    setBoundaries(yVel, 1, -1);
  }

  const bind = (x) => Math.max(0.5, Math.min(N + 0.5, x));

  // I still don't know what exactly this is doing
  function advect(arr, arrPrev, xVelPrev, yVelPrev) {
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        const x = bind(i - dt * N * xVelPrev[ix(i, j)]);
        const y = bind(j - dt * N * yVelPrev[ix(i, j)]);
        const i0 = Math.floor(x);
        const j0 = Math.floor(y);
        arr[ix(i, j)] =
          (1 - x + i0) *
            ((1 - y + j0) * arrPrev[ix(i0, j0)] +
              (y - j0) * arrPrev[ix(i0, j0 + 1)]) +
          (x - i0) *
            ((1 - y + j0) * arrPrev[ix(i0 + 1, j0)] +
              (y - j0) * arrPrev[ix(i0 + 1, j0 + 1)]);
      }
    }
  }

  const iterate = () => {
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];

    xVelPrev.fill(0);
    yVelPrev.fill(0);
    tempPrev.fill(0);

    // buoyancy
    for (let i = 0; i < size; i++) {
      yVelPrev[i] = (temp[i] - startingTemperature) * buoyantForce * dt;
      yVel[i] += dt * yVelPrev[i];
    }

    // velocity step
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];

    diffuse(xVel, xVelPrev, viscosity, -1, 1);
    diffuse(yVel, yVelPrev, viscosity, 1, -1);

    project(xVel, yVel, xVelPrev, yVelPrev);

    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];
    [tempPrev, temp] = [temp, tempPrev];

    advect(xVel, xVelPrev, xVelPrev, yVelPrev);
    setBoundaries(xVel, -1, 1);
    advect(yVel, yVelPrev, xVelPrev, yVelPrev);
    setBoundaries(yVel, 1, -1);

    project(xVel, yVel, xVelPrev, yVelPrev);

    // temperature step
    diffuse(temp, tempPrev, diffusionRate, 1, 1);

    [tempPrev, temp] = [temp, tempPrev];
    [xVelPrev, xVel] = [xVel, xVelPrev];
    [yVelPrev, yVel] = [yVel, yVelPrev];

    advect(temp, tempPrev, xVelPrev, yVelPrev);
    setBoundaries(temp, 1, 1);

    for (const {x, y, width, height, tempDelta} of regions) {
      for (let i = x; i < x + width; i++) {
        for (let j = y; j < y + height; j++) {
          temp[ix(i, j)] += tempDelta;
        }
      }
    }
  };

  return {
    iterate,
    getTemperatures: () => temp,
    getVel: (x, y) => {
      const index = ix(Math.floor(x * res), Math.floor(y * res));
      return {
        x: xVelPrev[index] / res / dt / 2,
        y: yVelPrev[index] / res / dt / 2,
      };
    },
  };
};
