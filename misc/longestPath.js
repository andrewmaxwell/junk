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

const longestFrom = (nodeIndex, path) => {
  let result = path.length;
  const lastInPath = path[path.length - 1];
  const connectedNodes = nodeIndex[lastInPath];

  for (const x of connectedNodes) {
    if (!path.includes(x)) {
      const next = longestFrom(nodeIndex, [...path, x]);
      if (next > result) result = next;
    }
  }
  return result;
};

const lengthOfLongestPath = (str) => {
  const nodeIndex = buildIndex(str);
  const uniqueNodes = Object.keys(nodeIndex);

  let max = 0;
  for (const node of uniqueNodes) {
    const len = longestFrom(nodeIndex, [node]);
    if (len > max) max = len;
  }
  return max;
};

const {Test} = require('./test');
Test.assertDeepEquals(lengthOfLongestPath('abcdegfb'), 7);
Test.assertDeepEquals(lengthOfLongestPath('abcdcefeba'), 5);
Test.assertDeepEquals(lengthOfLongestPath('ab,cd,ef'), 2);
Test.assertDeepEquals(lengthOfLongestPath('aelbgkanmaf,bhim,idc'), 11);

// const allPathsFrom = (nodes, path) => [
//   path,
//   ...nodes[path[path.length - 1]].flatMap((x) =>
//     path.includes(x) ? [] : allPathsFrom(nodes, path + x)
//   ),
// ];

// const allPaths = (str) => {
//   const nodes = buildIndex(str);
//   return Object.keys(nodes).flatMap((n) => allPathsFrom(nodes, n));
// };

// console.log(allPaths('abcdcefeba'));
