import {Renderer} from './renderer.js';
import {World} from './world.js';

const canvas = document.querySelector('canvas');
const width = (canvas.width = 800);
const height = (canvas.height = 600);
const renderer = new Renderer({canvas});
const world = new World();

const params = {
  detail: 100,
  viewingAngle: Math.PI / 3,
  wallHeight: 20,
  moveSpeed: 3,
  turnSpeed: 0.07,
  renderDist: width / 2,
  showMap: true,
  walkThroughWalls: false
};

const reset = () => world.reset(width, height);

const loop = () => {
  world.iterate(pressing, params);
  renderer.draw(world, world.getDistances(params), params);
  requestAnimationFrame(loop);
};

const pressing = {};
window.onkeydown = window.onkeyup = e => {
  pressing[e.key] = e.type === 'keydown';
};

const gui = new window.dat.GUI();
gui.add(params, 'detail', 10, width);
gui.add(params, 'viewingAngle', 0, 2 * Math.PI);
gui.add(params, 'wallHeight', 5, 100);
gui.add(params, 'moveSpeed', 0.5, 10);
gui.add(params, 'turnSpeed', 0.01, 0.2);
gui.add(params, 'renderDist', 10, width);
gui.add(params, 'walkThroughWalls');
gui.add(params, 'showMap');
gui.add({reset}, 'reset');

reset();
loop();
