import {PriorityQueue} from './PriorityQueue.js';

const runningMedian = (a) => {
  const firstHalf = new PriorityQueue((a, b) => b < a); // max heap
  const secondHalf = new PriorityQueue((a, b) => a < b); // min heap
  let prevMedian;
  return a.map((n) => {
    if (prevMedian === undefined || n < prevMedian) {
      firstHalf.push(n);
    } else {
      secondHalf.push(n);
    }

    if (firstHalf.size() > secondHalf.size()) {
      secondHalf.push(firstHalf.pop());
    } else if (secondHalf.size() > firstHalf.size()) {
      firstHalf.push(secondHalf.pop());
    }

    const len1 = firstHalf.size();
    const len2 = secondHalf.size();
    prevMedian =
      len1 === len2
        ? firstHalf.peak() / 2 + secondHalf.peak() / 2
        : len1 > len2
        ? firstHalf.peak()
        : secondHalf.peak();
    return prevMedian;
  });
};

// const runningMedian = (arr) => {
//   const numbers = [];
//   return arr.map((n, i) => {
//     numbers.push(n);
//     numbers.sort((a, b) => a - b);
//     return i % 2
//       ? numbers[(i - 1) / 2] / 2 + numbers[(i + 1) / 2] / 2
//       : numbers[i / 2];
//   });
// };

import {Test} from './test.js';

Test.assertDeepEquals(
  runningMedian([12, 4, 5, 3, 8, 7]),
  [12, 8, 5, 4.5, 5, 6]
);
