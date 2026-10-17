const mean = (arr) => arr.reduce((sum, x) => sum + x, 0) / arr.length;

// Largest k eigenvalues and eigenvectors of a symmetric matrix, by power
// iteration with deflation. The matrix is shifted so every eigenvalue is
// positive, which makes power iteration find the largest rather than the one
// with the largest magnitude.
export const topEigen = (matrix, k) => {
  const n = matrix.length;
  const shift = Math.max(
    ...matrix.map((row) => row.reduce((sum, x) => sum + Math.abs(x), 0)),
  );
  const m = matrix.map((row, i) =>
    row.map((x, j) => x + (i === j ? shift : 0)),
  );
  const result = [];
  for (let e = 0; e < k; e++) {
    let vector = Array.from({length: n}, (_, i) => 1 + i / n);
    let value = 0;
    for (let iter = 0; iter < 2000; iter++) {
      const next = m.map((row) =>
        row.reduce((s, x, j) => s + x * vector[j], 0),
      );
      const norm = Math.hypot(...next);
      if (!norm) {
        value = 0;
        break;
      }
      vector = next.map((x) => x / norm);
      if (Math.abs(norm - value) < 1e-10 * norm) break;
      value = norm;
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) m[i][j] -= value * vector[i] * vector[j];
    }
    result.push({value: value - shift, vector});
  }
  return result;
};

// Principal components of the traits. columns[j] holds everyone's answers to
// trait j and corr is the trait correlation matrix. Each factor's loadings say
// how much each trait contributes, and scores place each person on it.
export const pca = (columns, corr, k) => {
  const z = columns.map((col) => {
    const m = mean(col);
    const sd = Math.sqrt(mean(col.map((x) => (x - m) ** 2))) || 1;
    return col.map((x) => (x - m) / sd);
  });
  return topEigen(corr, k).map(({value, vector}) => {
    // Flip so the "high" end is the one most traits point toward.
    const sign = vector.reduce((a, b) => a + b, 0) < 0 ? -1 : 1;
    const loadings = vector.map((x) => x * sign);
    return {
      explained: value / columns.length,
      loadings,
      scores: z[0].map((_, i) =>
        loadings.reduce((sum, l, j) => sum + l * z[j][i], 0),
      ),
    };
  });
};

// Order items so similar ones sit next to each other, using average-linkage
// hierarchical clustering. When two clusters merge, they're flipped so their
// closest ends meet.
export const clusterOrder = (dist) => {
  const avgDist = (a, b) => {
    let sum = 0;
    for (const i of a) for (const j of b) sum += dist[i][j];
    return sum / (a.length * b.length);
  };

  let clusters = dist.map((_, i) => [i]);
  while (clusters.length > 1) {
    let best = {d: Infinity};
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = avgDist(clusters[i], clusters[j]);
        if (d < best.d) best = {d, i, j};
      }
    }
    const a = clusters[best.i];
    const b = clusters[best.j];
    const ra = [...a].reverse();
    const rb = [...b].reverse();
    const [x, y] = [
      [a, b],
      [a, rb],
      [ra, b],
      [ra, rb],
    ].reduce((p, q) =>
      dist[q[0].at(-1)][q[1][0]] < dist[p[0].at(-1)][p[1][0]] ? q : p,
    );
    clusters = clusters.filter((_, k) => k !== best.i && k !== best.j);
    clusters.push([...x, ...y]);
  }
  return clusters[0];
};

// How often each person comes out among another's k most similar (near) and k
// most different (far) when only a random half of the traits is used. A person
// who shows up in nearly every half is a solid match; one who only shows up
// sometimes could easily have been someone else.
export const neighborConsistency = (vectors, distance, k, runs) => {
  const n = vectors.length;
  const t = vectors[0].length;
  let seed = 1;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const near = vectors.map(() => Array(n).fill(0));
  const far = vectors.map(() => Array(n).fill(0));
  for (let run = 0; run < runs; run++) {
    const traits = [...Array(t).keys()]
      .map((j) => [random(), j])
      .sort((a, b) => a[0] - b[0])
      .slice(0, Math.floor(t / 2))
      .map(([, j]) => j);
    const sample = vectors.map((v) => traits.map((j) => v[j]));
    for (let i = 0; i < n; i++) {
      const order = sample
        .map((v, j) => [distance(sample[i], v), j])
        .filter(([, j]) => j !== i)
        .sort((a, b) => a[0] - b[0]);
      for (const [, j] of order.slice(0, k)) near[i][j] += 1 / runs;
      for (const [, j] of order.slice(-k)) far[i][j] += 1 / runs;
    }
  }
  return {near, far};
};
