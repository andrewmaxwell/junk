/* eslint-disable no-use-before-define */
export const initialState = {
  board: [
    ' b b b b',
    'b b b b ',
    ' b b b b',
    '        ',
    '        ',
    'r r r r ',
    ' r r r r',
    'r r r r ',
  ].map((r) => r.split('')),
  turn: 'b',
};

const setKings = (board) => {
  for (let i = 0; i < 8; i++) {
    if (board[0][i] === 'r') board[0][i] = 'R';
    if (board[7][i] === 'b') board[7][i] = 'B';
  }
  return board;
};

const getJump = (board, row, col, dr, dc, opponentColor) => {
  if (
    board[row + 2 * dr][col + 2 * dc] === ' ' &&
    board[row + dr][col + dc]?.toLowerCase() === opponentColor
  ) {
    const t = board.map((r) => r.slice());
    t[row + dr * 2][col + dc * 2] = t[row][col];
    t[row][col] = t[row + dr][col + dc] = ' ';
    const multi = getJumpsForPiece(t, row + dr * 2, col + dc * 2);
    return (multi.length ? multi : [t]).map(setKings);
  }
};

const getJumpsForPiece = (board, row, col) => {
  const p = board[row][col];
  const isKing = p === p.toUpperCase();
  const opponentColor = p.toLowerCase() === 'r' ? 'b' : 'r';
  const canMoveUp = row > 1 && (isKing || p === 'r');
  const canMoveDown = row < 6 && (isKing || p === 'b');

  return [
    canMoveUp && getJump(board, row, col, -1, -1, opponentColor),
    canMoveUp && getJump(board, row, col, -1, 1, opponentColor),
    canMoveDown && getJump(board, row, col, 1, -1, opponentColor),
    canMoveDown && getJump(board, row, col, 1, 1, opponentColor),
  ]
    .flat()
    .filter((j) => j);
};

const getMove = (board, row, col, dr, dc) => {
  if (board[row + dr][col + dc] === ' ') {
    const t = board.map((r) => r.slice());
    t[row + dr][col + dc] = t[row][col];
    t[row][col] = ' ';
    return setKings(t);
  }
};

const getMovesForPiece = (board, row, col) => {
  const p = board[row][col];
  const isKing = p === p.toUpperCase();
  const canMoveUp = row > 0 && (isKing || p === 'r');
  const canMoveDown = row < 7 && (isKing || p === 'b');
  return [
    canMoveUp && getMove(board, row, col, -1, -1),
    canMoveUp && getMove(board, row, col, -1, 1),
    canMoveDown && getMove(board, row, col, 1, -1),
    canMoveDown && getMove(board, row, col, 1, 1),
  ].filter((m) => m);
};

export const getNextStates = ({board, turn}) => {
  const moves = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c].toLowerCase() !== turn) continue;
      moves.push(...getJumpsForPiece(board, r, c));
    }
  }

  if (!moves.length) {
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        if (board[r][c].toLowerCase() !== turn) continue;
        moves.push(...getMovesForPiece(board, r, c));
      }
    }
  }

  const nextTurn = turn === 'b' ? 'r' : 'b';
  return moves
    .map((board) => ({
      board,
      turn: nextTurn,
      score: heuristic({board}),
    }))
    .sort((a, b) => b.score - a.score);
};

const KING_VALUE = 10;
const valueMap = {r: 1, R: KING_VALUE, b: -1, B: -KING_VALUE, ' ': 0};

export const heuristic = ({board}) => {
  let total = 0;
  for (const row of board) {
    for (const p of row) total += valueMap[p];
  }
  return total;
};

export const printBoard = ({board}) => {
  const rows = board.map((r, i) =>
    r.map((v, j) => (v === ' ' && (i + j) % 2 ? '.' : v)).join('')
  );
  console.log(rows.join('\n') + '\n--------');
};
