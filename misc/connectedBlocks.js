const solution = (input) => {
  const nums = input.split(',').reduce((res, c) => {
    if (/^\d\d$/.test(c)) res[Number(c)] = true;
    return res;
  }, {});
  let maxSize = 0;
  for (let i = 0; i < 100; i++) {
    if (!nums[i]) continue;
    delete nums[i];
    const q = [i];
    for (const v of q) {
      for (const n of [
        v % 10 !== 0 && v - 1,
        v % 10 !== 9 && v + 1,
        v > 9 && v - 10,
        v < 90 && v + 10,
      ]) {
        if (n !== false && nums[n]) {
          delete nums[n];
          q.push(n);
        }
      }
    }
    maxSize = Math.max(maxSize, q.length);
  }
  return maxSize;
};

import {Test} from './test';
Test.assertEquals(
  solution('18,00,95,40,36,26,57,48,54,65,76,87,97,47,00'),
  3,
  'one repeated cell'
);
Test.assertEquals(
  solution('18,00,95,40,36,26,57,48,54,65,76,87,97,47,00,46'),
  6,
  'bigger area'
);
Test.assertEquals(
  solution('18,00,01,02,95,40,36,26,57,48,54,65,76,87,97,47,00'),
  3,
  'multiple maximums'
);
Test.assertEquals(solution('18'), 1, 'single cell');
Test.assertEquals(solution(''), 0, 'no cells');
Test.assertEquals(solution('1,a1,-10,100'), 0, 'no valid cells');
Test.assertEquals(
  solution('18,00,95,40,36,26,57,48,54,65,76,87,97,47,00,98,910,911,912,92,93'),
  3,
  'with invalid cells'
);
Test.assertEquals(
  solution(
    '38,65,45,94,95,51,25,33,59,61,80,51,38,56,62,30,48,41,00,51,47,43,07,48,10,53,96,43,74,80,30,20,63,01,09,87,46,37,27,65,80,80'
  ),
  8
);
