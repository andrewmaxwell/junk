import {Simulator} from './Simulator.js';
import {Renderer} from './Renderer.js';
import {makeGl} from './utils.js';
import {PositionFrames} from './PositionFrames.js';
import {FrameRateDisplay} from './frameRate.js';

const canvas = document.querySelector('#canvas');
const gl = makeGl(canvas);

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
};

const textureSize = 600;

const currentPositions = new Float32Array(4 * textureSize ** 2);
for (let i = 0; i < currentPositions.length; i += 4) {
  currentPositions[i] = innerWidth / 2 + (Math.random() - 0.5) * 300;
  currentPositions[i + 1] = innerHeight / 2 + (Math.random() - 0.5) * 300;
  const angle = 2 * Math.random() * Math.PI;
  const speed = Math.random() * 10;
  currentPositions[i + 2] = currentPositions[i] + speed * Math.cos(angle);
  currentPositions[i + 3] = currentPositions[i + 1] + speed * Math.sin(angle);

  // currentPositions[i] = innerWidth * Math.random();
  // currentPositions[i + 1] = innerHeight * Math.random();
  // currentPositions[i + 2] = currentPositions[i] - Math.random();
  // currentPositions[i + 3] = currentPositions[i + 1] + Math.random();
}

const positionFrames = new PositionFrames(gl, currentPositions, textureSize);
const sim = new Simulator(gl);
const renderer = new Renderer(gl, textureSize);
const iterate = () => {
  sim.iterate(positionFrames, textureSize);
  renderer.render(positionFrames.currentFrame, textureSize);
  positionFrames.swap();
};

const frameRateDisplay = new FrameRateDisplay();

await Promise.all([sim.init(), renderer.init()]);

const loop = () => {
  if (document.hasFocus()) frameRateDisplay.measure(iterate);
  requestAnimationFrame(loop);
};

resize();
loop();

window.addEventListener('resize', resize);
