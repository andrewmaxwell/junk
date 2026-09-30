/** @import {Shape, Params} from './Shape.js' */

const SLOP = 0.1; // allowed penetration, keeps contacts alive between steps so they can warm start
const CORRECTION = 0.2; // fraction of the remaining penetration removed per pass
const MAX_CORRECTION = 2; // max push per pass, so deep overlaps don't explode apart
const BOUNCE_THRESHOLD = 0.05; // below this approach speed, don't bounce (stops resting jitter)
const MATCH_DIST_SQ = 1; // contacts closer than this to last step's are the same contact

/**
 * One contact point. Impulses are accumulated across solver iterations (and across steps
 * via warm starting) and clamped as a total, which is what makes stacks converge.
 * @typedef {{
 *   x: number, y: number,
 *   rAx: number, rAy: number, rBx: number, rBy: number,
 *   normalMass: number, tangentMass: number, bounce: number,
 *   jn: number, jt: number,
 * }} Contact
 */

/** The contacts between a pair of shapes for one step. A always has the lower id. */
export class Manifold {
  /**
   * @param {Shape} a
   * @param {Shape} b
   * @param {{normalX: number, normalY: number, depth: number, contacts: Array<{x: number, y: number}>}} hit
   * @param {Params} params
   * @param {Manifold} [prev] - same pair's manifold from last step, for warm starting
   */
  constructor(a, b, {normalX, normalY, depth, contacts}, params, prev) {
    this.a = a;
    this.b = b;
    /** @type {number} */
    this.normalX = normalX;
    /** @type {number} */
    this.normalY = normalY;
    this.depth = depth;
    // where the shapes started, to track how far position correction has separated them
    this.startX = b.centroidX - a.centroidX;
    this.startY = b.centroidY - a.centroidY;
    this.friction = params.friction;

    // sleeping shapes act as immovable
    const iMA = (this.iMA = a.awake ? a.inverseMass : 0);
    const iMB = (this.iMB = b.awake ? b.inverseMass : 0);
    const iIA = (this.iIA = a.awake ? a.inverseInertia : 0);
    const iIB = (this.iIB = b.awake ? b.inverseInertia : 0);

    // only reuse last step's impulses if the normal hasn't swung around
    const warmFrom =
      prev && prev.normalX * normalX + prev.normalY * normalY > 0.95
        ? prev.contacts
        : [];

    // Keep only the two ends of the overlap along the tangent. Clipping gives near-duplicate
    // points at each end, which the solver loads unevenly, making stacks creep sideways.
    if (contacts.length > 2) {
      let min = contacts[0];
      let max = contacts[0];
      for (const c of contacts) {
        const t = c.x * normalY - c.y * normalX;
        if (t < min.x * normalY - min.y * normalX) min = c;
        if (t > max.x * normalY - max.y * normalX) max = c;
      }
      contacts = [min, max];
    }

    // how fast gravity accelerates B toward/away from A along the normal
    const gravityN = params.gravity * normalY * ((iMB ? 1 : 0) - (iMA ? 1 : 0));

    /** @type {Contact[]} */
    this.contacts = contacts.map(({x, y}) => {
      const rAx = x - a.centroidX;
      const rAy = y - a.centroidY;
      const rBx = x - b.centroidX;
      const rBy = y - b.centroidY;

      const rnA = rAx * normalY - rAy * normalX;
      const rnB = rBx * normalY - rBy * normalX;
      const kN = iMA + iMB + rnA * rnA * iIA + rnB * rnB * iIB;

      // tangent is (normalY, -normalX)
      const rtA = rAx * -normalX - rAy * normalY;
      const rtB = rBx * -normalX - rBy * normalY;
      const kT = iMA + iMB + rtA * rtA * iIA + rtB * rtB * iIB;

      const dvx =
        b.xVelocity -
        b.angularVelocity * rBy -
        a.xVelocity +
        a.angularVelocity * rAy;
      const dvy =
        b.yVelocity +
        b.angularVelocity * rBx -
        a.yVelocity -
        a.angularVelocity * rAx;
      const vn = dvx * normalX + dvy * normalY;

      // bounce with the speed it had when it reached the surface, not the
      // extra speed from sinking in during the step, which would add energy
      const bounce =
        vn < -BOUNCE_THRESHOLD
          ? params.restitution *
            Math.sqrt(Math.max(0, vn * vn + 2 * gravityN * depth))
          : 0;

      let jn = 0;
      let jt = 0;
      let best = MATCH_DIST_SQ;
      for (const old of warmFrom) {
        const d = (old.x - x) ** 2 + (old.y - y) ** 2;
        if (d < best) {
          best = d;
          jn = old.jn;
          jt = old.jt;
        }
      }

      return {
        x,
        y,
        rAx,
        rAy,
        rBx,
        rBy,
        normalMass: kN ? 1 / kN : 0,
        tangentMass: kT ? 1 / kT : 0,
        bounce,
        jn,
        jt,
      };
    });
  }

