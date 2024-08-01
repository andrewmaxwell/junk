import {sieve} from '../misc/sieve.js';

const limit = 3e6;

const isPrime = sieve(limit);

const rad = 1;
const spacing = 1;
const totalRad = spacing * Math.sqrt(limit) + 2;

const canvas = document.querySelector('canvas');
canvas.width = canvas.height = 2 * totalRad;

const ctx = canvas.getContext('2d');
ctx.translate(totalRad, totalRad);
ctx.fillStyle = 'white';

for (let i = 0; i < limit; i++) {
  if (!isPrime[i]) continue;
  const angle = Math.sqrt(i) * Math.PI * 2;
  const dist = spacing * Math.sqrt(i);
  const x = dist * Math.cos(angle);
  const y = dist * Math.sin(angle);
  ctx.fillRect(x, y, rad, rad);
}
