const pointsNumber = (radius) => {
  let count = 1;
  for (let i = 0; i <= radius; i++) {
    count += 4 * Math.floor(Math.sqrt(radius * radius - i * i));
  }
  return count;
};

import {Test} from './test.js';
Test.assertEquals(pointsNumber(1), 5);
Test.assertEquals(pointsNumber(2), 13);
Test.assertEquals(pointsNumber(3), 29);
Test.assertEquals(pointsNumber(5), 81);
Test.assertEquals(pointsNumber(1000), 3141549);
