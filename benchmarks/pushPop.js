import {benchmark} from './benchmark.js';

const array = (num) => {
  const arr = [];
  for (let i = 0; i < num; i++) {
    arr.push(i);
  }

  let sum = 0;
  while (arr.length) {
    sum += arr.pop();
  }
  return sum;
};

class Stack {
  #head = null;
  push(val) {
    this.#head = {val, tail: this.#head};
  }
  isEmpty() {
    return this.#head === null;
  }
  pop() {
    if (this.isEmpty()) return;
    const val = this.#head.val;
    this.#head = this.#head.tail;
    return val;
  }
}
const stack = (num) => {
  const stack = new Stack();
  for (let i = 0; i < num; i++) {
    stack.push(i);
  }

  let sum = 0;
  while (!stack.isEmpty()) {
    sum += stack.pop();
  }
  return sum;
};

const noStorage = (num) => {
  let sum = 0;
  for (let i = 0; i < num; i++) {
    sum += i;
  }
  return sum;
};

const fast = (num) => (num * (num - 1)) / 2;

benchmark({array, stack, noStorage, fast}, [[10], [100], [1000], [1e4], [1e5]]);

// console.log(stack(100));
