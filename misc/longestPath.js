const buildIndex = (str) => {
  const nodes = {};
  for (let i = 0; i < str.length - 1; i++) {
    const a = str[i];
    const b = str[i + 1];
    if (a === ',' || b === ',') continue;
    (nodes[a] = nodes[a] || []).push(b);
    (nodes[b] = nodes[b] || []).push(a);
  }
  return nodes;
};

const longestFrom = (nodes, path) =>
  nodes[path[path.length - 1]].reduce((longest, x) => {
    const p = path.includes(x) ? [] : longestFrom(nodes, [...path, x]);
    return p.length > longest.length ? p : longest;
  }, path);

const lengthOfLongestPath = (str) => {
  const nodes = buildIndex(str);
  return Object.keys(nodes).reduce(
    (max, n) => Math.max(max, longestFrom(nodes, [n]).length),
    0
  );
};

const allPathsFrom = (nodes, path) => [
  path,
  ...nodes[path[path.length - 1]].flatMap((x) =>
    path.includes(x) ? [] : allPathsFrom(nodes, path + x)
  ),
];

const allPaths = (str) => {
  const nodes = buildIndex(str);
  return Object.keys(nodes).flatMap((n) => allPathsFrom(nodes, n));
};

const {Test} = require('./test');
Test.assertDeepEquals(lengthOfLongestPath('abcdegfb'), 7);
Test.assertDeepEquals(lengthOfLongestPath('abcdcefeba'), 5);
Test.assertDeepEquals(lengthOfLongestPath('ab,cd,ef'), 2);
Test.assertDeepEquals(lengthOfLongestPath('aelbgkanmaf,bhim,idc'), 11);

console.log(allPaths('abcdcefeba'));
