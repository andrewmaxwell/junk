const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

const isLetter = (c) => /[a-z]/i.test(c);

const getPiece = (r, c, grid, visited) => {
  const q = [{r, c, l: grid[r][c]}];
  visited[r][c] = true;
  for (const {r, c} of q) {
    for (const {x, y} of dirs) {
      const nx = c + x;
      const ny = r + y;
      if (
        grid[ny] &&
        grid[ny][nx] &&
        !visited[ny][nx] &&
        isLetter(grid[ny][nx])
      ) {
        visited[ny][nx] = true;
        q.push({r: ny, c: nx, l: grid[ny][nx]});
      }
    }
  }
  return q;
};

const spaghettiCode = (grid) => {
  const visited = grid.map(() => []);
  let longest = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!visited[r][c] && isLetter(grid[r][c])) {
        const piece = getPiece(r, c, grid, visited);
        if (piece.length > longest.length) longest = piece;
      }
    }
  }
  return longest.length
    ? longest.reduce((id, {l}) => (l === 'S' ? id : l), 'S')
    : '';
};

const {it, Test} = require('./test');
const show = ({data}) => {
  console.log(data.map((r) => r.join('')).join('\n'));
};
it('ex1', function () {
  var plate = [
    'SSSSSASS____'.split(''),
    '____________'.split(''),
    'SSSSSSBSSSS_'.split(''),
    '____________'.split(''),
    'SSSSSC______'.split(''),
  ];
  var info = {data: plate, count: 3, longest: 11, longestIDs: 'B'};
  show(info);
  var got = spaghettiCode(plate);
  Test.assertEquals(got, 'B');
});

it('ex2', function () {
  var plate = [
    'SSSSSSSSS      '.split(''),
    '________S__SSS_'.split(''),
    ' S   S  A    S '.split(''),
    '_S___S__S____S_'.split(''),
    ' B   S       S '.split(''),
    '_S___SSSSSCSSS_'.split(''),
  ];
  var info = {data: plate, count: 3, longest: 18, longestIDs: 'C'};
  show(info);
  var got = spaghettiCode(plate);
  Test.assertEquals(got, 'C');
});
