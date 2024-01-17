import {Renderer} from './Renderer.js';
import {Fluid} from './fluid.js';
import {makeMazeGrid} from './mazeGrid.js';

const fluid = new Fluid({
  radius: 8,
  gravity: 0.02,
  stiffness: 32,
  blocks: makeMazeGrid({mazeRows: 10, mazeCols: 17, scale: 4}),
});

const renderer = new Renderer(document.querySelector('canvas'));

const loop = () => {
  fluid.addParticle(30 + 10 * Math.random(), 30 + 10 * Math.random());
  fluid.tick();
  renderer.render(fluid);
  requestAnimationFrame(loop);
};

loop();

window.addEventListener('resize', () => {
  fluid.resize();
  renderer.resize();
});

window.addEventListener('mousemove', (e) => {
  if (!e.buttons) return;
  fluid.pushParticles(e.offsetX, e.offsetY, e.movementX, e.movementY);
});
