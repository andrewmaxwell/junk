// ========= Basic Cube Graph =========
const idToV = (i) => [Math.floor(i / 4), Math.floor((i % 4) / 2), i % 2];
const vToId = (x, y, z) => x * 4 + y * 2 + z;

export const VPOS = Array.from({length: 8}, (_, id) => {
  const [x, y, z] = idToV(id);
  const s = 0.5;
  return [x ? s : -s, y ? s : -s, z ? s : -s];
});

export const EDGES = (() => {
  const e = [];
  for (let i = 0; i < 8; i++) {
    const [xi, yi, zi] = idToV(i);
    for (let j = i + 1; j < 8; j++) {
      const [xj, yj, zj] = idToV(j);
      if (Math.abs(xi - xj) + Math.abs(yi - yj) + Math.abs(zi - zj) === 1)
        e.push([i, j]);
    }
  }
  if (e.length !== 12) throw new Error('Cube should have 12 edges');
  return e;
})();
const EDGE_INDEX = new Map(
  EDGES.map((e, i) => [e[0] < e[1] ? e.join(',') : [e[1], e[0]].join(','), i]),
);

// ========= Symmetries (48 automorphisms) =========
function generateAutomorphisms() {
  const perms = [];
  const arr = [0, 1, 2];
  const out = [];
  const permute = (a, l = 0) => {
    if (l === a.length) {
      out.push([...a]);
      return;
    }
    for (let i = l; i < a.length; i++) {
      [a[l], a[i]] = [a[i], a[l]];
      permute(a, l + 1);
      [a[l], a[i]] = [a[i], a[l]];
    }
  };
  permute(arr);
  for (const p of out) {
    for (let f0 = 0; f0 < 2; f0++)
      for (let f1 = 0; f1 < 2; f1++)
        for (let f2 = 0; f2 < 2; f2++) {
          const perm = new Array(8).fill(0);
          for (let vid = 0; vid < 8; vid++) {
            const v = idToV(vid);
            const vv = [v[p[0]], v[p[1]], v[p[2]]];
            const x = vv[0] ^ f0,
              y = vv[1] ^ f1,
              z = vv[2] ^ f2;
            perm[vid] = vToId(x, y, z);
          }
          perms.push(perm);
        }
  }
  // Deduplicate
  return Array.from(new Map(perms.map((p) => [p.join(','), p])).values());
}
const AUTOMORPHISMS = generateAutomorphisms();
const mapEdge = (e, perm) => {
  const u = perm[e[0]],
    v = perm[e[1]];
  return u < v ? [u, v] : [v, u];
};

// ========= Connectivity & Canonicalization =========
function isConnected(edgeIdx) {
  if (edgeIdx.length === 0) return false;
  const adj = new Map();
  const nodes = new Set();
  for (const ei of edgeIdx) {
    const [a, b] = EDGES[ei];
    nodes.add(a);
    nodes.add(b);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const arr = [...nodes];
  if (arr.length === 0) return false;
  const start = arr[0];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    for (const v of adj.get(u) || []) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen.size === arr.length;
}

function canonicalKey(edgeIdx) {
  let best = null;
  for (const perm of AUTOMORPHISMS) {
    const mapped = edgeIdx
      .map((ei) => {
        const me = mapEdge(EDGES[ei], perm);
        const key = me[0] < me[1] ? me.join(',') : [me[1], me[0]].join(',');
        return EDGE_INDEX.get(key);
      })
      .sort((a, b) => a - b);
    const k = mapped.join('-');
    if (best === null || k < best) best = k;
  }
  return best;
}

// ========= Build Classes (82 total) =========
export function buildClasses() {
  const connected = [];
  for (let mask = 1; mask < 1 << 12; mask++) {
    const es = [];
    for (let i = 0; i < 12; i++) if ((mask >> i) & 1) es.push(i);
    if (isConnected(es)) connected.push(es);
  }
  const repByKey = new Map();
  const membersByKey = new Map();
  for (const es of connected) {
    const key = canonicalKey(es);
    if (!repByKey.has(key)) repByKey.set(key, es);
    if (!membersByKey.has(key)) membersByKey.set(key, []);
    membersByKey.get(key).push(es);
  }
  const byK = new Map();
  for (const [key, rep] of repByKey.entries()) {
    const k = rep.length;
    const orbit = membersByKey.get(key).length;
    if (!byK.has(k)) byK.set(k, []);
    byK.get(k).push({key, rep, orbit});
  }
  for (const v of byK.values())
    v.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const ks = Array.from(byK.keys()).sort((a, b) => a - b);
  return {byK, ks};
}
