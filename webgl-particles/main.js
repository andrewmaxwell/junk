import {FrameRateDisplay} from './frameRate.js';
import {makeGl, orthographic} from './utils.js';

// the particle positions and velocities are stored in a texture whose width and height are textureSize:
// which means there are textureSize ** 2 particles
const textureSize = 600;

const canvas = document.querySelector('#canvas');
const {gl, createProgram, makeFrame} = makeGl(canvas);
let projection;

const resize = () => {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  projection = orthographic(0, innerWidth, 0, innerHeight, -1, 1);
};

const sim = createProgram({
  vertexShaderStr: `
attribute vec4 position; 
void main() {
  gl_Position = position;
}`,
  fragmentShaderStr: `
#define TAU 6.2831853072

precision highp float;

uniform sampler2D stateTexture;
uniform float textureSize;
uniform vec2 canvasDimensions;
uniform float time;

vec2 mathMod(vec2 n, vec2 m) {
  return mod(mod(n, m) + m, m);
}

vec2 attract(vec2 attractor, vec2 particle, float strength) {
  vec2 d = attractor - particle;
  return strength * d / max(0.1, d.x * d.x + d.y * d.y);
}

const int numAttractors = 3;

void main() {
  vec2 texcoord = gl_FragCoord.xy / textureSize;
  
  vec4 p = texture2D(stateTexture, texcoord);
  vec2 velocity = (p.xy - p.zw);
  vec2 n = p.xy + velocity;

  // for (int x = 0; x < 100; x++) {
  //   for (int y = 0; y < 100; y++) {
  //     vec2 b = texture2D(stateTexture, vec2(x, y) / textureSize).xy;
  //     n += attract(b, p.xy, 0.001);
  //   }
  // }

  for (int i = 0; i < numAttractors; i++) {
    float angle = float(i) / float(numAttractors) * TAU + time / 2.0;
    vec2 coords = canvasDimensions * 0.5 + 300.0 * vec2(sin(angle), cos(angle));
    n += attract(coords, n, 10.0);
  }

  gl_FragColor = vec4(n, p.xy);
}`,
  attribSize: 2,
  bufferData: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
  drawType: gl.TRIANGLES,
});

const renderer = createProgram({
  vertexShaderStr: `
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
  fragmentShaderStr: `
precision highp float;
void main(){
  gl_FragColor = vec4(1);
}`,
  attribSize: 1,
  bufferData: [...Array(textureSize ** 2).keys()],
  drawType: gl.POINTS,
});

const currentPositions = new Float32Array(4 * textureSize ** 2);
for (let i = 0; i < currentPositions.length; i += 4) {
  currentPositions[i] = innerWidth * Math.random();
  currentPositions[i + 1] = innerHeight * Math.random();
  currentPositions[i + 2] = currentPositions[i];
  currentPositions[i + 3] = currentPositions[i + 1];
}

let currentState = makeFrame({
  data: currentPositions,
  width: textureSize,
  height: textureSize,
});
let nextState = makeFrame({
  data: currentPositions,
  width: textureSize,
  height: textureSize,
});

const frameRateDisplay = new FrameRateDisplay();

const loop = () => {
  renderer.run(
    {
      stateTexture: [currentState, 0],
      textureSize,
      matrix: [false, projection],
    }
    // renders to screen
  );

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
