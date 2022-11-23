import {simRunner} from './simRunner.js';
import {makeRenderer} from './makeRenderer.js';
import {makeGl, orthographic} from './utils.js';
import {PositionFrames} from './PositionFrames.js';
import {FrameRateDisplay} from './frameRate.js';

const canvas = document.querySelector('#canvas');
const gl = makeGl(canvas);
let projection;

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  projection = orthographic(0, innerWidth, 0, innerHeight, -1, 1);
};

const textureSize = 600;

const currentPositions = new Float32Array(4 * textureSize ** 2);
for (let i = 0; i < currentPositions.length; i += 4) {
  // currentPositions[i] = innerWidth / 2;
  // currentPositions[i + 1] = innerHeight / 2;
  // currentPositions[i + 2] = currentPositions[i] + Math.cos(i);
  // currentPositions[i + 3] = currentPositions[i + 1] + Math.sin(i);
  currentPositions[i] = innerWidth * Math.random();
  currentPositions[i + 1] = innerHeight * Math.random();
  currentPositions[i + 2] = currentPositions[i];
  currentPositions[i + 3] = currentPositions[i + 1];
}

const positionFrames = new PositionFrames(gl, currentPositions, textureSize);
const runSim = await simRunner(gl);
const render = await makeRenderer(gl, textureSize);
const iterate = () => {
  runSim(positionFrames, textureSize);
  render(positionFrames.currentFrame, projection);
  positionFrames.swap();
};

const frameRateDisplay = new FrameRateDisplay();

const loop = () => {
  if (document.hasFocus()) frameRateDisplay.measure(iterate);
  requestAnimationFrame(loop);
};

resize();
loop();

window.addEventListener('resize', resize);
