import {V} from './V.js';

const MAX_DIST = 50;
const MIN_DIST = 0.1;
const MAX_STEPS = 16;

export class RayMarcher {
  constructor({camera, things}) {
    this.camera = camera;
    this.things = things;
    this.setCamera();
  }
  setCamera(newCamera) {
    const {camera} = this;
    if (newCamera) Object.assign(camera, newCamera);

    const {position, target, zoom} = camera;

    const normalToViewport = position.subtract(target).normalize();
    const uVector = new V(0, 0, 1).crossProduct(normalToViewport).normalize();
    const vVector = uVector.crossProduct(normalToViewport);

    const cs = position.subtract(target);
    const leftDown = position
      .add(normalToViewport.scale(-Math.sqrt(cs.dotProduct(cs))))
      .addM(uVector.scale(-zoom / 2))
      .addM(vVector.scale(-zoom / 2));

    Object.assign(this.camera, {uVector, vVector, leftDown});
  }
  getPixel(x, y) {
    const {
      camera: {position, leftDown, zoom, uVector, vVector},
    } = this;
    const rayDirection = leftDown
      .subtract(position)
      .addM(uVector.scale(x * zoom))
      .addM(vVector.scale(y * zoom))
      .normalize();

    return this.getRayColor(position, rayDirection);
  }
  getRayColor(rayStart, rayDirection) {
    let dist = 0;
    // let closest;
    const curr = rayStart.copy();
    for (let i = 0; dist < MAX_DIST && i < MAX_STEPS; i++) {
      let nextDist = Infinity;
      for (const t of this.things) {
        const d = t.dist(curr);
        if (d < nextDist) {
          nextDist = d;
          // closest = t;
        }
      }
      dist += nextDist;

      if (nextDist < MIN_DIST) break;

      curr.addM(rayDirection.scale(nextDist));
    }

    const v = Math.max(0, Math.min(255, 256 * (1 - dist / MAX_DIST)));
    return new V(v, v, v);

    // return closest.color
    //   .scale(1 - dist / MAX_DIST)
    //   .eachM((v) => Math.floor(Math.max(0, Math.min(255, v))));
  }
}
