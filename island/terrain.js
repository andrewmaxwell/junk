// terrain.js

/**
 * Initialize terrain height and rock hardness (also clears water/sediment).
 * Very simple: radial island shape + upsampled random hills.
 * @param {{
 *   simSize: number,
 *   elevationScale: number,
 *   islandRadiusCells: number,
 *   cellSize: number,
 *   hillGrid?: number,
 *   hillAmp?: number
 * }} params
 * @param {Float32Array} landHeight
 * @param {Float32Array} rockHardness
 * @param {Float32Array} waterDepth
 * @param {Float32Array} sediment
 */
export function initializeTerrain(
  params,
  landHeight,
  rockHardness,
  waterDepth,
  sediment,
) {
  const N = params.simSize | 0;

  /**
   * Row-major index.
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  const idx = (x, z) => z * N + x;

  // ---- Simple island mask (paraboloid falloff) ----
  const cx = (N - 1) / 2;
  const cz = (N - 1) / 2;
  const islandR = Math.max(8, params.islandRadiusCells);

  // ---- Low-res random hill field we’ll bilinear-upsample ----
  const hillGrid = Math.max(2, Math.floor(params.hillGrid ?? 32));
  const hills = new Float32Array(hillGrid * hillGrid);
  for (let j = 0; j < hillGrid * hillGrid; j++) hills[j] = Math.random(); // [0,1)

  /**
   * Bilinear sample the low-res hill field at normalized coords u,v in [0,1].
   * @param {number} u
   * @param {number} v
   * @returns {number} sampled hill value in [0,1]
   */
  function sampleHills(u, v) {
    const x = u * (hillGrid - 1);
    const z = v * (hillGrid - 1);
    const xi = Math.floor(x),
      zi = Math.floor(z);
    const xf = x - xi,
      zf = z - zi;
    const i00 = zi * hillGrid + xi;
    const i10 = zi * hillGrid + Math.min(xi + 1, hillGrid - 1);
    const i01 = Math.min(zi + 1, hillGrid - 1) * hillGrid + xi;
    const i11 =
      Math.min(zi + 1, hillGrid - 1) * hillGrid +
      Math.min(xi + 1, hillGrid - 1);
    const a = hills[i00] * (1 - xf) + hills[i10] * xf;
    const b = hills[i01] * (1 - xf) + hills[i11] * xf;
    return a * (1 - zf) + b * zf;
  }

  const hillAmp = params.hillAmp ?? 30; // meters of extra relief

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, z);

      // Radial distance from center in cells
      const dx = x - cx;
      const dz = z - cz;
      const r = Math.hypot(dx, dz);

      // Island paraboloid mask (1 at center → 0 at/after radius)
      const m = Math.max(0, 1 - (r * r) / (islandR * islandR)); // smooth dome

      // Base elevation in meters
      let h = m * params.elevationScale;

      // Add gentle, large-scale randomness from upsampled hill field.
      // Scale by island mask so ocean stays low.
      const u = x / (N - 1);
      const v = z / (N - 1);
      const hills01 = sampleHills(u, v); // [0,1]
      const hillsSigned = (hills01 - 0.5) * 2; // [-1,1]
      h += hillsSigned * hillAmp * m;

      landHeight[i] = h;

      // Simple random hardness in [0.15, 0.85]
      rockHardness[i] = 0.15 + 0.7 * Math.random();

      // Start dry; erosion will form lakes/rivers
      waterDepth[i] = 0;
      sediment[i] = 0;
    }
  }
}
