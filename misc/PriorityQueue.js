const parent = (i) => ((i + 1) >>> 1) - 1;
const left = (i) => (i << 1) + 1;
const right = (i) => (i + 1) << 1;

export class PriorityQueue {
  constructor(compareFunc) {
    this.compareFunc = compareFunc;
    this.heap = [];
  }
  peak() {
    return this.heap[0];
  }
  size() {
    return this.heap.length;
  }
  push(value) {
    this.heap.push(value);
    this.#siftUp(this.size() - 1);
    return this;
  }
  pop() {
    const poppedValue = this.peak();
    if (this.size()) this.#swap(0, this.size() - 1);
    this.heap.pop();
    this.#siftDown(0);
    return poppedValue;
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
  #swap(i, j) {
    const t = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = t;
  }
  #compare(i, j) {
    return this.compareFunc(this.heap[i], this.heap[j]);
  }
  #siftUp(i) {
    while (i > 0 && this.#compare(i, parent(i))) {
      this.#swap(i, parent(i));
      i = parent(i);
    }
    return i;
  }
  #siftDown(i) {
    while (
      (left(i) < this.size() && this.#compare(left(i), i)) ||
      (right(i) < this.size() && this.#compare(right(i), i))
    ) {
      const maxChild =
        right(i) < this.size() && this.#compare(right(i), left(i))
          ? right(i)
          : left(i);
      this.#swap(i, maxChild);
      i = maxChild;
    }
    return i;
  }
}

// import {Test} from './test.js';

// const shuffled = Array.from({length: 1000}, Math.random);
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
