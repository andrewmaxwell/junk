const addNode = (tree, value) =>
  tree
    ? value < tree.value
      ? {...tree, left: addNode(tree.left, value)}
      : {...tree, right: addNode(tree.right, value)}
    : {value};

const buildTree = (arr) => arr.reduce(addNode, undefined);

const toArr = (tree, depth = 0) =>
  tree
    ? [
        ...toArr(tree.left, depth + 1),
        ' '.repeat(depth) + tree.value,
        ...toArr(tree.right, depth + 1),
      ]
    : [];

console.log(
  toArr(
    buildTree([
      1, 2, 9, 5, 0, 3, 3, 3, 8, 5, 2, 9, 8, 6, 2, 6, 2, 8, 5, 0, 0, 5, 4, 8, 1,
      5, 3, 4, 0, 9, 6, 7, 5, 9, 1, 2, 3, 2, 1, 8, 6, 8, 3, 2, 6, 2, 4, 5, 8, 5,
      6, 7, 8, 9, 1, 3, 9, 0, 0, 7, 8, 3, 2, 4,
    ])
  ).join('\n')
);
