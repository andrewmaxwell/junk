const strToGrid = (str) =>
  str
    .split('\n')
    .filter((_, i) => i % 2)
    .map((r, y) =>
      [...r]
        .filter((_, i) => i % 2)
        .map((v, x) => ({v, x, y, neighbors: [], inc: true}))
    );

const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];
const cacheNeighbors = (grid) => {
  for (const row of grid) {
    for (const c of row) {
      c.neighbors = dirs.map(
        ({x, y}) => grid[y + c.y] && grid[y + c.y][x + c.x]
      );
    }
  }
};

const allConnected = (cells) => {
  const seen = new Set();
  let found = false;
  for (const c of cells) {
    if (c.v !== 'I' || seen.has(c)) continue;
    if (found) return false; // as soon as we find an "I" not in the first group, return false
    found = true;

    const q = [c];
    for (const d of q) {
      if (seen.has(d)) continue;
      seen.add(d);
      for (const n of d.neighbors) {
        if (n && n.inc) q.push(n);
      }
    }
  }
  return true;
};

const removeCells = (cells, width, height) => {
  const outerCells = cells.filter(
    (g) =>
      (!g.x || !g.y || g.x === width - 1 || g.y === height - 1) && g.v !== 'I'
  );

  while (outerCells.length) {
    const ix = outerCells.findIndex((g) => g.v === 'O');
    const g = ix > -1 ? outerCells.splice(ix, 1)[0] : outerCells.pop();
    // const g = outerCells.splice(Math.max(0, ix), 1)[0];
    g.inc = false;
    if (allConnected(cells)) {
      for (const n of g.neighbors) {
        if (n && n.inc && n.v !== 'I') outerCells.push(n);
      }
    } else {
      g.inc = true;
    }
  }
};

const cellsToStr = (str, cells) => {
  const result = str.split('\n').map((r) => [...r]);
  for (const {x, y, inc, neighbors} of cells) {
    if (!inc) continue;
    const [right, down, left, up] = neighbors;
    const emp = (n) => !n || !n.inc;
    if (emp(up) || emp(left)) result[y * 2][x * 2] = '.';
    if (emp(up)) result[y * 2][x * 2 + 1] = '.';
    if (emp(up) || emp(right)) result[y * 2][x * 2 + 2] = '.';
    if (emp(left)) result[y * 2 + 1][x * 2] = '.';
    if (emp(right)) result[y * 2 + 1][x * 2 + 2] = '.';
    if (emp(down) || emp(left)) result[y * 2 + 2][x * 2] = '.';
    if (emp(down)) result[y * 2 + 2][x * 2 + 1] = '.';
    if (emp(down) || emp(right)) result[y * 2 + 2][x * 2 + 2] = '.';
  }
  return result.map((r) => r.join('')).join('\n');
};

const insAndOuts = (str) => {
  console.log(str);
  const grid = strToGrid(str);
  const cells = [].concat(...grid);

  cacheNeighbors(grid);
  removeCells(cells, grid[0].length, grid.length);

  return cells.some((c) => c.inc && c.v === 'O') ? '' : cellsToStr(str, cells);
};

// https://www.codewars.com/kata/576bbb41b1abc47b3900015e/train/javascript
const {Test} = require('./test');
const showImage = (name) => {
  console.log(name);
};

var map =
  '       \n' +
  ' I I O \n' +
  '       \n' +
  ' O E I \n' +
  '       \n' +
  ' O I I \n' +
  '       ';
var sol =
  '.....  \n' +
  '.I I.O \n' +
  '... ...\n' +
  ' O.E I.\n' +
  '  .   .\n' +
  ' O.I I.\n' +
  '  .....';

var youranswer = insAndOuts(map);
showImage('example1', map, youranswer);
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
showImage('example2', map, youranswer);
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
showImage('example3', map, youranswer);
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
showImage('example4', map, youranswer);
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
showImage('example5', map, youranswer);
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
showImage('example6', map, youranswer);
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
showImage('example7', map, youranswer);
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
showImage('example8', map, youranswer);
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
showImage('example9', map, youranswer);
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
showImage('example10', map, youranswer);
Test.assertSimilar(youranswer, sol);

map = `                 
 I E I I I I I I 
                 
 I E E E E I I I 
                 
 I I E E O E I I 
                 
 I I I I E I I I 
                 `;
sol = `
.................
.I E I I I I I I.
. .........     .
.I.E E E E.I I I.
. ...     ...   .
.I I.E E O E.I I.
.   ..... ...   .
.I I I I.E.I I I.
......... .......`.trim();

youranswer = insAndOuts(map);
showImage('example11', map, youranswer);
Test.assertSimilar(youranswer, sol);

map = `         
 I E I I 
         
 I O E I 
         
 E I I I 
         
 O I I I 
         
 I I O I 
         `;
sol = `
... .....
.I.E.I I.
. . ... .
.I.O E.I.
. ..... .
.E I I I.
...     .
 O.I I I.
... ... .
.I I.O.I.
..... ...`.trim();

youranswer = insAndOuts(map);
showImage('example11', map, youranswer);
Test.assertSimilar(youranswer, sol);
