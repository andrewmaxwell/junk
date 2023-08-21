import {color, makeRenderer} from '../sand/makeRenderer.js';

const maxLength = Math.SQRT2;
const getCoords = (a) => {
  a *= 4;
  if (a < 1) return {x: a, y: 0};
  if (a < 2) return {x: 1, y: a - 1};
  if (a < 3) return {x: 3 - a, y: 1};
  return {x: 0, y: 4 - a};
};

// const maxLength = 2;
// const getCoords = (a) => {
//   a *= 2 * Math.PI;
//   return {x: Math.cos(a), y: Math.sin(a)};
// };

const getLength = (a, b) => {
  const ac = getCoords(a);
  const bc = getCoords(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
};

const gradient = (colors) => (val) => {
  for (let i = 1; i < colors.length; i++) {
    const prev = colors[i - 1];
    const curr = colors[i];
    if (val > curr.val) continue;
    const m = (val - prev.val) / (curr.val - prev.val);
    return color(
      prev.color[0] * (1 - m) + curr.color[0] * m,
      prev.color[1] * (1 - m) + curr.color[1] * m,
      prev.color[2] * (1 - m) + curr.color[2] * m
    );
  }

  return color(0, 255, 0);
};

const size = innerHeight;

const data = [];
for (let i = 0; i < size; i++) {
  for (let j = 0; j < size; j++) {
    data[i * size + j] = getLength(i / size, j / size);
  }
}

makeRenderer(
  document.querySelector('canvas'),
  size,
  size,
  gradient([
    {val: 0, color: [0, 0, 0]},
    {val: 1, color: [0, 0, 255]},
    {val: maxLength, color: [255, 255, 255]},
  ])
)(data);
