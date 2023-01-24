const gravity = 0.3;

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
      facingRight: true,
      moveSpeed: 8,
      jumpPower: 8,
      distance: 0,
    };
    this.asteroids = [];
    this.debris = [];
    this.ground = [];
    this.score = 0;
    this.gameOver = false;
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
    const {dino, width, height} = this;
    dino.ys += gravity;
    dino.y += dino.ys;
    if (pressing.ArrowLeft || pressing.KeyA) {
      dino.x -= dino.moveSpeed;
      dino.facingRight = false;
      dino.distance++;
    }
    if (pressing.ArrowRight || pressing.KeyD) {
      dino.x += dino.moveSpeed;
      dino.facingRight = true;
      dino.distance++;
    }

    if (dino.y + dino.h / 2 > height) {
      dino.y = height - dino.h / 2;
      dino.ys = 0;
      dino.jumping = false;
    }
    if (!dino.jumping && (pressing.ArrowUp || pressing.KeyW)) {
      dino.jumping = true;
      dino.ys -= dino.jumpPower;
    }

    dino.x = Math.max(dino.w / 2, Math.min(width - dino.w / 2, dino.x));
  }
  moveAsteroids() {
    const {asteroids, height, debris, dino} = this;
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      a.x += a.xs;
      a.y += a.ys;

      if (Math.hypot(a.x - dino.x, a.y - dino.y) < a.rad + dino.h / 2) {
        this.gameOver = true;
      }

      if (a.y > height) {
        for (let i = 0; i < a.rad ** 2; i++) {
          const speed = 1 + (Math.random() * 3) ** 3;
          const angle = Math.PI * (1.25 + 0.5 * Math.random());
          debris.push({
            x: a.x + a.rad * (Math.random() - 0.5),
            y: height,
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
