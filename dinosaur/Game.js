import {Ground} from './Ground.js';

const gravity = 0.3;
const jumpPower = 8;
const moveSpeed = 8;

export class Game {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.asteroidProbability = 0.01;

    this.dino = {
      x: 100,
      y: 100,
      ys: 0,
      w: 150,
      h: 100,
      rad: 50,
      facingRight: true,
      distance: 0,
    };
    this.asteroids = [];
    this.debris = [];
    this.score = 0;
    this.gameOver = false;

    this.ground = new Ground(this.width, this.height * 2, this.height - 100);
  }
  tick(pressing) {
    if (Math.random() < this.asteroidProbability) {
      this.makeAsteroid();
    }

    if (!this.gameOver) this.moveDino(pressing);
    else if (pressing.KeyR) this.reset();
    this.moveAsteroids();
    this.moveDebris();

    this.asteroidProbability += 0.00003;
  }
  makeAsteroid() {
    const {asteroids, width, height} = this;
    const x = Math.random() * width;
    const y = -400;
    const speed = 0.2 + 0.8 * Math.random();
    asteroids.push({
      x,
      y,
      xs: ((Math.random() * width - x) * speed) / 100,
      ys: ((height - y) * speed) / 100,
      rad: 20 / speed,
    });
  }
  moveDino(pressing) {
    const {dino, width, ground} = this;
    dino.ys += gravity;

    if (ground.isTouching(dino.x, dino.y + dino.ys, dino.rad)) {
      if (dino.ys > 0) dino.jumping = false;
      dino.ys = 0;
    } else {
      dino.y += dino.ys;
    }

    let dx = 0;
    if (pressing.ArrowLeft || pressing.KeyA) {
      dx -= moveSpeed;
      dino.facingRight = false;
      dino.distance++;
    }
    if (pressing.ArrowRight || pressing.KeyD) {
      dx += moveSpeed;
      dino.facingRight = true;
      dino.distance++;
    }

    if (!ground.isTouching(dino.x + dx, dino.y, dino.rad)) {
      dino.x += dx;
    }

    // if (dino.y + dino.h / 2 > height) {
    //   dino.y = height - dino.h / 2;
    //   dino.ys = 0;
    //   dino.jumping = false;
    // }
    if (!dino.jumping && (pressing.ArrowUp || pressing.KeyW)) {
      dino.jumping = true;
      dino.ys -= jumpPower;
    }

    dino.x = Math.max(dino.w / 2, Math.min(width - dino.w / 2, dino.x));
  }
  moveAsteroids() {
    const {asteroids, debris, dino, ground} = this;
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      a.x += a.xs;
      a.y += a.ys;

      if ((a.x - dino.x) ** 2 + (a.y - dino.y) ** 2 < (a.rad + dino.rad) ** 2) {
        this.gameOver = true;
      }

      if (ground.isTouching(a.x, a.y, a.rad / 2)) {
        ground.destroy(a.x, a.y, a.rad * 1.1);
        for (let i = 0; i < a.rad ** 2; i++) {
          const speed = 2 + Math.random() * 10;
          const angle = Math.PI * (1 + Math.random());
          debris.push({
            x: a.x + a.rad * (Math.random() - 0.5),
            y: a.y + a.rad * (Math.random() - 0.5),
            xs: speed * Math.cos(angle),
            ys: speed * Math.sin(angle),
          });
        }
        asteroids.splice(i--, 1);
        if (!this.gameOver) this.score++;
      }
    }
  }
  moveDebris() {
    const {debris, height} = this;
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      d.ys += gravity;
      d.x += d.xs;
      d.y += d.ys;

      if (d.y > height) {
        debris.splice(i--, 1);
      }
    }
  }
}
