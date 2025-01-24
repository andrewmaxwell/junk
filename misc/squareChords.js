import {makeHistogram} from './makeHistogram.js';

const getCoords = () => {
  const a = Math.random() * 4;
  if (a < 1) return {x: a, y: 0};
  if (a < 2) return {x: 1, y: a - 1};
  if (a < 3) return {x: 3 - a, y: 1};
  return {x: 0, y: 4 - a};
};

const getLength = () => {
  const a = getCoords();
  const b = getCoords();
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const vals = [];
for (let i = 0; i < 1e7; i++) vals[i] = getLength();

console.log(makeHistogram(vals));

// const total = 1e7;
// let count = 0;
// for (let i = 0; i < total; i++) count += getLength() < 1;
// console.log(count, count / total);
