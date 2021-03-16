const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const getEstRemaining = (arr, solutionCoords) => {
  let total = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr[i].length; j++) {
      const [x, y] = solutionCoords[arr[i][j]];
      total += Math.abs(i - y) + Math.abs(j - x);
    }
  }
  return total;
};

const getSolutionCoords = (size) => {
  const result = [];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      result[(i * size + j + 1) % (size * size)] = [j, i];
    }
  }
  return result;
};

const getIndexOfBest = (arr) => {
  let best = Infinity;
  let index;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i].dist + arr[i].estRemaining;
    if (x < best) {
      best = x;
      index = i;
    }
  }
  return index;
};

const getNeighbors = (arr) => {
  const y = arr.findIndex((r) => r.includes(0));
  const x = arr[y].indexOf(0);
  const result = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (!arr[ny] || arr[ny][nx] === undefined) continue;
    const copy = arr.map((r) => r.slice());
    copy[y][x] = copy[ny][nx];
    copy[ny][nx] = 0;
    result.push({move: copy[y][x], n: copy});
  }
  return result;
};

const getPath = (current) => [
  ...(current.prev.move ? getPath(current.prev) : []),
  current.move,
];

const slidePuzzle = (initialArr) => {
  const seen = {};
  const solutionCoords = getSolutionCoords(initialArr.length);
  const q = [
    {
      dist: 0,
      estRemaining: getEstRemaining(initialArr, solutionCoords),
      arr: initialArr,
    },
  ];
  seen[initialArr] = q[0];

  while (q.length) {
    const current = q.splice(getIndexOfBest(q), 1)[0];

    if (!current.estRemaining) return getPath(current);

    for (const {move, n} of getNeighbors(current.arr)) {
      const s = seen[n];
      if (!s) {
        seen[n] = {
          dist: current.dist + 1,
          estRemaining: getEstRemaining(n, solutionCoords),
          arr: n,
          prev: current,
          move,
        };
        q.push(seen[n]);
      } else if (current.dist + 1 < s.dist) {
        s.dist = current.dist + 1;
        s.prev = current;
        s.move = move;
      }
    }
  }
};

let simpleExample = [
  [3, 7, 14, 15, 10],
  [1, 0, 5, 9, 4],
  [16, 2, 11, 12, 8],
  [17, 6, 13, 18, 20],
  [21, 22, 23, 19, 24],
];
console.log(slidePuzzle(simpleExample)); // [6,7,11,12]
// console.log(
//   getEstRemaining(simpleExample, getSolutionCoords(simpleExample.length))
// );
// console.log(getSolutionCoords(4));
