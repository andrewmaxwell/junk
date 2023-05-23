import {Renderer} from './Renderer.js';
import {makeWorld} from './makeWorld.js';

const params = {
  stiffness: 0.01,
  cameraDistance: 600,
  cameraZoom: 700,
  fontSize: 15,
  opacity: 1.5,
  maxLineLength: 250,
  angX: Math.PI / 2,
  angZ: Math.PI / 0.66,
  lineThickness: 2,
};

const world = await makeWorld();
const renderer = new Renderer(document.querySelector('canvas'));

const loop = () => {
  renderer.render(world, params);
  world.step(params);
  requestAnimationFrame(loop);
};

loop();

const mouseMove = (e) => {
  params.angX = (e.pageX / innerWidth) * 10;
  params.angZ = -(e.pageY / innerHeight) * 10;
};

renderer.canvas.addEventListener('mousemove', mouseMove);
renderer.canvas.addEventListener('touchstart', mouseMove);

const gui = new window.dat.GUI();
gui.add(params, 'stiffness', 0, 0.1);
gui.add(params, 'cameraDistance', 0, 2000);
gui.add(params, 'cameraZoom', 0, 2000);
gui.add(params, 'fontSize', 1, 100);
gui.add(params, 'opacity', 0, 10);
gui.add(params, 'maxLineLength', 0, 2000);
gui.add(params, 'lineThickness', 0, 10);
