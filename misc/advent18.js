const grid = `
#################
#i.G..c...e..H.p#
########.########
#j.A..b...f..D.o#
########@########
#k.E..a...g..B.n#
########.########
#l.F..d...h..C.m#
#################`
  .trim()
  .split('\n');

const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1}
];

const isKey = c => c >= 'a' && c <= 'z';
const isPassable = (c, keysOwned) =>
  c !== '#' &&
  (c === '.' || c === '@' || isKey(c) || keysOwned.includes(c.toLowerCase()));

const contains = (q, nx, ny) => {
  for (let k = 0; k < q.length; k++) {
    if (q[k].x === nx && q[k].y === ny) return true;
  }
  return false;
};

const keysAccessible = start => {
  const q = [start];
  const result = [];
  for (let i = 0; i < q.length; i++) {
    const curr = q[i];
    if (isKey(curr.char) && !start.keys.includes(curr.char)) {
      result.push(curr);
      // if (result.length > 1) return result;
    }
    for (let j = 0; j < dirs.length; j++) {
      const dir = dirs[j];
      const nx = curr.x + dir.x;
      const ny = curr.y + dir.y;
      if (isPassable(grid[ny][nx], start.keys) && !contains(q, nx, ny)) {
        q.push({x: nx, y: ny, dist: curr.dist + 1, char: grid[ny][nx]});
      }
    }
  }
  return result;
};

const q = [
  {
    x: grid.find(r => r.includes('@')).indexOf('@'),
    y: grid.findIndex(r => r.includes('@')),
    keys: '',
    dist: 0
  }
];

// let best = {dist: Infinity};
// for (let i = 0; i < q.length; i++) {
//   console.log(q[i]);
//   const nextKeys = keysAccessible(q[i]);
//   if (!nextKeys.length && q[i].dist < best.dist) best = q[i];
//   nextKeys.forEach(k => {
//     q.push({x: k.x, y: k.y, dist: k.dist, keys: q[i].keys + k.char});
//   });
// }
// console.log(best);

while (q.length) {
  let curr = q[0];
  let minIndex = 0;
  for (let i = 0; i < q.length; i++) {
    if (q[i].dist <= curr.dist) {
      curr = q[i];
      minIndex = i;
    }
  }
  q[minIndex] = q[q.length - 1];
  q.pop();

  console.log(curr.dist, curr.keys, q.length);

  const nextKeys = keysAccessible(curr);
  if (!nextKeys.length) {
    console.log('>>>>>>>>>>', curr);
    break;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const k = nextKeys[i];
    q.push({x: k.x, y: k.y, dist: k.dist, keys: curr.keys + k.char});
  }
}
