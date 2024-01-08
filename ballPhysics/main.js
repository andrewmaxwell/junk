import {loadSound} from '../bounceDing/loadSound.js';
import {makeRenderer} from './makeRenderer.js';
const render = makeRenderer();

class Line {
  constructor(x1, y1, x2, y2) {
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.length = Math.hypot(x2 - x1, y2 - y1);
    this.nx = (y2 - y1) / this.length;
    this.ny = (x1 - x2) / this.length;
  }
}

class Ball {
  constructor(x, y, rad, xs = 0, ys = 0) {
    this.x = x;
    this.y = y;
    this.rad = rad;
    this.xs = xs;
    this.ys = ys;
    this.damage = 0;
  }
  move(gravity) {
    this.ys += gravity;
    this.x += this.xs;
    this.y += this.ys;
  }
  lineCollision({x1, y1, x2, y2, length, nx, ny}, onBounce) {
    const dx = this.x - x1;
    const dy = this.y - y1;
    const lx = x2 - x1;
    const ly = y2 - y1;
    const t = Math.max(0, Math.min(1, (dx * lx + dy * ly) / length ** 2));
    const overlap = this.rad - Math.hypot(dx - t * lx, dy - t * ly);

    if (overlap > 0) {
      this.x += nx * overlap;
      this.y += ny * overlap;

      const dotProduct = this.xs * nx + this.ys * ny;
      this.xs -= nx * 2 * dotProduct;
      this.ys -= ny * 2 * dotProduct;

      onBounce(this);
    }
  }
}

const maxDamage = 4;
const gravity = 0.1;
const startRad = 50;

const balls = [new Ball(innerWidth / 4, 0, startRad)];
const lines = [
  new Line(0, 0, innerWidth / 2, innerHeight),
  new Line(innerWidth / 2, innerHeight, innerWidth, 0),
];
let sound;

const onBounce = (ball) => {
  sound.play(0.5 + ball.y / innerHeight);

  ball.damage++;
  if (ball.damage > maxDamage) {
    ball.damage = 0;
    ball.rad *= 0.9;

    ball.ys -= 1;
    balls.push(new Ball(ball.x, ball.y, ball.rad, ball.xs, ball.ys + 1));
  }
};

const loop = () => {
  for (const ball of balls) {
    ball.move(gravity);
    for (const line of lines) {
      ball.lineCollision(line, onBounce);
    }
  }

  render(balls, lines);
  requestAnimationFrame(loop);
};

loadSound('../bounceDing/ding.mp3').then((result) => {
  sound = result;
  loop();
});
