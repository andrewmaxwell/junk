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
    const {heap, compare} = this;
    heap.push(value);
    let i = heap.length - 1;
    while (i > 0 && compare(heap[i], heap[parent(i)])) {
      swap(heap, i, parent(i));
      i = parent(i);
    }
  }
  pop() {
    const {heap, compare} = this;
    const poppedValue = heap[0];
    const bottom = heap.length - 1;
    if (bottom > 0) swap(heap, 0, bottom);
    heap.pop();
    let i = 0;
    while (
      (left(i) < heap.length && compare(heap[left(i)], heap[i])) ||
      (right(i) < heap.length && compare(heap[right(i)], heap[i]))
    ) {
      const maxChild =
        right(i) < heap.length && compare(heap[right(i)], heap[left(i)])
          ? right(i)
          : left(i);
      swap(heap, i, maxChild);
      i = maxChild;
    }
    return poppedValue;
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
