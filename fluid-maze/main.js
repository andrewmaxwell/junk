import {Renderer} from './Renderer.js';
import {Fluid} from './fluid.js';
import {makeMazeGrid} from './mazeGrid.js';

const radius = 16;
const spawnPerStep = 8;
const spawnSpread = 2 * radius;
// the reservoir is sealed, so stop pouring once it backs up to the faucet.
// Higher pushes the fluid through the maze faster, but too high and the
// pressure starts squeezing particles through the walls
const spawnMaxCrowd = 48;
// the faucet switches dye every so many particles, the bands of color show
// how the fluid folds its way through the maze
const dyeBand = 5000;
const stepMs = 1000 / 60; // physics is a fixed timestep, independent of refresh rate

const buildMaze = () =>
  makeMazeGrid({
    width: Math.floor(innerWidth / radius),
    height: Math.floor(innerHeight / radius),
    scale: 2,
    wallThickness: 1,
    margin: 3,
    shiftDown: 16,
  });

let maze = buildMaze();

const fluid = (window.fluid = new Fluid({
  radius,
  gravity: 0.02,
  restDensity: 0.2,
  stiffness: 300,
  stiffnessNear: 700,
  speed: 0.001,
  blocks: maze.blocks,
}));

const renderer = new Renderer(document.querySelector('canvas'));

let paused = false;
let lastTime = performance.now();
let backlog = 0;
let stepTime = 0;
let poured = 0;

const step = () => {
  const x = maze.spawnX * radius;
  const y = maze.spawnY * radius;
  const crowd = fluid.grid.countNear(x, y);
  for (let i = 0; crowd < spawnMaxCrowd && i < spawnPerStep; i++) {
    const color = Math.floor(poured++ / dyeBand) % renderer.palette.length;
    fluid.addParticle(
      x + spawnSpread * (Math.random() - 0.5),
      y + spawnSpread * (Math.random() - 0.5),
      color,
    );
  }
  fluid.tick();
};

const loop = () => {
  requestAnimationFrame(loop);

  const now = performance.now();
  // cap the backlog so a backgrounded tab doesn't come back to a huge catch-up
  backlog = Math.min(backlog + (now - lastTime), 4 * stepMs);
  lastTime = now;

  const start = performance.now();
  let steps = 0;
  while (!paused && backlog >= stepMs) {
    backlog -= stepMs;
    step();
    steps++;
  }
  // frames where no step was due would otherwise report 0ms
  if (steps) stepTime = (performance.now() - start) / steps;
  renderer.render(fluid, stepTime);
};

loop();

const newMaze = () => {
  maze = buildMaze();
  fluid.setBlocks(maze.blocks);
};

// debounced, dragging a window edge fires resize continuously and each one
// rebuilds the maze and the spatial grid
let resizeTimeout;
addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    newMaze();
    renderer.resize();
  }, 200);
});

// track movement ourselves, touch pointer events don't fill in movementX/Y
let pointer = null;
addEventListener('pointerdown', (e) => {
  pointer = {x: e.clientX, y: e.clientY};
});
addEventListener('pointerup', () => {
  pointer = null;
});
addEventListener(
  'pointermove',
  (e) => {
    if (!pointer) return;
    e.preventDefault();
    fluid.pushParticles(
      e.clientX,
      e.clientY,
      e.clientX - pointer.x,
      e.clientY - pointer.y,
    );
    pointer = {x: e.clientX, y: e.clientY};
  },
  {passive: false},
);

addEventListener('keydown', (e) => {
  // leave browser shortcuts like cmd+c alone
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === ' ') paused = !paused;
  else if (e.key === 'c') fluid.reset();
  else return;
  e.preventDefault();
});
