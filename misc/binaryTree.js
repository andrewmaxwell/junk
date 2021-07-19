/**
 * Okay bro, this is your birthday coding challenge!
 *
 ******************************************************************************
 *                               THE CHALLENGE
 ******************************************************************************
 *
 * In a gallaxy far far away, JavaScript was invented with all of the same
 * features that we have today except for one: it does not support mutation.
 * Your alien boss requests that you make a data-structure that can hold
 * any number of elements in a binary tree. He has given you some instructions
 * on how the tree should function as well as a blueprint for the
 * data-structure.
 *
 ******************************************************************************
 *                               INSTRUCTIONS
 ******************************************************************************
 * You must fill out the given methods in such a way as to complete all of the
 * given test cases (you can add more if you'd like). You can create helper
 * functions if you would like, just as long as there is no mutation.
 *
 * Example BinTree
 *        a
 *      b   c
 *     d e   g
 *        f
 *
 * isEmpty()
 * This method should return true if there are no remaining nodes in the
 * current sub-tree
 * if the current node is e, return false
 * if the current node is g, return true
 *
 * depth()
 * This method should return the maximum number of nodes one would need to
 * visit to get from the current node to an empty node
 * if the current node is b, return 3
 * if the current node is g, return 1
 *
 * count()
 * This method should return the number of non-empty nodes in the current
 * subtree.
 * if the current node is b, return 4
 * if the current node is g, return 1
 *
 * includes()
 * This should return true if the current subtree includes the given value.
 * if the current node is a and the param is e, return true
 * if the current node is c and the param is b, return false
 *
 * sort()
 * This method should return the sorted current subtree
 * if the current subtree consists of values [7, 4, 6, 5, 2, 3, 1] then
 * the returning tree should be
 *        7
 *     4
 *  2     6
 * 1 3  5
 *
 * add()
 * This method should add a node to the tree with respect to order
 *      5                    5
 *    3   7   -> add(4) -> 3   7
 *   2   6                2 4 6
 *
 * remove()
 * This method should remove given element from the current sub-tree
 *
 * map()
 * This method should apply a function to every node in the tree. Order
 * does not matter
 *
 * inOrder()
 * This method should apply a function to the current subtree in in-order
 * order
 *
 * postOrder()
 * This method should apply a function to the current subtree in postOrder
 * order
 *
 * preOrder()
 * This method should apply a function to the current subtree in preOrder
 * order
 */

class BinTree {
  constructor(value, left, right) {
    this.value = value;
    this.left = left;
    this.right = right;
    Object.freeze(this);
  }
  isEmpty() {
    return !this.left && !this.right;
  }
  depth() {
    return this.isEmpty()
      ? 1
      : 1 + Math.max(this.left?.depth() ?? 0, this.right?.depth() ?? 0);
  }
  count() {
    return this.isEmpty()
      ? 1
      : 1 + (this.left?.count() ?? 0) + this.right?.count();
  }
  includes(x) {
    return (
      this.value === x ||
      (this.left?.includes(x) ?? false) ||
      (this.right?.includes(x) ?? false)
    );
  }
  sort() {
    return [
      ...(this.left?.sort() ?? []),
      this.value,
      ...(this.right?.sort() ?? []),
    ];
  }

  add(x) {
    if (x < this.value) {
      return new BinTree(
        this.value,
        this.left ? this.left.add(x) : new BinTree(x),
        this.right
      );
    } else {
      return new BinTree(
        this.value,
        this.left,
        this.right ? this.right.add(x) : new BinTree(x)
      );
    }
  }
  remove(x) {
    if (this.value === x) {
      return this.left || this.right;
      // what if it has left AND right?
    } else if (x < this.value)
      return new BinTree(this.value, this.left?.remove(x), this.right);
    else return new BinTree(this.value, this.left, this.right?.remove(x));
  }
  map(fn) {
    return new BinTree(fn(this.value), this.left?.map(fn), this.right?.map(fn));
  }

  inOrder(fn) {
    this.left?.inOrder(fn);
    fn(this);
    this.right?.inOrder(fn);
    // is this supposed to return something? No example given.
  }
  postOrder(fn) {
    fn(this);
    this.left?.inOrder(fn);
    this.right?.inOrder(fn);
    // is this supposed to return something? No example given.
  }
  preOrder(fn) {
    this.left?.inOrder(fn);
    this.right?.inOrder(fn);
    fn(this);
    // is this supposed to return something? No example given.
  }
}

console.clear();
console.log('If there are no logs, then all tests passed.');

const {assert} = window.chai;
// const {assert} = require('chai');

assert.deepEqual(new BinTree(5).isEmpty(), true);

const example = new BinTree(
  'a',
  new BinTree('b', new BinTree('d'), new BinTree('e', null, new BinTree('f'))),
  new BinTree('c', null, new BinTree('g'))
);

assert.deepEqual(example.depth(), 4);
assert.deepEqual(example.left.depth(), 3);
assert.deepEqual(example.left.left.depth(), 1);

assert.deepEqual(example.count(), 7);
assert.deepEqual(example.left.count(), 4);

assert.deepEqual(example.left.includes('e'), true);
assert.deepEqual(example.left.includes('g'), false);
assert.deepEqual(example.right.includes('c'), true);
assert.deepEqual(example.right.includes('a'), false);

const example2 = new BinTree(
  7,
  new BinTree(
    4,
    new BinTree(2, new BinTree(1), new BinTree(3)),
    new BinTree(6, new BinTree(5))
  )
);
assert.deepEqual(example2.sort(), [1, 2, 3, 4, 5, 6, 7]);
assert.deepEqual(example2.left.sort(), [1, 2, 3, 4, 5, 6]);

const added = new BinTree(5).add(9).add(8);
assert.deepEqual(added.left, undefined);
assert.deepEqual(added.right, new BinTree(9, new BinTree(8)));

assert.deepEqual(added.remove(8), new BinTree(5, undefined, new BinTree(9)));

assert.deepEqual(added.remove(9), new BinTree(5, undefined, new BinTree(8)));

assert.deepEqual(example2.map((x) => x * 2).sort(), [2, 4, 6, 8, 10, 12, 14]);
