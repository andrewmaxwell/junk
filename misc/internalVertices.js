const isInternal = (v, graph) => {
  const neighbors = [...graph[v]];
  if (neighbors.length <= 2) return false;
  const cycle = [neighbors.pop()];
  while (neighbors.length) {
    const index = neighbors.findIndex((n) =>
      graph[cycle[cycle.length - 1]].has(n)
    );
    if (index === -1) return false;
    cycle.push(neighbors.splice(index, 1)[0]);
  }
  return graph[cycle[cycle.length - 1]].has(cycle[0]);
};

const removeInternal = (...triangles) => {
  const vertices = [...new Set([].concat(...triangles))].sort((a, b) => a - b);
  const graph = {};
  vertices.forEach((v) => (graph[v] = new Set()));
  triangles.forEach(([a, b, c]) => {
    graph[a].add(b).add(c);
    graph[b].add(a).add(c);
    graph[c].add(a).add(b);
  });
  return vertices.filter((v) => !isInternal(v, graph));
};

const {Test} = require('./test');
Test.assertEquals(removeInternal([0, 2, 1], [2, 3, 1]), [0, 1, 2, 3]);
Test.assertEquals(removeInternal([0, 2, 1], [3, 2, 1], [4, 2, 3], [0, 2, 4]), [
  0,
  1,
  3,
  4,
]);
Test.assertEquals(
  removeInternal(
    [0, 1, 3],
    [1, 3, 7],
    [1, 7, 9],
    [7, 9, 8],
    [10, 8, 9],
    [4, 7, 8],
    [3, 4, 7],
    [0, 2, 3],
    [2, 3, 4],
    [2, 4, 5],
    [4, 5, 6],
    [4, 6, 8],
    [6, 8, 10]
  ),
  [0, 1, 2, 5, 6, 9, 10]
);
