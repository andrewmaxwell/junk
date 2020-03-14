const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1}
];
const diags = [
  {x: 1, y: 1},
  {x: -1, y: 1},
  {x: -1, y: -1},
  {x: 1, y: -1}
];

const normalize = coords => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const {x, y} of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    coords: coords.map(c => ({x: c.x - minX, y: c.y - minY})),
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
};

const getPieceCoords = pieceStr => {
  const coords = [];
  const visited = {};
  pieceStr.split('\n').forEach((row, y, rows) => {
    row.split('').forEach((c, x) => {
      if (c !== '@' || visited[[x, y]]) return;
      visited[[x, y]] = true;
      const q = [{x, y}];
      for (let i = 0; i < q.length; i++) {
        const {x, y} = q[i];
        for (const d of dirs) {
          const n = {x: x + d.x, y: y + d.y};
          if (rows[n.y] && rows[n.y][n.x] === '@' && !visited[[n.x, n.y]]) {
            visited[[n.x, n.y]] = true;
            q.push(n);
          }
        }
      }
      coords.push(q);
    });
  });
  return coords;
};

Array.prototype.uniqBy = function(keyFunc) {
  const seen = {};
  return this.filter(el => {
    const key = keyFunc(el);
    return !(key in seen) && (seen[key] = true);
  });
};

const coordToStr = c => `${c.x},${c.y}`;

const without = (a, b, func) => {
  const set = new Set(b.map(func));
  return a.filter(x => !set.has(func(x)));
};

export const getPieceGroups = pieceStr =>
  getPieceCoords(pieceStr).map((coords, id) =>
    [
      c => c,
      c => ({x: -c.y, y: c.x}),
      c => ({x: -c.x, y: -c.y}),
      c => ({x: c.y, y: -c.x}),
      c => ({x: -c.x, y: c.y}),
      c => ({x: c.y, y: c.x}),
      c => ({x: c.x, y: -c.y}),
      c => ({x: -c.y, y: -c.x})
    ]
      .map(f => ({...normalize(coords.map(f)), id}))
      .uniqBy(c =>
        c.coords
          .map(coordToStr)
          .sort()
          .join('|')
      )
      .map(piece => {
        const [diagonals, orthogonals] = [diags, dirs].map(dirs =>
          piece.coords
            .flatMap(c => dirs.map(d => ({x: c.x + d.x, y: c.y + d.y})))
            .concat(piece.coords)
            .uniqBy(coordToStr)
        );
        return {
          ...piece,
          orthogonals: without(orthogonals, piece.coords, coordToStr),
          diagonals: without(
            diagonals,
            piece.coords.concat(orthogonals),
            coordToStr
          )
        };
      })
  );
