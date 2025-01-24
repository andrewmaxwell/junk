const dirs = [
  [1, 0, 1, 0, 1, 1],
  [0, 1, 0, 1, 1, 1],
  [-1, 0, 0, 0, 0, 1],
  [0, -1, 0, 0, 1, 0],
];

// const getPerimeter = (region) =>
//   region
//     .map(
//       ([x, y]) =>
//         dirs.filter(([dx, dy]) => input[y][x] !== input[y + dy]?.[x + dx])
//           .length
//     )
//     .reduce((a, b) => a + b);

// const part1 = regions
//   .map((r) => r.length * getPerimeter(r))
//   .reduce((a, b) => a + b);

// console.log('part1', part1);

const getRegions = (input) => {
  const seen = {};
  const regions = [];

  for (let y = 0; y < input.length; y++) {
    for (let x = 0; x < input[y].length; x++) {
      const c = [x, y];
      if (seen[c]) continue;
      seen[c] = true;

      const region = [c];
      for (const [cx, cy] of region) {
        for (const [dx, dy] of dirs) {
          const n = [cx + dx, cy + dy];
          if (seen[n] || input[cy + dy]?.[cx + dx] !== input[y][x]) continue;
          seen[n] = true;
          region.push(n);
        }
      }
      regions.push(region);
    }
  }
  return regions;
};

const buildEdgeGraph = (input, region) => {
  const edgeGraph = {};
  for (const [x, y] of region) {
    for (const [dx, dy, ax, ay, bx, by] of dirs) {
      if (input[y][x] === input[y + dy]?.[x + dx]) continue;
      const firstNode = [x + ax, y + ay];
      const secondNode = [x + bx, y + by];
      (edgeGraph[firstNode] ||= []).push(secondNode);
      (edgeGraph[secondNode] ||= []).push(firstNode);
    }
  }
  return edgeGraph;
};

const getSides = (edgeGraph) => {
  const seen = {};
  let total = 0;
  for (const k in edgeGraph) {
    if (seen[k]) continue;
    seen[k] = true;

    const perimeter = [k.split(',').map(Number)];
    for (const p of perimeter) {
      const c = edgeGraph[p].find((q) => !seen[q]);
      if (!c) continue;
      perimeter.push(c);
      seen[c] = true;
    }

    const ret = perimeter.filter((p, i) => {
      const a = perimeter[(i - 1 + perimeter.length) % perimeter.length];
      const c = perimeter[(i + 1) % perimeter.length];
      return a[0] - p[0] !== p[0] - c[0] || a[1] - p[1] !== p[1] - c[1];
    });

    console.log(ret);

    total += ret.length;
  }
  return total;
};

const part2 = (input) => {
  input = input.trim().split('\n');
  return getRegions(input)
    .map((region) => region.length * getSides(buildEdgeGraph(input, region)))
    .reduce((a, b) => a + b);
};

import {Test} from '../test.js';

// Test.assertDeepEquals(
//   part2(`
// AAAA
// BBCD
// BBCC
// EEEC`),
//   80
// );
// Test.assertDeepEquals(
//   part2(`
// EEEEE
// EXXXX
// EEEEE
// EXXXX
// EEEEE`),
//   236
// );
Test.assertDeepEquals(
  part2(`
AAAAAA
AAABBA
AAABBA
ABBAAA
ABBAAA
AAAAAA`),
  368
);
// Test.assertDeepEquals(
//   part2(`
// OOOOO
// OXOXO
// OOOOO
// OXOXO
// OOOOO`),
//   436
// );
Test.assertDeepEquals(
  part2(`
RRRRIICCFF
RRRRIICCCF
VVRRRCCFFF
VVRCCCJFFF
VVVVCJJCFE
VVIVCCJJEE
VVIIICJJEE
MIIIIIJJEE
MIIISIJEEE
MMMISSJEEE`),
  1206
);
