const firstEmptyCoord = grid => {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === '.' || grid[y][x] === 'o') return {x, y};
    }
  }
};

const isValid = (x, y, w, h, grid) => {
  let numRaisins = 0;
  for (let i = y; i < y + h; i++) {
    if (!grid[i]) return false;
    for (let j = x; j < x + w; j++) {
      const v = grid[i][j];
      if (v === 'o') numRaisins++;
      else if (v !== '.') return false;
    }
  }
  return numRaisins === 1;
};

const getPossibilities = ({grid, pieces}, dims) => {
  const {x, y} = firstEmptyCoord(grid);
  return dims
    .filter(d => isValid(x, y, d.w, d.h, grid))
    .map(d => {
      const newGrid = grid.map(r => r.slice());
      for (let i = y; i < y + d.h; i++) {
        for (let j = x; j < x + d.w; j++) {
          newGrid[i][j] = '#';
        }
      }
      return {grid: newGrid, pieces: pieces.concat({x, y, w: d.w, h: d.h})};
    });
};

const cut = cake => {
  const grid = cake.split('\n').map(r => r.split(''));
  const width = grid[0].length;
  const height = grid.length;
  const numRaisins = cake.match(/o/g).length;
  const pieceSize = (width * height) / numRaisins;
  if (pieceSize % 1) return [];
  const dims = [];
  for (let i = pieceSize; i > 0; i--) {
    if (pieceSize % i === 0 && i <= width && pieceSize / i <= height) {
      dims.push({w: i, h: pieceSize / i});
    }
  }
  const q = [{grid, pieces: []}];
  for (const p of q) {
    for (const next of getPossibilities(p, dims)) {
      if (next.pieces.length === numRaisins)
        return next.pieces.map(({x, y, w, h}) =>
          grid
            .slice(y, y + h)
            .map(r => r.slice(x, x + w).join(''))
            .join('\n')
        );
      q.push(next);
    }
  }
  return [];
};

const cake = `
.........
......o..
o........
.........
.........
.o.......`.trim();

// console.log(
//   cut(cake)
//     .map(s => s.join('\n\n'))
//     .join('\n-----\n')
// );
console.log(cut(cake).join('\n\n'));
