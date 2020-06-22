const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const slidePuzzle = (arr) => {
  const size = arr.length;
  const solved = [...new Array(size ** 2 - 1)].map((v, i) => i + 1) + ',0';
  const q = [[].concat(...arr)];
  const seen = {[q[0]]: []};
  while (q.length) {
    const cur = q.shift(); // breadth first
    if (cur.toString() === solved) return seen[cur];
    const i1 = cur.indexOf(0);
    for (const [dr, dc] of dirs) {
      const nr = Math.floor(i1 / size) + dr;
      const nc = (i1 % size) + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;

      const i2 = i1 + dr * size + dc;
      const next = cur.slice();
      next[i1] = cur[i2];
      next[i2] = cur[i1];
      if (seen[next]) continue;
      seen[next] = [...seen[cur], cur[i2]];
      q.push(next);
    }
  }
  return null;
};

const simpleExample = [
  [10, 3, 6, 4],
  [1, 5, 8, 0],
  [2, 13, 7, 15],
  [14, 9, 12, 11],
];
const result = slidePuzzle(simpleExample); // [6,7,11,12]
console.log(result);
// let puzzle2 = [
// 	[10, 3, 6, 4],
// 	[ 1, 5, 8, 0],
// 	[ 2,13, 7,15],
// 	[14, 9,12,11]
// ];
// let puzzle3 = [
// 	[ 3, 7,14,15,10],
// 	[ 1, 0, 5, 9, 4],
// 	[16, 2,11,12, 8],
// 	[17, 6,13,18,20],
// 	[21,22,23,19,24]
// ];
// [puzzle1,puzzle2,puzzle3].forEach(e => validateSolution(e,slidePuzzle(e.map(v => v.slice()))));
