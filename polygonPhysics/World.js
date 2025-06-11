import {Shape} from './Shape.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

let idCounter = 0;

export class World {
  constructor() {
    /** @type {Shape[]} */
    this.shapes = [];
    this.gravity = 0.001;
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
    const {shapes, gravity, grid} = this;

    for (let i = shapes.length - 1; i >= 0; i--) {
      // delete shapes that fall too far
      if (shapes[i].centroidY > 10_000) shapes.splice(i, 1);
      else shapes[i].resetStats();
    }

    grid.clear();
    for (const shape of shapes) {
      shape.step(dt, gravity);
      grid.insert(shape);
    }

    const pairs = grid.getOverlappingPairs();
    // const pairs = getOverlappingPairs(shapes);

    for (let t = 0; t < 8; t++) {
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
