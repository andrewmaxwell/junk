function frequencies(s) {
  const counts = {};
  for (const t of s) counts[t] = (counts[t] || 0) + 1;
  return Object.entries(counts);
}

const buildTree = (freqs) => {
  freqs = freqs.map(([node, freq]) => ({node, freq}));
  while (freqs.length > 1) {
    freqs.sort((a, b) => b.freq - a.freq);
    const a = freqs.pop();
    const b = freqs.pop();
    freqs.push({node: [a.node, b.node], freq: a.freq + b.freq});
  }
  return freqs[0].node;
};

const getCodes = (tree, code = '') =>
  Array.isArray(tree)
    ? {...getCodes(tree[0], code + '0'), ...getCodes(tree[1], code + '1')}
    : {[tree]: code};

function encode(freqs, s) {
  if (freqs.length <= 1) return null;
  const codes = getCodes(buildTree(freqs));
  return [...s].map((t) => codes[t]).join('');
}

function decode(freqs, bits) {
  if (freqs.length <= 1) return null;
  const tree = buildTree(freqs);
  let subTree = tree;
  let result = '';
  for (const b of bits) {
    subTree = subTree[b];
    if (!Array.isArray(subTree)) {
      result += subTree;
      subTree = tree;
    }
  }
  return result;
}

import {Test} from './test.js';

const s = 'aaaabcc';
const fs = frequencies(s);
Test.assertDeepEquals([...fs].sort(), [
  ['a', 4],
  ['b', 1],
  ['c', 2],
]);
Test.assertDeepEquals(encode(fs, s).length, 10);
Test.assertDeepEquals(encode(fs, ''), '');
Test.assertDeepEquals(decode(fs, ''), '');

Test.assertDeepEquals(encode([], ''), null);
Test.assertDeepEquals(decode([], ''), null);
Test.assertDeepEquals(encode([['a', 1]], ''), null);
Test.assertDeepEquals(decode([['a', 1]], ''), null);
