class Trie {
  constructor() {
    this.data = {count: 0};
  }
  add(str) {
    let current = this.data;
    current.count++;
    for (const t of str) {
      current[t] = current[t] || {count: 0};
      current = current[t];
      current.count++;
    }
  }
  find(str) {
    let current = this.data;
    for (const t of str) {
      if (!current[t]) return 0;
      current = current[t];
    }
    return current.count;
  }
}

const contacts = (input) => {
  const names = new Trie();
  const result = [];

  for (const line of input.split('\n')) {
    const [command, text] = line.split(' ');
    if (command === 'add') names.add(text);
    else if (command === 'find') result.push(names.find(text));
  }
  return result;
};

import {Test} from './test.js';

Test.assertDeepEquals(
  contacts(`add ed
add eddie
add edward
find ed
add edwina
find edw
find a`),
  [3, 2, 0]
);
