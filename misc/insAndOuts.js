const getVals = (grid, state, counter = 0) =>
  grid.map((row) =>
    row.map((val) => val === 'I' || (val === 'E' && state[counter++])),
  );

const gridToStr = (grid, state) => {
  const vals = getVals(grid, state);

  const result = Array.from({length: grid.length * 2 + 1}, () =>
    Array(grid[0].length * 2 + 1).fill(' '),
  );

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      result[y * 2 + 1][x * 2 + 1] = grid[y][x];
      if (!vals[y][x]) continue;
      const upEmpty = !y || !vals[y - 1][x];
      const downEmpty = y === vals.length - 1 || !vals[y + 1][x];
      const leftEmpty = !vals[y][x - 1];
      const rightEmpty = !vals[y][x + 1];

      if (upEmpty || leftEmpty) result[y * 2][x * 2] = '.';
      if (upEmpty) result[y * 2][x * 2 + 1] = '.';
      if (upEmpty || rightEmpty) result[y * 2][x * 2 + 2] = '.';
      if (leftEmpty) result[y * 2 + 1][x * 2] = '.';
      if (rightEmpty) result[y * 2 + 1][x * 2 + 2] = '.';
      if (downEmpty || leftEmpty) result[y * 2 + 2][x * 2] = '.';
      if (downEmpty) result[y * 2 + 2][x * 2 + 1] = '.';
      if (downEmpty || rightEmpty) result[y * 2 + 2][x * 2 + 2] = '.';
    }
  }
  return result.map((r) => r.join('')).join('\n');
};

const numIslands = (grid, state) => {
  const vals = [
    Array(grid[0].length + 2).fill(false),
    ...getVals(grid, state).map((row) => [false, ...row, false]),
    Array(grid[0].length + 2).fill(false),
  ];

  const markSeen = (x, y, v) => {
    if (!vals[y] || vals[y][x] !== v) return;
    vals[y][x] = -1;
    markSeen(x + 1, y, v);
    markSeen(x - 1, y, v);
    markSeen(x, y + 1, v);
    markSeen(x, y - 1, v);
  };

  let result = 0;
  for (let y = 0; y < vals.length; y++) {
    for (let x = 0; x < vals[y].length; x++) {
      if (vals[y][x] === -1) continue;
      result++;
      markSeen(x, y, vals[y][x]);
    }
  }
  return result;
};

const insAndOuts = (str) => {
  const grid = str
    .split('\n')
    .filter((_, i) => i % 2)
    .map((r) => r.match(/[IOE]/g));

  const q = [(str.match(/E/g) || []).map(() => false)];

  for (const state of q) {
    if (numIslands(grid, state) === 2) return gridToStr(grid, state);
    for (let i = state.lastIndexOf(true) + 1; i < state.length; i++) {
      q.push(state.map((s, j) => s || j === i));
    }
  }
  return '';
};

// https://www.codewars.com/kata/576bbb41b1abc47b3900015e/train/javascript
import {Test} from './test.js';
Test.failFast = true;

let map =
  '       \n' +
  ' I I O \n' +
  '       \n' +
  ' O E I \n' +
  '       \n' +
  ' O I I \n' +
  '       ';
let sol =
  '.....  \n' +
  '.I I.O \n' +
  '... ...\n' +
  ' O.E I.\n' +
  '  .   .\n' +
  ' O.I I.\n' +
  '  .....';

let youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' I I O \n' +
  '       \n' +
  ' O E I \n' +
  '       \n' +
  ' O I E \n' +
  '       ';
sol =
  '.....  \n' +
  '.I I.O \n' +
  '... ...\n' +
  ' O.E I.\n' +
  '  . ...\n' +
  ' O.I.E \n' +
  '  ...  ';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' I I I \n' +
  '       \n' +
  ' O E I \n' +
  '       \n' +
  ' O E I \n' +
  '       ';
sol =
  '.......\n' +
  '.I I I.\n' +
  '..... .\n' +
  ' O E.I.\n' +
  '    . .\n' +
  ' O E.I.\n' +
  '    ...';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' O O O \n' +
  '       \n' +
  ' O I O \n' +
  '       \n' +
  ' O O O \n' +
  '       ';
sol =
  '       \n' +
  ' O O O \n' +
  '  ...  \n' +
  ' O.I.O \n' +
  '  ...  \n' +
  ' O O O \n' +
  '       ';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' O E O \n' +
  '       \n' +
  ' E I E \n' +
  '       \n' +
  ' O E O \n' +
  '       ';
sol =
  '       \n' +
  ' O E O \n' +
  '  ...  \n' +
  ' E.I.E \n' +
  '  ...  \n' +
  ' O E O \n' +
  '       ';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' E E E \n' +
  '       \n' +
  ' I I I \n' +
  '       \n' +
  ' O E O \n' +
  '       ';
sol =
  '       \n' +
  ' E E E \n' +
  '.......\n' +
  '.I I I.\n' +
  '.......\n' +
  ' O E O \n' +
  '       ';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' I I I \n' +
  '       \n' +
  ' E E I \n' +
  '       \n' +
  ' I I I \n' +
  '       ';
sol =
  '.......\n' +
  '.I I I.\n' +
  '..... .\n' +
  ' E E.I.\n' +
  '..... .\n' +
  '.I I I.\n' +
  '.......';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '           \n' +
  ' I I O I E \n' +
  '           \n' +
  ' O E I E O \n' +
  '           \n' +
  ' O I I E I \n' +
  '           \n' +
  ' O O O E E \n' +
  '           \n' +
  ' I E I I O \n' +
  '           ';
sol = `..... ...  
.I I.O.I.E 
... ... .  
 O.E I E.O 
  .     ...
 O.I I E I.
  ..... ...
 O O O.E.E 
....... .  
.I E I I.O 
.........  `;

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' I I I \n' +
  '       \n' +
  ' O O O \n' +
  '       \n' +
  ' I I I \n' +
  '       ';
sol = '';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

map =
  '       \n' +
  ' I O I \n' +
  '       \n' +
  ' O E I \n' +
  '       \n' +
  ' I I I \n' +
  '       ';
sol = '';

youranswer = insAndOuts(map);
Test.assertSimilar(youranswer, sol);

Test.assertSimilar(
  insAndOuts(`      
 I I I
         
 I O I
         
 I I I
       `),
  '',
);
