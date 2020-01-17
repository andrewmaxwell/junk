class V {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  add(v) {
    return new V(this.x + v.x, this.y + v.y);
  }
  equalTo(v) {
    return this.x === v.x && this.y === v.y;
  }
}

class Map {
  constructor(rows) {
    this.rows = rows;
    const y = this.rows.findIndex(r => r.includes(-1));
    this.start = new V(this.rows[y].indexOf(-1), y);
  }
  valueAt(v) {
    return this.rows[v.y] && this.rows[v.y][v.x];
  }
}

const dirs = [
  new V(1, 0),
  new V(1, -1),
  new V(0, -1),
  new V(-1, -1),
  new V(-1, 0),
  new V(-1, 1),
  new V(0, 1),
  new V(1, 1)
];

const dirValid = (curr, dir) => {
  if (curr === -1) return true;
  const diff = Math.abs(curr - dir);
  return Math.min(diff, dirs.length - diff) <= 2; // + or - 90 degrees
};

const inPath = (path, curr, endPos) => {
  for (let i = 0; i < path.length; i++) {
    curr = curr.add(dirs[path[i]]);
    if (curr.equalTo(endPos)) return true;
  }
  return false;
};

const isValidMove = (map, pos, path, dirIndex) => {
  const next = pos.add(dirs[dirIndex]);
  const nextTile = map.valueAt(next);
  return (
    nextTile !== undefined && // on map
    dirValid(map.valueAt(pos), dirIndex) && // valid direction from current tile
    dirValid(nextTile, dirIndex) && // valid direction to next tile
    !inPath(path, map.start, next) // not already stepped on
  );
};

const endPos = (pos, path) => {
  for (let i = 0; i < path.length; i++) {
    pos = pos.add(dirs[path[i]]);
  }
  return pos;
};

const arrows = '→↗↑↖←↙↓↘';
const dance = str => {
  const map = new Map(
    str.split('\n').map(r => r.split('').map(a => arrows.indexOf(a)))
  );
  const q = [[]];
  let maxPath = [];
  for (let n = 0; n < q.length; n++) {
    const path = q[n];
    const pos = endPos(map.start, path);
    if (path.length && map.valueAt(pos) === -1) {
      // path ends with S
      if (path.length > maxPath.length) maxPath = path;
      continue;
    }
    for (let i = 0; i < dirs.length; i++) {
      if (isValidMove(map, pos, path, i)) {
        q.push(path.concat(i));
      }
    }
  }
  return maxPath.map(a => arrows[a]).join('');
};

const result = dance(
  `
↓↑↘→
←↑S↗
↖↓↓↙
←↓→↘
`.trim()
);

console.log(result, result.length); // 19
