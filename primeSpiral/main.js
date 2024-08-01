import {sieve} from '../misc/sieve.js';

const limit = 2 ** 20;
const totalRad = Math.sqrt(limit);

const canvas = document.querySelector('canvas');
canvas.width = canvas.height = 2 * totalRad;

const ctx = canvas.getContext('2d');
ctx.translate(totalRad, totalRad);
ctx.fillStyle = 'white';

for (const p of sieve(limit)) {
  const angle = Math.sqrt(p) * Math.PI * 2;
  const dist = Math.sqrt(p);
  const x = dist * Math.cos(angle);
  const y = dist * Math.sin(angle);
  ctx.fillRect(x, y, 1, 1);
}
