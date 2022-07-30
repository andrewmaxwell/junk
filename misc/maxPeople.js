const yearMaxPeople = (arr) => {
  const sorted = [];
  for (const [a, b] of arr) {
    sorted.push({year: a, num: 1}, {year: b, num: -1});
  }
  sorted.sort((a, b) => a.year - b.year || b.num - a.num);

  let current = 0;
  let max = 0;
  let maxYear;
  for (const {year, num} of sorted) {
    current += num;
    if (current > max) {
      max = current;
      maxYear = year;
    }
  }
  return [max, maxYear];
};

import {Test} from './test.js';

Test.assertSimilar(
  yearMaxPeople([
    [1980, 2010],
    [1979, 1985],
    [1986, 1995],
    [1987, 2008],
  ]),
  [3, 1987]
);
Test.assertSimilar(
  yearMaxPeople([
    [1980, 2010],
    [1979, 1986],
    [1986, 1995],
    [1987, 2008],
  ]),
  [3, 1986]
);
Test.assertSimilar(
  yearMaxPeople([
    [1980, 2010],
    [-199, -186],
    [1979, 1986],
    [-201, -157],
    [-170, -138],
  ]),
  [2, -199]
);
Test.assertSimilar(
  yearMaxPeople([
    [1980, 2010],
    [-199, -166],
    [1979, 1986],
    [-201, -157],
    [-170, -138],
  ]),
  [3, -170]
);
Test.assertSimilar(
  yearMaxPeople([
    [1988, 2013],
    [1987, 1995],
    [1980, 2010],
    [-199, -166],
    [1986, 1995],
    [1979, 1986],
    [-201, -157],
    [-170, -138],
    [1968, 1999],
  ]),
  [5, 1988]
);
