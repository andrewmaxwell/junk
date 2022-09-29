import {shuffle} from '../carcassonne/utils.js';

const getSortCount = (length) => {
  let count = 0;

  const numbers = shuffle([...Array(length).keys()]);

  const comparitor = (a, b) => {
    count++;
    return b - a;
  };

  numbers.sort(comparitor);
  return count;
};

// for (let i = 1; i <= 1e6; i = Math.round(i * 1.1 + 1)) {
//   const x = getSortCount(i);
//   console.log(i, x, x / i);
// }

console.log(getSortCount(14000));
