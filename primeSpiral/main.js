const limit = 3e6;

const isPrime = new Array(limit).fill(1);
isPrime[0] = isPrime[1] = 0;
for (let p = 2; p * p <= limit; ++p) {
  if (!isPrime[p]) continue;
  for (let i = p * p; i <= limit; i += p) isPrime[i] = 0;
}

const rad = 1;
const spacing = 1;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const totalRad = spacing * Math.sqrt(limit) + 2;
canvas.width = canvas.height = 2 * totalRad;
ctx.fillStyle = 'white';

for (let i = 0; i < limit; i++) {
  if (!isPrime[i]) continue;
  const angle = Math.sqrt(i) * Math.PI * 2;
  const dist = spacing * Math.sqrt(i);
  const x = dist * Math.cos(angle) - rad + totalRad;
  const y = dist * Math.sin(angle) - rad + totalRad;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, 2 * Math.PI);
  ctx.fill();
}
