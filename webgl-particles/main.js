import {FrameRateDisplay} from './frameRate.js';
import {
  createProgram,
  getFile,
  makeFrame,
  makeGl,
  orthographic,
} from './utils.js';

// the particle positions and velocities are stored in a texture whose width and height are textureSize:
// which means there are textureSize ** 2 particles
const textureSize = 600;

const canvas = document.querySelector('#canvas');
const gl = makeGl(canvas);
let projection;

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  projection = orthographic(0, innerWidth, 0, innerHeight, -1, 1);
};

const sim = createProgram(
  gl,
  `
attribute vec4 position; 
void main() {
  gl_Position = position;
}
  `,
  await getFile('./updatePositionFS.glsl'),
  2,
  [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
  gl.TRIANGLES
);

const renderer = createProgram(
  gl,
  `
attribute float id;
uniform sampler2D stateTexture;
uniform float textureSize;
uniform mat4 matrix;

void main() {
  float y = floor(id / textureSize);
  float x = mod(id, textureSize);
  vec2 texcoord = (vec2(x, y) + 0.5) / textureSize;
  vec4 position = texture2D(stateTexture, texcoord);
  gl_Position = matrix * vec4(position.xy, 0, 1);
  gl_PointSize = 1.0;
}`,
  `
precision highp float;
void main(){
  gl_FragColor = vec4(255,255,255,1);
}`,
  1,
  [...Array(textureSize ** 2).keys()],
  gl.POINTS
);

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

let currentState = makeFrame(gl, currentPositions, textureSize);
let nextState = makeFrame(gl, currentPositions, textureSize);

const frameRateDisplay = new FrameRateDisplay();

const loop = () => {
  renderer.run({
    stateTexture: [currentState, 0],
    textureSize,
    matrix: [false, projection],
  });

  sim.run(
    {
      stateTexture: [currentState, 0],
      textureSize,
      canvasDimensions: [innerWidth, innerHeight],
      time: performance.now() / 1000,
    },
    nextState.frameBuffer
  );

  // swap the states
  [currentState, nextState] = [nextState, currentState];

  frameRateDisplay.tick();
  requestAnimationFrame(loop);
};

resize();
loop();

window.addEventListener('resize', resize);
