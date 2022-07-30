const parent = (i) => ((i + 1) >>> 1) - 1;
const left = (i) => (i << 1) + 1;
const right = (i) => (i + 1) << 1;
const swap = (arr, i, j) => {
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
};

export class PriorityQueue {
  constructor(compare) {
    this.compare = compare;
    this.heap = [];
  }
  size() {
    return this.heap.length;
  }
  push(value) {
    this.heap.push(value);
    let i = this.heap.length - 1;
    while (i > 0 && this.compare(this.heap[i], this.heap[parent(i)])) {
      swap(this.heap, i, parent(i));
      i = parent(i);
    }
  }
  pop() {
    const poppedValue = this.heap[0];
    const bottom = this.heap.length - 1;
    if (bottom > 0) swap(this.heap, 0, bottom);
    this.heap.pop();
    let i = 0;
    while (
      (left(i) < this.heap.length &&
        this.compare(this.heap[left(i)], this.heap[i])) ||
      (right(i) < this.heap.length &&
        this.compare(this.heap[right(i)], this.heap[i]))
    ) {
      const maxChild =
        right(i) < this.heap.length &&
        this.compare(this.heap[right(i)], this.heap[left(i)])
          ? right(i)
          : left(i);
      swap(this.heap, i, maxChild);
      i = maxChild;
    }
    return poppedValue;
  }
  peak() {
    return this.heap[0];
  }
}

// import {Test} from './test.js';

// const shuffled = [9, 4, 5, 2, 8, 1, 0, 3, 7, 6];
// const h = new PriorityQueue((a, b) => a < b);
// for (const x of shuffled) h.push(x);

// const sorted = [];
// while (h.size()) sorted.push(h.pop());

// Test.assertDeepEquals(
//   sorted,
//   shuffled.sort((a, b) => a - b)
// );
