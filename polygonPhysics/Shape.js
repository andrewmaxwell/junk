import {
  polygonArea,
  polygonCentroid,
  polygonInertia,
  polygonSignedArea,
} from './helpers.js';
/** @import {Point} from './helpers.js' */

/** @typedef {{gravity: number, friction: number, restitution: number}} Params */

const SLEEP_SPEED = 0.005;
const SLEEP_TIME = 500; // ms

/** 2‑D convex rigid body */
export class Shape {
  /**
   * @param {Object} cfg
   * @param {number} cfg.id
   * @param {Point[]} cfg.points – world‑space vertices
   * @param {number} [cfg.xVelocity=0] - x velocity
   * @param {number} [cfg.yVelocity=0] - y velocity
   * @param {number} [cfg.angularVelocity=0]  - angular velocity (rad/ms)
   * @param {boolean} [cfg.fixed=false] - immovable if true
   */
  constructor({
    id,
    points,
    xVelocity = 0,
    yVelocity = 0,
    angularVelocity = 0,
    fixed = false,
  }) {
    if (!points?.length) throw new Error('Shape needs points');
    // collision clipping needs clockwise (on screen) winding
    if (polygonSignedArea(points) < 0) points.reverse();

    this.id = id;
    this.xVelocity = xVelocity;
    this.yVelocity = yVelocity;
    this.angularVelocity = angularVelocity;
    this.points = points;
    this.fixed = fixed;
    this.awake = !fixed; // sleeping and fixed shapes aren't simulated
    this.sleepTime = 0;

    const mass = fixed ? Infinity : polygonArea(points); // density = 1
    this.inverseMass = 1 / mass;
    this.inverseInertia = 1 / (mass * polygonInertia(points));

    const centroid = polygonCentroid(points);
    this.centroidX = centroid.x;
    this.centroidY = centroid.y;
    this.radius = Math.max(
      ...points.map((p) => Math.hypot(p.x - centroid.x, p.y - centroid.y)),
    );

    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.#updateBoundingBox();

    this.totalForce = 0; // for visualization only
  }

  /** @type {(dt: number, gravity: number) => void} dt in ms */
  integrateVelocity(dt, gravity) {
    if (this.awake) this.yVelocity += gravity * dt;
  }

  /** Semi-implicit Euler: move by the velocity the solver just produced.
   * @param {number} dt - timestep in ms
   */
  integratePosition(dt) {
    if (!this.awake) return;

    const ocx = this.centroidX;
    const ocy = this.centroidY;

    this.centroidX += this.xVelocity * dt;
    this.centroidY += this.yVelocity * dt;

    const cos = Math.cos(this.angularVelocity * dt);
    const sin = Math.sin(this.angularVelocity * dt);

    for (const p of this.points) {
      const dx = p.x - ocx;
      const dy = p.y - ocy;
      p.x = this.centroidX + dx * cos - dy * sin;
      p.y = this.centroidY + dx * sin + dy * cos;
    }

    this.#updateBoundingBox();

    // fall asleep after staying nearly still for a while
    if (this.speed() < SLEEP_SPEED) {
      this.sleepTime += dt;
      if (this.sleepTime > SLEEP_TIME) {
        this.awake = false;
        this.xVelocity = this.yVelocity = this.angularVelocity = 0;
      }
    } else this.sleepTime = 0;
  }

  /** Fastest any point on the shape is moving, roughly */
  speed() {
    return (
      Math.hypot(this.xVelocity, this.yVelocity) +
      Math.abs(this.angularVelocity) * this.radius
    );
  }

  wake() {
    if (this.fixed) return;
    this.awake = true;
    this.sleepTime = 0;
  }

  #updateBoundingBox() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  /** @type {(x: number, y: number) => void} */
  moveTo(x, y) {
    if (this.fixed) return;
    const dx = x - this.centroidX;
    const dy = y - this.centroidY;
    this.centroidX = x;
    this.centroidY = y;
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
    }
  }
}
