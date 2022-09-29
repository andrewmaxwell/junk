const findDuplicate = (paths) => {
  const ob = {};
  for (const p of paths) {
    const [prefix, ...files] = p.split(' ');
    for (const f of files) {
      const [fileName, data] = f.split(/[()]/);
      (ob[data] = ob[data] || []).push(prefix + '/' + fileName);
    }
  }
  return Object.values(ob).filter((arr) => arr.length > 1);
};

import {Test} from './test.js';
Test.assertDeepEquals(
  findDuplicate([
    'root/a 1.txt(abcd) 2.txt(efgh)',
    'root/c 3.txt(abcd)',
    'root/c/d 4.txt(efgh)',
    'root 4.txt(efgh)',
  ]),
  [
    ['root/a/1.txt', 'root/c/3.txt'],
    ['root/a/2.txt', 'root/c/d/4.txt', 'root/4.txt'],
  ]
);
