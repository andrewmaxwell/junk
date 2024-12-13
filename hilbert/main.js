import {getPrimes} from '../misc/getPrimes.js';

const nextSteps = [
  (v) => [v[1], v[0]],
  (v, l) => [v[0], v[1] + l],
  (v, l) => [v[0] + l, v[1] + l],
  (v, l) => [2 * l - 1 - v[1], l - 1 - v[0]],
];

const hilbert = (index, pow) => {
  let pos = [0, 0];
  for (let i = 0; i < pow; i++) {
    pos = nextSteps[(index >> (2 * i)) & 3](pos, 2 ** i);
  }
  return pos;
};

const pow = 6;
const scale = 16;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

canvas.width = canvas.height = scale * 2 ** pow;

const primes = getPrimes(4 ** pow);

ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = 'white';
ctx.strokeStyle = 'gray';
ctx.beginPath();
for (const p of primes) {
  const [x, y] = hilbert(p, pow);
  // ctx.fillRect(x * scale, y * scale, scale, scale);
  ctx.lineTo((x + 0.5) * scale, (y + 0.5) * scale);
  ctx.fillText(p, (x + 0.5) * scale, (y + 0.5) * scale);
}
ctx.stroke();
