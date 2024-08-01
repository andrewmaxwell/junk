const limit = 3e6;

const isPrime = new Array(limit).fill(1);
isPrime[0] = isPrime[1] = 0;
for (let p = 2; p * p <= limit; ++p) {
  if (!isPrime[p]) continue;
  for (let i = p * p; i <= limit; i += p) isPrime[i] = 0;
}

const rad = 1;
const spacing = 1;

let elements = '';

for (let i = 0; i < limit; i++) {
  if (!isPrime[i]) continue;
  const angle = Math.sqrt(i) * Math.PI * 2;
  const dist = spacing * Math.sqrt(i);
  const x = dist * Math.cos(angle) - rad;
  const y = dist * Math.sin(angle) - rad;
  elements += `<div title="${i.toLocaleString()}" style="transform:translate(${x}px,${y}px)"></div>`;
}

const totalRadius = spacing * Math.sqrt(limit) + 2;

document.body.innerHTML += `
<style>
  div > div {
    position: absolute;
    width: ${rad * 2}px;
    height: ${rad * 2}px;
    border-radius: ${rad}px;
    background: white;
  }
</style>
<div style="transform: translate(${totalRadius}px,${totalRadius}px)">${elements}</div>`;
