import {Renderer} from './Renderer.js';

const numSteps = 1000;
const gravity = 1e-4;
const handleMult = 100;

const bodies = Array.from({length: 3}, () => ({
  x: Math.random() * innerWidth,
  y: Math.random() * innerHeight,
  rad: 5 + Math.random() * 20,
  xs: handleMult * (Math.random() - 0.5),
  ys: handleMult * (Math.random() - 0.5),
}));

bodies.push({
  x: innerWidth / 2,
  y: innerHeight / 2,
  rad: 32,
  xs: 0,
  ys: 0,
});

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas);

const update = () => {
  for (const b of bodies) {
    b._x = b.x;
    b._y = b.y;
    b._xs = b.xs / handleMult;
    b._ys = b.ys / handleMult;
    b.mass = (4 / 3) * Math.PI * b.rad ** 3;
    b.path = [];
  }

  for (let i = 0; i < numSteps; i++) {
    for (let j = 1; j < bodies.length; j++) {
      const a = bodies[j];
      for (let k = 0; k < j; k++) {
        const b = bodies[k];

        const dx = a._x - b._x;
        const dy = a._y - b._y;
        const acc = gravity / (dx ** 2 + dy ** 2);

        a._xs -= dx * acc * b.mass;
        a._ys -= dy * acc * b.mass;
        b._xs += dx * acc * a.mass;
        b._ys += dy * acc * a.mass;
      }
    }

    for (const b of bodies) {
      b._x += b._xs;
      b._y += b._ys;
      b.path.push({x: b._x, y: b._y});
    }
  }
  renderer.render(bodies);
};

let moveSelected;
window.addEventListener('mousedown', (e) => {
  let min = Infinity;

  for (const b of bodies) {
    const velDist = Math.hypot(b.x + b.xs - e.pageX, b.y + b.ys - e.pageY);
    if (velDist < min) {
      min = velDist;
      moveSelected = (x, y) => {
        b.xs = x - b.x;
        b.ys = y - b.y;
      };
    }

    const bodyDist = Math.hypot(b.x - e.pageX, b.y - e.pageY);

    const radDist = Math.abs(bodyDist - b.rad);
    if (radDist < min) {
      min = radDist;
      moveSelected = (x, y) => {
        b.rad = Math.hypot(b.x - x, b.y - y);
      };
    }

    if (bodyDist < min) {
      min = bodyDist;
      moveSelected = (x, y) => {
        b.x = x;
        b.y = y;
      };
    }
  }

  if (min > 20) moveSelected = null;
});
window.addEventListener('mouseup', () => {
  moveSelected = null;
});
window.addEventListener('mousemove', (e) => {
  moveSelected?.(e.pageX, e.pageY);
  update();
});

window.addEventListener('resize', update);
update();
