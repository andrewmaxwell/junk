/*
   |------
   v     |
A->B->C->D
^  v     ^
|--E-----|
   ^
   F
*/

const shortestPath = (graph, start, end) => {
  const list = [[start, 0]];
  for (const [n, dist] of list) {
    if (n === end) return dist;
    for (const [from, to] of graph) {
      if (from === n && !list.some(x => x[0] === to)) {
        list.push([to, dist + 1]);
      }
    }
  }
  return 'No path exists.';
};

const shortestPath2 = (graph, start, end, seen = [start]) =>
  start === end
    ? 0
    : Math.min(
        ...graph.map(([from, to]) =>
          from === start && !seen.includes(to)
            ? 1 + shortestPath2(graph, to, end, [...seen, to])
            : Infinity
        )
      );

console.log(
  shortestPath(['AB', 'BC', 'BE', 'CD', 'DB', 'EA', 'ED', 'FE'], 'C', 'E')
);
