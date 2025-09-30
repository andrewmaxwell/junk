// sim.js
import {initializeTerrain} from './terrain.js';

/**
 * Create the simulation state and internal scratch buffers.
 * Arrays are stable references on the returned object.
 * @param {{
 *   simSize: number,
 *   seed?: string|number,
 *   seaLevel: number,
 *   elevationScale: number,
 *   islandRadiusCells: number,
 *   cellSize: number,
 *   hillGrid?: number,
 *   hillAmp?: number
 * }} params
 * @returns {{
 *   landHeight: Float32Array,
 *   waterDepth: Float32Array,
 *   sediment: Float32Array,
 *   rockHardness: Float32Array,
 *   iterate: (stepParams: {
 *     dt: number,
 *     rainRate: number,
 *     evaporationRate: number,
 *     flowFactor: number,
 *     capacityCoeff: number,
 *     erodeRate: number,
 *     depositRate: number,
 *     maxErodePerStep: number,
 *     talusAngleDeg: number,
 *     thermalRate: number,
 *     thermalPasses: number,
 *     seaLevel?: number,
 *     streamPowerK: number,
 *     streamPowerM: number,
 *     streamPowerN: number
 *   }) => void
 * }}
 */
export function makeSim(params) {
  const N = params.simSize | 0;
  const num = N * N;

  /**
   * Row-major index of (x,z).
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  const indexOf = (x, z) => z * N + x;

  // Public state (stable references)
  const landHeight = new Float32Array(num);
  const waterDepth = new Float32Array(num);
  const sediment = new Float32Array(num);
  const rockHardness = new Float32Array(num);

  // Internal scratch buffers
  const combinedHeight = new Float32Array(num);
  const nextWaterDepth = new Float32Array(num);
  const nextSediment = new Float32Array(num);
  const deltaHeightTherm = new Float32Array(num);
  const fluxNorth = new Float32Array(num);
  const fluxSouth = new Float32Array(num);
  const fluxEast = new Float32Array(num);
  const fluxWest = new Float32Array(num);

  // One-time terrain init
  initializeTerrain(params, landHeight, rockHardness, waterDepth, sediment);

  /**
   * Simulate one time step: water routing, erosion/transport, thermal erosion.
   * @param {{
   *   dt: number,
   *   rainRate: number,
   *   evaporationRate: number,
   *   flowFactor: number,
   *   capacityCoeff: number,
   *   erodeRate: number,
   *   depositRate: number,
   *   maxErodePerStep: number,
   *   talusAngleDeg: number,
   *   thermalRate: number,
   *   thermalPasses: number,
   *   seaLevel?: number,
   *   streamPowerK: number,
   *   streamPowerM: number,
   *   streamPowerN: number
   * }} stepParams
   */
  function iterate(stepParams) {
    const {
      dt,
      rainRate,
      evaporationRate,
      flowFactor,
      capacityCoeff,
      erodeRate,
      depositRate,
      maxErodePerStep,
      talusAngleDeg,
      thermalRate,
      thermalPasses,
      streamPowerK,
      streamPowerM,
      streamPowerN,
    } = stepParams;

    const seaLevel = stepParams.seaLevel ?? params.seaLevel;
    const cellSize = params.cellSize;
    const small = 1e-9;

    const talusHeightThreshold =
      Math.tan((talusAngleDeg * Math.PI) / 180) * cellSize + 1e-6;

    // Rain, Evaporation, Combined Height
    for (let i = 0; i < num; i++) {
      waterDepth[i] = Math.max(
        0,
        waterDepth[i] + rainRate * dt - evaporationRate * dt,
      );
      combinedHeight[i] = landHeight[i] + waterDepth[i];
      nextWaterDepth[i] = 0;
      nextSediment[i] = 0;
      fluxNorth[i] = fluxSouth[i] = fluxEast[i] = fluxWest[i] = 0;
    }

    // Flux computation (4-neighbor) on combined height
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = indexOf(x, z);
        const hHere = combinedHeight[i];

        let outflow = 0;

        if (z > 0) {
          const dH = hHere - combinedHeight[indexOf(x, z - 1)];
          if (dH > 0) {
            fluxNorth[i] = Math.max(0, fluxNorth[i] + dt * flowFactor * dH);
            outflow += fluxNorth[i];
          }
        }
        if (z < N - 1) {
          const dH = hHere - combinedHeight[indexOf(x, z + 1)];
          if (dH > 0) {
            fluxSouth[i] = Math.max(0, fluxSouth[i] + dt * flowFactor * dH);
            outflow += fluxSouth[i];
          }
        }
        if (x < N - 1) {
          const dH = hHere - combinedHeight[indexOf(x + 1, z)];
          if (dH > 0) {
            fluxEast[i] = Math.max(0, fluxEast[i] + dt * flowFactor * dH);
            outflow += fluxEast[i];
          }
        }
        if (x > 0) {
          const dH = hHere - combinedHeight[indexOf(x - 1, z)];
          if (dH > 0) {
            fluxWest[i] = Math.max(0, fluxWest[i] + dt * flowFactor * dH);
            outflow += fluxWest[i];
          }
        }

        // Conserve mass
        const maxOut = waterDepth[i];
        if (outflow * dt > maxOut && outflow > small) {
          const scale = maxOut / (outflow * dt + small);
          fluxNorth[i] *= scale;
          fluxSouth[i] *= scale;
          fluxEast[i] *= scale;
          fluxWest[i] *= scale;
        }
      }
    }

    // Apply fluxes (advect water & sediment)
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = indexOf(x, z);
        const w = waterDepth[i];

        const outN = fluxNorth[i] * dt;
        const outS = fluxSouth[i] * dt;
        const outE = fluxEast[i] * dt;
        const outW = fluxWest[i] * dt;
        const totalOut = outN + outS + outE + outW;

        const stay = Math.max(0, w - totalOut);
        const sedimentHere = sediment[i];

        nextWaterDepth[i] += stay;
        if (w > small) {
          nextSediment[i] += sedimentHere * (stay / w);
        } else {
          nextSediment[i] += sedimentHere;
        }

        if (z > 0 && outN > 0) {
          const j = indexOf(x, z - 1);
          nextWaterDepth[j] += outN;
          if (w > small) nextSediment[j] += sedimentHere * (outN / w);
        }
        if (z < N - 1 && outS > 0) {
          const j = indexOf(x, z + 1);
          nextWaterDepth[j] += outS;
          if (w > small) nextSediment[j] += sedimentHere * (outS / w);
        }
        if (x < N - 1 && outE > 0) {
          const j = indexOf(x + 1, z);
          nextWaterDepth[j] += outE;
          if (w > small) nextSediment[j] += sedimentHere * (outE / w);
        }
        if (x > 0 && outW > 0) {
          const j = indexOf(x - 1, z);
          nextWaterDepth[j] += outW;
          if (w > small) nextSediment[j] += sedimentHere * (outW / w);
        }
      }
    }

    // Erosion / deposition (capacity model + stream-power incision)
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = indexOf(x, z);

        const hHere = combinedHeight[i];
        let maxDrop = 0;
        if (z > 0)
          maxDrop = Math.max(
            maxDrop,
            hHere - combinedHeight[indexOf(x, z - 1)],
          );
        if (z < N - 1)
          maxDrop = Math.max(
            maxDrop,
            hHere - combinedHeight[indexOf(x, z + 1)],
          );
        if (x > 0)
          maxDrop = Math.max(
            maxDrop,
            hHere - combinedHeight[indexOf(x - 1, z)],
          );
        if (x < N - 1)
          maxDrop = Math.max(
            maxDrop,
            hHere - combinedHeight[indexOf(x + 1, z)],
          );

        const localSlope = Math.max(0, maxDrop) / params.cellSize;
        const outPerSec =
          fluxNorth[i] + fluxSouth[i] + fluxEast[i] + fluxWest[i]; // discharge proxy
        const depthHere = nextWaterDepth[i];
        const velocityProxy = outPerSec / Math.max(depthHere, 1e-4);

        const capacity = capacityCoeff * velocityProxy * localSlope;
        const sed = nextSediment[i];

        // Capacity-driven erosion/deposition (suspended load)
        if (sed < capacity) {
          let erode = erodeRate * (capacity - sed) * dt;
          erode = Math.min(erode, maxErodePerStep);
          erode *= 1 - 0.8 * rockHardness[i];
          const minBed = seaLevel - 30;
          erode = Math.min(erode, Math.max(0, landHeight[i] - minBed));
          landHeight[i] -= erode;
          nextSediment[i] += erode;
        } else {
          const deposit = depositRate * (sed - capacity) * dt;
          landHeight[i] += deposit;
          nextSediment[i] -= deposit;
        }

        // Stream-power incision (channels carve bedrock)
        if (localSlope > 0 && outPerSec > 0) {
          const incision =
            Math.min(
              maxErodePerStep,
              streamPowerK *
                Math.pow(outPerSec, streamPowerM) *
                Math.pow(localSlope, streamPowerN) *
                dt,
            ) *
            (1 - 0.8 * rockHardness[i]);
          if (incision > 0) {
            landHeight[i] -= incision;
            nextSediment[i] += incision;
          }
        }
      }
    }

    // Commit fields
    for (let i = 0; i < num; i++) {
      waterDepth[i] = Math.max(0, nextWaterDepth[i]);
      sediment[i] = Math.max(0, nextSediment[i]);
    }

    // Thermal erosion (talus / landslides)
    for (let pass = 0; pass < thermalPasses; pass++) {
      deltaHeightTherm.fill(0);
      for (let z = 1; z < N - 1; z++) {
        for (let x = 1; x < N - 1; x++) {
          const i = indexOf(x, z);
          const bedHere = landHeight[i];

          /** @type {[number,number][]} */
          const neighbors = [
            [x, z - 1],
            [x, z + 1],
            [x - 1, z],
            [x + 1, z],
          ];

          for (let k = 0; k < neighbors.length; k++) {
            const [nx, nz] = neighbors[k];
            const j = indexOf(nx, nz);
            const diff = bedHere - landHeight[j];
            if (diff > talusHeightThreshold) {
              const move = (diff - talusHeightThreshold) * 0.5 * thermalRate;
              deltaHeightTherm[i] -= move;
              deltaHeightTherm[j] += move;
            }
          }
        }
      }
      for (let i = 0; i < num; i++) {
        landHeight[i] += deltaHeightTherm[i];
      }
    }
  }

  return {
    landHeight,
    waterDepth,
    sediment,
    rockHardness,
    iterate,
  };
}
