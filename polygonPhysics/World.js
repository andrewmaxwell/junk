import {detectCollision} from './detectCollision.js';
import {Shape} from './Shape.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';
/** @import {Params} from './Shape.js' */

let idCounter = 0;

export class World {
  constructor() {
    /** @type {Shape[]} */
    this.shapes = [];

    /** @type {SpatialHashGrid<Shape>} */
    this.grid = new SpatialHashGrid(150);

    /** @type {Shape[][]} */
    this.pairs = [];
    this.numCollisions = 0;
    this.collisionIterations = 8;
  }
  /** @param {Array<Partial<Shape> & {points: Array<{x: number, y: number}>}>} newShapes */
  add(...newShapes) {
    this.shapes.push(
      ...newShapes.map((s) => new Shape({id: idCounter++, ...s})), // id is used to dedupe collisions
    );
  }
  /**
   * @param {number} dt
   * @param {Params} params
   * */
  step(dt, params) {
    const {shapes, grid} = this;

    for (let i = shapes.length - 1; i >= 0; i--) {
      // delete shapes that fall too far
      if (shapes[i].centroidY > 10_000) shapes.splice(i, 1);
      else shapes[i].resetStats();
    }

    grid.clear();
    for (const shape of shapes) {
      shape.step(dt, params);
      grid.insert(shape);
    }

    this.pairs = grid.getOverlappingPairs();
    // const pairs = getOverlappingPairs(shapes);

    this.numCollisions = 0;
    for (let t = 0; t < this.collisionIterations; t++) {
      for (const [a, b] of this.pairs) {
        const hit = detectCollision(a.points, b.points);
        if (hit?.contacts.length) {
          this.numCollisions++;
          a.resolveCollision(b, hit, params);
        }
      }
    }
  }
  /** @type {(x: number, y: number) => Shape | undefined} */
  getClosestShape(x, y) {
    let minDist = Infinity;
    return this.shapes.reduce((a, b) => {
      const d = Math.hypot(b.centroidX - x, b.centroidY - y);
      if (d < minDist) {
        minDist = d;
        return b;
      }
      return a;
    });
  }
}
