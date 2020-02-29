const knightMoves = [
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
  [1, -2],
  [2, -1]
];

const move = (pos, m) => {
  const x = String.fromCharCode(pos.charCodeAt(0) + m[0]);
  const y = Number(pos[1]) + m[1];
  return x >= 'a' && x <= 'h' && y >= 1 && y <= 8 && x + y;
};

function knight(start, finish) {
  const q = [start];
  const dist = {[start]: 0};
  for (const curr of q) {
    if (curr === finish) return dist[curr];
    for (const m of knightMoves) {
      const n = move(curr, m);
      if (n && !(n in dist)) {
        dist[n] = dist[curr] + 1;
        q.push(n);
      }
    }
  }
}
