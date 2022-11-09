import {color, makeRenderer} from '../sand/makeRenderer.js';
import {RayMarcher} from './Raymarcher.js';
import {V} from './V.js';

const rows = 64;
const cols = rows;

const rm = new RayMarcher({
  camera: {position: new V(0, 0, 0), target: new V(0, 0, 0), zoom: 20},
  things: [
    // floor
    {dist: (p) => Math.abs(p.z)},

    // spheres
    ...[
      {position: new V(10, 2, 2), radius: 1.5},
      {position: new V(-3, 0, 2), radius: 1.5},
      {position: new V(3, 0, 2), radius: 1.5},
      {position: new V(1.5, 0, 4.5), radius: 1.5},
      {position: new V(-1, 10, 4), radius: 4.0},
      {position: new V(0, 0, 7), radius: 1.5},
    ].map((s) => ({
      dist: (p) => p.dist(s.position) - s.radius,
    })),
  ],
});

const data = new Array(rows * cols);
const canvas = document.querySelector('canvas');
const render = makeRenderer(canvas, cols, rows, (v) => color(v.x, v.y, v.z));

const draw = () => {
  for (let sy = 0; sy < rows; sy++) {
    for (let sx = 0; sx < cols; sx++) {
      const v = rm.getPixel(sx / cols, sy / rows);
      data[sy * cols + sx] = new V(v, v, v);
    }
  }
  render(data);
};

const you = {
  position: new V(-7, -10, 4),
  angle: 1,
  turnSpeed: 0.02,
  moveSpeed: 0.1,
  zoom: 1,
  av: 0,
  xs: 0,
  ys: 0,
};
const pressing = {};
window.onkeyup = window.onkeydown = ({code, type}) => {
  pressing[code] = type == 'keydown';
};

const loop = () => {
  if (pressing.KeyA) you.av += you.turnSpeed;
  if (pressing.KeyD) you.av -= you.turnSpeed;
  if (pressing.KeyW || pressing.KeyS) {
    const s = (pressing.KeyW ? 1 : -1) * you.moveSpeed;
    you.xs += s * Math.cos(you.angle);
    you.ys += s * Math.sin(you.angle);
  }

  you.angle += you.av;
  you.position.x += you.xs;
  you.position.y += you.ys;

  you.av *= 0.5;
  you.xs *= 0.9;
  you.ys *= 0.9;

  you.target = new V(
    you.position.x + Math.cos(you.angle),
    you.position.y + Math.sin(you.angle),
    4
  );

  rm.setCamera(you);
  draw();

  requestAnimationFrame(loop);
};

window.onkeyup({});
loop();
