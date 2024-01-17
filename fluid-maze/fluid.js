import Grid from '../particle-fluid/Grid.js';

const maxParticles = 2 ** 15;

export class Fluid {
  constructor({radius, blocks, gravity, stiffness}) {
    this.radius = radius;
    this.blocks = blocks;
    this.gravity = gravity;
    this.stiffness = stiffness;

    this.xCoord = new Float32Array(maxParticles);
    this.yCoord = new Float32Array(maxParticles);
    this.xPrev = new Float32Array(maxParticles);
    this.yPrev = new Float32Array(maxParticles);
    this.vicinityCache = new Array(maxParticles);

    this.neighborIndex = new Int16Array(maxParticles);
    this.neighborGradient = new Float32Array(maxParticles);
    this.neighborX = new Float32Array(maxParticles);
    this.neighborY = new Float32Array(maxParticles);

    this.reset();
  }
  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    this.grid = new Grid(this.radius, this.width, this.height);
    this.grid.addBlocks(this.blocks);
  }

  reset() {
    this.resize();
    this.numParticles = 0;
  }

  moveParticles() {
    const {
      grid,
      xCoord,
      yCoord,
      xPrev,
      yPrev,
      gravity,
      width,
      height,
      vicinityCache,
    } = this;

    grid.clear();
    for (let i = 0; i < this.numParticles; i++) {
      const xVel = xCoord[i] - xPrev[i];
      const yVel = yCoord[i] - yPrev[i] + gravity;
      xPrev[i] = xCoord[i];
      yPrev[i] = yCoord[i];
      xCoord[i] += xVel;
      yCoord[i] += yVel;

      // delete particles off screen
      if (
        xCoord[i] < 0 ||
        xCoord[i] > width ||
        yCoord[i] < 0 ||
        yCoord[i] > height
      ) {
        this.numParticles--;
        xCoord[i] = xCoord[this.numParticles];
        yCoord[i] = yCoord[this.numParticles];
        xPrev[i] = xPrev[this.numParticles];
        yPrev[i] = yPrev[this.numParticles];
        i--;
        continue;
      }

      // block collisions
      for (const b of grid.getCell(xCoord[i], yCoord[i]).blocks) {
        const left = xCoord[i] - b.x;
        const right = b.x + b.w - xCoord[i];
        const top = yCoord[i] - b.y;
        const bottom = b.y + b.h - yCoord[i];
        const min = Math.min(left, right, top, bottom);

        if (min === left) {
          xCoord[i] = xPrev[i] = b.x - Math.random();
        } else if (min === right) {
          xCoord[i] = xPrev[i] = b.x + b.w + Math.random();
        } else if (min === top) {
          yCoord[i] = yPrev[i] = b.y - Math.random();
        } else if (min === bottom) {
          yCoord[i] = yPrev[i] = b.y + b.h + Math.random();
        }
      }

      vicinityCache[i] = grid.add(xCoord[i], yCoord[i], i);
    }
  }

  interact() {
    const {
      radius,
      numParticles,
      vicinityCache,
      xCoord,
      yCoord,
      neighborIndex,
      neighborGradient,
      neighborX,
      neighborY,
      stiffness,
    } = this;

    const invRad2 = 1 / radius ** 2;
    for (let i = 0; i < numParticles; i++) {
      let numNeighbors = 0;
      let nearDensity = 0;
      for (const n of vicinityCache[i]) {
        if (n === i) continue;
        const dx = xCoord[n] - xCoord[i];
        const dy = yCoord[n] - yCoord[i];
        const lsq = Math.max(1, dx * dx + dy * dy);
        if (lsq >= radius * radius) continue;

        const g = 1 - Math.sqrt(lsq) / radius;
        nearDensity += g * g * g;
        neighborIndex[numNeighbors] = n;
        neighborGradient[numNeighbors] = g;
        neighborX[numNeighbors] = dx;
        neighborY[numNeighbors] = dy;
        numNeighbors++;
      }

      const nearPressure = stiffness * nearDensity * invRad2;

      for (let k = 0; k < numNeighbors; k++) {
        const n = neighborIndex[k];
        const ng = neighborGradient[k];
        const amt = (nearPressure * ng * ng) / (1 - ng) / radius;
        const ax = neighborX[k] * amt;
        const ay = neighborY[k] * amt;
        xCoord[i] -= ax;
        yCoord[i] -= ay;
        xCoord[n] += ax;
        yCoord[n] += ay;
      }
    }
  }

  tick() {
    this.moveParticles();
    this.interact();
    this.interact();
  }

  addParticle(x, y) {
    const {xCoord, yCoord, xPrev, yPrev} = this;
    if (this.numParticles >= maxParticles) return;
    const i = this.numParticles++;
    xCoord[i] = xPrev[i] = x;
    yCoord[i] = yPrev[i] = y;
  }

  pushParticles(x, y, dx, dy) {
    const {numParticles, xCoord, yCoord, xPrev, yPrev} = this;
    for (let i = 0; i < numParticles; i++) {
      const dist = Math.hypot(xCoord[i] - x, yCoord[i] - y);
      const amt = 0.2 * (1 - dist * 0.01);
      if (amt < 0) continue;
      xPrev[i] -= amt * dx;
      yPrev[i] -= amt * dy;
    }
  }
}
