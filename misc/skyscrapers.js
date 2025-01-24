// https://www.codewars.com/kata/5671d975d81d6c1c87000022/train/javascript

const SIZE = 4;

const isValid = (arr, clue) => {
  if (!clue) return true;

  if (clue === 1) {
    return !arr[0] || arr[0] === SIZE;
  }
  if (clue === SIZE) {
    return arr.every((v, i) => !v || v === i + 1);
  }

  // if clue is 2, index of biggest number must be > 1

  // if clue is 3, index of biggest number must be > 2, index of second biggest number must be > 1
};

const split = (arr) => {
  const result = [];
  for (let i = 0; i < arr.length; i += SIZE) {
    result.push(arr.slice(i, i + SIZE));
  }
  return result;
};

const solvePuzzle = (clues) => {
  const queue = [new Array(SIZE ** 2).fill(0)];
  while (queue.length) {
    const current = queue.pop(); // DFS
    const index = current.indexOf(0);
    if (index === -1) return split(current);

    const rowIndex = Math.floor(index / SIZE);
    const colIndex = index % SIZE;
    const top = clues[colIndex];
    const right = clues[SIZE + rowIndex];
    const bottom = clues[SIZE ** 2 - colIndex - 5];
    const left = clues[SIZE ** 2 - rowIndex - 1];

    const colVals = [];
    const rowVals = [];
    for (let j = 0; j < SIZE; j++) {
      colVals[j] = current[j * SIZE + colIndex];
      rowVals[j] = current[rowIndex * SIZE + j];
    }

    for (let i = SIZE; i > 0; i--) {
      if (colVals.includes(i) || rowVals.includes(i)) continue;

      const rowCopy = [...rowVals];
      rowCopy[rowIndex] = i;
      if (!isValid(rowCopy, left) || !isValid(rowCopy.reverse(), right))
        continue;

      const colCopy = [...colVals];
      colCopy[colIndex] = i;
      if (!isValid(colCopy, top) || !isValid(colCopy.reverse(), bottom))
        continue;

      const copy = [...current];
      copy[index] = i;
      queue.push(copy);
    }
  }
};

import {it, Test} from './test.js';
it('can solve 4x4 puzzle 1', function () {
  var clues = [2, 2, 1, 3, 2, 2, 3, 1, 1, 2, 2, 3, 3, 2, 1, 3];
  var expected = [
    [1, 3, 4, 2],
    [4, 2, 1, 3],
    [3, 4, 2, 1],
    [2, 1, 3, 4],
  ];
  var actual = solvePuzzle(clues);
  Test.assertDeepEquals(expected, actual);
});
it('can solve 4x4 puzzle 2', function () {
  var clues = [0, 0, 1, 2, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0];
  var expected = [
    [2, 1, 4, 3],
    [3, 4, 1, 2],
    [4, 2, 3, 1],
    [1, 3, 2, 4],
  ];
  var actual = solvePuzzle(clues);
  Test.assertDeepEquals(expected, actual);
});
