function insert(value, node, result, index, totalSmaller) {
  if (!node) {
    result[index] = totalSmaller;
    return {duplicateCount: 1, value, sum: 0, left: 0, right: 0};
  }

  if (node.value === value) {
    node.duplicateCount++;
    result[index] = totalSmaller + node.sum;
    return node;
  }

  if (node.value > value) {
    node.sum++;
    node.left = insert(value, node.left, result, index, totalSmaller);
    return node;
  }

  node.right = insert(
    value,
    node.right,
    result,
    index,
    totalSmaller + node.duplicateCount + node.sum
  );
  return node;
}

function smaller(arr) {
  const result = [];
  let tree;
  for (let i = arr.length - 1; i >= 0; i--) {
    tree = insert(arr[i], tree, result, i, 0);
  }
  return result;
}

const {Test} = require('./test');
Test.assertSimilar(smaller([5, 4, 3, 2, 1]), [4, 3, 2, 1, 0]);
Test.assertSimilar(smaller([1, 2, 3]), [0, 0, 0]);
Test.assertSimilar(smaller([1, 2, 0]), [1, 1, 0]);
Test.assertSimilar(smaller([1, 2, 1]), [0, 1, 0]);
Test.assertSimilar(smaller([1, 1, -1, 0, 0]), [3, 3, 0, 0, 0]);
Test.assertSimilar(
  smaller([5, 4, 7, 9, 2, 4, 4, 5, 6]),
  [4, 1, 5, 5, 0, 0, 0, 0, 0]
);
