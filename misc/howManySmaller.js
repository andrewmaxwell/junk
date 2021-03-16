const update = (tree) => {
  tree.height = 1 + Math.max(tree.left.height, tree.right.height);
  tree.size = 1 + tree.left.size + tree.right.size;
};
const leftRotate = (tree) => {
  const y = tree.right;
  const T2 = y.left;
  y.left = tree;
  tree.right = T2;
  update(tree);
  update(y);
  return y;
};
const rightRotate = (tree) => {
  const y = tree.left;
  const T3 = y.right;
  y.right = tree;
  tree.left = T3;
  update(tree);
  update(y);
  return y;
};
const insert = (tree, val, result, i) => {
  if (tree.val === undefined) {
    tree.val = val;
    tree.height = 1;
    tree.size = 1;
    tree.left = {height: 0, size: 0};
    tree.right = {height: 0, size: 0};
    return tree;
  } else if (val <= tree.val) {
    tree.left = insert(tree.left, val, result, i);
  } else {
    tree.right = insert(tree.right, val, result, i);
    result[i] += 1 + tree.left.size;
  }
  update(tree);

  const balance = tree.left.height - tree.right.height;
  if (balance > 1) {
    if (val > tree.left.val) tree.left = leftRotate(tree.left);
    return rightRotate(tree);
  } else if (balance < -1) {
    if (val <= tree.right.val) tree.right = rightRotate(tree.right);
    return leftRotate(tree);
  } else return tree;
};

// const draw = (tree, indent = 0) => {
//   if (tree.val === undefined) return;
//   draw(tree.right, indent + 1);
//   console.log(' '.repeat(indent * 3) + tree.val + '-' + tree.size);
//   draw(tree.left, indent + 1);
// };

const smaller = (arr) => {
  // console.log('length', arr.length);
  // console.time();
  const result = [];
  let tree = {height: 0, size: 0};
  for (let i = arr.length - 1; i >= 0; i--) {
    result[i] = 0;
    tree = insert(tree, arr[i], result, i);
  }
  // draw(tree);
  // console.timeEnd();
  return result;
};

// const input = [5, 4, 2, 7, 3, 6, 1, 5];
// const input = [...new Array(100)].map((v, i, a) => a.length - i);
const input = [...new Array(1e5)].map(() => Math.floor(Math.random() * 10) - 5);
// const input = [1, 1, 1, 1, 1, 1, 1, 1, 1];
// const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reverse();
console.time();
const result = smaller(input);
console.timeEnd();

// console.log(input);
console.log(result);
