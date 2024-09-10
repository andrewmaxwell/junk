import {getPrimes} from '../misc/getPrimes.js';
import {viewer} from './viewer.js';

const obs = getPrimes(2 ** 16).map((p) => {
  const angle = Math.sqrt(p) * Math.PI * 2;
  const dist = Math.sqrt(p);
  const x = dist * Math.cos(angle);
  const y = dist * Math.sin(angle);
  return {p, x, y};
});

viewer((ctx, camera) => {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '0.25px sans-serif';

  ctx.fillStyle = 'gray';
  ctx.beginPath();
  for (const {x, y} of obs) {
    if (!camera.isVisible(x, y)) continue;
    ctx.moveTo(x + 1, y);
    ctx.arc(x, y, 1, 0, 2 * Math.PI);
  }
  ctx.fill();

  if (camera.zoom > 10) {
    ctx.fillStyle = 'white';
    for (const {x, y, p} of obs) {
      if (!camera.isVisible(x, y)) continue;
      ctx.fillText(p.toLocaleString(), x, y);
    }
  }
});
