import {Renderer} from './Renderer.js';
import {Fluid} from './fluid.js';
import {makeMazeGrid} from './mazeGrid.js';

const radius = 16;
const fluid = (window.fluid = new Fluid({
  radius,
  gravity: 0.02,
  stiffness: 64,
  blocks: makeMazeGrid({
    mazeRows: 8,
    mazeCols: 20,
    scale: 2,
    wallThickness: 1,
    shiftDown: 16,
  }),
}));

const renderer = new Renderer(document.querySelector('canvas'));

const loop = () => {
  fluid.addParticle(
    innerWidth / 2 + 100 * (Math.random() - 0.5),
    100 * Math.random()
  );

  const start = performance.now();
  fluid.tick();
  renderer.render(fluid, performance.now() - start);
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
