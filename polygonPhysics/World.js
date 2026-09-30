import {detectCollision} from './detectCollision.js';
import {Manifold} from './Manifold.js';
import {Shape} from './Shape.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';
/** @import {Params} from './Shape.js' */

const WAKE_SPEED = 0.02; // something moving faster than this wakes what it touches

let idCounter = 0;

export class World {
  constructor() {
    /** @type {Shape[]} */
    this.shapes = [];

    /** @type {SpatialHashGrid<Shape>} */
    this.grid = new SpatialHashGrid(150);

    /** @type {Shape[][]} */
    this.pairs = [];

    /** @type {Map<number, Manifold>} keyed by pair, kept between steps for warm starting */
    this.manifolds = new Map();

    this.velocityIterations = 20;
    this.positionIterations = 8;
  }
  /** @param {Array<Partial<Shape> & {points: Array<{x: number, y: number}>}>} newShapes */
  add(...newShapes) {
    this.shapes.push(
      ...newShapes.map((s) => new Shape({id: idCounter++, ...s})), // id is used to key pairs
    );
  }
  /**
   * @param {number} dt - ms, should be the same every step
   * @param {Params} params
   * */
  step(dt, params) {
    const {shapes, grid} = this;

    // delete shapes that fly too far
    for (let i = shapes.length - 1; i >= 0; i--) {
      const {centroidX, centroidY} = shapes[i];
      if (Math.abs(centroidX) > 10_000 || Math.abs(centroidY) > 10_000) {
        shapes.splice(i, 1);
      }
    }

    grid.clear();
    for (const shape of shapes) {
      // sleeping shapes keep their force from when they fell asleep, since
      // contacts between sleeping shapes aren't solved
      if (shape.awake) shape.totalForce = 0;
      grid.insert(shape);
    }

    this.pairs = grid.getOverlappingPairs();

    // narrow phase, once per step
    const hits = [];
    /** @type {Shape[]} */
    const woken = [];
    for (const [a, b] of this.pairs) {
      const hit = detectCollision(a.points, b.points);
      if (!hit?.contacts.length) continue;
      hits.push({a, b, hit});

      // wake sleepers that get hit, judged before gravity so resting shapes don't count
      const speed = a.speed() + b.speed();
      for (const s of [a, b]) {
        if (!s.awake && !s.fixed && speed > WAKE_SPEED) {
          s.wake();
          woken.push(s);
        }
      }
    }

    // also wake whatever sleeps on top of a woken shape (and on top of that...),
    // otherwise it would float in place if its support falls away
    const up = Math.sign(params.gravity);
    for (let i = 0; i < woken.length; i++) {
      const below = woken[i];
      grid.forEachNear(below, 1, (s) => {
        if (s.awake || s.fixed) return;
        if ((below.centroidY - s.centroidY) * up <= 0) return;
        s.wake();
        woken.push(s);
      });
    }

    for (const shape of shapes) shape.integrateVelocity(dt, params.gravity);

    const prevManifolds = this.manifolds;
    this.manifolds = new Map();
    for (const {a, b, hit} of hits) {
      const key = a.id * 2 ** 26 + b.id;
      this.manifolds.set(
        key,
        new Manifold(a, b, hit, params, prevManifolds.get(key)),
      );
    }

    // separate passes, so every manifold measures bounce speeds from the same velocities
    for (let i = 0; i < this.positionIterations; i++) {
      for (const m of this.manifolds.values()) m.correctPositions();
    }
    for (const m of this.manifolds.values()) m.warmStart();

    for (let i = 0; i < this.velocityIterations; i++) {
      for (const m of this.manifolds.values()) m.solve();
    }

    // before integrating, since that can put shapes to sleep, which freezes their force
    for (const {a, b, contacts} of this.manifolds.values()) {
      for (const {jn} of contacts) {
        if (a.awake) a.totalForce += jn / dt;
        if (b.awake) b.totalForce += jn / dt;
      }
    }

    for (const shape of shapes) shape.integratePosition(dt);
  }
  /** Wake everything, e.g. after gravity changes */
  wakeAll() {
    for (const s of this.shapes) s.wake();
  }
  /** @type {(x: number, y: number) => Shape | undefined} */
  getClosestShape(x, y) {
    let minDist = Infinity;
    let closest;
    for (const s of this.shapes) {
      if (s.fixed) continue;
      const d = Math.hypot(s.centroidX - x, s.centroidY - y);
      if (d < minDist) {
        minDist = d;
        closest = s;
      }
    }
    return closest;
  }
}
