/** @template T */
export class PriorityQueue {
  /** @param {(a:T, b:T)=>boolean} [cmp]  true ⇢ a has *higher* priority than b */
  constructor(cmp = (a, b) => a < b) {
    this.#cmp = cmp;
    this.#heap = [];
    this.#index = new Map(); // item → current index
    Object.freeze(this); // make helper props read‑only
  }

  // ───────────────── public API ──────────────────
  size() {
    return this.#heap.length;
  }
  peek() {
    return this.#heap[0];
  }
  clear() {
    this.#heap.length = 0;
    this.#index.clear();
  }

  /** @param {T} value */
  push(value) {
    const i = this.#heap.length;
    this.#heap.push(value);
    this.#index.set(value, i);
    this.#siftUp(i);
    return this;
  }

  pop() {
    if (!this.#heap.length) return;
    const top = this.#heap[0];
    const last = this.#heap.pop(); // remove tail
    this.#index.delete(top);

    if (this.#heap.length) {
      // move tail to root, then fix
      this.#heap[0] = last;
      this.#index.set(last, 0);
      this.#siftDown(0);
    }
    return top;
  }

  /** Tell the queue the priority of *value* has changed. */
  /** @param {T} value */
  updatePosition(value) {
    const i = this.#index.get(value);
    if (i === undefined) throw new Error('Item not found in PQ');
    if (!this.#siftUp(i)) this.#siftDown(i);
    return this;
  }

  // ──────────────── private helpers ───────────────
  /** @type {T[]} */ #heap;
  /** @type {Map<T,number>} */ #index;
  /** @type {(a:T,b:T)=>boolean} */ #cmp;

  /** @param {number} i */
  #parent(i) {
    return (i - 1) >>> 1;
  }
  /** @param {number} i */
  #left(i) {
    return (i << 1) + 1;
  }

  /** @param {number} i, @param {number} j */
  #swap(i, j) {
    const h = this.#heap,
      idx = this.#index;
    [h[i], h[j]] = [h[j], h[i]];
    idx.set(h[i], i);
    idx.set(h[j], j);
  }

  /** @param {number} i */
  #siftUp(i) {
    let moved = false;
    while (i > 0) {
      const p = this.#parent(i);
      if (!this.#cmp(this.#heap[i], this.#heap[p])) break;
      this.#swap(i, p);
      i = p;
      moved = true;
    }
    return moved;
  }

  /** @param {number} i */
  #siftDown(i) {
    const n = this.#heap.length;
    while (true) {
      const l = this.#left(i);
      const r = l + 1; // right child
      let best = i;

      if (l < n && this.#cmp(this.#heap[l], this.#heap[best])) best = l;
      if (r < n && this.#cmp(this.#heap[r], this.#heap[best])) best = r;
      if (best === i) break;

      this.#swap(i, best);
      i = best;
    }
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
//   shuffled.sort((a, b) => a - b),
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
//   ['e', 'b', 'a', 'd', 'c'],
// );
