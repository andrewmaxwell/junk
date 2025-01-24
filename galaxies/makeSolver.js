// const getEmptyNeighbors = (grid, i) => {
//   const result = [];
//   grid.forEach((row, y) => {
//     row.forEach((val, x) => {
//       if (
//         val === -1 &&
//         (grid[y - 1]?.[x] === i ||
//           grid[y][x + 1] === i ||
//           grid[y][x - 1] === i ||
//           grid[y + 1]?.[x] === i)
//       )
//         result.push({x, y});
//     });
//   });
//   console.log('>>>', i, result);
//   return result;
// };

// const grow = (centers, grid) => {
//   centers.forEach((c, i) => {
//     const neighbors = getEmptyNeighbors(grid, i);

//     for (const n of neighbors) {
//       if (grid[n.y][n.x] !== -1) continue;

//       const ox = 2 * c.x - n.x;
//       const oy = 2 * c.y - n.y;
//       if (grid[oy]?.[ox] !== -1) continue;

//       grid[n.y][n.x] = grid[oy][ox] = i;
//       // add neighbors of grid[n.y][n.x] and grid[oy][ox]
//     }
//   });
// };

const getInitialGrid = ({width, height, centers}) => {
  const grid = Array.from({length: height}, () => Array(width).fill(-1));
  centers.forEach(({x, y}, i) => {
    if (x % 1 && y % 1) {
      grid[y - 0.5][x - 0.5] =
        grid[y - 0.5][x + 0.5] =
        grid[y + 0.5][x - 0.5] =
        grid[y + 0.5][x + 0.5] =
          i;
    } else if (x % 1) {
      grid[y][x - 0.5] = grid[y][x + 0.5] = i;
    } else if (y % 1) {
      grid[y - 0.5][x] = grid[y + 0.5][x] = i;
    } else {
      grid[y][x] = i;
    }
  });

  return grid;
};

export const makeSolver = ({width, height, centers}) => {
  const grid = getInitialGrid({width, height, centers});

  const solve = (row = 0, col = 0) => {
    if (row === grid.length) return grid;

    // skip spots that are already filled in
    if (grid[row][col] !== -1) {
      return solve(row + (col === width - 1), (col + 1) % width);
    }

    // try each number in the empty spot
    for (let i = 0; i < centers.length; i++) {
      // if no neighbors are the same color, skip it
      // if (
      //   grid[row - 1]?.[col] !== i &&
      //   grid[row + 1]?.[col] !== i &&
      //   grid[row][col - 1] !== i &&
      //   grid[row][col + 1] !== i
      // )
      //   continue;

      const ox = centers[i].x * 2 - col;
      const oy = centers[i].y * 2 - row;

      // if the opposite spot is not empty, skip it
      if (grid[oy]?.[ox] !== -1) continue;

      grid[row][col] = grid[oy][ox] = i;

      const solution = solve(row + (col === width - 1), (col + 1) % width);
      if (solution) return solution;

      grid[row][col] = grid[oy][ox] = -1;
    }
  };

  solve();

  return {grid};
};
