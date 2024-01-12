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
    const {heap} = this;
    heap.push(value);
    this.#siftUp(heap.length - 1);
    return this;
  }
  pop() {
    const {heap} = this;
    const poppedValue = heap[0];
    if (heap.length > 1) swap(heap, 0, heap.length - 1);
    heap.pop();
    this.#siftDown(0);
    return poppedValue;
  }
  peak() {
    return this.heap[0];
  }
  updatePosition(value) {
    const index = this.heap.indexOf(value);
    if (index === -1) {
      throw new Error(`Item not found: ${JSON.stringify(value)}`);
    }
    const newIndex = this.#siftUp(index);
    if (index === newIndex) this.#siftDown(index);
    return this;
  }
  #siftUp(i) {
    const {heap, compare} = this;
    while (i > 0 && compare(heap[i], heap[parent(i)])) {
      swap(heap, i, parent(i));
      i = parent(i);
    }
    return i;
  }
  #siftDown(i) {
    const {heap, compare} = this;
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
    return i;
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

// /////
// const vals = {a: 4, b: 2, c: 6, d: 1, e: 3};
// const q = new PriorityQueue((a, b) => vals[a] < vals[b]);
// q.push('a').push('b').push('c').push('d').push('e');

// vals.d = 5;
// q.updatePosition('d');

// vals.e = 0;
// q.updatePosition('e');

// Test.assertDeepEquals(
//   [q.pop(), q.pop(), q.pop(), q.pop(), q.pop()],
//   ['e', 'b', 'a', 'd', 'c']
// );
