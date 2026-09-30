import Grid from '../particle-fluid/Grid.js';
import {interact} from '../particle-fluid/interact.js';

const maxParticles = 2 ** 15;
const eps = 0.01;

export class Fluid {
  constructor({
    radius,
    blocks,
    gravity,
    restDensity,
    stiffness,
    stiffnessNear,
    speed,
    wallFriction = 0.98,
  }) {
    this.radius = radius;
    this.blocks = blocks;
    this.gravity = gravity;
    this.restDensity = restDensity;
    this.stiffness = stiffness;
    this.stiffnessNear = stiffnessNear;
    this.speed = speed;
    this.wallFriction = wallFriction;

    this.xCoord = new Float32Array(maxParticles);
    this.yCoord = new Float32Array(maxParticles);
    this.xPrev = new Float32Array(maxParticles);
    this.yPrev = new Float32Array(maxParticles);

    this.reset();
  }

  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    this.grid = new Grid(this.radius, this.width, this.height);
    this.grid.addBlocks(this.blocks);
  }

  setBlocks(blocks) {
    this.blocks = blocks;
    this.resize();
  }

  reset() {
    this.resize();
    this.numParticles = 0;
  }

  moveParticles() {
    const {xCoord, yCoord, xPrev, yPrev, gravity, width, height, grid, radius} =
      this;

    for (let i = 0; i < this.numParticles; i++) {
      let xVel = xCoord[i] - xPrev[i];
      let yVel = yCoord[i] - yPrev[i] + gravity;

      // never move more than a cell in one step, or a particle could jump
      // clean through a wall without ever landing in one of its cells
      const speedSq = xVel * xVel + yVel * yVel;
      if (speedSq > radius * radius) {
        const scale = radius / Math.sqrt(speedSq);
        xVel *= scale;
        yVel *= scale;
      }

      xPrev[i] = xCoord[i];
      yPrev[i] = yCoord[i];
      xCoord[i] += xVel;
      yCoord[i] += yVel;

      // delete particles off screen by swapping in the last one, then redo
      // this index so the particle we just moved here gets its turn
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

      grid.add(xCoord[i], yCoord[i], i);
    }
  }

  // Push particles out of the nearest face of any wall they ended up inside of.
  // Only the velocity into the wall is cancelled, the velocity along it is kept
  // (minus friction) so fluid can actually slide down and around corners.
  collideWithWalls() {
    const {xCoord, yCoord, xPrev, yPrev, grid, wallFriction} = this;

    for (let i = 0; i < this.numParticles; i++) {
      for (const b of grid.getCell(xCoord[i], yCoord[i]).blocks) {
        const left = xCoord[i] - b.x;
        const right = b.x + b.w - xCoord[i];
        const top = yCoord[i] - b.y;
        const bottom = b.y + b.h - yCoord[i];
        if (left < 0 || right < 0 || top < 0 || bottom < 0) continue;

        const xVel = xCoord[i] - xPrev[i];
        const yVel = yCoord[i] - yPrev[i];
        const min = Math.min(left, right, top, bottom);

        // nudge just past the face, so a particle shoved off the edge of the
        // screen by an outer wall goes out of bounds and gets deleted
        if (min === left || min === right) {
          xCoord[i] = min === left ? b.x - eps : b.x + b.w + eps;
          xPrev[i] = xCoord[i];
          yPrev[i] = yCoord[i] - yVel * wallFriction;
        } else {
          yCoord[i] = min === top ? b.y - eps : b.y + b.h + eps;
          yPrev[i] = yCoord[i];
          xPrev[i] = xCoord[i] - xVel * wallFriction;
        }
      }
    }
  }

  tick() {
    this.grid.clear();
    this.moveParticles();
    interact(this);
    this.collideWithWalls();
  }

  addParticle(x, y) {
    const {xCoord, yCoord, xPrev, yPrev} = this;
    if (this.numParticles >= maxParticles) return;
    const i = this.numParticles++;
    xCoord[i] = xPrev[i] = x;
    yCoord[i] = yPrev[i] = y;
  }

  pushParticles(x, y, dx, dy, reach = 100) {
    const {numParticles, xCoord, yCoord, xPrev, yPrev} = this;
    for (let i = 0; i < numParticles; i++) {
      const dist = Math.hypot(xCoord[i] - x, yCoord[i] - y);
      if (dist > reach) continue;
      const amt = 0.2 * (1 - dist / reach);
      xPrev[i] -= amt * dx;
      yPrev[i] -= amt * dy;
    }
  }
}
