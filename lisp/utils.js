import {Test} from '../misc/test.js';

export const isLinkedList = (node) => node?.hasOwnProperty('next');

const empty = {EMPTY: true};

export const toLinkedList = (arr) => {
  if (!Array.isArray(arr)) return arr;
  let curr = empty;
  for (let i = arr.length - 1; i >= 0; i--) {
    curr = {val: arr[i], next: curr};
  }
  return curr;
};

export const fromLinkedList = (node) => {
  if (!isLinkedList(node)) return [node];
  return node.next === empty
    ? [node.val]
    : [node.val, ...fromLinkedList(node.next)];
};

const tests = [['a', 'b', 'c']];

for (const t of tests) {
  const ll = toLinkedList(t);
  const arr = fromLinkedList(ll);

  console.dir(ll, {depth: Infinity});
  Test.assertDeepEquals(arr, t);
}
