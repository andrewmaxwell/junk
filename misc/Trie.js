export class Trie {
  constructor() {
    this.trie = {};
  }
  add(arr) {
    let c = this.trie;
    for (const el of arr) {
      c = c[el] = c[el] || {};
    }
    if (c.$$) return false;
    return (c.$$ = true);
  }
  has(arr) {
    let c = this.trie;
    for (const el of arr) {
      if (!(c = c[el])) return false;
    }
    return !!c.$$;
  }
}

// import {Test} from './test.js';
// const t = new Trie();
// Test.assertDeepEquals(t.add('abc'), true);
// Test.assertDeepEquals(t.add('abc'), false);
// Test.assertDeepEquals(t.add('abd'), true);
// Test.assertDeepEquals(t.has('abc'), true);
// Test.assertDeepEquals(t.has('ab'), false);
// Test.assertDeepEquals(t.add('ab'), true);
// Test.assertDeepEquals(t.has('ab'), true);
// Test.assertDeepEquals(t.trie, {
//   a: {b: {$$: true, c: {$$: true}, d: {$$: true}}},
// });
