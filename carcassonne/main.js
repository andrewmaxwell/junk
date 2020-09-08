import {drawBoard} from './render.js';
import {
  pipe,
  when,
  last,
  repeat,
  assocPath,
  shuffle,
  minBy,
  rotate,
} from './utils.js';

const dirs = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// takes a board and makes sure there are blank rows and columns at the edges
const normalize = pipe(
  when(
    (b) => b[0].some((i) => i),
    (b) => [repeat(b[0].length), ...b]
  ),
  when(
    (b) => last(b).some((i) => i),
    (b) => [...b, repeat(b[0].length)]
  ),
  when(
    (b) => b.some((r) => r[0]),
    (b) => b.map((r) => [undefined, ...r])
  ),
  when(
    (b) => b.some(last),
    (b) => b.map((r) => [...r, undefined])
  )
);

// takes coords, a number of times to rotate and the state and returns a new state with the first piece put in the right place and removed from the remaining pieces
const placePiece = (path, rotation) => ({board, pieces}) => ({
  board: pipe(assocPath(path, rotate(rotation, pieces[0])), normalize)(board),
  pieces: pieces.slice(1),
});

// returns the average x and y coords of placed pieces
const getCenter = (board) => {
  let totals = [0, 0];
  let num = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (!board[r][c]) continue;
      totals[0] += r;
      totals[1] += c;
      num++;
    }
  }
  return totals.map((t) => t / num);
};

// given a piece and a board, returns the row, column, and number of times to rotate to place it on the board
const findPlacement = (piece, board) => {
  const possibilities = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (
        (board[r] || {})[c] ||
        !dirs.some(([x, y]) => (board[r + y] || {})[c + x])
      )
        continue;

      for (let t = 0; t < 4; t++) {
        if (
          dirs.every(([x, y], i) => {
            const n = (board[r + y] || {})[c + x];
            return !n || piece[(i - t + 4) % 4] === n[(i + 2) % 4];
          })
        )
          possibilities.push([r, c, t]);
      }
    }
  }
  const [avgR, avgC] = getCenter(board);
  return minBy(([r, c]) => (avgR - r) ** 2 + (avgC - c) ** 2, possibilities);
};

// given the state, returns a new state with the next piece placed and removed from remaining pieces
const findAndPlace = (state) => {
  const piece = state.pieces[0];
  const [r, c, t] = findPlacement(piece, state.board);
  return placePiece([r, c], t)(state);
};

// execution
let state;

const reset = () => {
  state = {
    board: [[]],
    pieces: [
      'crgr',
      ...shuffle(
        [
          ['gggg', 4],
          ['ggrg', 10],
          ['cccc', 1],
          ['ccgc', 4],
          ['ccrc', 3],
          ['cggc', 7],
          ['crrc', 5],
          ['gcgc', 6],
          ['cggg', 5],
          ['cgrr', 3],
          ['crrg', 3],
          ['crrr', 3],
          ['crgr', 3],
          ['rgrg', 8],
          ['ggrr', 9],
          ['grrr', 4],
          ['rrrr', 1],
        ].flatMap(([s, n]) => repeat(n * 20, s))
      ),
    ],
  };

  // place initial piece
  state = placePiece([0, 0], 0)(state);
};

const loop = () => {
  if (state.pieces.length) {
    state = findAndPlace(state);
    drawBoard(state.board);
  }
  setTimeout(loop, 200);
};

reset();
loop();
