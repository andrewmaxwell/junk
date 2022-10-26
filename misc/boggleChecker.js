const dirs = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const found = (board, [t, ...r], x, y) => {
  if (!t) return true;

  const b = board.map((r) => [...r]);
  b[y][x] = '';

  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (b[ny] && b[ny][nx] === t && found(b, r, nx, ny)) return true;
  }
  return false;
};

const checkWord = (board, [t, ...r]) => {
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[y].length; x++) {
      if (board[y][x] === t && found(board, r, x, y)) return true;
    }
  }
  return false;
};

import {Test} from './test.js';
var testBoard = [
  ['E', 'A', 'R', 'A'],
  ['N', 'L', 'E', 'C'],
  ['I', 'A', 'I', 'S'],
  ['B', 'Y', 'O', 'R'],
];

Test.expect(checkWord(testBoard, 'C') == true);
Test.expect(checkWord(testBoard, 'EAR') == true);
Test.expect(checkWord(testBoard, 'EARS') == false);
Test.expect(checkWord(testBoard, 'BAILER') == true);
Test.expect(
  checkWord(testBoard, 'RSCAREIOYBAILNEA') == true,
  'Must be able to check indefinite word lengths going in all directions'
);
Test.expect(
  checkWord(testBoard, 'CEREAL') == false,
  "Valid guesses can't overlap themselves"
);
Test.expect(
  checkWord(testBoard, 'ROBES') == false,
  'Valid guesses have to be adjacent'
);
Test.expect(
  checkWord(testBoard, 'BAKER') == false,
  'All the letters have to be in the board'
);
Test.expect(
  checkWord(testBoard, 'CARS') == false,
  'Valid guesses cannot wrap around the edges of the board'
);
