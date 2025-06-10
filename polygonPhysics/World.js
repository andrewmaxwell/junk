import {Shape} from './Shape.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

let idCounter = 0;

export class World {
  constructor() {
    /** @type {Shape[]} */
    this.shapes = [];
    this.gravity = 0.001;
    this.collisionSteps = 8;
    /** @type {SpatialHashGrid<Shape>} */
    this.grid = new SpatialHashGrid(150);
  }
  /** @param {Array<Partial<Shape> & {points: Array<{x: number, y: number}>}>} newShapes */
  add(...newShapes) {
    this.shapes.push(
      ...newShapes.map((s) => new Shape({id: idCounter++, ...s})),
    );
  }
  /** @param {number} dt */
  step(dt) {
    const {shapes, collisionSteps, gravity, grid} = this;

    for (const shape of shapes) {
      shape.contacts.length = 0;
    }

    grid.clear();
    for (const shape of shapes) {
      shape.step(dt, gravity);
      grid.insert(shape);
    }

    const pairs = grid.getPotentialPairs();
    // const pairs = getOverlappingPairs(shapes);

    for (let t = 0; t < collisionSteps; t++) {
      for (const [a, b] of pairs) {
        a.resolveCollision(b);
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
