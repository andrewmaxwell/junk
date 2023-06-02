import {Game} from './Game.js';
import {Renderer} from './Renderer.js';

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas);

let mouse = {x: 0, y: 0};
let game;
let paused = false;

const params = {
  rows: 64,
  minToStayAlive: 2,
  maxToStayAlive: 3,
  minForSpawn: 3,
  maxForSpawn: 3,
  speed: 10,
};

const reset = (randomize = true) => {
  const cols = Math.round(
    (params.rows / innerHeight) * innerWidth * Math.sqrt(3)
  );
  game = new Game(params.rows, cols);
  if (randomize) game.randomize();

  renderer.render(game, mouse);
};

const loop = () => {
  game.step(params);
  renderer.render(game, mouse);

  if (!paused) {
    setTimeout(loop, 1000 / params.speed);
  }
};

const gui = new window.dat.GUI();
gui.add(params, 'rows', 10, 200, 1).onChange(reset);
gui.add(params, 'speed', 1, 100);
gui.add(params, 'minToStayAlive', 0, 12, 1);
gui.add(params, 'maxToStayAlive', 0, 12, 1);
gui.add(params, 'minForSpawn', 0, 12, 1);
gui.add(params, 'maxForSpawn', 0, 12, 1);
gui.add(
  {
    'Start/Stop': () => {
      paused = !paused;
      if (!paused) loop();
    },
  },
  'Start/Stop'
);
gui.add(
  {
    Step: () => {
      if (paused) loop();
      paused = true;
    },
  },
  'Step'
);
gui.add(
  {
    Clear: () => {
      reset(false);
      paused = true;
    },
  },
  'Clear'
);
gui.add({Randomize: reset}, 'Randomize');

let isAlive;

window.addEventListener('resize', () => renderer.resize(0));
canvas.addEventListener('mousemove', (e) => {
  mouse = renderer.getCoords(e, params.rows);
  if (e.buttons === 1) game.set(mouse.x, mouse.y, !isAlive);
  renderer.render(game, mouse);
});
canvas.addEventListener('mousedown', (e) => {
  mouse = renderer.getCoords(e, params.rows);
  isAlive = game.safeGet(mouse.x, mouse.y);
  game.set(mouse.x, mouse.y, !isAlive);
  renderer.render(game, mouse);
});
window.addEventListener('keypress', () => {
  if (paused) loop();
  paused = true;
});

reset();
loop();
