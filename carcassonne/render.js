import {rotate} from './utils.js';

const SPRITE_SIZE = 85;
const img = document.querySelector('img');

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

const sprites = `
gggg ggrg cccc ccgc x
ccrc x cggc x crrc
x gcgc x x x
cggg cgrr crrg crrr crgr
rgrg ggrr grrr rrrr x
`
  .trim()
  .split('\n')
  .map((r, y) =>
    r.split(' ').map((c, x) => ({c, x: 15 + 105 * x, y: 15 + 118 * y}))
  )
  .flat()
  .reduce((res, {c, x, y}) => ({...res, [c]: {x, y}}), {});

export const drawBoard = (board) => {
  canvas.width = SPRITE_SIZE * board[0].length;
  canvas.height = SPRITE_SIZE * board.length;
  for (let i = 0; i < board.length; i++) {
    for (let j = 0; j < board[i].length; j++) {
      if (!board[i][j]) continue;
      for (let t = 0; t < 4; t++) {
        const p = rotate(t, board[i][j]);
        if (!sprites[p]) continue;
        ctx.save();
        ctx.translate((j + 0.5) * SPRITE_SIZE, (i + 0.5) * SPRITE_SIZE);
        ctx.rotate(-(t * Math.PI) / 2);
        ctx.translate(-SPRITE_SIZE / 2, -SPRITE_SIZE / 2);
        ctx.drawImage(
          img,
          sprites[p].x,
          sprites[p].y,
          SPRITE_SIZE,
          SPRITE_SIZE,
          0,
          0,
          SPRITE_SIZE,
          SPRITE_SIZE
        );
        ctx.restore();
        break;
      }
    }
  }
};

// export const boardToString = (board) => {
//   const res = new Array(board.length * 3).fill('');
//   for (let r = 0; r < board.length; r++) {
//     for (let c = 0; c < board[r].length; c++) {
//       const [u, rr, d, l] = board[r][c] || [];
//       res[r * 3 + 0] += u ? '┌ ' + u + ' ┐' : '     ';
//       res[r * 3 + 1] += l ? l + '   ' + rr : '     ';
//       res[r * 3 + 2] += d ? '└ ' + d + ' ┘' : '     ';
//     }
//   }
//   return res.join('\n');
// };
