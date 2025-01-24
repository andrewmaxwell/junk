import {makeHistogram} from './makeHistogram.js';

const randomWalk = () => {
  let x = 0;
  let y = 0;
  let dir = 0;
  let steps = 0;
  do {
    steps++;
    dir = (dir + Math.floor(Math.random() * 3) + 3) % 4;
    // dir = (dir + Math.floor(Math.random() * 2) * 2 + 3) % 4;
    x += [1, 0, -1, 0][dir];
    y += [0, 1, 0, -1][dir];
  } while ((x || y) && steps < 1e7);

  return steps;
};

console.log(makeHistogram(Array.from({length: 1e3}, randomWalk)));
