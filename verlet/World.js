import Grid from '../particle-fluid/Grid.js';

class Ball {
  constructor(id, x, y, rad = 16, vx = 0, vy = 0) {
    this.x = x + vx;
    this.px = x;
    this.y = y + vy;
    this.py = y;
    this.rad = rad;
    this.ax = this.ay = 0;
    this.id = id;
    this.color = `hsl(${id / 10}, 100%, 70%)`;
  }
  updatePosition(dt) {
    const vx = this.x - this.px;
    const vy = this.y - this.py;
    this.px = this.x;
    this.py = this.y;
    this.x += vx + this.ax * dt * dt;
    this.y += vy + this.ay * dt * dt;
    this.ax = 0;
    this.ay = 0;
  }
  accelerate(x, y) {
    this.ax += x;
    this.ay += y;
  }
  contain(left, top, right, bottom) {
    this.x = Math.max(Math.min(this.x, right - this.rad), left + this.rad);
    this.y = Math.max(Math.min(this.y, bottom - this.rad), top + this.rad);
  }
  resolveBlockCollision(b) {
    if (
      this.x + this.rad < b.x ||
      this.x - this.rad > b.x + b.w ||
      this.y + this.rad < b.y ||
      this.y - this.rad > b.y + b.h
    )
      return;

    const leftOverlap = this.x + this.rad - b.x;
    const rightOverlap = b.x + b.w - (this.x - this.rad);
    const topOverlap = this.y + this.rad - b.y;
    const bottomOverlap = b.y + b.h - (this.y - this.rad);

    switch (Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap)) {
      case leftOverlap:
        this.x -= leftOverlap;
        break;
      case rightOverlap:
        this.x += rightOverlap;
        break;
      case topOverlap:
        this.y -= topOverlap;
        break;
      case bottomOverlap:
        this.y += bottomOverlap;
        break;
    }
  }
  resolveCollision(b) {
    const dx = this.x - b.x;
    const dy = this.y - b.y;
    const sqDist = dx * dx + dy * dy;
    const len = this.rad + b.rad;
    if (sqDist < 1 || len ** 2 <= sqDist) return;

    const dist = Math.sqrt(sqDist);
    const amount = (len / dist - 1) / 2;
    this.x += dx * amount;
    this.y += dy * amount;
    b.x -= dx * amount;
    b.y -= dy * amount;
  }
  setDistance(b, len) {
    const dx = this.x - b.x;
    const dy = this.y - b.y;
    const sqDist = dx * dx + dy * dy;
    if (sqDist < 1) return;

    const actualDist = Math.sqrt(sqDist);
    const amount = (len / actualDist - 1) / 16;
    this.x += dx * amount;
    this.y += dy * amount;
    b.x -= dx * amount;
    b.y -= dy * amount;
  }
}

export class World {
  constructor() {
    this.balls = [];
    this.blocks = [];
    this.links = [];
  }
  resize(params) {
    this.grid = new Grid(params.maxRad * 2, innerWidth, innerHeight);
  }
  addBall(x, y, rad, xs, ys) {
    const ball = new Ball(this.balls.length, x, y, rad, xs, ys);
    this.balls.push(ball);
    return ball;
  }
  addBlock(x, y, w, h) {
    this.blocks.push({x, y, w, h});
  }
  link(a, b) {
    this.links.push({a, b, len: Math.hypot(a.x - b.x, a.y - b.y)});
  }
  step(params) {
    for (const {a, b, len} of this.links) {
      a.setDistance(b, len);
    }
    for (let s = 0; s < params.steps; s++) {
      this.grid.clear();

      for (const ball of this.balls) {
        ball.accelerate(0, params.gravity);
        ball.updatePosition(params.speed / params.steps);
        ball.contain(0, 0, innerWidth - 1, innerHeight - 1);
        for (const b of this.blocks) ball.resolveBlockCollision(b);
        ball.neighbors = this.grid.add(ball.x, ball.y, ball);
      }

      for (const ball of this.balls) {
        for (const n of ball.neighbors) {
          if (ball.id < n.id) ball.resolveCollision(n);
        }
      }
    }
  }
}
