const search = ({startState, isDone, getNextStates, toHash}) => {
  const q = [startState];
  const hashToPrevState = {[toHash(startState)]: null};
  for (let current of q) {
    if (isDone(current)) {
      const result = [];
      while (current !== startState) {
        result.push(current);
        current = hashToPrevState[toHash(current)];
      }
      return result.reverse();
    }
    for (const next of getNextStates(current)) {
      if (toHash(next) in hashToPrevState) continue;
      hashToPrevState[toHash(next)] = current;
      q.push(next);
    }
  }
  return 'No solution!';
};

// SETTING SUN
// https://smallpond.ca/jim/misc/settingSun/

const DIRS = [
  [1, 0, 'right'],
  [0, 1, 'down'],
  [-1, 0, 'left'],
  [0, -1, 'up'],
];
const ROWS = 5;
const COLS = 4;
const COLORS = {2: 'Y', 3: 'B', 4: 'R'}; // just to help understand the output better

// takes a state and returns a grid representing the grid. This makes it much easier to calculate if pieces can be moved
const toGrid = (state) => {
  const grid = [];
  for (let i = 0; i < ROWS; i++) {
    grid[i] = [];
    for (let j = 0; j < COLS; j++) grid[i][j] = false;
  }
  for (const [x, y, w, h] of state)
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++) grid[j][i] = COLORS[w + h];
  return grid;
};

// takes a piece, a direction, and a grid and returns true if the piece can move in the given direction
const canMove = ([x, y, w, h], [dx, dy], grid) => {
  if (dx) {
    const c = x + dx + (dx > 0 ? w - 1 : 0);
    return c >= 0 && c < COLS && grid.slice(y, y + h).every((r) => !r[c]);
  } else if (dy) {
    const r = y + dy + (dy > 0 ? h - 1 : 0);
    return (
      r >= 0 && r < ROWS && grid[r].every((v, i) => !v || i < x || i >= x + w)
    );
  }
};

const result = search({
  startState: [
    [0, 0, 1, 2],
    [1, 0, 2, 2],
    [3, 0, 1, 2],
    [1, 2, 2, 1],
    [0, 3, 1, 2],
    [1, 3, 1, 1],
    [2, 3, 1, 1],
    [3, 3, 1, 2],
    [1, 4, 1, 1],
    [2, 4, 1, 1],
  ],
  isDone: (state) => state.some((s) => s.join('') === '1322'),
  getNextStates: (state) => {
    const grid = toGrid(state);
    const result = [];
    for (const piece of state) {
      for (const [dx, dy, desc] of DIRS) {
        if (!canMove(piece, [dx, dy], grid)) continue;
        const moved = [piece[0] + dx, piece[1] + dy, piece[2], piece[3]];
        const next = state.map((p) => (p === piece ? moved : p));
        next.description = `Move ${piece.join('')} ${desc}`;
        result.push(next);
      }
    }
    return result;
  },
  toHash: (state) =>
    state
      .map((p) => p.join(''))
      .sort()
      .join(''),
});

// output the result
for (let i = 0; i < result.length; i++) {
  const r = result[i];
  console.log(`${i + 1}. ${r.description}`);
  console.log(
    toGrid(r)
      .map((r) => r.map((c) => c || '.').join(''))
      .join('\n')
  );
}