  /** Push the shapes apart directly, without adding velocity. Called several times per step. */
  correctPositions() {
    const {a, b, iMA, iMB, normalX, normalY} = this;
    // estimate the current depth from how far the shapes moved apart along the normal
    // since detection, rather than detecting again (ignores rotation, close enough)
    const separated =
      (b.centroidX - a.centroidX - this.startX) * normalX +
      (b.centroidY - a.centroidY - this.startY) * normalY;
    const penetration = this.depth - separated - SLOP;
    if (penetration <= 0 || !(iMA + iMB)) return;
    const k = Math.min(penetration * CORRECTION, MAX_CORRECTION) / (iMA + iMB);
    a.moveTo(a.centroidX - normalX * k * iMA, a.centroidY - normalY * k * iMA);
    b.moveTo(b.centroidX + normalX * k * iMB, b.centroidY + normalY * k * iMB);
  }

  /** Apply last step's impulses up front so the solver starts near the answer. */
  warmStart() {
    for (const c of this.contacts) {
      const px = this.normalX * c.jn + this.normalY * c.jt;
      const py = this.normalY * c.jn - this.normalX * c.jt;
      this.#apply(c, px, py);
    }
  }

  /** One Gauss-Seidel iteration over the contacts. */
  solve() {
    const {a, b, normalX: nx, normalY: ny} = this;
    for (const c of this.contacts) {
      // friction first, bounded by the current normal impulse
      let dvx =
        b.xVelocity -
        b.angularVelocity * c.rBy -
        a.xVelocity +
        a.angularVelocity * c.rAy;
      let dvy =
        b.yVelocity +
        b.angularVelocity * c.rBx -
        a.yVelocity -
        a.angularVelocity * c.rAx;
      const vt = dvx * ny - dvy * nx;
      const maxT = this.friction * c.jn;
      const jt = Math.max(-maxT, Math.min(maxT, c.jt - vt * c.tangentMass));
      const djt = jt - c.jt;
      c.jt = jt;
      this.#apply(c, ny * djt, -nx * djt);

      // normal
      dvx =
        b.xVelocity -
        b.angularVelocity * c.rBy -
        a.xVelocity +
        a.angularVelocity * c.rAy;
      dvy =
        b.yVelocity +
        b.angularVelocity * c.rBx -
        a.yVelocity -
        a.angularVelocity * c.rAx;
      const vn = dvx * nx + dvy * ny;
      const jn = Math.max(0, c.jn + (c.bounce - vn) * c.normalMass);
      const djn = jn - c.jn;
      c.jn = jn;
      this.#apply(c, nx * djn, ny * djn);
    }
  }

  /** @type {(c: Contact, px: number, py: number) => void} impulse on B, opposite on A */
  #apply(c, px, py) {
    const {a, b, iMA, iMB, iIA, iIB} = this;
    a.xVelocity -= px * iMA;
    a.yVelocity -= py * iMA;
    a.angularVelocity -= (c.rAx * py - c.rAy * px) * iIA;
    b.xVelocity += px * iMB;
    b.yVelocity += py * iMB;
    b.angularVelocity += (c.rBx * py - c.rBy * px) * iIB;
  }
}
