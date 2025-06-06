import {viewer} from '../primeSpiral/viewer.js';
import {convexIntersection, poly} from './helpers.js';

const A = poly(0, 0, 300, 5);
const B = poly(-800, 0, 300, 6);

viewer((ctx) => {
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.strokeStyle = 'white';
  for (const s of [A, B]) {
    ctx.beginPath();
    s.forEach((p, i) => {
      ctx.lineTo(p.x, p.y);
      ctx.fillText(i.toString(), p.x, p.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = 'red';
  ctx.beginPath();
  for (const p of convexIntersection(A, B)) {
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.stroke();

  for (const p of B) {
    p.x++;
  }
});
