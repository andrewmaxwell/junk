import {PriorityQueue} from '../misc/PriorityQueue.js';

export const getShortestPath = (from, to, nodes) => {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const q = new PriorityQueue((a, b) => dist.get(a) < dist.get(b));
  for (const n of nodes) {
    dist.set(n, n === from ? 0 : Infinity);
    q.push(n);
  }

  while (q.size()) {
    const u = q.pop();
    visited.add(u);

    if (u === to) {
      const path = [];
      let curr = to;
      while (curr) {
        path.push(curr);
        curr = prev.get(curr);
      }
      return path.reverse();
    }

    for (const v of u.neighbors) {
      if (visited.has(v)) continue;
      const alt = dist.get(u) + Math.hypot(v.x - u.x, v.y - u.y);
      if (alt < dist.get(v)) {
        dist.set(v, alt);
        prev.set(v, u);
        q.updatePosition(v);
      }
    }
  }
};
