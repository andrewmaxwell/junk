https://www.codewars.com/kata/57ff9d3b8f7dda23130015fa/train/javascript

const dirs = [
  {x: 1, y: 0},
  {x: 1, y: 1},
  {x: 0, y: 1},
  {x: -1, y: 1},
  {x: -1, y: 0},
  {x: -1, y: -1},
  {x: 0, y: -1},
  {x: 1, y: -1},
];

const isSafe = (map, r, c) => {
  for (const {x, y} of dirs) {
    const nr = r + y;
    const nc = c + x;
    if (map[nr] && map[nr][nc] == 0) return true;
  }
  return false;
};

const getSafeCell = (map) => {
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      if (map[r][c] === '?' && isSafe(map, r, c)) return [r, c];
    }
  }
};

const solveMine = (map, n) => {
  console.log(map);
  map = map.split('\n').map((r) => r.split(' '));
  while (true) {
    const safeCell = getSafeCell(map);
    if (!safeCell) {
      return map
        .map((r) => r.join(' '))
        .join('\n')
        .replace(/\?/g, 'x');
      // return res.match(/x/g).length === n ? res : '?';
    }
    const [r, c] = safeCell;
    map[r][c] = open(r, c);
    console.log('>>', r, c, map[r][c]);
    console.log(map.map((r) => r.join(' ')).join('\n'));
  }
};
