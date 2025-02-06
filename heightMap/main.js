import {makeCamera} from './camera.js';
import {load} from './load.js';
import {makeRenderer} from './renderer.js';

const camera = makeCamera();
const {render} = makeRenderer();
const {width, height, altitudes, colors} = await load();

const loop = () => {
  camera.move();
  render(camera, width, height, altitudes, colors);
  requestAnimationFrame(loop);
};

loop();
