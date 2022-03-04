const maxTurns = 2;

const parseMap = (str) => {
  const rows = str
    .trim()
    .split('\n')
    .map((r) => [' ', ...r.split(' '), ' ']);
  const blankRow = rows[0].map(() => ' ');
  return [blankRow, ...rows, blankRow];
};
const addMoves = (grid, x, y, dx, dy, letter, moves, turns) => {
  if (grid[y] && grid[y][x] === letter) moves[y + ',' + x] = [y, x];
  else if (grid[y] && grid[y][x] === ' ') {
    addMoves(grid, x + dx, y + dy, dx, dy, letter, moves, turns);
    if (turns) {
      addMoves(grid, x - dy, y + dx, -dy, dx, letter, moves, turns - 1);
      addMoves(grid, x + dy, y - dx, dy, -dx, letter, moves, turns - 1);
    }
  }
  return moves;
};

const getMoves = (grid, i, j) => {
  const moves = {};
  addMoves(grid, j + 1, i, 1, 0, grid[i][j], moves, maxTurns);
  addMoves(grid, j, i + 1, 0, 1, grid[i][j], moves, maxTurns);
  addMoves(grid, j - 1, i, -1, 0, grid[i][j], moves, maxTurns);
  addMoves(grid, j, i - 1, 0, -1, grid[i][j], moves, maxTurns);
  return Object.values(moves);
};

const resolveMove = (grid, i, j, y, x) => {
  const copy = [...grid];
  copy[i] = [...copy[i]];
  copy[i][j] = ' ';
  copy[y] = [...copy[y]];
  copy[y][x] = ' ';
  return copy;
};

const findSolution = (grid) => {
  console.log(gridToString(grid), '\n-----------------------');
  if (grid.every((r) => r.every((c) => c === ' '))) return [];
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      if (grid[i][j] === ' ') continue;
      for (const [y, x] of getMoves(grid, i, j)) {
        const s = findSolution(resolveMove(grid, i, j, y, x));
        if (s)
          return [
            [
              [i - 1, j - 1],
              [y - 1, x - 1],
            ],
            ...s,
          ];
      }
    }
  }
};

const linkUp = (str) =>
  console.log(JSON.stringify(str)) || findSolution(parseMap(str));

// https://www.codewars.com/kata/57738d9110a0a6f1d50000a7/train/javascript

const gridToString = (grid) => grid.map((r) => r.join(' ')).join('\n');

const checkSol = (map) => {
  console.time();
  const answer = linkUp(map);
  console.timeEnd();

  const grid = parseMap(map);
  if (!Array.isArray(answer)) throw new Error('Not an array.');
  for (const move of answer) {
    let [[y0, x0], [y1, x1]] = move;
    y0++;
    x0++;
    y1++;
    x1++;
    if (grid[y0][x0] !== grid[y1][x1]) {
      console.log(gridToString(grid));
      throw new Error(`Not matching letters: ${JSON.stringify(move)}`);
    }
    grid[y0][x0] = grid[y1][x1] = ' ';
  }
  if (grid.flat().some((x) => x !== ' ')) {
    console.log(gridToString(grid));
    throw new Error('Grid not empty');
  }
  console.log('PASSED');
};

checkSol(`
J L N O K F L G
M D E A K B I K
I O J L L M B P
P C G J F D O E
I N F O N M D H
I N D K J E C G
A M H B E P C H
C F A A B H P G`);

checkSol(`
F H L F H L C K
I L B K K I A N
O I K F O P H P
C G F M M I A N
N A E J B J D G
M O C B G E L P
H C E G D D P B
O J M A J E N D`);

// checkSol(
//   'E D C L H H O L\nG B G F M P B A\nN A J C D L I E\nN D G K P C A K\nF F M E O N I H\nP I G J K M N B\nJ B I K E J D O\nL P F C M H O A'
// );

// checkSol(
//   'O K B E M E H M\nA P H N F G B J\nN O H F K D K P\nN B O P G L I I\nL G A A J M D I\nE F O B P C K I\nC F C L D G D M\nE J A L H C N J'
// );
