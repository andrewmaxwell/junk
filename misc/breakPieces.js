const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1}
];
const allDirs = dirs.concat([
  {x: 1, y: 1},
  {x: -1, y: 1},
  {x: -1, y: -1},
  {x: 1, y: -1}
]);

const shapeToGrid = shape => shape.split('\n').map(r => r.split(''));

const getCoordsOfPieces = grid => {
  const result = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== ' ') continue;
      const q = [{x, y}];
      let outside = false;
      grid[y][x] = '.';
      for (let i = 0; i < q.length; i++) {
        for (let j = 0; j < dirs.length; j++) {
          const x = q[i].x + dirs[j].x;
          const y = q[i].y + dirs[j].y;
          if (grid[y] && grid[y][x] === ' ') {
            grid[y][x] = '.';
            q.push({x, y});
            if (!x || !y || y === grid.length - 1 || x === grid[y].length - 1)
              outside = true;
          }
        }
      }
      if (!outside) result.push(q);
    }
  }
  return result;
};

const coordsToGrid = coords => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    minX = Math.min(minX, coords[i].x);
    maxX = Math.max(maxX, coords[i].x);
    minY = Math.min(minY, coords[i].y);
    maxY = Math.max(maxY, coords[i].y);
  }
  const grid = Array(maxY - minY + 3)
    .fill()
    .map(() => Array(maxX - minX + 3).fill('.'));
  for (let i = 0; i < coords.length; i++) {
    const y = coords[i].y - minY + 1;
    const x = coords[i].x - minX + 1;
    grid[y][x] = ' ';
  }
  return grid;
};

const blankEmptySpace = grid =>
  grid.map((row, y) =>
    row.map((v, x) =>
      v === '.' &&
      allDirs.some(d => {
        const nx = x + d.x;
        const ny = y + d.y;
        return grid[ny] && grid[ny][nx] === ' ';
      })
        ? '.'
        : ' '
    )
  );

const drawEdges = grid =>
  grid.map((row, y) =>
    row.map((v, x) => {
      if (v !== '.') return v;
      const [rt, dn, lt, up] = dirs.map(
        d => grid[y + d.y] && grid[y + d.y][x + d.x] === '.'
      );
      return rt && lt && !up && !dn ? '-' : up && dn && !rt & !lt ? '|' : '+';
    })
  );

const gridToString = grid =>
  grid.map(r => r.join('').replace(/\s+$/, '')).join('\n');

const pipe = (...funcs) => arg => funcs.reduce((r, f) => f(r), arg);

const drawPiece = pipe(coordsToGrid, blankEmptySpace, drawEdges, gridToString);

const breakPieces = pipe(shapeToGrid, getCoordsOfPieces, pieceCoords =>
  pieceCoords.map(drawPiece)
);

var shape = `
        +-+             
        | |             
      +-+-+-+           
      |     |           
  +--+-----+--+        
  |           |        
+--+-----------+--+     
|                 |     
+-----------------+`;

breakPieces(shape).forEach(v => console.log(v));
