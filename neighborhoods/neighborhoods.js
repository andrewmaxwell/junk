// Neighborhood detection from a preprocessed OSM street network, with three
// algorithms you can cycle through to compare (click the label or press "A"):
//
//   1. CONNECTED COMPONENTS — Andrew's intuition. Major roads are hard barriers;
//      two minor streets share a neighborhood if you can drive between them
//      without touching or crossing a major road. ("Major" = major highway class
//      AND faster than 25 mph; a <=25 mph street is never a barrier.)
//
//   2. CROSS-ARTERIAL COMMUNITIES — a deliberately different lens. Major roads are
//      NOT barriers; they're ordinary edges in the full street graph, and Louvain
//      modularity finds communities over the whole thing. A community can span an
//      arterial, so the result is density-based districts that ignore the barriers.
//
//   3. SLOW STREETS (<=25 mph) — areas you can stay inside without ever exceeding
//      25 mph. Streets <=25 mph are the fabric; faster roads are barriers, BUT you
//      may cross one where a slow street runs straight through it (leaving bearings
//      ~180 deg apart) with no traffic signal. So arterials still separate areas,
//      except at quiet straight-through crossings that stitch both sides together.
//
// Input is the compact map produced by download.py:
//   { span:[W,H], points:[x0,y0,...],
//     streets:[[flags,i0,i1,...]],  // flags bit0=major, bit1=slow(<=25mph)
//     signals:[pi,...] }            // point indices with a traffic signal
// Coordinates are pre-projected integer meters. A street's endpoint indices are
// its intersection ("node") ids: streets sharing an endpoint index meet there.

import {PALETTE, ADJ_DIST, RESOLUTION} from './config.js';
import {bboxOf, PointGrid} from './geometry.js';
import {louvain} from './louvain.js';

// Mode 3: two slow streets crossing a fast road count as "straight across" if
// their leaving bearings are within this many degrees of 180 (collinear).
const STRAIGHT_TOL = (35 * Math.PI) / 180;

// SIMILAR[k] = palette indices that look too much like color k to read as
// distinct (redmean distance below the threshold). Coloring avoids giving a
// neighborhood any color in this set for one of its neighbors, so e.g. teal and
// green never end up side by side. Precomputed once from PALETTE.
const SIMILAR_THRESH = 132;
const SIMILAR = PALETTE.map((a, i) => {
  const set = new Set();
  PALETTE.forEach((b, j) => {
    if (i === j) return;
    const rbar = (a[0] + b[0]) / 2;
    const dr = a[0] - b[0],
      dg = a[1] - b[1],
      db = a[2] - b[2];
    const d = Math.sqrt(
      (2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db,
    );
    if (d < SIMILAR_THRESH) set.add(j);
  });
  return set;
});

export function analyze(map) {
  const P = map.points;
  const pt = (i) => [P[2 * i], P[2 * i + 1]];

  // Expand every street once: geometry, the major/slow flags, and endpoint nodes.
  // A street counts as "major" (a barrier / gray skeleton) only if its highway
  // class is major AND it's faster than 25 mph. A <=25 mph street is never a
  // major road in any mode -- it's always neighborhood fabric and gets colored.
  const edges = []; // { major, slow, u, v, pts, bbox }
  for (const s of map.streets) {
    const flags = s[0];
    const slow = (flags & 2) !== 0;
    const pts = [];
    for (let i = 1; i < s.length; i++) pts.push(pt(s[i]));
    edges.push({
      major: (flags & 1) !== 0 && !slow,
      slow,
      u: s[1],
      v: s[s.length - 1],
      pts,
      bbox: bboxOf(pts),
    });
  }
  const signals = new Set(map.signals);

  const renders = [
    connectedComponents(edges),
    crossArterial(edges, RESOLUTION),
    slowNetwork(edges, signals),
  ];

  return {edges, span: {x: map.span[0], y: map.span[1]}, renders};
}

// --- Shared helpers ---------------------------------------------------------

function makeUF(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  return {find, union};
}

// node id -> list of member edge indices that touch it (by either endpoint).
function nodeIndex(edges, members) {
  const m = new Map();
  for (const e of members) {
    for (const node of [edges[e].u, edges[e].v]) {
      let arr = m.get(node);
      if (!arr) m.set(node, (arr = []));
      arr.push(e);
    }
  }
  return m;
}

// Direction (radians) a street heads as it leaves the given endpoint node.
function bearingAt(edge, node) {
  const p = edge.pts;
  if (node === edge.u) return Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
  const n = p.length;
  return Math.atan2(p[n - 2][1] - p[n - 1][1], p[n - 2][0] - p[n - 1][0]);
}

// Two streets leaving a node ~180 deg apart run straight through each other.
function straightThrough(b1, b2) {
  let d = Math.abs(b1 - b2);
  if (d > Math.PI) d = 2 * Math.PI - d; // angle between leaving directions, 0..PI
  return d > Math.PI - STRAIGHT_TOL;
}

// --- The three algorithms ---------------------------------------------------

// Mode 1: connected components of the minor-street network. Major roads (by
// highway class) are hard barriers that block connection at the nodes they touch.
function connectedComponents(edges) {
  const members = [];
  const barrier = new Set();
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].major) {
      barrier.add(edges[i].u);
      barrier.add(edges[i].v);
    } else members.push(i);
  }
  const nIdx = nodeIndex(edges, members);
  const uf = makeUF(edges.length);
  for (const [node, es] of nIdx) {
    if (barrier.has(node)) continue; // crossing here would cross a major road
    for (let i = 1; i < es.length; i++) uf.union(es[0], es[i]);
  }
  return colorByPartition(
    'Connected components (major-road barriers)',
    edges,
    members,
    (e) => uf.find(e),
    nIdx,
  );
}

