const up = {x: 0, y: -1};
const down = {x: 0, y: 1, op: up};
const left = {x: -1, y: 0};
const right = {x: 1, y: 0, op: left};
up.op = down;
left.op = right;

const pipes = {
  '┗': [up, right],
  '┓': [left, down],
  '┏': [down, right],
  '┛': [up, left],
  '━': [left, right],
  '┃': [up, down],
  '┣': [up, down, right],
  '┫': [up, down, left],
  '┳': [left, right, down],
  '┻': [left, right, up],
  '╋': [up, down, left, right]
};

const checkPipe = rows => {
  const visited = rows.map(r => r.split('').map(() => false)); // keep track of which pipes we've checked so we don't get stuck in an infinite loop
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const p = pipes[rows[r][c]];
      if (!p || visited[r][c]) continue;
      // we only care about pipes that connect to the edges
      if (
        (!r && p.includes(up)) ||
        (r === rows.length - 1 && p.includes(down)) ||
        (!c && p.includes(left)) ||
        (c === rows[r].length - 1 && p.includes(right))
      ) {
        const q = [{r, c}]; // array of coordinates discovered in pipe so far
        visited[r][c] = true;
        for (let i = 0; i < q.length; i++) {
          for (const d of pipes[rows[q[i].r][q[i].c]]) {
            // each connecting direction
            const nc = d.x + q[i].c;
            const nr = d.y + q[i].r;
            if (!rows[nr] || !rows[nr][nc]) continue; // off the edge is fine
            if (rows[nr][nc] === '.' || !pipes[rows[nr][nc]].includes(d.op)) {
              // enountered a . or a pipe that doesn't connect
              console.log('Leak at', nr, nc);
              return false;
            }
            if (!visited[nr][nc]) {
              visited[nr][nc] = true;
              q.push({r: nr, c: nc}); // discovered a new connected piece
            }
          }
        }
      }
    }
  }
  return true;
};

// TESTS
const display = arr => console.log('\n\n' + arr.join('\n'));

const {Test} = require('./test.js');
let pipe = ['╋━━┓', '┃..┃', '┛..┣'];
display(pipe);
Test.assertEquals(checkPipe(pipe), true);

pipe = ['...┏', '┃..┃', '┛..┣'];
display(pipe);
Test.assertEquals(checkPipe(pipe), false);

pipe = ['...┏', '...┃', '┛..┣'];
display(pipe);
Test.assertEquals(checkPipe(pipe), false);

pipe = ['...┏', '...┃', '┓..┣'];
display(pipe);
Test.assertEquals(checkPipe(pipe), true);

pipe = ['╋', '╋', '╋'];
display(pipe);
Test.assertEquals(checkPipe(pipe), true);

pipe = ['╋....', '┃..┛.', '┃....'];
display(pipe);
Test.assertEquals(checkPipe(pipe), false);

pipe = ['....', '.┛┛.', '....'];
display(pipe);
Test.assertEquals(checkPipe(pipe), true);

pipe = ['┳', '━'];
display(pipe);
Test.assertEquals(checkPipe(pipe), false);

pipe = ['.┣┫┏┻┓', '.┣╋┫.┗', '┓┃┗┛..', '┣┛.┳..'];
display(pipe);
Test.assertEquals(checkPipe(pipe), false);
