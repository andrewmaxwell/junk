// Louvain modularity community detection (multi-level).
// graph: array of Map(neighbor -> weight), symmetric, self-loops allowed.
// Returns Int32Array: community label per node. gamma is the resolution
// (lower => chunkier communities, higher => finer).
export function louvain(graph, gamma) {
  const n = graph.length;
  const orig2cur = new Int32Array(n);
  for (let i = 0; i < n; i++) orig2cur[i] = i;
  let g = graph;
  while (true) {
    const {comm, k} = louvainPass(g, gamma);
    for (let i = 0; i < n; i++) orig2cur[i] = comm[orig2cur[i]];
    if (k === g.length) break; // no merges -> converged
    g = louvainAggregate(g, comm, k);
    if (g.length === 1) break;
  }
  return orig2cur;
}

function louvainPass(g, gamma) {
  const n = g.length;
  const deg = new Float64Array(n);
  let twoM = 0;
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (const [j, w] of g[i]) d += j === i ? 2 * w : w; // self-loop counts twice
    deg[i] = d;
    twoM += d;
  }
  const comm = new Int32Array(n);
  const commTot = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    comm[i] = i;
    commTot[i] = deg[i];
  }

  let moved = true,
    passes = 0;
  while (moved && passes++ < 50) {
    moved = false;
    for (let i = 0; i < n; i++) {
      const ci = comm[i];
      const links = new Map(); // neighbor community -> total weight from i
      for (const [j, w] of g[i]) {
        if (j === i) continue;
        const cj = comm[j];
        links.set(cj, (links.get(cj) || 0) + w);
      }
      commTot[ci] -= deg[i]; // pull i out of its community
      const pen = (gamma * deg[i]) / twoM;
      let bestC = ci,
        bestGain = (links.get(ci) || 0) - pen * commTot[ci];
      for (const [C, kin] of links) {
        const gain = kin - pen * commTot[C];
        if (gain > bestGain) {
          bestGain = gain;
          bestC = C;
        }
      }
      commTot[bestC] += deg[i];
      if (bestC !== ci) {
        comm[i] = bestC;
        moved = true;
      }
    }
  }
  const remap = new Map();
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (!remap.has(comm[i])) remap.set(comm[i], k++);
    comm[i] = remap.get(comm[i]);
  }
  return {comm, k};
}

function louvainAggregate(g, comm, k) {
  const ng = Array.from({length: k}, () => new Map());
  const selfSum = new Float64Array(k);
  for (let i = 0; i < g.length; i++) {
    const ci = comm[i];
    for (const [j, w] of g[i]) {
      if (j === i) selfSum[ci] += w;
      const cj = comm[j];
      ng[ci].set(cj, (ng[ci].get(cj) || 0) + w);
    }
  }
  for (let c = 0; c < k; c++)
    if (ng[c].has(c)) ng[c].set(c, (ng[c].get(c) + selfSum[c]) / 2);
  return ng;
}
