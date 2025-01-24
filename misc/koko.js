const minEatingSpeed = (piles, hours) => {
  let minTime = 1;
  let maxTime = Math.max(...piles);

  while (minTime <= maxTime) {
    const mid = Math.floor(maxTime / 2 + minTime / 2);

    let time = 0;
    for (const p of piles) time += Math.ceil(p / mid);

    if (time <= hours) maxTime = mid - 1;
    else minTime = mid + 1;
  }

  return minTime;
};

import {Test} from './test.js';
Test.assertEquals(minEatingSpeed([3, 6, 7, 11], 8), 4);
Test.assertEquals(minEatingSpeed([30, 11, 23, 4, 20], 5), 30);
Test.assertEquals(minEatingSpeed([30, 11, 23, 4, 20], 6), 23);
