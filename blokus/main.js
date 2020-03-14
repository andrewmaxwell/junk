import {makeRenderer, color} from '../sand/makeRenderer.js';
import {getPieceGroups} from './getPieces.js';

const boardSize = 40;

const pieceStr = `
@ @@ @@@ @@ @@@ @@@ @@ @@ @@@@ 
         @  @    @  @@  @@ 

@@@@ @@@@ @@@ @@@ @@@ @@@@@
@     @   @@  @ @   @@

@  @@ @@@ @ @   @
@   @  @ @@ @@ @@@
@@@ @@ @  @@ @@ @
`;

const pieceGroups = getPieceGroups(pieceStr);

const validCoords = (x, y) =>
  x >= 0 && y >= 0 && x < boardSize && y < boardSize;

const validPlacement = ({coords, orthogonals, diagonals}, x, y, board) => {
  const rotated = coords.map(
    c => `${boardSize - x - c.x - 1},${boardSize - y - c.y - 1}`
  );
  return (
    coords.every(c => {
      const nx = x + c.x;
      const ny = y + c.y;
      return !board[ny * boardSize + nx] && !rotated.includes(`${nx},${ny}`);
    }) &&
    diagonals.some(c => {
      const nx = x + c.x;
      const ny = y + c.y;
      return validCoords(nx, ny) && board[ny * boardSize + nx] === 1;
    }) &&
    orthogonals.every(c => {
      const nx = x + c.x;
      const ny = y + c.y;
      return !validCoords(nx, ny) || board[ny * boardSize + nx] !== 1;
    })
  );
};

const placePiece = (piece, px, py, {used, board}) => {
  const boardCopy = board.slice();
  for (const c of piece.coords) {
    const x = c.x + px;
    const y = c.y + py;
    boardCopy[y * boardSize + x] = 1;

    const rx = boardSize - x - 1;
    const ry = boardSize - y - 1;
    boardCopy[ry * boardSize + rx] = 2;
  }
  return {used: [...used, piece.id], board: boardCopy};
};

const c1 = color(189, 123, 0);
const c2 = color(101, 0, 173);
const black = color(0, 0, 0);
const render = makeRenderer(
  document.querySelector('canvas'),
  boardSize,
  boardSize,
  v => (v === 1 ? c1 : v === 2 ? c2 : black)
);

let stack;
const blankBoard = {used: [], board: new Array(boardSize ** 2).fill()};
const init = () => {
  stack = [];
  pieceGroups.forEach(g => {
    g.forEach(p => {
      stack.push(placePiece(p, 0, 0, blankBoard));
    });
  });
};

const loop = () => {
  const current = stack.pop();
  if (!current) return console.log('DONE');
  for (let i = 0; i < pieceGroups.length; i++) {
    if (current.used.includes(i)) continue;
    for (const p of pieceGroups[i]) {
      for (let y = 0; y < boardSize - p.h; y++) {
        for (let x = 0; x < boardSize - p.h; x++) {
          if (validPlacement(p, x, y, current.board))
            stack.push(placePiece(p, x, y, current));
        }
      }
    }
  }
  render(current.board);
  window.output.innerText = `Stack size: ${stack.length}, Used: ${current.used.length}/${pieceGroups.length}`;
  requestAnimationFrame(loop);
  // setTimeout(loop, 200);
};

init();
loop();

const size = 16;
pieceGroups.forEach(g => {
  document.body.appendChild(document.createElement('hr'));
  g.forEach(p => {
    const C = document.createElement('canvas');
    C.width = size * (p.w + 2);
    C.height = size * (p.h + 2);
    C.style.margin = size + 'px';
    const T = C.getContext('2d');
    [
      [p.orthogonals, 'red'],
      [p.coords, 'white'],
      [p.diagonals, 'blue']
    ].forEach(([arr, color]) => {
      T.fillStyle = color;
      arr.forEach(c => {
        T.fillRect(
          (c.x + 1) * size + 1,
          (c.y + 1) * size + 1,
          size - 2,
          size - 2
        );
      });
    });
    document.body.appendChild(C);
  });
});
