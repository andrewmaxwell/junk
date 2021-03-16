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

const getShip = (field, r, c) => {
  const q = [{r, c}];
  const seen = {[r * 10 + c]: true};
  for (const {r, c} of q) {
    for (const [dx, dy] of dirs) {
      const rr = r + dy;
      const cc = c + dx;
      const idx = rr * 10 + cc;
      if (field[rr] && field[rr][cc] && !seen[idx]) {
        q.push({r: rr, c: cc});
        seen[idx] = true;
      }
    }
  }
  return q;
};

const isValid = (ship) =>
  ship.every((s) => s.r === ship[0].r) || ship.every((s) => s.c === ship[0].c);

function validateBattlefield(field) {
  const ships = {4: 1, 3: 2, 2: 3, 1: 4};
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (!field[r][c]) continue;
      const ship = getShip(field, r, c);
      if (isValid(ship) && ships[ship.length]) {
        ships[ship.length]--;
        for (const {r, c} of ship) field[r][c] = 0;
      } else return false;
    }
  }
  return Object.values(ships).every((v) => !v);
}

const {Test} = require('./test');
Test.assertEquals(
  validateBattlefield([
    [1, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    [1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ]),
  true
);
