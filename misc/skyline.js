class Tree {
  constructor() {
    this.val = null;
  }
  add(x) {
    if (this.val === null) {
      this.val = {x, y: 0};
    } else if (x > this.val.x) {
      if (!this.right) this.right = new Tree();
      this.right.add(x);
    } else if (x < this.val.x) {
      if (!this.left) this.left = new Tree();
      this.left.add(x);
    }
    return this;
  }
  setRangeHeight(left, right, height) {
    if (this.val.x >= left && this.val.x < right) {
      this.val.y = Math.max(height, this.val.y);
    }
    if (left < this.val.x) this.left?.setRangeHeight(left, right, height);
    if (right > this.val.x) this.right?.setRangeHeight(left, right, height);
    return this;
  }
  toArray() {
    return [
      ...(this.left ? this.left.toArray() : []),
      [this.val.x, this.val.y],
      ...(this.right ? this.right.toArray() : []),
    ];
  }
}

const skyline = (buildings) => {
  const tree = new Tree();

  for (const [x, h, w] of buildings) {
    tree
      .add(x, h)
      .add(x + w, 0)
      .setRangeHeight(x, x + w, h);
  }

  return tree.toArray();
};

import {Test} from './test.js';

Test.assertEquals(
  skyline([
    [2, 10, 5],
    [12, 7, 5],
    [15, 12, 8],
  ]),
  [
    [2, 10],
    [7, 0],
    [12, 7],
    [17, 12],
    [23, 0],
  ]
);

Test.assertDeepEquals(
  skyline([
    [1, 5, 3],
    [4, 8, 4],
    [8, 6, 2],
    [12, 7, 3],
  ]),
  [
    [1, 5],
    [4, 8],
    [8, 6],
    [10, 0],
    [12, 7],
    [15, 0],
  ]
);
