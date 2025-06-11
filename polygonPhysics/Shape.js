import {detectCollision} from './detectCollision.js';
import {polygonArea, polygonCentroid, polygonInertia} from './helpers.js';

/** 2‑D convex rigid body */
export class Shape {
  /**
   * @param {Object} cfg
   * @param {number} cfg.id
   * @param {Array<{x:number,y:number}>} cfg.points – world‑space vertices (clockwise)
   * @param {number} [cfg.xVelocity=0] - x velocity
   * @param {number} [cfg.yVelocity=0] - y velocity
   * @param {number} [cfg.angularVelocity=0]  - angular velocity (rad/s)
   * @param {number} [cfg.restitution=0.5] - restitution (0–1)
   * @param {number} [cfg.friction=0.3] - friction coefficient
   * @param {boolean} [cfg.fixed=false] - immovable if true
   */
  constructor({
    id,
    points,
    xVelocity = 0,
    yVelocity = 0,
    angularVelocity = 0,
    restitution = 0.5,
    friction = 1,
    fixed = false,
  }) {
    if (!points?.length) throw new Error('Shape needs points');

    this.id = id;
    this.xVelocity = xVelocity;
    this.yVelocity = yVelocity;
    this.angularVelocity = angularVelocity;
    this.restitution = restitution;
    this.friction = friction;
    this.points = points;
    this.fixed = fixed;

    const mass = fixed ? Infinity : polygonArea(points); // density = 1
    this.inverseMass = 1 / mass;
    this.inverseInertia = 1 / (mass * polygonInertia(points));

    const centroid = polygonCentroid(points);
    this.centroidX = centroid.x;
    this.centroidY = centroid.y;

    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.#updateBoundingBox();

    /** @type {Array<{contact: {x: number, y: number}, force: number}>} */
    this.contacts = [];
    this.totalForce = 0;
  }

  /** Integrate motion using semi-implicit Euler.
   * @param {number} dt - timestep in seconds
   * @param {number} g  - vertical acceleration
   */
  step(dt, g) {
    if (this.fixed) return;

    this.yVelocity += g * dt;

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

  /** @type {(dx: number, dy: number) => void} */
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
    // this.#updateBoundingBox(); // not necessary at this point
  }

  resetStats() {
    this.contacts.length = 0;
    this.totalForce = 0;
  }

  /** @type {(impulseX: number, impulseY: number, angularImpulse: number) => void} */
  #applyImpulse(impulseX, impulseY, angularImpulse) {
    if (this.fixed) return;
    this.xVelocity += impulseX * this.inverseMass;
    this.yVelocity += impulseY * this.inverseMass;
    this.angularVelocity += angularImpulse * this.inverseInertia;
    this.totalForce +=
      Math.abs(impulseX) + Math.abs(impulseY) + Math.abs(angularImpulse / 20);
  }

  /** @type {(B: Shape) => void} */
  resolveCollision(B) {
    const hit = detectCollision(this.points, B.points);
    if (!hit || !hit.contacts.length) return;

    const {normalX, normalY, depth, contacts} = hit;

    // Baumgarte position correction
    const penetration = Math.max(depth - 0.01, 0);
    const inverseMassSum = this.inverseMass + B.inverseMass;
    if (penetration && inverseMassSum) {
      const k = (penetration * 0.8) / inverseMassSum;
      const dx = normalX * k;
      const dy = normalY * k;
      this.moveTo(
        this.centroidX - dx * this.inverseMass,
        this.centroidY - dy * this.inverseMass,
      );
      B.moveTo(
        B.centroidX + dx * B.inverseMass,
        B.centroidY + dy * B.inverseMass,
      );
    }

    const e = Math.min(this.restitution, B.restitution);
    const μs = Math.max(this.friction, B.friction);
    const μd = (this.friction + B.friction) / 2;

    for (const c of contacts) {
      const rAx = c.x - this.centroidX;
      const rAy = c.y - this.centroidY;
      const rBx = c.x - B.centroidX;
      const rBy = c.y - B.centroidY;

      const vAx = this.xVelocity - this.angularVelocity * rAy;
      const vAy = this.yVelocity + this.angularVelocity * rAx;
      const vBx = B.xVelocity - B.angularVelocity * rBy;
      const vBy = B.yVelocity + B.angularVelocity * rBx;

      let rvx = vBx - vAx;
      let rvy = vBy - vAy;
      const vn = rvx * normalX + rvy * normalY;
      if (vn > 0) continue; // moving away

      // normal impulse
      const raN = rAx * normalY - rAy * normalX;
      const rbN = rBx * normalY - rBy * normalX;
      const kN =
        this.inverseMass +
        B.inverseMass +
        raN * raN * this.inverseInertia +
        rbN * rbN * B.inverseInertia;
      if (!kN) continue; // don't divide by 0

      const jn = (-(1 + e) * vn) / kN;
      const jnx = normalX * jn;
      const jny = normalY * jn;

      this.contacts.push({contact: c, force: jn}); // store contacts for rendering, only need one copy, don't need to push to B.contacts
      this.#applyImpulse(-jnx, -jny, -raN * jn);
      B.#applyImpulse(jnx, jny, rbN * jn);

      // friction impulse
      const vAx2 = this.xVelocity - this.angularVelocity * rAy;
      const vAy2 = this.yVelocity + this.angularVelocity * rAx;
      const vBx2 = B.xVelocity - B.angularVelocity * rBy;
      const vBy2 = B.yVelocity + B.angularVelocity * rBx;
      rvx = vBx2 - vAx2;
      rvy = vBy2 - vAy2;

      let tx = rvx - (rvx * normalX + rvy * normalY) * normalX;
      let ty = rvy - (rvx * normalX + rvy * normalY) * normalY;
      const magT2 = tx * tx + ty * ty;
      if (magT2 < 1e-8) continue; // don't divide by 0 or tiny numbers
      const invMagT = 1 / Math.sqrt(magT2);
      tx *= invMagT;
      ty *= invMagT;

      const vt = rvx * tx + rvy * ty;
      const raT = rAx * ty - rAy * tx;
      const rbT = rBx * ty - rBy * tx;
      const kT =
        this.inverseMass +
        B.inverseMass +
        raT * raT * this.inverseInertia +
        rbT * rbT * B.inverseInertia;
      if (!kT) continue; // don't divide by 0

      let jt = -vt / kT;
      const maxStatic = μs * jn;
      if (Math.abs(jt) > maxStatic) jt = Math.sign(jt) * μd * jn;

      const jtx = tx * jt;
      const jty = ty * jt;
      this.#applyImpulse(-jtx, -jty, -raT * jt);
      B.#applyImpulse(jtx, jty, rbT * jt);
    }
  }
}
