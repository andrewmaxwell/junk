import {makeFrame} from './utils.js';

export class PositionFrames {
  constructor(gl, currentPositions, textureSize) {
    this.currentFrame = makeFrame(gl, currentPositions, textureSize);
    this.nextFrame = makeFrame(gl, currentPositions, textureSize);
  }
  swap() {
    [this.currentFrame, this.nextFrame] = [this.nextFrame, this.currentFrame];
  }
}