// Mode 2: Louvain communities over the FULL street graph, with major roads as
// ordinary edges (not barriers). A community can span an arterial, so districts
// ignore mode 1's barriers and look very different. Colors the minor streets.
function crossArterial(edges, gamma) {
  const members = [];
  for (let i = 0; i < edges.length; i++) if (!edges[i].major) members.push(i);

  // Primal graph: nodes = street endpoints (intersections), one edge per street.
  const idx = new Map();
  const lid = (node) => {
    let i = idx.get(node);
    if (i === undefined) idx.set(node, (i = idx.size));
    return i;
  };
  const adj = [];
  const ensure = (i) => {
    while (adj.length <= i) adj.push(new Map());
  };
  for (let e = 0; e < edges.length; e++) {
    const {u, v} = edges[e];
    if (u === v) continue; // closed loop -- no connectivity between nodes
    const a = lid(u),
      b = lid(v);
    ensure(a);
    ensure(b);
    adj[a].set(b, (adj[a].get(b) || 0) + 1);
    adj[b].set(a, (adj[b].get(a) || 0) + 1);
  }
  const comm = louvain(adj, gamma);
  const nbId = (e) => {
    const lu = idx.get(edges[e].u);
    return lu === undefined ? 'iso' + e : comm[lu]; // isolated self-loop edge
  };
  return colorByPartition(
    'Cross-arterial communities',
    edges,
    members,
    nbId,
    nodeIndex(edges, members),
  );
}

// Mode 3: slow-street (<=25 mph) network. Faster roads are barriers, except a
// node with no signal where two slow streets cross straight through stitches the
// two sides together. (At a node with no fast road at all, slow streets connect
// freely -- you can turn any way without speeding up.)
function slowNetwork(edges, signals) {
  const members = [];
  const fastNode = new Set();
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].slow) members.push(i);
    else {
      fastNode.add(edges[i].u);
      fastNode.add(edges[i].v);
    }
  }
  const nIdx = nodeIndex(edges, members);
  const uf = makeUF(edges.length);
  for (const [node, es] of nIdx) {
    if (!fastNode.has(node)) {
      for (let i = 1; i < es.length; i++) uf.union(es[0], es[i]); // free turning
    } else if (!signals.has(node)) {
      // Crossing a fast road: connect only straight-through slow pairs.
      const b = es.map((e) => bearingAt(edges[e], node));
      for (let i = 0; i < es.length; i++)
        for (let j = i + 1; j < es.length; j++)
          if (straightThrough(b[i], b[j])) uf.union(es[i], es[j]);
    }
    // else: fast road + traffic signal -> no slow-to-slow connection across it.
  }
  return colorByPartition(
    'Slow streets (≤25 mph)',
    edges,
    members,
    (e) => uf.find(e),
    nIdx,
  );
}

// --- Adjacency + coloring ---------------------------------------------------

// Build neighborhood adjacency for one partition and greedy-color it. `members`
// are the edge indices that get colored; nbId(e) is an edge's neighborhood id;
// nIdx maps node -> member edges (shared-intersection adjacency). Returns
// { name, count, colorByEdge } where colorByEdge[i] is a PALETTE index, or -1 for
// edges not in this partition (those draw as the gray skeleton).
function colorByPartition(name, edges, members, nbId, nIdx) {
  const adj = new Map();
  const link = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  // (a) neighborhoods that meet at a shared intersection.
  for (const es of nIdx.values()) {
    const ids = [...new Set(es.map(nbId))];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) link(ids[i], ids[j]);
  }
  // (b) neighborhoods whose streets pass within ADJ_DIST (e.g. across an arterial).
  const pg = new PointGrid(ADJ_DIST);
  for (const e of members) {
    const {pts} = edges[e];
    const id = nbId(e);
    for (let i = 1; i < pts.length; i++)
      pg.add(
        (pts[i - 1][0] + pts[i][0]) / 2,
        (pts[i - 1][1] + pts[i][1]) / 2,
        id,
      );
  }
  pg.eachNearPair(ADJ_DIST, link);

  // Greedy color, largest degree first. Pick the allowed color used least so far
  // (spreads all colors evenly). "Allowed" degrades in tiers so high-degree
  // neighborhoods still get colored:
  //   1. avoid every neighbor's color AND anything similar to it (the goal);
  //   2. if none left, just avoid neighbors' exact colors (the hard guarantee);
  //   3. if still none (degree >= palette size), least-used overall.
  // Adjacent neighborhoods never share a color; only "no similar color" relaxes.
  const ids = [...new Set(members.map(nbId))];
  ids.sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0));
  const colorOf = new Map();
  const usage = new Array(PALETTE.length).fill(0);
  const leastUsed = (allowed) => {
    let best = -1;
    for (let k = 0; k < PALETTE.length; k++) {
      if (!allowed(k)) continue;
      if (best === -1 || usage[k] < usage[best]) best = k;
    }
    return best;
  };
  for (const id of ids) {
    const used = new Set();
    for (const n of adj.get(id) || [])
      if (colorOf.has(n)) used.add(colorOf.get(n));
    const blocked = new Set(used);
    for (const c of used) for (const s of SIMILAR[c]) blocked.add(s);
    let best = leastUsed((k) => !blocked.has(k)); // tier 1: no same/similar
    if (best === -1) best = leastUsed((k) => !used.has(k)); // tier 2: no same
    if (best === -1) best = leastUsed(() => true); // tier 3: least-used overall
    colorOf.set(id, best);
    usage[best]++;
  }

  const colorByEdge = new Int16Array(edges.length).fill(-1);
  for (const e of members) colorByEdge[e] = colorOf.get(nbId(e));
  return {name, count: ids.length, colorByEdge};
}
