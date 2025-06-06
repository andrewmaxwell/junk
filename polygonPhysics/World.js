import {getOverlappingPairs} from './helpers.js';
import {Shape} from './Shape.js';

export class World {
  constructor() {
    /** @type {Shape[]} */
    this.shapes = [];
    this.gravity = 1;
    this.moveSteps = 4;
    this.collisionSteps = 4;
    this.pairs = [];
  }
  /** @param {Array<Partial<Shape> & {points: Array<{x: number, y: number}>}>} newShapes */
  add(...newShapes) {
    this.shapes.push(...newShapes.map((s) => new Shape(s)));
  }
  step() {
    const {shapes, collisionSteps, gravity, moveSteps} = this;

    for (let m = 0; m < moveSteps; m++) {
      for (const shape of shapes) {
        shape.step(1 / moveSteps, gravity);
      }

      const pairs = getOverlappingPairs(shapes);

      for (let t = 0; t < collisionSteps; t++) {
        for (const [a, b] of pairs) {
          a.resolveCollision(b);
        }
      }

      this.pairs = pairs;
    }
  }
}
