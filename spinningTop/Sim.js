// Sim.js
// Simulation core — no rendering or screen-size concerns.

/** @import {Particle} from './utils.js' */
import {
  qNew,
  copyInto,
  qAdd,
  qMul,
  qDot,
  qScale,
  qUnit,
  accumSeriesFrom,
  X,
  W, // only what we use
} from './utils.js';

const SUBSTEPS = 20;

export class Sim {
  /**
   * Build the simulation from ASCII input.
   * @param {string} inputString
   * @param {number} rpm
   * @param {number} tilt
   */
  constructor(inputString, rpm, tilt) {
    this.mass = 0;
    this.seed = 1;

    this.cm = qNew(); // mass-weighted position sum
    this.spin = qNew((71 * rpm) / 13560, 0, 0, 0); // initial spin vector
    this.inertia = [qNew(), qNew(), qNew(), qNew()];
    this.basisN = qNew(1, 0, 0, 0);
    this.impulseAcc = qNew(); // accumulated impulses
    this.orient = qNew();
    this.acc = qNew(30, 0, 0, 0); // gravity proxy

    /** @type {Particle[]} */
    this.particles = new Array(1 << 20);
    this.count = 0;

    // Pre-shape orientation: o(q.a+2) with seed h=1
    const tiltZ = (71 / 8136) * tilt;
    accumSeriesFrom(tiltZ, this.orient.a, 2, /*initialH=*/ 1);

    // Build particles from INPUT (faithful to original ordering)
    const lines = inputString.split(/\r?\n/);
    for (let rowBias = 0, li = 0; li < lines.length; li++, rowBias--) {
      const line = lines[li];
      let colIdx = 0;
      while (true) {
        const ch = colIdx < line.length ? line.charCodeAt(colIdx++) : 0;
        if (!ch || ch === 47 /* '/' */) break;

        let zSumForLine = 0;
        while (ch > 32 && zSumForLine * 113 < 710) {
          // BODY first
          let mLocal = 2.0 / colIdx;
          zSumForLine += mLocal;

          // STEP-LIST
          const initialH = (colIdx - 0.5 + this.seed * 61e-7) / 2;

          const pos = qNew();
          const vel = qNew();
          /** @type {Particle} */
          const node = {x: pos, v: vel, m: 0};

          this.mass -= mLocal /= ch % 2 ? 2 : 2000;

          // First component, then series into x.a[1], x.a[2] using the seeded h
          node.x.a[X] = rowBias | 0;
          accumSeriesFrom(zSumForLine, node.x.a, 1, initialH);

          node.m = mLocal;
          this.cm = qAdd(this.cm, qScale(node.x, node.m));

          this.particles[this.count++] = node;

          this.seed = (48271 * this.seed) % 65535;
        }
      }
    }

    // Center by mass
    const invM = 1 / this.mass;
    for (let k = 0; k < this.count; k++) {
      this.particles[k].x = qAdd(this.particles[k].x, qScale(this.cm, invM));
    }
  }

  /**
   * Advance one frame of physics (no rendering).
   * @param {number} dt
   * @param {number} restitution
   * @param {number} friction
   */
  stepFrame(dt, restitution, friction) {
    for (let s = 0; s < SUBSTEPS; s++) {
      let forceAccum = qNew(this.mass, 0, 0, 0);
      let torqueAccum = qNew();
      let vImpulse = qNew(); // working vector `v` (do not reassign)
      const vComponents = vImpulse.a; // alias must remain valid

      // Build inertia-ish t[]
      const t = [qNew(), qNew(), qNew()];
      for (let k = 0; k < this.count; k++) {
        const node = this.particles[k];
        if (!node || !node.m) continue;
        const P = node.x;
        const PPw = qMul(P, P).a[W];
        for (let j = 3; j--; ) {
          t[j] = qAdd(t[j], qScale(P, P.a[j] * node.m));
          t[j].a[j] += PPw * node.m;
        }
      }

      // inertia and denominator accumulation
      let inertiaDenom = 0;
      for (let j = 0; j < 3; j++) {
        this.inertia[j] = qMul(t[(j + 1) % 3], t[(j + 2) % 3]);
        inertiaDenom -= qDot(t[j], this.inertia[j]);
      }
      for (let j = 3; j--; ) {
        this.inertia[j] = qScale(this.inertia[j], 3 / inertiaDenom);
        this.inertia[j].a[W] = 0; // zero W component
      }

      // Contacts & impulses
      let mostNegativeHeight = 0;
      for (let k = 0; k < this.count; k++) {
        const node = this.particles[k];
        if (!node || !node.m) continue;

        let rContact = qScale(this.orient, -1);
        rContact.a[W] *= -1;
        rContact = qMul(qMul(this.orient, node.x), rContact);

        // node.v = A(rContact, acc)
        copyInto(node.v, qAdd(rContact, this.acc));
        const height = node.v.a[X];

        if (height < 0) {
          // E[i] into vComponents[i]
          for (let j = 4; j--; ) {
            vComponents[j] = qDot(
              this.inertia[(j / 1) | 0],
              qMul(rContact, this.basisN),
            );
          }

          const Av_mwr = qAdd(this.impulseAcc, qMul(this.spin, rContact));
          const mv_r = qMul(vImpulse, rContact);
          const g =
            ((1 + restitution) * Av_mwr.a[X]) / (mv_r.a[X] - 1 / this.mass);

          // vImpulse = A(impulseAcc, m(spin, rContact))
          copyInto(vImpulse, qAdd(this.impulseAcc, qMul(this.spin, rContact)));

          // *E = E[W] = 0
          vComponents[X] = 0;
          vComponents[W] = 0;

          // vImpulse = A( s(basisN, g*height - g), s(U(vImpulse), g*friction) )
          copyInto(
            vImpulse,
            qAdd(
              qScale(this.basisN, g * height - g),
              qScale(qUnit(vImpulse), g * friction),
            ),
          );

          forceAccum = qAdd(forceAccum, vImpulse);
          torqueAccum = qAdd(torqueAccum, qMul(rContact, vImpulse));

          // mostNegativeHeight = min(mostNegativeHeight, height)
          mostNegativeHeight =
            mostNegativeHeight > height ? height : mostNegativeHeight;
        }
      }

      // Integrate world state (exact order preserved)
      this.acc.a[X] -= mostNegativeHeight;
      this.impulseAcc = qAdd(
        this.impulseAcc,
        qScale(forceAccum, dt / -this.mass),
      );
      this.acc = qAdd(this.acc, qScale(this.impulseAcc, dt));

      // Angular update (uses accumulated torque)
      for (let j = 3; j--; )
        vComponents[j] = qDot(this.inertia[j], torqueAccum) * dt;
      this.spin = qAdd(this.spin, vImpulse);
      this.orient = qUnit(
        qAdd(this.orient, qScale(qMul(this.spin, this.orient), 0.5 * dt)),
      );
    }
  }
}
