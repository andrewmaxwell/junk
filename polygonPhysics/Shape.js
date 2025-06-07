import {
  contactManifold,
  polygonArea,
  polygonCentroid,
  polygonInertia,
  polygonsCollide,
} from './helpers.js';

/** 2‑D convex rigid body */
export class Shape {
  /**
   * @param {Object} cfg
   * @param {Array<{x:number,y:number}>} cfg.points – world‑space vertices (clockwise)
   * @param {number} [cfg.vx=0] - x velocity
   * @param {number} [cfg.vy=0] - y velocity
   * @param {number} [cfg.w=0]  - angular velocity (rad/s)
   * @param {number} [cfg.mass] - overrides area‑based mass (∞ if fixed)
   * @param {number} [cfg.rest=0.5] - restitution (0–1)
   * @param {number} [cfg.friction=0.3] - friction coefficient
   * @param {boolean} [cfg.fixed=false] - immovable if true
   */
  constructor({
    points,
    vx = 0,
    vy = 0,
    w = 0,
    mass,
    rest = 0.5,
    friction = 0.3,
    fixed = false,
  }) {
    if (!points?.length) throw new Error('Shape needs points');

    this.vx = vx;
    this.vy = vy;
    this.w = w;
    this.rest = rest;
    this.friction = friction;
    this.points = points;
    this.fixed = fixed;

    if (fixed) mass = Infinity;
    mass ??= polygonArea(points); // density = 1
    this.invM = 1 / mass;
    this.invI = 1 / (mass * polygonInertia(points));
    this.centroid = polygonCentroid(points);

    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.updateBoundingBox();

    /** @type {Array<{contact: {x: number, y: number}, force: number}>} */
    this.contacts = [];
  }

  /** Integrate motion using semi-implicit Euler.
   * @param {number} dt - timestep in seconds
   * @param {number} g  - vertical acceleration
   */
  step(dt, g) {
    this.contacts.length = 0;
    if (this.fixed) return;

    this.vy += g * dt;

    const {x: cx, y: cy} = this.centroid;
    this.centroid.x += this.vx * dt;
    this.centroid.y += this.vy * dt;

    const cos = Math.cos(this.w * dt);
    const sin = Math.sin(this.w * dt);

    for (const p of this.points) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      p.x = this.centroid.x + dx * cos - dy * sin;
      p.y = this.centroid.y + dx * sin + dy * cos;
    }

    this.updateBoundingBox();
  }

  updateBoundingBox() {
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
  correctPosition(dx, dy) {
    if (this.fixed) return;
    this.centroid.x += dx;
    this.centroid.y += dy;
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
    }
    // don't bother updating the bounding box, the pairs have already been calculated at this point
  }

  /** @type {(ix: number, iy: number, tau: number) => void} */
  applyImpulse(ix, iy, tau) {
    if (this.fixed) return;
    this.vx += ix * this.invM;
    this.vy += iy * this.invM;
    this.w += tau * this.invI;
  }

  /** @type {(B: Shape) => void} */
  resolveCollision(B) {
    const hit = polygonsCollide(this.points, B.points);
    if (!hit) return;

    const {normal: n, depth} = hit;

    // Baumgarte position correction
    const pen = Math.max(depth - 0.01, 0);
    const mSum = this.invM + B.invM;
    if (pen && mSum) {
      const k = (pen * 0.8) / mSum;
      const dx = n.x * k;
      const dy = n.y * k;
      this.correctPosition(-dx * this.invM, -dy * this.invM);
      B.correctPosition(dx * B.invM, dy * B.invM);
    }

    const contacts = contactManifold(this.points, B.points);
    if (!contacts.length) return; // not touching

    const e = Math.min(this.rest, B.rest);
    const μs = Math.max(this.friction, B.friction);
    const μd = (this.friction + B.friction) / 2;

    for (const c of contacts) {
      const rAx = c.x - this.centroid.x;
      const rAy = c.y - this.centroid.y;
      const rBx = c.x - B.centroid.x;
      const rBy = c.y - B.centroid.y;

      const vAx = this.vx - this.w * rAy;
      const vAy = this.vy + this.w * rAx;
      const vBx = B.vx - B.w * rBy;
      const vBy = B.vy + B.w * rBx;

      let rvx = vBx - vAx;
      let rvy = vBy - vAy;
      const vn = rvx * n.x + rvy * n.y;
      if (vn > 0) continue; // moving away,

      // normal impulse
      const raN = rAx * n.y - rAy * n.x;
      const rbN = rBx * n.y - rBy * n.x;
      const kN =
        this.invM + B.invM + raN * raN * this.invI + rbN * rbN * B.invI;
      if (!kN) continue; // don't divide by 0

      const jn = (-(1 + e) * vn) / kN;
      const jnx = n.x * jn;
      const jny = n.y * jn;

      this.contacts.push({contact: c, force: jn}); // store contacts for rendering, only need one copy, don't need to push to B.contacts
      this.applyImpulse(-jnx, -jny, -raN * jn);
      B.applyImpulse(jnx, jny, rbN * jn);

      // friction impulse
      const vAx2 = this.vx - this.w * rAy;
      const vAy2 = this.vy + this.w * rAx;
      const vBx2 = B.vx - B.w * rBy;
      const vBy2 = B.vy + B.w * rBx;
      rvx = vBx2 - vAx2;
      rvy = vBy2 - vAy2;

      let tx = rvx - (rvx * n.x + rvy * n.y) * n.x;
      let ty = rvy - (rvx * n.x + rvy * n.y) * n.y;
      const magT2 = tx * tx + ty * ty;
      if (magT2 < 1e-8) continue; // don't divide by 0 or tiny numbers
      const invMagT = 1 / Math.sqrt(magT2);
      tx *= invMagT;
      ty *= invMagT;

      const vt = rvx * tx + rvy * ty;
      const raT = rAx * ty - rAy * tx;
      const rbT = rBx * ty - rBy * tx;
      const kT =
        this.invM + B.invM + raT * raT * this.invI + rbT * rbT * B.invI;
      if (!kT) continue; // don't divide by 0

      let jt = -vt / kT;
      const maxStatic = μs * jn;
      if (Math.abs(jt) > maxStatic) jt = Math.sign(jt) * μd * jn;

      const jtx = tx * jt;
      const jty = ty * jt;
      this.applyImpulse(-jtx, -jty, -raT * jt);
      B.applyImpulse(jtx, jty, rbT * jt);
    }
  }
}
