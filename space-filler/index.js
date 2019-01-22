import {Grid} from './Grid.js';

const scale = 2;
const speed = 100;
const tries = 100;
const mult = 0.0001; // size of circles
const hueStart = 0;
const hueSpeed = 1 / 100;

const C = document.querySelector('canvas');
const T = C.getContext('2d');

let W, H, grid, q;

const reset = () => {
  W = C.width = innerWidth;
  H = C.height = innerHeight;
  grid = new Grid(scale, W, H);
  q = [{x: 0, y: 0, d: 0}];
};

const getNext = c => {
  for (var i = 0; i < tries; i++) {
    // var a = 2 * Math.random() * Math.PI;
    var a = c.d * c.d * mult + (i / tries) * Math.PI * 2;
    var x = c.x + scale * Math.cos(a);
    var y = c.y + scale * Math.sin(a);
    if (x >= 0 && x < W && y >= 0 && y < H) {
      var neighbors = grid.getNeighbors(x, y);
      if (neighbors.every(n => Math.hypot(n.x - x, n.y - y) >= scale)) {
        return {x, y, d: c.d + 1};
      }
    }
  }
};

const loop = () => {
  if (q.length) requestAnimationFrame(loop);
  for (var i = 0; i < speed && q.length; i++) {
    const c = q[q.length - 1];
    var n = getNext(c);
    if (n) {
      grid.add(n);
      q.push(n);
      T.strokeStyle = `hsl(${hueStart + n.d * hueSpeed},50%,50%)`;
      T.beginPath();
      T.moveTo(c.x, c.y);
      T.lineTo(n.x, n.y);
      T.stroke();
    } else q.pop();
  }
};

reset();
loop();
