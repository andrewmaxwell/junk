const toArr = (tree, depth = 0) =>
  tree
    ? [
        ...toArr(tree.left, depth + 1),
        ' '.repeat(depth) + tree.value,
        ...toArr(tree.right, depth + 1),
      ]
    : [];

const nodes = {1: {value: 1}};

const addNode = (value) => {
  if (!nodes[value]) {
    nodes[value] = {value};

    if (value % 2 === 0) {
      addNode(value / 2).right = nodes[value];
    } else {
      addNode(value * 3 + 1).left = nodes[value];
    }
  }

  return nodes[value];
};

const addDepth = (node, depth = 0) => {
  if (!node) return;
  node.depth = depth;
  addDepth(node.left, depth + 1);
  addDepth(node.right, depth + 1);
};

for (let i = 1; i < 1000; i++) addNode(i);

addDepth(nodes[1]);

console.dir(nodes[1], {depth: 10});
// console.log(toArr(nodes[1]).join('\n'));
