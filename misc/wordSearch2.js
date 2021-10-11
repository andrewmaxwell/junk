const existsAt = (grid, [first, ...rest], r, c, seen = {}) => {
  if (!first) return true;
  if (!grid[r] || grid[r][c] !== first || seen[r + ',' + c]) return false;
  const s = {...seen, [r + ',' + c]: true};
  return (
    existsAt(grid, rest, r - 1, c, s) ||
    existsAt(grid, rest, r, c - 1, s) ||
    existsAt(grid, rest, r + 1, c, s) ||
    existsAt(grid, rest, r, c + 1, s)
  );
};

const exist = (grid, word) => {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (existsAt(grid, word, r, c)) return true;
    }
  }
  return false;
};

const {Test} = require('./test');
Test.assertDeepEquals(
  exist(
    [
      ['A', 'B', 'C', 'E'],
      ['S', 'F', 'C', 'S'],
      ['A', 'D', 'E', 'E'],
    ],
    'ABCCED'
  ),
  true
);
Test.assertDeepEquals(
  exist(
    [
      ['A', 'B', 'C', 'E'],
      ['S', 'F', 'C', 'S'],
      ['A', 'D', 'E', 'E'],
    ],
    'SEE'
  ),
  true
);
Test.assertDeepEquals(
  exist(
    [
      ['A', 'B', 'C', 'E'],
      ['S', 'F', 'C', 'S'],
      ['A', 'D', 'E', 'E'],
    ],
    'ABCB'
  ),
  false
);
