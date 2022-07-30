// const _bft = (acc, index = 0) =>
//   acc[index]
//     ? _bft(
//         [
//           ...acc,
//           ...(acc[index].left ? [acc[index].left] : []),
//           ...(acc[index].right ? [acc[index].right] : []),
//         ],
//         index + 1
//       )
//     : acc;

// const bft = (tree) => _bft([tree]);

// const levelOrder = (tree) => bft(tree).map((q) => q.value);

class FIFO {
  push(value) {
    this.last = {value, prev: this.last};
    if (!this.first) this.first = this.last;
    if (this.last.prev) this.last.prev.next = this.last;
  }
  pop() {
    const result = this.first;
    this.first = this.first?.next;
    delete this.first?.prev;
    return result;
  }
  isEmpty() {
    return this.first !== undefined;
  }
}

const levelOrder = (tree) => {
  const result = [];
  const nodes = new FIFO();
  nodes.push(tree);
  while (!nodes.isEmpty()) {
    const {value, left, right} = nodes.pop();
    if (left) nodes.push(left);
    if (right) nodes.push(right);
    result.push(value);
  }
  return result;
};

import {Test} from './test.js';

const tree = {
  value: 1,
  right: {
    value: 2,
    right: {
      value: 5,
      left: {value: 3, right: {value: 4}},
      right: {value: 6},
    },
  },
};

Test.assertDeepEquals(levelOrder(tree), [1, 2, 5, 3, 6, 4]);
