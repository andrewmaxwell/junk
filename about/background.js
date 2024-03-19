import {Game} from '../triangularGameOfLife/Game.js';
import {Renderer} from '../triangularGameOfLife/Renderer.js';

const canvas = document.querySelector('canvas');
const renderer = new Renderer(canvas);

const params = {
  rows: 64,
  minToStayAlive: 2,
  maxToStayAlive: 3,
  minForSpawn: 3,
  maxForSpawn: 3,
  speed: 10,
};

const cols = Math.round(
  (params.rows / innerHeight) * innerWidth * Math.sqrt(3)
);
const game = new Game(params.rows, cols);
game.randomize();

const loop = () => {
  game.step(params);
  renderer.render(game);
  setTimeout(loop, 1000 / params.speed);
};

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('dblclick', () => game.randomize());

loop();
