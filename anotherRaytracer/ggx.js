// How much light rough reflections (GGX microfacets, as in shaders.js)
// reflect with only one bounce off the tiny mirrors. Real light bounces
// between them too and mostly comes back out, so the shader scales its
// reflections up by how much this falls short ("Practical multiple
// scattering compensation for microfacet models", Turquin). Without that,
// white metal at roughness 0.7 looks half as bright as it should.

/** The table's size along each side: roughness from 0 to 1, and the cosine of the view angle from 0 to 1 */
export const ALBEDO_SIZE = 32;

/** @type {(c: number, a2: number) => number} */
const lambda = (c, a2) =>
  0.5 * (Math.sqrt(1 + (a2 * (1 - c * c)) / Math.max(c * c, 1e-8)) - 1);

/**
 * The fraction of light white GGX metal reflects with one bounce, toward a
 * viewer at an angle with cosine cosV, for roughness alpha: the average of
 * G2 / G1 over half-vectors sampled as the shader samples them (by visible
 * normals), on an n × n grid.
 * @type {(cosV: number, alpha: number, n?: number) => number}
 */
const albedo = (cosV, alpha, n = 32) => {
  const a2 = alpha * alpha;
  const v = [Math.sqrt(1 - cosV * cosV), 0, cosV];
  const stretched = [alpha * v[0], 0, v[2]];
  const length = Math.hypot(...stretched);
  const s = stretched.map((x) => x / length);
  const lambdaV = lambda(cosV, a2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const phi = (2 * Math.PI * (i + 0.5)) / n;
      const z = (1 - (j + 0.5) / n) * (1 + s[2]) - s[2];
      const sinA = Math.sqrt(Math.max(0, 1 - z * z));
      const hx = alpha * (sinA * Math.cos(phi) + s[0]);
      const hy = alpha * sinA * Math.sin(phi);
      const hz = Math.max(z + s[2], 1e-6);
      const hl = Math.hypot(hx, hy, hz);
      const h = [hx / hl, hy / hl, hz / hl];
      const vh = v[0] * h[0] + v[2] * h[2];
      const cosL = 2 * vh * h[2] - v[2];
      if (cosL <= 0) continue;
      sum += (1 + lambdaV) / (1 + lambdaV + lambda(cosL, a2));
    }
  }
  return sum / (n * n);
};

/**
 * albedo for every roughness (rows) and view cosine (columns), each from 0
 * to 1 in ALBEDO_SIZE steps, packed four to a vec4 for a uniform buffer
 */
export const albedoTable = () => {
  const table = new Float32Array(ALBEDO_SIZE * ALBEDO_SIZE);
  for (let row = 0; row < ALBEDO_SIZE; row++) {
    const alpha = Math.max(row / (ALBEDO_SIZE - 1), 0.002);
    for (let col = 0; col < ALBEDO_SIZE; col++) {
      const cosV = Math.max(col / (ALBEDO_SIZE - 1), 0.01);
      table[row * ALBEDO_SIZE + col] = albedo(cosV, alpha);
    }
  }
  return table;
};
