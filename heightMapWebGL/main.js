import {makeCamera} from './camera.js';
import {makeRenderer} from './renderer.js';
import {getProjection, loadImage} from './utils.js';

const [colorImg, heightImg] = await Promise.all(
  ['../heightMap/color.png', '../heightMap/height.png'].map(loadImage),
);
const canvas = document.querySelector('canvas');
const render = makeRenderer(canvas, colorImg, heightImg);
const camera = makeCamera();

window.addEventListener('click', () => canvas.requestPointerLock());

const loop = () => {
  camera.move();
  render(getProjection(camera, canvas.width / canvas.height));
  requestAnimationFrame(loop);
};

loop();
