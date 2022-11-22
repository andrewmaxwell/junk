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
  setDistance(b, len, stiffness) {
    const dx = this.x - b.x;
    const dy = this.y - b.y;
    const sqDist = dx * dx + dy * dy;
    if (sqDist < 1) return;

    const actualDist = Math.sqrt(sqDist);
    const amount = (len / actualDist - 1) * stiffness;
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
  link(a, b, stiffness) {
    this.links.push({a, b, len: Math.hypot(a.x - b.x, a.y - b.y), stiffness});
  }
  step(params) {
    for (const {a, b, len, stiffness} of this.links) {
      a.setDistance(b, len, stiffness);
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
  makeSoftbodyRect(x, y, w, h, rad = 4) {
    const balls = [];
    for (let i = 0; i < h; i++) {
      balls[i] = [];
      for (let j = 0; j < w; j++) {
        balls[i][j] = this.addBall(x + j * rad * 2, y + i * rad * 2, rad);
      }
    }

    const stiffness = 1 / 16;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        if (balls[i + 1]) this.link(balls[i][j], balls[i + 1][j], stiffness);
        if (balls[i][j + 1]) this.link(balls[i][j], balls[i][j + 1], stiffness);
        if (balls[i + 1]?.[j + 1])
          this.link(balls[i][j], balls[i + 1][j + 1], stiffness);
      }
    }
  }
  makeSlinky(x, y, w, h, rad = 2, thickness = 10) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = thickness;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = rad; i < h - rad; i++) {
      const xc = rad + (w - 2 * rad) * (Math.cos(i / 8) / 2 + 0.5);
      ctx.lineTo(xc, i);
    }
    ctx.stroke();
    const pixels = ctx.getImageData(0, 0, w, h);
    const balls = [];
    for (let i = 0; i < h; i += rad * 2) {
      for (let j = 0; j < w; j += rad * 2) {
        if (pixels.data[(i * w + j) * 4 + 3])
          balls.push(this.addBall(x + j, y + i, rad));
      }
    }

    for (let i = 1; i < balls.length; i++) {
      for (let j = 0; j < i; j++) {
        if (
          Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y) <
          rad * 4
        ) {
          this.link(balls[i], balls[j], 1 / 30);
        }
      }
    }

    // let prev = [];
    // for (let i = 0; i < h; i++) {
    //   const xc = x + (Math.sin(i) / 2 + 0.5) * w;
    //   const yc = y + i * rad * 2;
    //   const row = [];
    //   for (let j = 0; j < thickness; j++) {
    //     row[j] = this.addBall(xc + j * rad * 2, yc, rad);
    //   }
    //   const group = [...row, ...prev];
    //   for (let j = 1; j < group.length; j++) {
    //     for (let k = 0; k < j; k++) {
    //       this.link(group[j], group[k], 1 / 200);
    //     }
    //   }
    //   prev = row;
    // }
  }
}
