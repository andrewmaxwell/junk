const getHeight = (tree) =>
  tree ? 1 + Math.max(getHeight(tree.left), getHeight(tree.right)) : 0;

const leftRotate = (tree) => ({
  ...tree.right,
  left: {...tree, right: tree.right.left},
});

const rightRotate = (tree) => ({
  ...tree.left,
  right: {...tree, left: tree.left.right},
});

const doBalance = (tree, value, b) =>
  b > 1
    ? rightRotate(
        value > tree.left.value ? {...tree, left: leftRotate(tree.left)} : tree
      )
    : b < -1
    ? leftRotate(
        value <= tree.right.value
          ? {...tree, right: rightRotate(tree.right)}
          : tree
      )
    : tree;

const balance = (tree, value) =>
  doBalance(tree, value, getHeight(tree.left) - getHeight(tree.right));

const addNode = (tree, value) =>
  tree
    ? balance(
        value <= tree.value
          ? {...tree, left: addNode(tree.left, value)}
          : {...tree, right: addNode(tree.right, value)}
      )
    : {value};

const buildTreeFromList = (arr) => arr.reduce(addNode, null);

const {Test} = require('./test');
const tree1 = buildTreeFromList([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
Test.assertDeepEquals(tree1, {
  value: 3,
  right: {
    value: 7,
    right: {value: 8, right: {value: 9}},
    left: {
      value: 5,
      right: {value: 6, right: undefined},
      left: {value: 4, right: undefined},
    },
  },
  left: {
    value: 1,
    right: {value: 2, right: undefined},
    left: {value: 0, right: undefined},
  },
});

const tree2 = buildTreeFromList([6, 9, 3, 5, 0, 8, 1, 4, 7, 2]);
Test.assertDeepEquals(tree2, {
  value: 6,
  right: {
    value: 8,
    left: {value: 7},
    right: {value: 9, left: undefined},
  },
  left: {
    value: 3,
    right: {value: 5, left: {value: 4}},
    left: {
      value: 1,
      right: {value: 2},
      left: {value: 0, right: undefined},
    },
  },
});
