const addToBox = (s, box) => {
  if (s <= 'Z') {
    for (let i = 0; i < box.length - 1; i++) {
      for (let j = 0; j < box[i].length - 1; j++) {
        if (
          box[i][j] === '#' &&
          box[i + 1][j] === '#' &&
          box[i][j + 1] === '#' &&
          box[i + 1][j + 1] === '#'
        ) {
          box[i][j] = box[i + 1][j] = box[i][j + 1] = box[i + 1][j + 1] = s;
          return true;
        }
      }
    }
  } else {
    for (let i = 0; i < box.length; i++) {
      for (let j = 0; j < box[i].length; j++) {
        if (box[i][j] === '#') {
          box[i][j] = s;
          return true;
        }
      }
    }
  }
  return false;
};

const pack = (box, string) => {
  box = box.split('\n').map((r) => [...r]);
  const leftOvers = [];
  for (const s of string) {
    if (!addToBox(s, box)) leftOvers.push(s);
  }
  return leftOvers.join(', ') || box.map((r) => r.join(' ')).join('\n');
};

import {Test} from './test.js';
const box8 = '####\n####\n####\n####';
console.log(pack('#', 'a'), 'a');
Test.assertEquals(pack('#', 'a'), 'a');
console.log(pack(box8, 'ABC'));
Test.assertEquals(pack(box8, 'ABC'), 'A A B B\nA A B B\nC C # #\nC C # #');
console.log(pack(box8, 'abcdefghijklmnop'));
Test.assertEquals(
  pack(box8, 'abcdefghijklmnop'),
  'a b c d\ne f g h\ni j k l\nm n o p'
);
console.log(pack(box8, 'abcdeFghijklm'));
Test.assertEquals(
  pack(box8, 'abcdeFghijklm'),
  'a b c d\ne F F g\nh F F i\nj k l m'
);
